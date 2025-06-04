/**
 * Clase base para todos los conectores
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../vite';
export class BaseConnector extends EventEmitter {
    id;
    type;
    _config;
    _status = 'disabled';
    _metrics;
    _lastHealthCheck;
    _startTime;
    constructor(config) {
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
    get config() {
        return { ...this._config };
    }
    get status() {
        return this._status;
    }
    /**
     * Inicia el conector
     */
    async start() {
        try {
            log(`Iniciando conector ${this.id} (${this.type})`, 'connector');
            this._status = 'active';
            this._startTime = new Date();
            await this.doStart();
            this.emit('status-change', this._status);
            log(`Conector ${this.id} iniciado correctamente`, 'connector');
        }
        catch (error) {
            this._status = 'error';
            this.emit('status-change', this._status);
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * Detiene el conector
     */
    async stop() {
        try {
            log(`Deteniendo conector ${this.id}`, 'connector');
            await this.doStop();
            this._status = 'disabled';
            this._startTime = undefined;
            this.emit('status-change', this._status);
            log(`Conector ${this.id} detenido`, 'connector');
        }
        catch (error) {
            log(`Error al detener conector ${this.id}: ${error}`, 'connector');
            throw error;
        }
    }
    /**
     * Pausa el conector
     */
    async pause() {
        if (this._status === 'active') {
            await this.doStop();
            this._status = 'paused';
            this.emit('status-change', this._status);
        }
    }
    /**
     * Reanuda el conector
     */
    async resume() {
        if (this._status === 'paused') {
            await this.doStart();
            this._status = 'active';
            this.emit('status-change', this._status);
        }
    }
    /**
     * Health check del conector
     */
    async healthCheck() {
        try {
            this._lastHealthCheck = await this.doHealthCheck();
            return this._lastHealthCheck;
        }
        catch (error) {
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
    getMetrics() {
        if (this._startTime) {
            this._metrics.uptime = Date.now() - this._startTime.getTime();
        }
        return { ...this._metrics };
    }
    /**
     * Actualiza configuración
     */
    async updateConfig(newConfig) {
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
    async testConnection() {
        return await this.doTestConnection();
    }
    /**
     * Emite un evento procesado
     */
    emitEvent(eventData) {
        const event = {
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
    emitError(error) {
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
    setupMetricsTracking() {
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
        this.addLatency = (latency) => {
            latencySum += latency;
            latencyCount++;
        };
    }
    incrementEventCount() {
        // Implementado en setupMetricsTracking
    }
    incrementErrorCount() {
        // Implementado en setupMetricsTracking
    }
    addLatency(latency) {
        // Implementado en setupMetricsTracking
    }
    /**
     * Valida la configuración del conector
     */
    validateConfig() {
        if (!this._config.id || !this._config.orgId || !this._config.name) {
            throw new Error('Configuración inválida: id, orgId y name son requeridos');
        }
    }
}
