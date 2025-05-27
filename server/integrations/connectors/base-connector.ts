/**
 * Clase base para todos los conectores
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../vite';
import { 
  IDataConnector, 
  ConnectorConfig, 
  ConnectorMetrics, 
  ConnectorStatus,
  ConnectorType,
  HealthCheckResult,
  RawEvent 
} from './interfaces';

export abstract class BaseConnector extends EventEmitter implements IDataConnector {
  public readonly id: string;
  public readonly type: ConnectorType;
  protected _config: ConnectorConfig;
  protected _status: ConnectorStatus = 'disabled';
  protected _metrics: ConnectorMetrics;
  protected _lastHealthCheck?: HealthCheckResult;
  protected _startTime?: Date;

  constructor(config: ConnectorConfig) {
    super();
    this.id = config.id;
    this.type = config.type;
    this._config = { ...config };
    
    this._metrics = {
      eventsPerMinute: 0,
      errorsPerMinute: 0,
      avgLatency: 0,
      uptime: 0
    };

    // Contadores para métricas
    this.setupMetricsTracking();
  }

  get config(): ConnectorConfig {
    return { ...this._config };
  }

  get status(): ConnectorStatus {
    return this._status;
  }

  /**
   * Métodos abstractos que deben implementar las clases hijas
   */
  protected abstract doStart(): Promise<void>;
  protected abstract doStop(): Promise<void>;
  protected abstract doHealthCheck(): Promise<HealthCheckResult>;
  protected abstract doTestConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * Inicia el conector
   */
  async start(): Promise<void> {
    try {
      log(`Iniciando conector ${this.id} (${this.type})`, 'connector');
      
      this._status = 'active';
      this._startTime = new Date();
      
      await this.doStart();
      
      this.emit('status-change', this._status);
      log(`Conector ${this.id} iniciado correctamente`, 'connector');
    } catch (error) {
      this._status = 'error';
      this.emit('status-change', this._status);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Detiene el conector
   */
  async stop(): Promise<void> {
    try {
      log(`Deteniendo conector ${this.id}`, 'connector');
      
      await this.doStop();
      
      this._status = 'disabled';
      this._startTime = undefined;
      
      this.emit('status-change', this._status);
      log(`Conector ${this.id} detenido`, 'connector');
    } catch (error) {
      log(`Error al detener conector ${this.id}: ${error}`, 'connector');
      throw error;
    }
  }

  /**
   * Pausa el conector
   */
  async pause(): Promise<void> {
    if (this._status === 'active') {
      await this.doStop();
      this._status = 'paused';
      this.emit('status-change', this._status);
    }
  }

  /**
   * Reanuda el conector
   */
  async resume(): Promise<void> {
    if (this._status === 'paused') {
      await this.doStart();
      this._status = 'active';
      this.emit('status-change', this._status);
    }
  }

  /**
   * Health check del conector
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      this._lastHealthCheck = await this.doHealthCheck();
      return this._lastHealthCheck;
    } catch (error) {
      this._lastHealthCheck = {
        healthy: false,
        message: `Health check failed: ${error}`,
        lastChecked: new Date()
      };
      return this._lastHealthCheck;
    }
  }

  /**
   * Obtiene métricas actuales
   */
  getMetrics(): ConnectorMetrics {
    if (this._startTime) {
      this._metrics.uptime = Date.now() - this._startTime.getTime();
    }
    return { ...this._metrics };
  }

  /**
   * Actualiza configuración
   */
  async updateConfig(newConfig: Partial<ConnectorConfig>): Promise<void> {
    const wasActive = this._status === 'active';
    
    if (wasActive) {
      await this.stop();
    }
    
    this._config = { ...this._config, ...newConfig };
    
    if (wasActive) {
      await this.start();
    }
  }

  /**
   * Prueba la conexión
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return await this.doTestConnection();
  }

  /**
   * Emite un evento procesado
   */
  protected emitEvent(eventData: Omit<RawEvent, 'id' | 'connectorId'>): void {
    const event: RawEvent = {
      id: uuidv4(),
      connectorId: this.id,
      ...eventData
    };

    this.emit('event', event);
    this.incrementEventCount();
  }

  /**
   * Emite un error
   */
  protected emitError(error: Error | string): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    this.emit('error', errorObj);
    this.incrementErrorCount();
    
    // Si hay muchos errores, cambiar estado
    if (this._metrics.errorsPerMinute > 10) {
      this._status = 'error';
      this.emit('status-change', this._status);
    }
  }

  /**
   * Configura el tracking de métricas
   */
  private setupMetricsTracking(): void {
    let eventCount = 0;
    let errorCount = 0;
    let latencySum = 0;
    let latencyCount = 0;

    // Resetear contadores cada minuto
    setInterval(() => {
      this._metrics.eventsPerMinute = eventCount;
      this._metrics.errorsPerMinute = errorCount;
      this._metrics.avgLatency = latencyCount > 0 ? latencySum / latencyCount : 0;
      
      eventCount = 0;
      errorCount = 0;
      latencySum = 0;
      latencyCount = 0;
      
      this.emit('metrics-update', this._metrics);
    }, 60000);

    // Métodos para incrementar contadores
    this.incrementEventCount = () => eventCount++;
    this.incrementErrorCount = () => errorCount++;
    this.addLatency = (latency: number) => {
      latencySum += latency;
      latencyCount++;
    };
  }

  protected incrementEventCount(): void {
    // Implementado en setupMetricsTracking
  }

  protected incrementErrorCount(): void {
    // Implementado en setupMetricsTracking
  }

  protected addLatency(latency: number): void {
    // Implementado en setupMetricsTracking
  }

  /**
   * Valida la configuración del conector
   */
  protected validateConfig(): void {
    if (!this._config.id || !this._config.orgId || !this._config.name) {
      throw new Error('Configuración inválida: id, orgId y name son requeridos');
    }
  }
}
