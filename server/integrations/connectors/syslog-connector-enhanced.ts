/**
 * Enhanced Syslog Connector
 * Receives and processes syslog messages over UDP, TCP, or TCP+TLS
 */

import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import { Connector, ConnectorConfig, ConnectorStatus, RawEvent } from './connector.interface';
import { log } from '../../vite';
import { db } from '../../db';
import { connectors } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface SyslogConnectorConfig extends ConnectorConfig {
  protocol: 'udp' | 'tcp' | 'tls';
  port: number;
  host?: string; // Default: 0.0.0.0
  tlsEnabled?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCA?: string;
  requestClientCert?: boolean;
  filtering?: {
    include?: string[];
    exclude?: string[];
    facilities?: number[]; // Filter by facility
    severities?: number[]; // Filter by severity
    sources?: string[]; // Filter by hostname/IP
  };
}

// Interface for parsed syslog message
export interface ParsedSyslogMessage {
  facility: number;
  severity: number;
  timestamp: Date;
  hostname: string;
  appName: string;
  procId: string;
  msgId: string;
  message: string;
  rawMessage: string;
  sourceIp: string;
}

/**
 * Syslog Connector implementation
 */
export class SyslogConnector extends EventEmitter implements Connector {
  public readonly id: string;
  public readonly organizationId: string;
  public readonly name: string;
  public readonly type = 'syslog';
  
  private _status: ConnectorStatus = 'active';
  private _config: SyslogConnectorConfig;
  private _lastSuccessfulConnection?: Date;
  private _nextRun?: Date;
  private _errorCount: number = 0;
  private _lastError?: string;
  
  // Server instances
  private udpServer?: dgram.Socket;
  private tcpServer?: net.Server;
  private tlsServer?: tls.Server;
  
  // Statistics
  private messageCount: number = 0;
  private startTime: Date = new Date();
  
  constructor(id: string, organizationId: string, name: string, config: SyslogConnectorConfig) {
    super();
    this.id = id;
    this.organizationId = organizationId;
    this.name = name;
    this._config = config;
  }
  
  /**
   * Start the syslog server based on the configured protocol
   */
  public async start(): Promise<void> {
    try {
      log(`Starting syslog connector ${this.name} (${this.id})`, 'syslog-connector');
      
      // Stop any existing servers first
      await this.stop();
      
      const config = this._config;
      const host = config.host || '0.0.0.0';
      const port = config.port;
      
      // Start the appropriate server based on protocol
      switch (config.protocol) {
        case 'udp':
          await this.startUdpServer(host, port);
          break;
        case 'tcp':
          await this.startTcpServer(host, port);
          break;
        case 'tls':
          await this.startTlsServer(host, port);
          break;
        default:
          throw new Error(`Unsupported protocol: ${config.protocol}`);
      }
      
      this._status = 'active';
      this._lastSuccessfulConnection = new Date();
      this.startTime = new Date();
      this.messageCount = 0;
      
      // Update database
      await this.updateConnectorInDb({
        status: this._status,
        lastSuccessfulConnection: this._lastSuccessfulConnection
      });
      
      log(`Syslog connector ${this.name} started on ${host}:${port} (${config.protocol})`, 'syslog-connector');
      this.emit('started');
    } catch (error) {
      this._status = 'error';
      this._errorCount++;
      this._lastError = error instanceof Error ? error.message : String(error);
      
      await this.updateConnectorInDb({
        status: this._status,
        errorMessage: this._lastError
      });
      
      log(`Error starting syslog connector ${this.name}: ${this._lastError}`, 'syslog-connector');
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Stop the syslog server
   */
  public async stop(): Promise<void> {
    try {
      log(`Stopping syslog connector ${this.name} (${this.id})`, 'syslog-connector');
      
      // Close UDP server if it exists
      if (this.udpServer) {
        this.udpServer.close();
        this.udpServer.removeAllListeners();
        this.udpServer = undefined;
      }
      
      // Close TCP server if it exists
      if (this.tcpServer) {
        this.tcpServer.close();
        this.tcpServer.removeAllListeners();
        this.tcpServer = undefined;
      }
      
      // Close TLS server if it exists
      if (this.tlsServer) {
        this.tlsServer.close();
        this.tlsServer.removeAllListeners();
        this.tlsServer = undefined;
      }
      
      this._status = 'paused';
      
      // Update database
      await this.updateConnectorInDb({
        status: this._status
      });
      
      log(`Syslog connector ${this.name} stopped`, 'syslog-connector');
      this.emit('stopped');
    } catch (error) {
      log(`Error stopping syslog connector ${this.name}: ${error}`, 'syslog-connector');
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * For Syslog connectors, runOnce doesn't make sense
   * But we implement it for consistency with the Connector interface
   */
  public async runOnce(): Promise<void> {
    throw new Error('Syslog connectors do not support runOnce');
  }
  
  /**
   * Test connection by starting the server and then stopping it
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const config = this._config;
      const host = config.host || '0.0.0.0';
      const port = config.port;
      
      // Try to create a server of the appropriate type
      switch (config.protocol) {
        case 'udp': {
          const server = dgram.createSocket('udp4');
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.once('listening', () => {
              server.close();
              resolve();
            });
            server.bind(port, host);
          });
          break;
        }
        case 'tcp': {
          const server = net.createServer();
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.once('listening', () => {
              server.close();
              resolve();
            });
            server.listen(port, host);
          });
          break;
        }
        case 'tls': {
          // Check if TLS certificates exist
          if (!config.tlsCert || !config.tlsKey) {
            return { success: false, message: 'TLS certificate and key are required for TLS protocol' };
          }
          
          // Check if the certificate files exist
          if (!fs.existsSync(config.tlsCert) || !fs.existsSync(config.tlsKey)) {
            return { success: false, message: 'TLS certificate or key file not found' };
          }
          
          // Create TLS options
          const tlsOptions: tls.TlsOptions = {
            cert: fs.readFileSync(config.tlsCert),
            key: fs.readFileSync(config.tlsKey)
          };
          
          if (config.tlsCA && fs.existsSync(config.tlsCA)) {
            tlsOptions.ca = fs.readFileSync(config.tlsCA);
          }
          
          if (config.requestClientCert) {
            tlsOptions.requestCert = true;
          }
          
          // Try to create a TLS server
          const server = tls.createServer(tlsOptions);
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.once('listening', () => {
              server.close();
              resolve();
            });
            server.listen(port, host);
          });
          break;
        }
        default:
          return { success: false, message: `Unsupported protocol: ${config.protocol}` };
      }
      
      return { success: true, message: `Successfully bound to ${host}:${port} (${config.protocol})` };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Get the current connector status
   */
  public getStatus(): ConnectorStatus {
    return this._status;
  }
  
  /**
   * Update the connector status
   */
  public setStatus(status: ConnectorStatus, message?: string): void {
    const previousStatus = this._status;
    this._status = status;
    
    // If status changed, emit event
    if (previousStatus !== status) {
      this.emit('status-change', status, message);
      
      // Update status in database
      this.updateConnectorInDb({
        status: status,
        errorMessage: message || null
      });
    }
    
    // Handle error tracking
    if (status === 'error') {
      this._errorCount++;
      this._lastError = message;
      
      // Auto-disable if too many consecutive errors
      if (this._errorCount >= 5) {
        this.setStatus('disabled', 'Auto-disabled due to too many consecutive errors');
        this.emit('auto-disabled', this._errorCount, message);
      }
    } else if (status === 'active') {
      // Reset error count on successful status
      this._errorCount = 0;
      this._lastError = undefined;
    }
  }
  
  /**
   * Get the current configuration
   */
  public getConfig(): SyslogConnectorConfig {
    return this._config;
  }
  
  /**
   * Update the connector configuration
   */
  public async updateConfig(config: Partial<SyslogConnectorConfig>): Promise<void> {
    const needsRestart = (
      config.protocol !== undefined && config.protocol !== this._config.protocol ||
      config.port !== undefined && config.port !== this._config.port ||
      config.host !== undefined && config.host !== this._config.host ||
      config.tlsEnabled !== undefined && config.tlsEnabled !== this._config.tlsEnabled ||
      config.tlsCert !== undefined && config.tlsCert !== this._config.tlsCert ||
      config.tlsKey !== undefined && config.tlsKey !== this._config.tlsKey ||
      config.tlsCA !== undefined && config.tlsCA !== this._config.tlsCA
    );
    
    // Update configuration
    this._config = { ...this._config, ...config };
    
    // Update configuration in database
    await this.updateConnectorInDb({
      configuration: this._config
    });
    
    // Emit config-updated event
    this.emit('config-updated', this._config);
    
    // Restart if necessary
    if (needsRestart && this._status === 'active') {
      await this.stop();
      await this.start();
    }
  }
  
  /**
   * Get connector status
   */
  public get status(): ConnectorStatus {
    return this._status;
  }
  
  /**
   * Get last successful connection time
   */
  public get lastSuccessfulConnection(): Date | undefined {
    return this._lastSuccessfulConnection;
  }
  
  /**
   * Get next run time
   * For Syslog connectors, this doesn't apply
   */
  public get nextRun(): undefined {
    return undefined;
  }
  
  /**
   * Start a UDP server for syslog messages
   */
  private async startUdpServer(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create UDP socket
      const server = dgram.createSocket('udp4');
      
      // Handle errors
      server.on('error', (error) => {
        log(`UDP server error: ${error}`, 'syslog-connector');
        this.setStatus('error', `UDP server error: ${error.message}`);
        this.emit('error', error);
      });
      
      // Handle messages
      server.on('message', (msg, rinfo) => {
        this.messageCount++;
        const rawMessage = msg.toString().trim();
        
        try {
          // Parse syslog message
          const parsedMessage = this.parseSyslogMessage(rawMessage, rinfo.address);
          
          // Skip if the message doesn't pass filtering
          if (!this.shouldProcessMessage(parsedMessage)) {
            return;
          }
          
          // Create normalized event
          const event = this.createEventFromSyslogMessage(parsedMessage);
          
          // Emit the event
          this.emit('event', event);
        } catch (error) {
          log(`Error processing syslog message: ${error}`, 'syslog-connector');
        }
      });
      
      // Start listening
      server.bind(port, host, () => {
        log(`UDP server listening on ${host}:${port}`, 'syslog-connector');
        this.udpServer = server;
        resolve();
      });
      
      // Handle bind errors
      server.once('error', reject);
    });
  }
  
  /**
   * Start a TCP server for syslog messages
   */
  private async startTcpServer(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create TCP server
      const server = net.createServer((socket) => {
        const remoteAddress = socket.remoteAddress || 'unknown';
        
        // Handle connection
        log(`TCP client connected: ${remoteAddress}`, 'syslog-connector');
        
        let buffer = '';
        
        // Handle data
        socket.on('data', (data) => {
          buffer += data.toString();
          
          // Process complete lines (messages can span multiple data events)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
          
          for (const line of lines) {
            if (line.trim()) {
              this.messageCount++;
              
              try {
                // Parse syslog message
                const parsedMessage = this.parseSyslogMessage(line.trim(), remoteAddress);
                
                // Skip if the message doesn't pass filtering
                if (!this.shouldProcessMessage(parsedMessage)) {
                  return;
                }
                
                // Create normalized event
                const event = this.createEventFromSyslogMessage(parsedMessage);
                
                // Emit the event
                this.emit('event', event);
              } catch (error) {
                log(`Error processing syslog message: ${error}`, 'syslog-connector');
              }
            }
          }
        });
        
        // Handle socket errors
        socket.on('error', (error) => {
          log(`TCP socket error: ${error}`, 'syslog-connector');
        });
        
        // Handle socket close
        socket.on('close', () => {
          log(`TCP client disconnected: ${remoteAddress}`, 'syslog-connector');
        });
      });
      
      // Handle server errors
      server.on('error', (error) => {
        log(`TCP server error: ${error}`, 'syslog-connector');
        this.setStatus('error', `TCP server error: ${error.message}`);
        this.emit('error', error);
      });
      
      // Start listening
      server.listen(port, host, () => {
        log(`TCP server listening on ${host}:${port}`, 'syslog-connector');
        this.tcpServer = server;
        resolve();
      });
      
      // Handle listen errors
      server.once('error', reject);
    });
  }
  
  /**
   * Start a TLS server for secure syslog messages
   */
  private async startTlsServer(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const config = this._config;
      
      // Check if TLS certificates are provided
      if (!config.tlsCert || !config.tlsKey) {
        const error = new Error('TLS certificate and key are required for TLS protocol');
        reject(error);
        return;
      }
      
      // Create TLS options
      let tlsOptions: tls.TlsOptions;
      
      try {
        tlsOptions = {
          cert: fs.readFileSync(config.tlsCert),
          key: fs.readFileSync(config.tlsKey)
        };
        
        if (config.tlsCA) {
          tlsOptions.ca = fs.readFileSync(config.tlsCA);
        }
        
        if (config.requestClientCert) {
          tlsOptions.requestCert = true;
          tlsOptions.rejectUnauthorized = false; // Allow clients without certs to connect
        }
      } catch (error) {
        reject(new Error(`Failed to read TLS certificates: ${error instanceof Error ? error.message : 'Unknown error'}`));
        return;
      }
      
      // Create TLS server
      const server = tls.createServer(tlsOptions, (socket) => {
        const remoteAddress = socket.remoteAddress || 'unknown';
        
        // Handle connection
        log(`TLS client connected: ${remoteAddress}`, 'syslog-connector');
        
        let buffer = '';
        
        // Handle data
        socket.on('data', (data) => {
          buffer += data.toString();
          
          // Process complete lines (messages can span multiple data events)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
          
          for (const line of lines) {
            if (line.trim()) {
              this.messageCount++;
              
              try {
                // Parse syslog message
                const parsedMessage = this.parseSyslogMessage(line.trim(), remoteAddress);
                
                // Skip if the message doesn't pass filtering
                if (!this.shouldProcessMessage(parsedMessage)) {
                  return;
                }
                
                // Create normalized event
                const event = this.createEventFromSyslogMessage(parsedMessage);
                
                // Emit the event
                this.emit('event', event);
              } catch (error) {
                log(`Error processing syslog message: ${error}`, 'syslog-connector');
              }
            }
          }
        });
        
        // Handle socket errors
        socket.on('error', (error) => {
          log(`TLS socket error: ${error}`, 'syslog-connector');
        });
        
        // Handle socket close
        socket.on('close', () => {
          log(`TLS client disconnected: ${remoteAddress}`, 'syslog-connector');
        });
      });
      
      // Handle server errors
      server.on('error', (error) => {
        log(`TLS server error: ${error}`, 'syslog-connector');
        this.setStatus('error', `TLS server error: ${error.message}`);
        this.emit('error', error);
      });
      
      // Start listening
      server.listen(port, host, () => {
        log(`TLS server listening on ${host}:${port}`, 'syslog-connector');
        this.tlsServer = server;
        resolve();
      });
      
      // Handle listen errors
      server.once('error', reject);
    });
  }
  
  /**
   * Parse a syslog message
   */
  private parseSyslogMessage(message: string, sourceIp: string): ParsedSyslogMessage {
    // RFC5424 format: <PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [STRUCTURED-DATA] MSG
    // RFC3164 format: <PRI>TIMESTAMP HOSTNAME TAG: MSG
    
    // Default values
    const result: ParsedSyslogMessage = {
      facility: 1, // user-level
      severity: 5, // notice
      timestamp: new Date(),
      hostname: sourceIp,
      appName: '-',
      procId: '-',
      msgId: '-',
      message: message,
      rawMessage: message,
      sourceIp
    };
    
    try {
      // Extract PRI
      const priMatch = message.match(/^<(\d+)>/);
      if (priMatch) {
        const pri = parseInt(priMatch[1], 10);
        result.facility = Math.floor(pri / 8);
        result.severity = pri % 8;
        
        // Remove PRI from message
        message = message.substring(priMatch[0].length);
      }
      
      // Try to parse as RFC5424
      const rfc5424Match = message.match(/^1 (\S+) (\S+) (\S+) (\S+) (\S+) (?:\[([^\]]*)\] )?(.*)$/);
      if (rfc5424Match) {
        // RFC5424 format
        result.timestamp = new Date(rfc5424Match[1]);
        result.hostname = rfc5424Match[2];
        result.appName = rfc5424Match[3];
        result.procId = rfc5424Match[4];
        result.msgId = rfc5424Match[5];
        // result.structuredData = rfc5424Match[6]; // Not used currently
        result.message = rfc5424Match[7] || '';
      } else {
        // Try to parse as RFC3164
        const rfc3164Match = message.match(/^(\w{3}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s+(.*)$/);
        if (rfc3164Match) {
          // RFC3164 format
          const timestampStr = rfc3164Match[1];
          const currentYear = new Date().getFullYear();
          result.timestamp = new Date(`${currentYear} ${timestampStr}`);
          result.hostname = rfc3164Match[2];
          result.appName = rfc3164Match[3];
          result.message = rfc3164Match[4] || '';
        }
        // If neither format matches, keep the raw message as the message content
      }
      
      return result;
    } catch (error) {
      // If parsing fails, return with default values
      log(`Error parsing syslog message: ${error}`, 'syslog-connector');
      return result;
    }
  }
  
  /**
   * Create a normalized event from a parsed syslog message
   */
  private createEventFromSyslogMessage(parsedMessage: ParsedSyslogMessage): RawEvent {
    // Map syslog severity to event severity
    const severityMap: Record<number, string> = {
      0: 'critical', // Emergency
      1: 'critical', // Alert
      2: 'critical', // Critical
      3: 'error',    // Error
      4: 'warn',     // Warning
      5: 'info',     // Notice
      6: 'info',     // Informational
      7: 'debug'     // Debug
    };
    
    // Map facility to tag
    const facilityMap: Record<number, string> = {
      0: 'kernel',
      1: 'user',
      2: 'mail',
      3: 'system',
      4: 'security',
      5: 'syslogd',
      6: 'printer',
      7: 'network',
      8: 'uucp',
      9: 'clock',
      10: 'security',
      11: 'ftp',
      12: 'ntp',
      13: 'logaudit',
      14: 'logalert',
      15: 'clock',
      16: 'local0',
      17: 'local1',
      18: 'local2',
      19: 'local3',
      20: 'local4',
      21: 'local5',
      22: 'local6',
      23: 'local7'
    };
    
    // Create tags
    const tags = ['syslog'];
    
    // Add facility tag if available
    if (parsedMessage.facility in facilityMap) {
      tags.push(facilityMap[parsedMessage.facility]);
    }
    
    // Create the normalized event
    return {
      id: uuidv4(),
      timestamp: parsedMessage.timestamp,
      source: 'syslog',
      type: 'syslog',
      payload: {
        message: parsedMessage.message,
        hostname: parsedMessage.hostname,
        appName: parsedMessage.appName,
        procId: parsedMessage.procId,
        msgId: parsedMessage.msgId,
        facility: parsedMessage.facility,
        severity: parsedMessage.severity,
        sourceIp: parsedMessage.sourceIp,
        rawMessage: parsedMessage.rawMessage
      },
      tags,
      metadata: {
        connectorId: this.id,
        organizationId: this.organizationId
      }
    };
  }
  
  /**
   * Check if a message should be processed based on filtering rules
   */
  private shouldProcessMessage(message: ParsedSyslogMessage): boolean {
    const config = this._config;
    
    // If no filtering is configured, process all messages
    if (!config.filtering) {
      return true;
    }
    
    // Check facility filter
    if (config.filtering.facilities && config.filtering.facilities.length > 0) {
      if (!config.filtering.facilities.includes(message.facility)) {
        return false;
      }
    }
    
    // Check severity filter
    if (config.filtering.severities && config.filtering.severities.length > 0) {
      if (!config.filtering.severities.includes(message.severity)) {
        return false;
      }
    }
    
    // Check source filter
    if (config.filtering.sources && config.filtering.sources.length > 0) {
      if (!config.filtering.sources.some(source => 
        message.hostname === source || message.sourceIp === source
      )) {
        return false;
      }
    }
    
    // Check include patterns
    if (config.filtering.include && config.filtering.include.length > 0) {
      if (!config.filtering.include.some(pattern => 
        message.rawMessage.includes(pattern) || message.message.includes(pattern)
      )) {
        return false;
      }
    }
    
    // Check exclude patterns
    if (config.filtering.exclude && config.filtering.exclude.length > 0) {
      if (config.filtering.exclude.some(pattern => 
        message.rawMessage.includes(pattern) || message.message.includes(pattern)
      )) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Update the connector record in the database
   */
  private async updateConnectorInDb(updates: Partial<any>): Promise<void> {
    try {
      await db.update(connectors)
        .set(updates)
        .where(eq(connectors.id, parseInt(this.id)));
    } catch (error) {
      log(`Error updating connector ${this.id} in database: ${error}`, 'syslog-connector');
    }
  }
}