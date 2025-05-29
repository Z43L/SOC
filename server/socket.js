import { Server as IOServer } from 'socket.io';
import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';
let io;
let wss;
export function initWebSocket(server) {
    // Initialize Socket.IO for general purpose
    io = new IOServer(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST']
        }
    });
    // Initialize WebSocket Server for raw WebSocket connections
    wss = new WebSocketServer({
        server,
        path: '/ws' // This will handle /ws/* paths
    });
    // Handle WebSocket connections
    wss.on('connection', (ws, req) => {
        const pathname = url.parse(req.url).pathname;
        console.log(`[WebSocket] Client connected to ${pathname}`);
        // Handle different WebSocket endpoints
        if (pathname === '/ws/dashboard') {
            handleDashboardConnection(ws);
        }
        else if (pathname === '/api/ws/connectors') {
            handleConnectorsConnection(ws);
        }
        else {
            console.log(`[WebSocket] Unknown endpoint: ${pathname}`);
            ws.close(1002, 'Unknown endpoint');
        }
    });
    return io;
}
function handleDashboardConnection(ws) {
    console.log('[WebSocket] Dashboard client connected');
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('[WebSocket] Dashboard message:', message);
            // Handle dashboard-specific messages
        }
        catch (error) {
            console.error('[WebSocket] Error parsing dashboard message:', error);
        }
    });
    ws.on('close', () => {
        console.log('[WebSocket] Dashboard client disconnected');
    });
    // Send periodic updates (demo)
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'dashboard_update',
                timestamp: new Date().toISOString(),
                data: { status: 'active' }
            }));
        }
        else {
            clearInterval(interval);
        }
    }, 30000);
}
function handleConnectorsConnection(ws) {
    console.log('[WebSocket] Connectors client connected');
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('[WebSocket] Connectors message:', message);
            // Handle connectors-specific messages
        }
        catch (error) {
            console.error('[WebSocket] Error parsing connectors message:', error);
        }
    });
    ws.on('close', () => {
        console.log('[WebSocket] Connectors client disconnected');
    });
}
export function getIo() {
    if (!io)
        throw new Error('Socket.io not initialized');
    return io;
}
export function getWebSocketServer() {
    if (!wss)
        throw new Error('WebSocket server not initialized');
    return wss;
}
