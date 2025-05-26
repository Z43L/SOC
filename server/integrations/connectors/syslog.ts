/**
 * Implementación de conectores de tipo Syslog
 * Permite recibir logs de sistemas mediante el protocolo Syslog
 */

import { Connector, InsertAlert } from '@shared/schema';
import { BaseConnector, ConnectorConfig, ConnectorResult } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import * as dgram from 'dgram';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import * as path from 'path';
import { aiParser } from '../ai-parser-service';

/**
 * Configuración específica para conectores de tipo Syslog
 */
export interface SyslogConnectorConfig extends ConnectorConfig {
  protocol: 'udp' | 'tcp' | 'tls';
  port: number;
  host?: string; // Por defecto es 0.0.0.0
  useTLS?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCA?: string;
  filtering?: {
    include?: string[];
    exclude?: string[];
  };
  parsers?: {
    [key: string]: {
      pattern: string;
      fields: Record<string, string>;
    }
  };
  severityMapping?: Record<string, string>;
}

/**
 * Conector para recibir logs Syslog
 */
export class SyslogConnector extends BaseConnector {
  protected config: SyslogConnectorConfig;
  private server: dgram.Socket | net.Server | tls.Server | null = null;
  private isListening: boolean = false;
  private syslogBuffer: string[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  
  constructor(connector: Connector) {
    super(connector);
    this.config = this.connector.configuration as SyslogConnectorConfig;
  }
  
  /**
   * Validar la configuración del conector
   */
  public validateConfig(): boolean {
    // Verificar campos obligatorios
    if (!this.config.protocol) {
      log(`Conector ${this.connector.name} no tiene protocolo configurado`, 'connector');
      return false;
    }
    
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
      log(`Conector ${this.connector.name} tiene un puerto inválido, usando 514 por defecto`, 'connector');
      this.config.port = 514; // Puerto Syslog por defecto
    }
    
    // Si se usa TLS, verificar certificados
    if (this.config.protocol === 'tls' || this.config.useTLS) {
      if (!this.config.tlsCert || !this.config.tlsKey) {
        log(`Conector ${this.connector.name} usa TLS pero no tiene certificados configurados`, 'connector');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Iniciar el servidor Syslog
   */
  private async startServer(): Promise<boolean> {
    if (this.isListening) {
      return true;
    }
    
    try {
      // Diferentes implementaciones según el protocolo
      if (this.config.protocol === 'udp') {
        this.server = dgram.createSocket('udp4');
        
        this.server.on('message', (msg, rinfo) => {
          const message = msg.toString().trim();
          this.handleSyslogMessage(message, rinfo.address);
        });
        
        this.server.on('error', (err) => {
          log(`Error en servidor Syslog UDP: ${err.message}`, 'connector');
          this.isListening = false;
        });
        
        await new Promise<void>((resolve, reject) => {
          if (!this.server) return reject(new Error('Server not initialized'));
          this.server.bind(this.config.port, this.config.host || '0.0.0.0', () => {
            log(`Servidor Syslog UDP escuchando en ${this.config.host || '0.0.0.0'}:${this.config.port}`, 'connector');
            resolve();
          });
        });
      } else if (this.config.protocol === 'tcp') {
        this.server = net.createServer((socket) => {
          const remoteAddress = socket.remoteAddress || 'unknown';
          log(`Cliente Syslog conectado desde ${remoteAddress}`, 'connector');
          
          socket.on('data', (data) => {
            const messages = this.parseStreamData(data.toString());
            for (const message of messages) {
              this.handleSyslogMessage(message, remoteAddress);
            }
          });
          
          socket.on('error', (err) => {
            log(`Error en conexión Syslog TCP desde ${remoteAddress}: ${err.message}`, 'connector');
          });
          
          socket.on('close', () => {
            log(`Cliente Syslog desconectado desde ${remoteAddress}`, 'connector');
          });
        });
        
        this.server.on('error', (err) => {
          log(`Error en servidor Syslog TCP: ${err.message}`, 'connector');
          this.isListening = false;
        });
        
        await new Promise<void>((resolve, reject) => {
          if (!this.server) return reject(new Error('Server not initialized'));
          this.server.listen(this.config.port, this.config.host || '0.0.0.0', () => {
            log(`Servidor Syslog TCP escuchando en ${this.config.host || '0.0.0.0'}:${this.config.port}`, 'connector');
            resolve();
          });
        });
      } else if (this.config.protocol === 'tls') {
        // Verificar y cargar certificados
        try {
          const tlsOptions: tls.TlsOptions = {
            key: fs.readFileSync(this.config.tlsKey || ''),
            cert: fs.readFileSync(this.config.tlsCert || '')
          };
          
          if (this.config.tlsCA) {
            tlsOptions.ca = fs.readFileSync(this.config.tlsCA);
          }
          
          this.server = tls.createServer(tlsOptions, (socket) => {
            const remoteAddress = socket.remoteAddress || 'unknown';
            log(`Cliente Syslog TLS conectado desde ${remoteAddress}`, 'connector');
            
            socket.on('data', (data) => {
              const messages = this.parseStreamData(data.toString());
              for (const message of messages) {
                this.handleSyslogMessage(message, remoteAddress);
              }
            });
            
            socket.on('error', (err) => {
              log(`Error en conexión Syslog TLS desde ${remoteAddress}: ${err.message}`, 'connector');
            });
            
            socket.on('close', () => {
              log(`Cliente Syslog TLS desconectado desde ${remoteAddress}`, 'connector');
            });
          });
          
          this.server.on('error', (err) => {
            log(`Error en servidor Syslog TLS: ${err.message}`, 'connector');
            this.isListening = false;
          });
          
          await new Promise<void>((resolve, reject) => {
            if (!this.server) return reject(new Error('Server not initialized'));
            this.server.listen(this.config.port, this.config.host || '0.0.0.0', () => {
              log(`Servidor Syslog TLS escuchando en ${this.config.host || '0.0.0.0'}:${this.config.port}`, 'connector');
              resolve();
            });
          });
        } catch (certError) {
          log(`Error cargando certificados TLS: ${certError instanceof Error ? certError.message : 'Error desconocido'}`, 'connector');
          return false;
        }
      } else {
        log(`Protocolo ${this.config.protocol} no soportado`, 'connector');
        return false;
      }
      
      this.isListening = true;
      
      // Configurar procesamiento periódico del buffer
      this.processingInterval = setInterval(() => {
        this.processSyslogBuffer();
      }, 10000); // Procesar cada 10 segundos
      
      return true;
    } catch (error) {
      log(`Error iniciando servidor Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      return false;
    }
  }
  
  /**
   * Detener el servidor Syslog
   */
  private stopServer(): void {
    // Limpiar intervalo de procesamiento
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // Cerrar servidor según el tipo
    if (this.server) {
      try {
        if (this.config.protocol === 'udp') {
          (this.server as dgram.Socket).close();
        } else {
          (this.server as net.Server).close();
        }
        this.server = null;
      } catch (error) {
        log(`Error cerrando servidor Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      }
    }
    
    this.isListening = false;
  }
  
  /**
   * Ejecutar el conector
   */
  public async execute(): Promise<ConnectorResult> {
    const startTime = Date.now();
    
    try {
      // Validar configuración
      if (!this.validateConfig()) {
        await this.updateConnectorStatus(false, 'Configuración inválida');
        return {
          success: false,
          message: 'Configuración del conector inválida'
        };
      }
      
      log(`Ejecutando conector Syslog ${this.connector.name}`, 'connector');
      
      // Iniciar el servidor si no está en ejecución
      const serverStarted = await this.startServer();
      if (!serverStarted) {
        await this.updateConnectorStatus(false, 'Error iniciando servidor Syslog');
        return {
          success: false,
          message: 'Error iniciando servidor Syslog'
        };
      }
      
      // Actualizar estadísticas
      this.state.executionTime = Date.now() - startTime;
      
      // Actualizar estado del conector
      await this.updateConnectorStatus(true);
      
      return {
        success: true,
        message: `Servidor Syslog activo en puerto ${this.config.port}/${this.config.protocol}`,
        metrics: {
          itemsProcessed: this.state.dataProcessed,
          bytesProcessed: this.state.bytesProcessed,
          executionTime: this.state.executionTime
        }
      };
    } catch (error) {
      log(`Error ejecutando conector Syslog ${this.connector.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      
      // Detener el servidor en caso de error crítico
      this.stopServer();
      
      // Actualizar estado
      await this.updateConnectorStatus(false, error instanceof Error ? error.message : 'Error desconocido');
      
      return {
        success: false,
        message: `Error ejecutando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }
  
  /**
   * Maneja un mensaje Syslog recibido
   */
  private handleSyslogMessage(message: string, sourceIp: string): void {
    // Comprobar filtros de inclusión/exclusión
    if (this.config.filtering) {
      if (this.config.filtering.exclude) {
        for (const pattern of this.config.filtering.exclude) {
          if (message.includes(pattern)) {
            return; // Excluir este mensaje
          }
        }
      }
      
      if (this.config.filtering.include) {
        let included = false;
        for (const pattern of this.config.filtering.include) {
          if (message.includes(pattern)) {
            included = true;
            break;
          }
        }
        if (!included) return; // No incluido en ningún patrón
      }
    }
    
    // Actualizar estadísticas
    this.state.bytesProcessed += message.length;
    this.state.dataProcessed++;
    
    // Añadir al buffer para procesamiento por lotes
    this.syslogBuffer.push(message);
    
    // Si el buffer es muy grande, procesarlo inmediatamente
    if (this.syslogBuffer.length >= 1000) {
      this.processSyslogBuffer();
    }
  }
  
  /**
   * Divide un stream de datos en mensajes Syslog individuales
   */
  private parseStreamData(data: string): string[] {
    // Buscar diferentes terminadores de mensaje
    return data
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(message => message.trim().length > 0);
  }
  
  /**
   * Procesa el buffer de mensajes Syslog
   */
  private async processSyslogBuffer(): Promise<void> {
    if (this.syslogBuffer.length === 0) return;
    const messagesToProcess = [...this.syslogBuffer];
    this.syslogBuffer = [];
    log(`Procesando ${messagesToProcess.length} mensajes Syslog`, 'connector');
    const alerts: InsertAlert[] = [];
    for (const message of messagesToProcess) {
      try {
        let parsedMessage = this.parseSyslogMessage(message);
        // Fallback IA si el parser convencional no extrae campos relevantes
        if (!parsedMessage || (!parsedMessage.message && !parsedMessage.host)) {
          const aiResult = await aiParser.parseLogs(message, this.connector);
          if (aiResult.success && aiResult.data && aiResult.data.length > 0) {
            parsedMessage = aiResult.data[0];
            parsedMessage._parser = 'ai';
          }
        }
        if (parsedMessage && this.shouldCreateAlert(parsedMessage)) {
          const alert = this.createAlertFromSyslog(parsedMessage);
          // ...aquí va el manejo del alert, si es necesario...
        }
      } catch (error) {
        log(`Error procesando mensaje Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      }
    }
  }
}