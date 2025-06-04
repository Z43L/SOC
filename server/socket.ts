import { Server as IOServer } from 'socket.io';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import http from 'http';
import url from 'url';

let io: IOServer;
let wss: WebSocketServer;

// Connection tracking and rate limiting
const connectionCounts = new Map<string, number>();
const messageRateLimits = new Map<string, { count: number; lastReset: number }>();
const MAX_CONNECTIONS_PER_IP = 50;
const MAX_MESSAGES_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function getClientIP(req: http.IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         (req.headers['x-real-ip'] as string) ||
         req.socket.remoteAddress ||
         'unknown';
}

function checkConnectionLimit(ip: string): boolean {
  const currentConnections = connectionCounts.get(ip) || 0;
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    console.warn(`[WebSocket] Connection limit exceeded for IP: ${ip}`);
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

function checkMessageRateLimit(ip: string): boolean {
  const now = Date.now();
  const rateInfo = messageRateLimits.get(ip) || { count: 0, lastReset: now };
  
  // Reset counter if window has passed
  if (now - rateInfo.lastReset > RATE_LIMIT_WINDOW) {
    rateInfo.count = 0;
    rateInfo.lastReset = now;
  }
  
  if (rateInfo.count >= MAX_MESSAGES_PER_MINUTE) {
    console.warn(`[WebSocket] Message rate limit exceeded for IP: ${ip}`);
    return false;
  }
  
  rateInfo.count++;
  messageRateLimits.set(ip, rateInfo);
  return true;
}

export function initWebSocket(server: http.Server) {
  // Initialize Socket.IO for general purpose
  io = new IOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  // Initialize WebSocket Server for raw WebSocket connections
  wss = new WebSocketServer({ server });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const pathname = url.parse(req.url!).pathname;
    const clientIP = getClientIP(req);
    
    console.log(`[WebSocket] Client connected to ${pathname} from ${clientIP}`);
    
    // Check connection limits
    if (!checkConnectionLimit(clientIP)) {
      ws.close(1008, 'Connection limit exceeded');
      return;
    }
    
    // Handle different WebSocket endpoints
    if (pathname === '/api/ws/dashboard') {
      handleDashboardConnection(ws, clientIP);
    } else if (pathname === '/api/ws/connectors') {
      handleConnectorsConnection(ws, clientIP);
    } else {
      console.log(`[WebSocket] Unknown endpoint: ${pathname}`);
      removeConnection(clientIP);
      ws.close(1002, 'Unknown endpoint');
    }
  });

  return io;
}

function handleDashboardConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Dashboard client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 10; // 10KB max message size
  
  ws.on('message', (data: RawData) => {
    try {
      // Rate limiting
      if (!checkMessageRateLimit(clientIP)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      
      // Message size validation
      if (data.length > maxMessageSize) {
        console.warn(`[WebSocket] Message too large from ${clientIP}: ${data.length} bytes`);
        ws.close(1009, 'Message too large');
        return;
      }
      
      const message = JSON.parse(data.toString());
      
      // Basic message validation
      if (typeof message !== 'object' || message === null) {
        console.warn(`[WebSocket] Invalid message format from ${clientIP}`);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
        return;
      }
      
      console.log('[WebSocket] Dashboard message:', { 
        type: message.type, 
        from: clientIP,
        messageId: ++messageCount 
      });
      
      // Handle dashboard-specific messages
      // Add your dashboard message handling logic here
      
    } catch (error) {
      console.error(`[WebSocket] Error parsing dashboard message from ${clientIP}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        dataLength: data.length,
        messageCount
      });
      
      // Send error response if connection is still open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Message parsing failed' 
        }));
      }
    }
  });

  ws.on('close', (code: number, reason: any) => {
    console.log(`[WebSocket] Dashboard client disconnected: ${code} ${reason}`);
    removeConnection(clientIP);
  });

  ws.on('error', (error: Error) => {
    console.error(`[WebSocket] Dashboard connection error from ${clientIP}:`, error);
    removeConnection(clientIP);
  });

  // Send periodic updates (demo)
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'dashboard_update',
          timestamp: new Date().toISOString(),
          data: { status: 'active' }
        }));
      } catch (error) {
        console.error(`[WebSocket] Error sending dashboard update to ${clientIP}:`, error);
        clearInterval(interval);
      }
    } else {
      clearInterval(interval);
    }
  }, 30000);
  
  // Clean up interval on close
  ws.on('close', () => clearInterval(interval));
}

function handleConnectorsConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Connectors client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 50; // 50KB max for connector messages
  
  ws.on('message', (data: RawData) => {
    try {
      // Rate limiting
      if (!checkMessageRateLimit(clientIP)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      
      // Message size validation
      if (data.length > maxMessageSize) {
        console.warn(`[WebSocket] Connector message too large from ${clientIP}: ${data.length} bytes`);
        ws.close(1009, 'Message too large');
        return;
      }
      
      const message = JSON.parse(data.toString());
      
      // Basic message validation
      if (typeof message !== 'object' || message === null) {
        console.warn(`[WebSocket] Invalid connector message format from ${clientIP}`);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
        return;
      }
      
      console.log('[WebSocket] Connectors message:', { 
        type: message.type, 
        from: clientIP,
        messageId: ++messageCount 
      });
      
      // Handle connectors-specific messages
      // Add your connector message handling logic here
      
    } catch (error) {
      console.error(`[WebSocket] Error parsing connectors message from ${clientIP}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        dataLength: data.length,
        messageCount
      });
      
      // Send error response if connection is still open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Message parsing failed' 
        }));
      }
    }
  });

  ws.on('close', (code: number, reason: any) => {
    console.log(`[WebSocket] Connectors client disconnected: ${code} ${reason}`);
    removeConnection(clientIP);
  });

  ws.on('error', (error: Error) => {
    console.error(`[WebSocket] Connectors connection error from ${clientIP}:`, error);
    removeConnection(clientIP);
  });
}

export function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function getWebSocketServer() {
  if (!wss) throw new Error('WebSocket server not initialized');
  return wss;
}
