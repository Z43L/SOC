import { Server as IOServer } from 'socket.io';
import http from 'http';

let io: IOServer;

export function initWebSocket(server: http.Server) {
  io = new IOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });
  return io;
}

export function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
