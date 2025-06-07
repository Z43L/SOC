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
const MAX_RECONNECT_ATTEMPTS = 20; // Maximum number of reconnection attempts
const RECONNECT_RESET_INTERVAL = 10 * 60 * 1000; // Reset attempts after 10 minutes of successful connection

export interface TransportOptions {
  serverUrl: string;
  token?: string;
  serverCA?: string;
  enableCompression: boolean;
  autoReconnect?: boolean; // Add option to control auto-reconnection
}

export interface TransportRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  headers?: Record<string, string>;
}

export interface TransportResponse {
  success: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

export type CommandHandler = (command: Record<string, unknown>) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}>;

/**
 * Clase de transporte para comunicación con el servidor
 * 
 * Incluye las siguientes mejoras de seguridad:
 * - Límite máximo de intentos de reconexión (20 intentos)
 * - Reset automático del contador de reconexión después de conexión exitosa
 * - Validación del tamaño de mensajes (máximo 1MB)
 * - Validación básica del formato de mensajes
 * - Manejo mejorado de errores sin desconexión automática
 */
export class Transport extends EventEmitter {
  private options: TransportOptions;
  private config?: AgentConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private resetTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private lastSuccessfulConnection: number = 0;

  constructor(options: TransportOptions, config?: AgentConfig) {
    super();
    this.options = options;
    this.config = config;
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
        },
        // Security options
        rejectUnauthorized: true, // Always validate certificates by default
        timeout: 30000, // 30 second timeout
      };

      // Override certificate validation only if explicitly allowed in config
      if (this.config?.allowInsecureConnections) {
        reqOptions.rejectUnauthorized = false;
        console.warn('WARNING: Certificate validation is disabled. This should only be used in development.');
      }

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
        const wsUrl = new URL('/api/ws/agents', this.options.serverUrl);
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
          this.lastSuccessfulConnection = Date.now();
          this.reconnectAttempt = 0;
          
          // Set up timer to reset reconnect attempts after successful connection
          if (this.resetTimer) {
            clearTimeout(this.resetTimer);
          }
          this.resetTimer = setTimeout(() => {
            this.reconnectAttempt = 0;
            console.log('Reconnect attempt counter reset after successful connection period');
          }, RECONNECT_RESET_INTERVAL);
          
          this.emit('connected');
          resolve(true);
        });
        
        this.ws.on('message', async (data) => {
          try {
            // Message size validation
            const maxMessageSize = 1024 * 1024; // 1MB max
            let dataBuffer: Buffer;
            
            if (Buffer.isBuffer(data)) {
              dataBuffer = data;
            } else if (typeof data === 'string') {
              dataBuffer = Buffer.from(data, 'utf-8');
            } else if (data instanceof ArrayBuffer) {
              dataBuffer = Buffer.from(data);
            } else if (Array.isArray(data)) {
              // Handle Buffer array case
              dataBuffer = Buffer.concat(data);
            } else {
              console.warn('Received data in unexpected format, attempting conversion');
              dataBuffer = Buffer.from(String(data), 'utf-8');
            }
            
            if (dataBuffer.length > maxMessageSize) {
              console.warn(`Received oversized message: ${dataBuffer.length} bytes, ignoring`);
              return;
            }

            let messageData: Buffer;
            
            // Descomprimir si es necesario
            if (this.options.enableCompression) {
              messageData = zlib.inflateSync(dataBuffer);
            } else {
              messageData = dataBuffer;
            }
            
            const message = JSON.parse(messageData.toString('utf-8'));
            
            // Basic message validation
            if (typeof message !== 'object' || message === null) {
              console.warn('Received invalid message format, ignoring');
              return;
            }
            
            // Si es un comando, procesarlo
            if (message.type === 'command') {
              await this.handleCommand(message);
            }
            
            this.emit('message', message);
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
            // Don't disconnect on message parsing errors, just log and continue
          }
        });
        
        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          if (this.options.autoReconnect !== false) {
            this.scheduleReconnect();
          }
        });
        
        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          this.connected = false;
          if (this.options.autoReconnect !== false) {
            this.scheduleReconnect();
          }
        });
        
        // Timeout para la conexión inicial
        setTimeout(() => {
          if (!this.connected) {
            console.error('WebSocket connection timeout');
            if (this.ws) {
              this.ws.terminate();
              this.ws = null;
            }
            if (this.options.autoReconnect !== false) {
              this.scheduleReconnect();
            }
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        if (this.options.autoReconnect !== false) {
          this.scheduleReconnect();
        }
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
    
    // Check if we've exceeded maximum reconnection attempts
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection attempts.`);
      this.emit('maxReconnectAttemptsReached');
      return;
    }
    
    // Calcular tiempo de espera con jitter aleatorio
    const baseDelay = RECONNECT_INTERVALS[Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)];
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delay = baseDelay + jitter;
    
    console.log(`Scheduling WebSocket reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
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
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
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

  /**
   * Reconecta manualmente el WebSocket
   */
  async reconnect(): Promise<boolean> {
    await this.close();
    this.reconnectAttempt = 0; // Reset attempt counter
    return this.connectWebsocket();
  }

  /**
   * Verifica si está conectado
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Obtiene el estado de reconexión
   */
  getReconnectionStatus(): {
    connected: boolean;
    reconnectAttempt: number;
    maxAttempts: number;
    lastSuccessfulConnection: number;
    timeSinceLastConnection: number;
  } {
    return {
      connected: this.connected,
      reconnectAttempt: this.reconnectAttempt,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      timeSinceLastConnection: this.lastSuccessfulConnection ? Date.now() - this.lastSuccessfulConnection : 0
    };
  }

  /**
   * Reinicia el contador de intentos de reconexión manualmente
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
    console.log('Reconnect attempt counter manually reset');
  }
}