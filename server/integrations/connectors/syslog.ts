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
        const parsedMessage = this.parseSyslogMessage(message);
        if (parsedMessage && this.shouldCreateAlert(parsedMessage)) {
          const alert = this.createAlertFromSyslog(parsedMessage);
          if (alert) {
            await storage.createAlert(alert);
            alerts.push(alert);
          }
        }
      } catch (error) {
        log(`Error procesando mensaje Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      }
    }
    
    log(`Creadas ${alerts.length} alertas de ${messagesToProcess.length} mensajes Syslog`, 'connector');
  }
  
  /**
   * Parse un mensaje Syslog en sus componentes
   */
  private parseSyslogMessage(message: string): any {
    try {
      // Intentar parsear cada formato configurado
      if (this.config.parsers) {
        for (const [parserName, parser] of Object.entries(this.config.parsers)) {
          try {
            const regex = new RegExp(parser.pattern);
            const match = regex.exec(message);
            
            if (match) {
              const result: Record<string, any> = {
                _raw: message,
                _parser: parserName
              };
              
              // Extraer campos basados en grupos de regex
              for (const [field, group] of Object.entries(parser.fields)) {
                const groupIndex = parseInt(group, 10);
                if (!isNaN(groupIndex) && match[groupIndex]) {
                  result[field] = match[groupIndex];
                }
              }
              
              return result;
            }
          } catch (regexError) {
            log(`Error en regex del parser ${parserName}: ${regexError instanceof Error ? regexError.message : 'Error desconocido'}`, 'connector');
          }
        }
      }
      
      // Parser por defecto para formato Syslog estándar (RFC 3164)
      const standardPattern = /^<(\d+)>(?:\d+\s)?(?:(\w{3}\s+\d+\s+\d+:\d+:\d+)\s+)?([^:]+):\s+(.*)$/;
      const match = standardPattern.exec(message);
      
      if (match) {
        const priority = parseInt(match[1], 10);
        const facility = Math.floor(priority / 8);
        const severity = priority % 8;
        
        return {
          _raw: message,
          _parser: 'standard',
          timestamp: match[2] || new Date().toISOString(),
          host: match[3],
          message: match[4],
          facility,
          severity
        };
      }
      
      // Si no hay coincidencia, devolver objeto simple
      return {
        _raw: message,
        _parser: 'none',
        message
      };
    } catch (error) {
      log(`Error parseando mensaje Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      return {
        _raw: message,
        _parser: 'error',
        message,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }
  
  /**
   * Determina si un mensaje Syslog debe generar una alerta
   */
  private shouldCreateAlert(parsedMessage: any): boolean {
    // Mensaje de error o con severidad alta (0-3 según RFC 5424)
    if (typeof parsedMessage.severity === 'number' && parsedMessage.severity <= 3) {
      return true;
    }
    
    // Mensajes que contengan palabras clave de seguridad
    const securityKeywords = [
      'fail', 'failure', 'error', 'denied', 'reject', 'unauthoriz', 
      'attack', 'threat', 'malware', 'virus', 'trojan', 'exploit',
      'anom', 'suspicious', 'brute', 'force', 'overflow'
    ];
    
    const message = parsedMessage.message || parsedMessage._raw || '';
    for (const keyword of securityKeywords) {
      if (message.toLowerCase().includes(keyword)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Crea una alerta a partir de un mensaje Syslog
   */
  private createAlertFromSyslog(parsedMessage: any): InsertAlert | null {
    try {
      // Extraer información relevante
      const rawMessage = parsedMessage._raw || '';
      const message = parsedMessage.message || rawMessage;
      const host = parsedMessage.host || 'unknown';
      
      // Determinar título
      let title = '';
      if (message.length <= 80) {
        title = message;
      } else {
        // Extraer primera línea, limitar a 80 caracteres
        title = message.split('\n')[0].trim().substring(0, 80);
        if (title.length === 80) title += '...';
      }
      
      // Determinar severidad
      let severity = 'medium';
      if (typeof parsedMessage.severity === 'number') {
        // Mapeo RFC 5424: 0-2 critical, 3-4 high, 5 medium, 6-7 low
        if (parsedMessage.severity <= 2) severity = 'critical';
        else if (parsedMessage.severity <= 4) severity = 'high';
        else if (parsedMessage.severity === 5) severity = 'medium';
        else severity = 'low';
      } else if (this.config.severityMapping) {
        // Aplicar mapeo personalizado si existe
        for (const [pattern, mappedSeverity] of Object.entries(this.config.severityMapping)) {
          if (message.includes(pattern)) {
            severity = mappedSeverity;
            break;
          }
        }
      } else {
        // Intentar inferir severidad por contenido
        if (/crit|emerg|fatal|alert/i.test(message)) severity = 'critical';
        else if (/fail|error|err|denied|alarm/i.test(message)) severity = 'high';
        else if (/warn|suspicious/i.test(message)) severity = 'medium';
        else severity = 'low';
      }
      
      return {
        title: `${host}: ${title}`,
        description: message,
        severity,
        source: `Syslog (${this.connector.name})`,
        sourceIp: parsedMessage.source_ip || null,
        destinationIp: parsedMessage.destination_ip || null,
        status: 'new',
        metadata: {
          raw: parsedMessage._raw,
          host,
          facility: parsedMessage.facility,
          severity: parsedMessage.severity,
          timestamp: parsedMessage.timestamp || new Date().toISOString()
        }
      };
    } catch (error) {
      log(`Error creando alerta desde Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      return null;
    }
  }
}