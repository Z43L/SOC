/**
 * Gestor de heartbeats
 */

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

  constructor(
    options: HeartbeatOptions,
    transport: Transport,
    metricsCollector: MetricsCollector
  ) {
    this.options = options;
    this.transport = transport;
    this.metricsCollector = metricsCollector;
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

    const heartbeatData: HeartbeatData = {
      agentId: this.options.agentId,
      timestamp: new Date().toISOString(),
      metrics: this.lastMetrics
    };

    if (this.lastError) {
      heartbeatData.lastError = this.lastError;
      // Limpiar después de enviarlo
      this.lastError = null;
    }

    try {
      const response = await this.transport.request({
        endpoint: this.options.endpoint,
        method: 'POST',
        data: heartbeatData
      });

      if (!response.success) {
        console.error(`Heartbeat failed: ${response.error || 'Unknown error'}`);
        return false;
      }

      console.log('Heartbeat sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      return false;
    }
  }
}