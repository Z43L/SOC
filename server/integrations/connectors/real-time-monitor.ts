/**
 * Monitor en tiempo real para conectores
 * Proporciona WebSocket updates y métricas en tiempo real
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { ConnectorManager } from './connector-manager';
import { storage } from '../../storage';
import { log } from '../../vite';

interface ConnectorMetrics {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'error' | 'warning';
  eventsProcessed: number;
  bytesProcessed: number;
  lastEventAt?: Date;
  errorCount: number;
  uptime: number;
  avgResponseTime: number;
  throughput: number; // events per minute
}

interface RealtimeUpdate {
  type: 'connector_status' | 'connector_metrics' | 'new_event' | 'error' | 'health_check' | 'dashboard_update' | 'alert_update' | 'incident_update';
  connectorId?: string;
  data: any;
  timestamp: Date;
}

export class RealtimeMonitor extends EventEmitter {
  private static instance: RealtimeMonitor;
  private wss?: WebSocketServer;
  private connectedClients: Set<WebSocket> = new Set();
  private metricsUpdateInterval?: NodeJS.Timeout;
  private connectorManager: ConnectorManager;
  private metricsHistory: Map<string, ConnectorMetrics[]> = new Map();

  private constructor() {
    super();
    this.connectorManager = ConnectorManager.getInstance();
    this.setupConnectorListeners();
  }

  public static getInstance(): RealtimeMonitor {
    if (!RealtimeMonitor.instance) {
      RealtimeMonitor.instance = new RealtimeMonitor();
    }
    return RealtimeMonitor.instance;
  }

  /**
   * Inicializa el servidor WebSocket
   */
  public initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/connectors/realtime'
    });

    this.wss.on('connection', (ws: WebSocket, request) => {
      log('Nueva conexión WebSocket para monitoreo de conectores', 'realtime-monitor');
      
      this.connectedClients.add(ws);

      // Enviar estado inicial
      this.sendInitialState(ws);

      ws.on('close', () => {
        this.connectedClients.delete(ws);
        log('Conexión WebSocket cerrada', 'realtime-monitor');
      });

      ws.on('error', (error) => {
        log(`Error en WebSocket: ${error}`, 'realtime-monitor');
        this.connectedClients.delete(ws);
      });

      // Ping/pong para mantener la conexión viva
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });

    this.startMetricsCollection();
    log('RealtimeMonitor inicializado con WebSocket', 'realtime-monitor');
  }

  /**
   * Envía el estado inicial a un cliente WebSocket
   */
  private async sendInitialState(ws: WebSocket): Promise<void> {
    try {
      const connectors = await storage.listConnectors();
      const metrics = await this.getAllConnectorMetrics();

      const initialState = {
        type: 'initial_state',
        data: {
          connectors,
          metrics
        },
        timestamp: new Date()
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(initialState));
      }
    } catch (error) {
      log(`Error enviando estado inicial: ${error}`, 'realtime-monitor');
    }
  }

  /**
   * Configura listeners para eventos del ConnectorManager
   */
  private setupConnectorListeners(): void {
    this.connectorManager.on('connector:started', (connectorId: string) => {
      this.broadcastUpdate({
        type: 'connector_status',
        connectorId,
        data: { status: 'active', message: 'Connector started' },
        timestamp: new Date()
      });
    });

    this.connectorManager.on('connector:stopped', (connectorId: string) => {
      this.broadcastUpdate({
        type: 'connector_status',
        connectorId,
        data: { status: 'inactive', message: 'Connector stopped' },
        timestamp: new Date()
      });
    });

    this.connectorManager.on('connector:error', (connectorId: string, error: string) => {
      this.broadcastUpdate({
        type: 'error',
        connectorId,
        data: { error, status: 'error' },
        timestamp: new Date()
      });
    });

    this.connectorManager.on('connector:event', (connectorId: string, event: any) => {
      this.broadcastUpdate({
        type: 'new_event',
        connectorId,
        data: event,
        timestamp: new Date()
      });
    });
  }

  /**
   * Inicia la recolección periódica de métricas
   */
  private startMetricsCollection(): void {
    this.metricsUpdateInterval = setInterval(async () => {
      try {
        const metrics = await this.collectConnectorMetrics();
        
        // Guardar métricas en el historial
        for (const metric of metrics) {
          if (!this.metricsHistory.has(metric.id)) {
            this.metricsHistory.set(metric.id, []);
          }
          
          const history = this.metricsHistory.get(metric.id)!;
          history.push(metric);
          
          // Mantener solo las últimas 100 métricas
          if (history.length > 100) {
            history.shift();
          }
        }

        // Enviar actualizaciones
        this.broadcastUpdate({
          type: 'connector_metrics',
          data: metrics,
          timestamp: new Date()
        });

      } catch (error) {
        log(`Error recolectando métricas: ${error}`, 'realtime-monitor');
      }
    }, 10000); // Cada 10 segundos
  }

  /**
   * Recolecta métricas de todos los conectores
   */
  private async collectConnectorMetrics(): Promise<ConnectorMetrics[]> {
    const metrics: ConnectorMetrics[] = [];
    const connectors = this.connectorManager.getAllConnectors();

    for (const connector of connectors) {
      try {
        const connectorMetrics = connector.getMetrics();
        const status = await connector.healthCheck();

        const metric: ConnectorMetrics = {
          id: connector.id,
          name: connector.config.name,
          type: connector.config.type,
          status: status.healthy ? 'active' : 'error',
          eventsProcessed: connectorMetrics.eventsProcessed,
          bytesProcessed: connectorMetrics.bytesProcessed,
          lastEventAt: connectorMetrics.lastEventAt,
          errorCount: connectorMetrics.errorCount,
          uptime: connectorMetrics.uptime,
          avgResponseTime: connectorMetrics.avgResponseTime || 0,
          throughput: this.calculateThroughput(connector.id, connectorMetrics.eventsProcessed)
        };

        metrics.push(metric);
      } catch (error) {
        log(`Error obteniendo métricas del conector ${connector.id}: ${error}`, 'realtime-monitor');
      }
    }

    return metrics;
  }

  /**
   * Calcula el throughput de eventos por minuto
   */
  private calculateThroughput(connectorId: string, currentEvents: number): number {
    const history = this.metricsHistory.get(connectorId);
    if (!history || history.length < 2) {
      return 0;
    }

    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    
    if (!current || !previous) {
      return 0;
    }

    const timeDiff = (current.uptime - previous.uptime) / 60; // en minutos
    const eventsDiff = current.eventsProcessed - previous.eventsProcessed;

    return timeDiff > 0 ? eventsDiff / timeDiff : 0;
  }

  /**
   * Obtiene todas las métricas de conectores
   */
  public async getAllConnectorMetrics(): Promise<ConnectorMetrics[]> {
    return await this.collectConnectorMetrics();
  }

  /**
   * Obtiene el historial de métricas de un conector
   */
  public getConnectorMetricsHistory(connectorId: string): ConnectorMetrics[] {
    return this.metricsHistory.get(connectorId) || [];
  }

  /**
   * Difunde una actualización a todos los clientes conectados
   */
  private broadcastUpdate(update: RealtimeUpdate): void {
    const message = JSON.stringify(update);
    
    this.connectedClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          log(`Error enviando actualización WebSocket: ${error}`, 'realtime-monitor');
          this.connectedClients.delete(ws);
        }
      }
    });
  }

  /**
   * Envía actualizaciones del dashboard a todos los clientes conectados
   */
  public broadcastDashboardUpdate(data: any): void {
    this.broadcastUpdate({
      type: 'dashboard_update',
      data,
      timestamp: new Date()
    });
  }

  /**
   * Envía actualizaciones de alertas a todos los clientes conectados
   */
  public broadcastAlertUpdate(alert: any): void {
    this.broadcastUpdate({
      type: 'alert_update',
      data: alert,
      timestamp: new Date()
    });
  }

  /**
   * Envía actualizaciones de incidentes a todos los clientes conectados
   */
  public broadcastIncidentUpdate(incident: any): void {
    this.broadcastUpdate({
      type: 'incident_update',
      data: incident,
      timestamp: new Date()
    });
  }

  /**
   * Envía una actualización específica a un cliente
   */
  public sendUpdateToClient(ws: WebSocket, update: RealtimeUpdate): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(update));
      } catch (error) {
        log(`Error enviando actualización a cliente: ${error}`, 'realtime-monitor');
      }
    }
  }

  /**
   * Obtiene estadísticas del monitor en tiempo real
   */
  public getMonitorStats(): {
    connectedClients: number;
    totalConnectors: number;
    activeConnectors: number;
    errorConnectors: number;
    avgThroughput: number;
  } {
    const connectors = this.connectorManager.getAllConnectors();
    const activeConnectors = connectors.filter(c => c.isRunning).length;
    const errorConnectors = connectors.filter(c => !c.isRunning).length;
    
    // Calcular throughput promedio
    let totalThroughput = 0;
    this.metricsHistory.forEach((history) => {
      if (history.length > 0) {
        totalThroughput += history[history.length - 1].throughput;
      }
    });
    const avgThroughput = this.metricsHistory.size > 0 ? totalThroughput / this.metricsHistory.size : 0;

    return {
      connectedClients: this.connectedClients.size,
      totalConnectors: connectors.length,
      activeConnectors,
      errorConnectors,
      avgThroughput
    };
  }

  /**
   * Detiene el monitor en tiempo real
   */
  public shutdown(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }

    this.connectedClients.forEach((ws) => {
      ws.terminate();
    });

    if (this.wss) {
      this.wss.close();
    }

    log('RealtimeMonitor detenido', 'realtime-monitor');
  }
}
