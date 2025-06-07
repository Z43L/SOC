/**
 * Test for Socket.IO WebSocket fix
 * Ensures Socket.IO connections are properly handled alongside raw WebSocket connections
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { Server as IOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import http from 'http';
import url from 'url';

// Mock implementation of the fixed WebSocket handler
function createFixedWebSocketHandler() {
    const connectionCounts = new Map<string, number>();
    const MAX_CONNECTIONS_PER_IP = 50;
    
    function getClientIP(req: http.IncomingMessage): string {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
               (req.headers['x-real-ip'] as string) ||
               req.socket.remoteAddress ||
               'unknown';
    }
    
    function safeClose(ws: WebSocket, code: number, reason?: string): void {
        try {
            // Validate close code to prevent invalid frame errors
            if (code < 1000 || code > 4999) {
                console.warn(`[WebSocket] Invalid close code ${code}, using 1000 instead`);
                code = 1000;
            }
            
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close(code, reason);
            }
        } catch (error) {
            console.error(`[WebSocket] Error closing connection: ${(error as Error).message}`);
            try {
                ws.terminate();
            } catch (terminateError) {
                console.error(`[WebSocket] Error terminating connection: ${(terminateError as Error).message}`);
            }
        }
    }
    
    function checkConnectionLimit(ip: string): boolean {
        const currentConnections = connectionCounts.get(ip) || 0;
        if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
            return false;
        }
        connectionCounts.set(ip, currentConnections + 1);
        return true;
    }
    
    function removeConnection(ip: string): void {
        const currentConnections = connectionCounts.get(ip) || 0;
        if (currentConnections > 0) {
            connectionCounts.set(ip, currentConnections - 1);
        }
    }
    
    function handleDashboardConnection(ws: WebSocket, clientIP: string): void {
        // Simple mock implementation
        ws.send(JSON.stringify({
            type: 'welcome',
            message: 'Dashboard connected'
        }));
    }
    
    return function connectionHandler(ws: WebSocket, req: http.IncomingMessage): void {
        try {
            const pathname = url.parse(req.url!).pathname;
            const clientIP = getClientIP(req);
            
            // THE KEY FIX: Let Socket.IO handle its own connections - ignore them here
            if (pathname && pathname.startsWith('/socket.io/')) {
                console.log(`[WebSocket] Ignoring Socket.IO connection to ${pathname} from ${clientIP}`);
                return;
            }
            
            console.log(`[WebSocket] Client connected to ${pathname} from ${clientIP}`);
            
            // Check connection limits
            if (!checkConnectionLimit(clientIP)) {
                safeClose(ws, 1008, 'Connection limit exceeded');
                return;
            }
            
            // Handle different WebSocket endpoints
            if (pathname === '/api/ws/dashboard' || pathname === '/ws/dashboard') {
                handleDashboardConnection(ws, clientIP);
            } else {
                removeConnection(clientIP);
                // Use 1008 (Policy Violation) instead of 1002 (Protocol Error) for unknown endpoints
                safeClose(ws, 1008, 'Unknown endpoint');
            }
        } catch (error) {
            console.error(`[WebSocket] Error handling WebSocket connection:`, error);
            try {
                removeConnection(getClientIP(req));
                safeClose(ws, 1011, 'Internal server error');
            } catch (closeError) {
                console.error(`[WebSocket] Error closing connection after error: ${(closeError as Error).message}`);
            }
        }
    };
}

describe('Socket.IO WebSocket Fix', () => {
    let server: http.Server;
    let io: IOServer;
    let wss: WebSocketServer;
    const PORT = 3003;
    
    beforeAll(async () => {
        server = http.createServer();
        
        // Initialize Socket.IO for general purpose (like the real implementation)
        io = new IOServer(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        
        // Initialize WebSocket Server for raw WebSocket connections with our fix
        wss = new WebSocketServer({ server });
        
        // Add error handling for the WebSocket server to prevent crashes
        wss.on('error', (error: Error) => {
            console.error('[WebSocket] WebSocket server error:', error);
        });
        
        const connectionHandler = createFixedWebSocketHandler();
        wss.on('connection', connectionHandler);
        
        await new Promise<void>((resolve) => {
            server.listen(PORT, resolve);
        });
    });
    
    afterAll(async () => {
        io.close();
        wss.close();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });
    
    it('should allow Socket.IO connections without interference', async () => {
        const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
            const client = ioClient(`http://localhost:${PORT}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                client.disconnect();
                resolve({ success: true });
            });
            
            client.on('connect_error', (error) => {
                resolve({ success: false, error: error.message });
            });
            
            setTimeout(() => {
                client.disconnect();
                resolve({ success: false, error: 'Connection timeout' });
            }, 3000);
        });
        
        expect(result.success).toBe(true);
        if (!result.success) {
            console.log('Socket.IO connection error:', result.error);
        }
    });
    
    it('should still handle raw WebSocket connections to valid endpoints', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/api/ws/dashboard`);
        
        const result = await new Promise<{ success: boolean; connected: boolean; error?: string }>((resolve) => {
            let connected = false;
            
            ws.on('open', () => {
                connected = true;
            });
            
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'welcome') {
                    ws.close();
                    resolve({ success: true, connected });
                }
            });
            
            ws.on('error', (error) => {
                resolve({ success: false, connected, error: error.message });
            });
            
            ws.on('close', (code) => {
                if (!connected) {
                    resolve({ success: false, connected, error: `Closed with code ${code}` });
                }
            });
            
            setTimeout(() => {
                ws.close();
                resolve({ success: false, connected, error: 'Timeout' });
            }, 2000);
        });
        
        expect(result.success).toBe(true);
        expect(result.connected).toBe(true);
    });
    
    it('should reject raw WebSocket connections to invalid endpoints with proper code', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/invalid/endpoint`);
        
        const result = await new Promise<{ success: boolean; code?: number; reason?: string }>((resolve) => {
            ws.on('open', () => {
                resolve({ success: false });
            });
            
            ws.on('close', (code, reason) => {
                resolve({ 
                    success: code === 1008 && reason.toString() === 'Unknown endpoint',
                    code,
                    reason: reason.toString()
                });
            });
            
            ws.on('error', (error) => {
                resolve({ success: false });
            });
            
            setTimeout(() => {
                resolve({ success: false });
            }, 2000);
        });
        
        expect(result.success).toBe(true);
        expect(result.code).toBe(1008);
        expect(result.reason).toBe('Unknown endpoint');
    });
    
    it('should not interfere with Socket.IO polling transport', async () => {
        const result = await new Promise<{ success: boolean; transport?: string; error?: string }>((resolve) => {
            const client = ioClient(`http://localhost:${PORT}`, {
                transports: ['polling'] // Force polling transport
            });
            
            client.on('connect', () => {
                const transport = client.io.engine.transport.name;
                client.disconnect();
                resolve({ success: true, transport });
            });
            
            client.on('connect_error', (error) => {
                resolve({ success: false, error: error.message });
            });
            
            setTimeout(() => {
                client.disconnect();
                resolve({ success: false, error: 'Connection timeout' });
            }, 3000);
        });
        
        expect(result.success).toBe(true);
        expect(result.transport).toBe('polling');
    });
});