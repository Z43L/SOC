/**
 * Gestor de heartbeats
 */

import * as os from 'os';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { Transport } from './transport';
import { MetricsCollector } from './metrics';
import { SystemMetrics } from '../collectors/types';

export interface HeartbeatOptions {
  interval: number; // Intervalo en segundos
  endpoint: string;
  agentId: string;
}

export interface HeartbeatData {
  agentId: string;
  timestamp: string;
  metrics: SystemMetrics;
  lastError?: string;
  // Enhanced telemetry data
  version: string;
  platform: string;
  arch: string;
  installationMethod?: string;
  binaryChecksum?: string;
  uptime: number;
}

/**
 * Gestor de heartbeats periódicos
 */
export class HeartbeatManager {
  private options: HeartbeatOptions;
  private transport: Transport;
  private metricsCollector: MetricsCollector;
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private lastMetrics: SystemMetrics | null = null;
  private startTime: number = Date.now();
  private version: string;
  private binaryChecksum: string | null = null;

  constructor(
    options: HeartbeatOptions,
    transport: Transport,
    metricsCollector: MetricsCollector,
    version: string = '1.0.0'
  ) {
    this.options = options;
    this.transport = transport;
    this.metricsCollector = metricsCollector;
    this.version = version;
    this.calculateBinaryChecksum();
  }

  /**
   * Inicia el envío periódico de heartbeats
   */
  start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.sendHeartbeat().catch(error => {
        console.error('Error sending heartbeat:', error);
      });
    }, this.options.interval * 1000);

    console.log(`Heartbeat manager started with interval ${this.options.interval}s`);
  }

  /**
   * Detiene el envío de heartbeats
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Heartbeat manager stopped');
    }
  }

  /**
   * Calcula el checksum del binario actual del agente
   */
  private async calculateBinaryChecksum(): Promise<void> {
    try {
      const binaryPath = process.execPath;
      const fileContent = await fs.readFile(binaryPath);
      const hash = crypto.createHash('sha256');
      hash.update(fileContent);
      this.binaryChecksum = hash.digest('hex');
    } catch (error) {
      console.warn('Could not calculate binary checksum:', error);
    }
  }

  /**
   * Establece las métricas del sistema actuales
   */
  setSystemMetrics(metrics: SystemMetrics): void {
    this.lastMetrics = metrics;
    this.metricsCollector.updateSystemMetrics(metrics);
  }

  /**
   * Registra un error para incluirlo en el próximo heartbeat
   */
  setLastError(error: string): void {
    this.lastError = error;
  }

  /**
   * Envía un heartbeat inmediatamente
   */
  async sendHeartbeat(): Promise<boolean> {
    if (!this.lastMetrics) {
      console.warn('No system metrics available for heartbeat');
      return false;
    }

    const uptime = Date.now() - this.startTime;
    
    const heartbeatData: HeartbeatData = {
      agentId: this.options.agentId,
      timestamp: new Date().toISOString(),
      metrics: this.lastMetrics,
      // Enhanced telemetry
      version: this.version,
      platform: os.platform(),
      arch: os.arch(),
      uptime,
      binaryChecksum: this.binaryChecksum || undefined,
      installationMethod: process.env.SOC_AGENT_INSTALL_METHOD || 'manual'
    };

    if (this.lastError) {
      heartbeatData.lastError = this.lastError;
      // Limpiar después de enviarlo
      this.lastError = null;
    }

    try {
      // Try WebSocket first, fallback to HTTP
      let success = false;
      
      if (this.transport.isConnected()) {
        success = await this.transport.sendWsMessage({
          type: 'heartbeat',
          agentId: this.options.agentId,
          timestamp: heartbeatData.timestamp,
          status: 'active',
          metrics: heartbeatData.metrics,
          version: heartbeatData.version,
          platform: heartbeatData.platform,
          arch: heartbeatData.arch,
          uptime: heartbeatData.uptime,
          lastError: this.lastError
        });
        
        if (success) {
          console.log('Heartbeat sent via WebSocket');
          // Clear error after successful WebSocket send
          if (this.lastError) {
            this.lastError = null;
          }
          return true;
        }
      }
      
      // Fallback to HTTP
      const response = await this.transport.request({
        endpoint: this.options.endpoint,
        method: 'POST',
        data: heartbeatData
      });

      if (!response.success) {
        console.error(`Heartbeat failed: ${response.error || 'Unknown error'}`);
        return false;
      }

      console.log('Heartbeat sent via HTTP');
      return true;
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      return false;
    }
  }
}