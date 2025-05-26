/**
 * Módulo de comunicación con el servidor SOC
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { AgentConfig } from './agent-config';
import { AgentEvent } from './monitoring';

/**
 * Clase para gestionar la comunicación con el servidor SOC
 */
export class AgentCommunication {
  private config: AgentConfig;
  private authToken: string | null = null;
  private tokenExpiration: Date | null = null;
  
  constructor(config: AgentConfig) {
    this.config = config;
  }
  
  /**
   * Registra el agente con el servidor SOC
   */
  async registerAgent(
    hostname: string,
    ip: string,
    os: string,
    version: string,
    capabilities: string[]
  ): Promise<{
    success: boolean;
    agentId?: string;
    message?: string;
    config?: {
      heartbeatInterval?: number;
      endpoints?: {
        data?: string;
        heartbeat?: string;
      }
    }
  }> {
    try {
      const payload = {
        hostname,
        ip,
        os,
        version,
        capabilities,
        registrationKey: this.config.registrationKey
      };
      
      const response = await this.sendRequest(
        'POST',
        this.config.registrationEndpoint,
        payload
      );
      
      if (!response.success) {
        return {
          success: false,
          message: response.message || 'Registration failed'
        };
      }
      
      // Verificar que la respuesta contiene un ID de agente
      if (!response.data || !response.data.agentId) {
        return {
          success: false,
          message: 'Registration response missing agent ID'
        };
      }
      
      // Guardar token de autenticación si existe
      if (response.data.token) {
        this.authToken = response.data.token;
        
        // Establecer expiración del token (por defecto 24 horas si no se especifica)
        const expirationSeconds = response.data.tokenExpiration || 24 * 60 * 60;
        this.tokenExpiration = new Date();
        this.tokenExpiration.setSeconds(this.tokenExpiration.getSeconds() + expirationSeconds);
      }
      
      return {
        success: true,
        agentId: response.data.agentId,
        config: response.data.config
      };
    } catch (error) {
      console.error('Error registering agent:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Envía eventos al servidor SOC
   */
  async sendEvents(events: Omit<AgentEvent, 'agentId' | 'signature'>[]): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      if (!this.config.agentId) {
        return {
          success: false,
          message: 'Agent not registered (missing agent ID)'
        };
      }
      
      // Preparar eventos con ID del agente y firma si es necesario
      const formattedEvents: AgentEvent[] = await Promise.all(
        events.map(async (event) => {
          const fullEvent: AgentEvent = {
            ...event,
            agentId: this.config.agentId as string
          };
          
          // Añadir firma digital si está configurado
          if (this.config.signMessages && this.config.privateKeyPath) {
            fullEvent.signature = await this.signEvent(fullEvent);
          }
          
          return fullEvent;
        })
      );
      
      const payload = {
        events: formattedEvents
      };
      
      const response = await this.sendRequest(
        'POST',
        this.config.dataEndpoint,
        payload
      );
      
      return {
        success: response.success,
        message: response.message
      };
    } catch (error) {
      console.error('Error sending events:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Envía un heartbeat al servidor SOC
   */
  async sendHeartbeat(
    status: 'active' | 'warning' | 'error' | 'inactive',
    metrics?: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    }
  ): Promise<{
    success: boolean;
    message?: string;
    config?: any;
  }> {
    try {
      if (!this.config.agentId) {
        return {
          success: false,
          message: 'Agent not registered (missing agent ID)'
        };
      }
      // LOG para depuración del token JWT
      console.log('Token usado para heartbeat:', this.authToken);
      const payload = {
        agentId: this.config.agentId,
        status,
        timestamp: new Date().toISOString(),
        metrics: metrics || {}
      };
      
      const response = await this.sendRequest(
        'POST',
        this.config.heartbeatEndpoint,
        payload
      );
      
      return {
        success: response.success,
        message: response.message,
        config: response.data?.config || {}
      };
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Obtiene un token de autenticación
   */
  private getAuthToken(): string {
    // Si no hay token o está expirado, usar el ID del agente como autenticación básica
    if (!this.authToken || (this.tokenExpiration && new Date() > this.tokenExpiration)) {
      return this.config.agentId || '';
    }
    
    return this.authToken;
  }
  
  /**
   * Envía una solicitud HTTP/HTTPS al servidor
   */
  private sendRequest(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: any
  ): Promise<{
    success: boolean;
    message?: string;
    data?: any;
  }> {
    return new Promise((resolve) => {
      try {
        // Determinar protocolo basado en URL
        const isHttps = this.config.serverUrl.startsWith('https://');
        const httpModule = isHttps ? https : http;
        
        // Construir URL completa
        let url = this.config.serverUrl;
        if (!url.endsWith('/') && !endpoint.startsWith('/')) {
          url += '/';
        }
        url += endpoint;
        
        // Analizar URL para obtener host, path, etc.
        const urlObj = new URL(url);
        
        // Preparar datos si es necesario
        const payload = data ? JSON.stringify(data) : '';
        
        // Opciones de la solicitud
        const options: http.RequestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'User-Agent': 'SOC-Inteligente-Agent',
            'Authorization': `Bearer ${this.getAuthToken()}`
          }
        };
        
        // Realizar solicitud
        const req = httpModule.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            try {
              // Intentar analizar respuesta como JSON
              const response = responseData ? JSON.parse(responseData) : {};
              
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve({
                  success: true,
                  data: response.data || response
                });
              } else {
                resolve({
                  success: false,
                  message: response.message || `HTTP Error: ${res.statusCode}`,
                  data: response.data
                });
              }
            } catch (error) {
              resolve({
                success: false,
                message: 'Error parsing server response: ' + (error instanceof Error ? error.message : 'Unknown error')
              });
            }
          });
        });
        
        req.on('error', (error) => {
          resolve({
            success: false,
            message: 'Request error: ' + error.message
          });
        });
        
        if (payload) {
          req.write(payload);
        }
        
        req.end();
      } catch (error) {
        resolve({
          success: false,
          message: 'Request exception: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
      }
    });
  }
  
  /**
   * Firma digitalmente un evento utilizando la clave privada
   */
  private async signEvent(event: Omit<AgentEvent, 'signature'>): Promise<string> {
    try {
      if (!this.config.privateKeyPath) {
        throw new Error('Private key path not configured for signing');
      }
      
      // Leer clave privada
      const privateKeyData = await fs.readFile(this.config.privateKeyPath, 'utf-8');
      
      // Crear firma
      const sign = crypto.createSign('SHA256');
      
      // Crear copia del evento sin la firma para serializar
      const eventCopy = { ...event };
      
      // Actualizar con los datos serializados
      sign.update(JSON.stringify(eventCopy));
      
      // Firmar con la clave privada
      return sign.sign(privateKeyData, 'base64');
    } catch (error) {
      console.error('Error signing event:', error);
      return 'SIGNING_ERROR';
    }
  }
}