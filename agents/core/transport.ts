/**
 * Transporte para comunicación con el servidor
 */

import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import WebSocket from 'ws';
import { AgentConfig } from './agent-config';
import { EventEmitter } from 'events';

// Intervalo de reconexión (ms)
const RECONNECT_INTERVALS = [5000, 10000, 30000, 60000, 120000];

export interface TransportOptions {
  serverUrl: string;
  token?: string;
  serverCA?: string;
  enableCompression: boolean;
}

export interface TransportRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  headers?: Record<string, string>;
}

export interface TransportResponse {
  success: boolean;
  status: number;
  data?: any;
  error?: string;
}

export type CommandHandler = (command: any) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}>;

/**
 * Clase de transporte para comunicación con el servidor
 */
export class Transport extends EventEmitter {
  private options: TransportOptions;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private commandHandlers: Map<string, CommandHandler> = new Map();

  constructor(options: TransportOptions) {
    super();
    this.options = options;
  }

  /**
   * Realiza una petición HTTPS al servidor
   */
  async request(req: TransportRequest): Promise<TransportResponse> {
    const url = new URL(req.endpoint, this.options.serverUrl);
    
    return new Promise((resolve) => {
      const reqOptions: https.RequestOptions = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(this.options.token ? { 'Authorization': `Bearer ${this.options.token}` } : {}),
          ...(req.headers || {})
        }
      };

      // Añadir certificado CA personalizado si se proporciona
      if (this.options.serverCA) {
        reqOptions.ca = this.options.serverCA;
      }

      let data: Buffer | null = null;
      if (req.data) {
        data = Buffer.from(JSON.stringify(req.data));
        
        // Comprimir datos si está habilitado
        if (this.options.enableCompression) {
          data = zlib.deflateSync(data);
          (reqOptions.headers as any)['Content-Encoding'] = 'deflate';
        }
        
        (reqOptions.headers as any)['Content-Length'] = data.length.toString();
      }

      const httpModule = url.protocol === 'https:' ? https : http;
      const request = httpModule.request(url, reqOptions, (response) => {
        const chunks: Buffer[] = [];
        
        response.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        
        response.on('end', () => {
          const responseBuffer = Buffer.concat(chunks);
          let responseData: any = null;
          
          try {
            // Manejar respuesta comprimida
            const contentEncoding = response.headers['content-encoding'];
            let decompressedData: Buffer;
            
            if (contentEncoding === 'gzip') {
              decompressedData = zlib.gunzipSync(responseBuffer);
            } else if (contentEncoding === 'deflate') {
              decompressedData = zlib.inflateSync(responseBuffer);
            } else {
              decompressedData = responseBuffer;
            }
            
            if (decompressedData.length > 0) {
              responseData = JSON.parse(decompressedData.toString('utf-8'));
            }
          } catch (error) {
            console.error('Error parsing response:', error);
          }
          
          const success = response.statusCode && response.statusCode >= 200 && response.statusCode < 300;
          
          resolve({
            success: !!success,
            status: response.statusCode || 0,
            data: responseData,
            error: !success ? (responseData?.error || 'Unknown error') : undefined
          });
        });
      });
      
      request.on('error', (error) => {
        resolve({
          success: false,
          status: 0,
          error: `Network error: ${error.message}`
        });
      });
      
      if (data) {
        request.write(data);
      }
      
      request.end();
    });
  }

  /**
   * Inicia una conexión WebSocket con el servidor
   */
  async connectWebsocket(): Promise<boolean> {
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (e) {
        // Ignorar errores al cerrar
      }
      this.ws = null;
    }

    return new Promise((resolve) => {
      try {
        const wsUrl = new URL('/ws/agent', this.options.serverUrl);
        wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
        
        // Añadir token a la URL si está disponible
        if (this.options.token) {
          wsUrl.searchParams.append('token', this.options.token);
        }

        const wsOptions: WebSocket.ClientOptions = {
          headers: {
            'User-Agent': 'SOC-Agent/1.0',
          }
        };

        // Añadir certificado CA personalizado si se proporciona
        if (this.options.serverCA) {
          wsOptions.ca = this.options.serverCA;
        }

        this.ws = new WebSocket(wsUrl.toString(), wsOptions);
        
        this.ws.on('open', () => {
          console.log('WebSocket connection established');
          this.connected = true;
          this.reconnectAttempt = 0;
          this.emit('connected');
          resolve(true);
        });
        
        this.ws.on('message', async (data) => {
          try {
            let messageData: Buffer;
            
            // Descomprimir si es necesario
            if (this.options.enableCompression) {
              messageData = zlib.inflateSync(data as Buffer);
            } else {
              messageData = data as Buffer;
            }
            
            const message = JSON.parse(messageData.toString('utf-8'));
            
            // Si es un comando, procesarlo
            if (message.type === 'command') {
              await this.handleCommand(message);
            }
            
            this.emit('message', message);
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        });
        
        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.scheduleReconnect();
        });
        
        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          this.connected = false;
          this.scheduleReconnect();
        });
        
        // Timeout para la conexión inicial
        setTimeout(() => {
          if (!this.connected) {
            console.error('WebSocket connection timeout');
            if (this.ws) {
              this.ws.terminate();
              this.ws = null;
            }
            this.scheduleReconnect();
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        this.scheduleReconnect();
        resolve(false);
      }
    });
  }

  /**
   * Envía un mensaje a través del WebSocket
   */
  async sendWsMessage(data: any): Promise<boolean> {
    if (!this.connected || !this.ws) {
      await this.connectWebsocket();
      
      // Si sigue sin estar conectado, fallar
      if (!this.connected || !this.ws) {
        return false;
      }
    }
    
    try {
      let messageData = Buffer.from(JSON.stringify(data));
      
      // Comprimir si está habilitado
      if (this.options.enableCompression) {
        messageData = zlib.deflateSync(messageData);
      }
      
      this.ws.send(messageData);
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  /**
   * Programa un intento de reconexión con backoff exponencial
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Calcular tiempo de espera con jitter aleatorio
    const baseDelay = RECONNECT_INTERVALS[Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)];
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delay = baseDelay + jitter;
    
    console.log(`Scheduling WebSocket reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt + 1})`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempt++;
      await this.connectWebsocket();
    }, delay);
  }

  /**
   * Registra un manejador para un tipo de comando
   */
  registerCommandHandler(commandType: string, handler: CommandHandler): void {
    this.commandHandlers.set(commandType, handler);
  }

  /**
   * Maneja un comando recibido por WebSocket
   */
  private async handleCommand(message: any): Promise<void> {
    if (!message.command || typeof message.command !== 'string') {
      console.error('Invalid command received:', message);
      return;
    }
    
    const handler = this.commandHandlers.get(message.command);
    if (!handler) {
      console.warn(`No handler registered for command type: ${message.command}`);
      
      // Enviar respuesta de error
      await this.sendWsMessage({
        type: 'commandResponse',
        requestId: message.requestId,
        success: false,
        error: `Unsupported command: ${message.command}`,
        result: {
          stdout: '',
          stderr: `Unsupported command: ${message.command}`,
          exitCode: 1,
          durationMs: 0
        }
      });
      
      return;
    }
    
    try {
      console.log(`Executing command: ${message.command}`);
      const startTime = Date.now();
      
      const result = await handler(message.data || {});
      const duration = Date.now() - startTime;
      
      // Enviar respuesta
      await this.sendWsMessage({
        type: 'commandResponse',
        requestId: message.requestId,
        success: result.exitCode === 0,
        result: {
          ...result,
          durationMs: duration
        }
      });
    } catch (error) {
      console.error(`Error executing command ${message.command}:`, error);
      
      // Enviar respuesta de error
      await this.sendWsMessage({
        type: 'commandResponse',
        requestId: message.requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        result: {
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unknown error',
          exitCode: 1,
          durationMs: 0
        }
      });
    }
  }

  /**
   * Cierra la conexión WebSocket
   */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (e) {
        // Ignorar errores al cerrar
      }
      this.ws = null;
    }
    
    this.connected = false;
  }
}