/**
 * Recolector de métricas para el agente
 */

import * as http from 'http';
import { SystemMetrics } from '../collectors/types';

interface MetricsOptions {
  enableEndpoint?: boolean;
  port?: number;
  path?: string;
}

export interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
  help?: string;
  type?: 'counter' | 'gauge' | 'histogram';
}

/**
 * Recolector de métricas en formato Prometheus
 */
export class MetricsCollector {
  private options: MetricsOptions;
  private metrics: Map<string, Metric> = new Map();
  private server: http.Server | null = null;
  private systemMetrics: SystemMetrics | null = null;

  constructor(options?: MetricsOptions) {
    this.options = {
      enableEndpoint: options?.enableEndpoint ?? true,
      port: options?.port ?? 9090,
      path: options?.path ?? '/metrics'
    };

    // Inicializar contadores básicos
    this.registerMetric({
      name: 'soc_agent_events_total',
      value: 0,
      help: 'Total number of events collected',
      type: 'counter'
    });

    this.registerMetric({
      name: 'soc_agent_failed_push_total',
      value: 0,
      help: 'Total number of failed event pushes',
      type: 'counter'
    });

    this.registerMetric({
      name: 'soc_agent_queue_size',
      value: 0,
      help: 'Current size of the event queue',
      type: 'gauge'
    });
  }

  /**
   * Inicia el servidor HTTP para métricas
   */
  async start(): Promise<void> {
    if (!this.options.enableEndpoint) return;

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.url === this.options.path) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(this.formatMetrics());
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.on('error', (err) => {
        console.error('Error starting metrics server:', err);
        this.server = null;
        resolve();
      });

      this.server.listen(this.options.port, '127.0.0.1', () => {
        console.log(`Metrics server listening on http://127.0.0.1:${this.options.port}${this.options.path}`);
        resolve();
      });
    });
  }

  /**
   * Detiene el servidor de métricas
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Registra una métrica
   */
  registerMetric(metric: Metric): void {
    this.metrics.set(this.getMetricKey(metric), metric);
  }

  /**
   * Actualiza el valor de una métrica existente
   */
  updateMetric(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey({ name, value, labels });
    const existing = this.metrics.get(key);
    
    if (existing) {
      existing.value = value;
    } else {
      this.registerMetric({ name, value, labels });
    }
  }

  /**
   * Incrementa el valor de un contador
   */
  incrementCounter(name: string, amount: number = 1, labels?: Record<string, string>): void {
    const key = this.getMetricKey({ name, value: 0, labels });
    const existing = this.metrics.get(key);
    
    if (existing) {
      existing.value += amount;
    } else {
      this.registerMetric({ 
        name, 
        value: amount, 
        labels,
        type: 'counter'
      });
    }
  }

  /**
   * Actualiza las métricas del sistema
   */
  updateSystemMetrics(metrics: SystemMetrics): void {
    this.systemMetrics = metrics;
    
    // Actualizar métricas individuales
    this.updateMetric('soc_agent_cpu_usage', metrics.cpuUsage);
    this.updateMetric('soc_agent_memory_usage', metrics.memoryUsage);
    this.updateMetric('soc_agent_disk_usage', metrics.diskUsage);
    this.updateMetric('soc_agent_network_in_bytes', metrics.networkIn);
    this.updateMetric('soc_agent_network_out_bytes', metrics.networkOut);
    this.updateMetric('soc_agent_process_count', metrics.runningProcesses);
    
    if (metrics.openFileDescriptors !== undefined) {
      this.updateMetric('soc_agent_open_file_descriptors', metrics.openFileDescriptors);
    }
    
    if (metrics.uptime !== undefined) {
      this.updateMetric('soc_agent_uptime_seconds', metrics.uptime);
    }
  }

  /**
   * Actualiza el tamaño de la cola
   */
  updateQueueSize(size: number): void {
    this.updateMetric('soc_agent_queue_size', size);
  }

  /**
   * Registra un evento
   */
  recordEvent(type: string): void {
    this.incrementCounter('soc_agent_events_total', 1, { type });
  }

  /**
   * Registra un fallo de envío
   */
  recordFailedPush(): void {
    this.incrementCounter('soc_agent_failed_push_total');
  }

  /**
   * Obtiene la clave única para una métrica
   */
  private getMetricKey(metric: Metric): string {
    if (!metric.labels || Object.keys(metric.labels).length === 0) {
      return metric.name;
    }
    
    const labelStr = Object.entries(metric.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `${metric.name}{${labelStr}}`;
  }

  /**
   * Formatea las métricas en formato Prometheus
   */
  private formatMetrics(): string {
    const lines: string[] = [];
    
    // Agrupar métricas por nombre
    const metricsByName = new Map<string, Metric[]>();
    
    for (const metric of this.metrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }
    
    // Formatear cada grupo
    for (const [name, metrics] of metricsByName.entries()) {
      const first = metrics[0];
      
      // Añadir comentarios
      if (first.help) {
        lines.push(`# HELP ${name} ${first.help}`);
      }
      
      if (first.type) {
        lines.push(`# TYPE ${name} ${first.type}`);
      }
      
      // Añadir valores
      for (const metric of metrics) {
        let line = name;
        
        if (metric.labels && Object.keys(metric.labels).length > 0) {
          const labelStr = Object.entries(metric.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          
          line += `{${labelStr}}`;
        }
        
        line += ` ${metric.value}`;
        lines.push(line);
      }
    }
    
    return lines.join('\n') + '\n';
  }
}