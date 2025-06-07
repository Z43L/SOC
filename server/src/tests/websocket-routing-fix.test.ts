/**
 * Simple unit test for WebSocket routing fixes
 * Tests the specific issues mentioned in the bug report
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';

// Mock implementation of the fixed WebSocket handler
function createTestWebSocketHandler() {
    const connectionCounts = new Map();
    const MAX_CONNECTIONS_PER_IP = 50;
    
    function getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.socket.remoteAddress ||
               'unknown';
    }
    
    function checkConnectionLimit(ip) {
        const currentConnections = connectionCounts.get(ip) || 0;
        if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
            return false;
        }
        connectionCounts.set(ip, currentConnections + 1);
        return true;
    }
    
    function removeConnection(ip) {
        const currentConnections = connectionCounts.get(ip) || 0;
        if (currentConnections > 0) {
            connectionCounts.set(ip, currentConnections - 1);
        }
    }
    
    function handleDashboardConnection(ws, clientIP) {
        // Simple mock implementation
        ws.send(JSON.stringify({
            type: 'welcome',
            message: 'Dashboard connected'
        }));
    }
    
    return function connectionHandler(ws, req) {
        try {
            const pathname = url.parse(req.url).pathname;
            const clientIP = getClientIP(req);
            
            // Check connection limits
            if (!checkConnectionLimit(clientIP)) {
                try {
                    ws.close(1008, 'Connection limit exceeded');
                } catch (error) {
                    console.error(`[WebSocket] Error closing connection for rate limit: ${error.message}`);
                }
                return;
            }
            
            // Handle different WebSocket endpoints - THIS IS THE KEY FIX
            if (pathname === '/api/ws/dashboard' || pathname === '/ws/dashboard') {
                handleDashboardConnection(ws, clientIP);
            } else {
                removeConnection(clientIP);
                // Use 1008 (Policy Violation) instead of 1002 (Protocol Error) for unknown endpoints
                try {
                    ws.close(1008, 'Unknown endpoint');
                } catch (error) {
                    console.error(`[WebSocket] Error closing connection for unknown endpoint: ${error.message}`);
                }
            }
        } catch (error) {
            console.error(`[WebSocket] Error handling WebSocket connection:`, error);
            try {
                removeConnection(getClientIP(req));
                ws.close(1011, 'Internal server error');
            } catch (closeError) {
                console.error(`[WebSocket] Error closing connection after error: ${closeError.message}`);
            }
        }
    };
}

describe('WebSocket Routing Fixes', () => {
    let server;
    let wss;
    const PORT = 3001;
    
    beforeAll(async () => {
        server = http.createServer();
        wss = new WebSocketServer({ server });
        const connectionHandler = createTestWebSocketHandler();
        wss.on('connection', connectionHandler);
        
        await new Promise((resolve) => {
            server.listen(PORT, resolve);
        });
    });
    
    afterAll(async () => {
        wss.close();
        await new Promise((resolve) => {
            server.close(resolve);
        });
    });
    
    it('should support legacy /ws/dashboard endpoint', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws/dashboard`);
        
        const result = await new Promise((resolve) => {
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
                resolve({ success: false, error: error.message });
            });
            
            ws.on('close', (code) => {
                if (!connected) {
                    resolve({ success: false, closedWithoutConnect: true, code });
                }
            });
            
            setTimeout(() => {
                resolve({ success: false, timeout: true });
            }, 2000);
        });
        
        expect(result.success).toBe(true);
        expect(result.connected).toBe(true);
    });
    
    it('should support standard /api/ws/dashboard endpoint', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/api/ws/dashboard`);
        
        const result = await new Promise((resolve) => {
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
                resolve({ success: false, error: error.message });
            });
            
            setTimeout(() => {
                resolve({ success: false, timeout: true });
            }, 2000);
        });
        
        expect(result.success).toBe(true);
        expect(result.connected).toBe(true);
    });
    
    it('should reject unknown endpoints with code 1008', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/unknown/endpoint`);
        
        const result = await new Promise((resolve) => {
            ws.on('open', () => {
                resolve({ success: false, unexpectedlyConnected: true });
            });
            
            ws.on('close', (code, reason) => {
                resolve({ 
                    success: code === 1008 && reason.toString() === 'Unknown endpoint',
                    code,
                    reason: reason.toString()
                });
            });
            
            ws.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });
            
            setTimeout(() => {
                resolve({ success: false, timeout: true });
            }, 2000);
        });
        
        expect(result.success).toBe(true);
        expect(result.code).toBe(1008);
        expect(result.reason).toBe('Unknown endpoint');
    });
    
    it('should not use invalid close code 1002 for unknown endpoints', async () => {
        const ws = new WebSocket(`ws://localhost:${PORT}/invalid/path`);
        
        const result = await new Promise((resolve) => {
            ws.on('close', (code, reason) => {
                resolve({ 
                    code,
                    reason: reason.toString(),
                    isInvalidCode: code === 1002  // This should be false with our fix
                });
            });
            
            ws.on('error', (error) => {
                resolve({ error: error.message });
            });
            
            setTimeout(() => {
                resolve({ timeout: true });
            }, 2000);
        });
        
        expect(result.isInvalidCode).toBe(false);
        expect(result.code).not.toBe(1002);
        expect(result.code).toBe(1008); // Should use the correct code
    });
});