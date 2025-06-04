/**
 * Sistema de cola para procesamiento de datos de conectores
 * Maneja el procesamiento asíncrono y de alto volumen de datos
 */
import { EventEmitter } from 'events';
import { DataProcessor } from './data-processor';
import { storage } from '../../storage';
import { log } from '../../vite';
export class ConnectorQueue extends EventEmitter {
    static instance;
    queue = [];
    processing = new Map();
    completed = [];
    failed = [];
    isRunning = false;
    concurrency = 5;
    retryDelay = 5000; // 5 segundos
    maxQueueSize = 10000;
    cleanupInterval = null;
    constructor() {
        super();
        this.startCleanupScheduler();
    }
    static getInstance() {
        if (!ConnectorQueue.instance) {
            ConnectorQueue.instance = new ConnectorQueue();
        }
        return ConnectorQueue.instance;
    }
    /**
     * Inicia el procesamiento de la cola
     */
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        log('Connector queue started', 'queue');
        // Iniciar workers concurrentes
        for (let i = 0; i < this.concurrency; i++) {
            this.processQueue();
        }
    }
    /**
     * Detiene el procesamiento de la cola
     */
    stop() {
        this.isRunning = false;
        log('Connector queue stopped', 'queue');
    }
    /**
     * Añade un trabajo a la cola
     */
    async enqueue(connectorId, data, dataSource, priority = 'medium') {
        // Verificar límite de cola
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Queue is full');
        }
        const job = {
            id: this.generateJobId(),
            connectorId,
            data,
            dataSource,
            priority,
            attempts: 0,
            maxAttempts: priority === 'critical' ? 5 : 3,
            createdAt: new Date()
        };
        // Insertar según prioridad
        this.insertByPriority(job);
        this.emit('jobQueued', job);
        log(`Job ${job.id} queued for connector ${connectorId}`, 'queue');
        return job.id;
    }
    /**
     * Obtiene estadísticas de la cola
     */
    getStats() {
        const totalProcessingTime = this.completed.reduce((sum, job) => {
            if (job.processingStartedAt && job.completedAt) {
                return sum + (job.completedAt.getTime() - job.processingStartedAt.getTime());
            }
            return sum;
        }, 0);
        return {
            pending: this.queue.length,
            processing: this.processing.size,
            completed: this.completed.length,
            failed: this.failed.length,
            totalProcessed: this.completed.length + this.failed.length,
            averageProcessingTime: this.completed.length > 0 ? totalProcessingTime / this.completed.length : 0
        };
    }
    /**
     * Obtiene el estado de un trabajo específico
     */
    getJobStatus(jobId) {
        // Buscar en cola pendiente
        const pendingJob = this.queue.find(j => j.id === jobId);
        if (pendingJob) {
            return { status: 'pending', job: pendingJob };
        }
        // Buscar en procesamiento
        const processingJob = this.processing.get(jobId);
        if (processingJob) {
            return { status: 'processing', job: processingJob };
        }
        // Buscar en completados
        const completedJob = this.completed.find(j => j.id === jobId);
        if (completedJob) {
            return { status: 'completed', job: completedJob };
        }
        // Buscar en fallidos
        const failedJob = this.failed.find(j => j.id === jobId);
        if (failedJob) {
            return { status: 'failed', job: failedJob };
        }
        return { status: 'not_found' };
    }
    /**
     * Reintenta trabajos fallidos
     */
    async retryFailedJobs(connectorId) {
        let retriedCount = 0;
        const jobsToRetry = connectorId
            ? this.failed.filter(job => job.connectorId === connectorId)
            : this.failed.slice();
        for (const job of jobsToRetry) {
            if (job.attempts < job.maxAttempts) {
                // Remover de fallidos y añadir a la cola
                this.failed = this.failed.filter(j => j.id !== job.id);
                job.error = undefined;
                this.insertByPriority(job);
                retriedCount++;
            }
        }
        log(`Retrying ${retriedCount} failed jobs`, 'queue');
        return retriedCount;
    }
    /**
     * Limpia trabajos antiguos
     */
    cleanup(olderThanHours = 24) {
        const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
        const initialCompleted = this.completed.length;
        const initialFailed = this.failed.length;
        this.completed = this.completed.filter(job => job.completedAt > cutoffTime);
        this.failed = this.failed.filter(job => job.createdAt > cutoffTime);
        const removedCompleted = initialCompleted - this.completed.length;
        const removedFailed = initialFailed - this.failed.length;
        if (removedCompleted > 0 || removedFailed > 0) {
            log(`Cleaned up ${removedCompleted} completed and ${removedFailed} failed jobs`, 'queue');
        }
    }
    /**
     * Procesa la cola de trabajos
     */
    async processQueue() {
        while (this.isRunning) {
            try {
                const job = this.dequeue();
                if (!job) {
                    // No hay trabajos, esperar un poco
                    await this.sleep(1000);
                    continue;
                }
                await this.processJob(job);
            }
            catch (error) {
                log(`Queue processing error: ${error}`, 'queue');
                await this.sleep(5000);
            }
        }
    }
    /**
     * Procesa un trabajo individual
     */
    async processJob(job) {
        job.processingStartedAt = new Date();
        job.attempts++;
        this.processing.set(job.id, job);
        this.emit('jobStarted', job);
        try {
            // Obtener el conector
            const connector = await storage.getConnector(job.connectorId);
            if (!connector) {
                throw new Error(`Connector ${job.connectorId} not found`);
            }
            // Procesar los datos
            const processor = new DataProcessor(connector);
            const result = await processor.processData(job.data, job.dataSource);
            if (result.success) {
                // Guardar alertas en la base de datos
                for (const alert of result.alerts) {
                    try {
                        await storage.createAlert(alert);
                    }
                    catch (alertError) {
                        log(`Error saving alert: ${alertError}`, 'queue');
                    }
                }
                // Guardar threat intel en la base de datos
                for (const threat of result.threatIntel) {
                    try {
                        await storage.createThreatIntel(threat);
                    }
                    catch (threatError) {
                        log(`Error saving threat intel: ${threatError}`, 'queue');
                    }
                }
                // Trabajo completado exitosamente
                job.completedAt = new Date();
                this.processing.delete(job.id);
                this.completed.push(job);
                this.emit('jobCompleted', job, result);
                log(`Job ${job.id} completed successfully`, 'queue');
                // Actualizar métricas del conector
                await this.updateConnectorMetrics(connector, result);
            }
            else {
                throw new Error(`Processing failed: ${result.errors.join(', ')}`);
            }
        }
        catch (error) {
            await this.handleJobError(job, error);
        }
    }
    /**
     * Maneja errores en el procesamiento de trabajos
     */
    async handleJobError(job, error) {
        job.error = error instanceof Error ? error.message : String(error);
        this.processing.delete(job.id);
        log(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${job.error}`, 'queue');
        if (job.attempts < job.maxAttempts) {
            // Reintentar más tarde
            setTimeout(() => {
                this.insertByPriority(job);
            }, this.retryDelay * job.attempts); // Backoff exponencial
            this.emit('jobRetry', job);
        }
        else {
            // Trabajo falló definitivamente
            this.failed.push(job);
            this.emit('jobFailed', job);
            log(`Job ${job.id} failed permanently`, 'queue');
        }
    }
    /**
     * Actualiza métricas del conector
     */
    async updateConnectorMetrics(connector, result) {
        try {
            const configuration = connector.configuration || {};
            const executionState = configuration.executionState || {};
            // Actualizar estadísticas
            executionState.lastRun = new Date();
            executionState.lastSuccess = new Date();
            executionState.dataProcessed = (executionState.dataProcessed || 0) + result.metrics.successfulRecords;
            executionState.bytesProcessed = (executionState.bytesProcessed || 0) + result.metrics.bytesProcessed;
            executionState.executionTime = result.metrics.processingTime;
            executionState.consecutiveErrors = 0;
            await storage.updateConnector(connector.id, {
                configuration: {
                    ...configuration,
                    executionState
                },
                status: 'active',
                lastData: new Date().toISOString(),
                lastSuccessfulConnection: new Date()
            });
        }
        catch (error) {
            log(`Error updating connector metrics: ${error}`, 'queue');
        }
    }
    /**
     * Retira el siguiente trabajo de la cola
     */
    dequeue() {
        return this.queue.shift() || null;
    }
    /**
     * Inserta trabajo según prioridad
     */
    insertByPriority(job) {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const jobPriority = priorityOrder[job.priority];
        let insertIndex = this.queue.length;
        for (let i = 0; i < this.queue.length; i++) {
            const existingPriority = priorityOrder[this.queue[i].priority];
            if (jobPriority < existingPriority) {
                insertIndex = i;
                break;
            }
        }
        this.queue.splice(insertIndex, 0, job);
    }
    /**
     * Genera ID único para trabajo
     */
    generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Función de espera
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Inicia el programador de limpieza
     */
    startCleanupScheduler() {
        // Limpiar cada hora
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);
    }
    /**
     * Detiene el programador de limpieza
     */
    destroy() {
        this.stop();
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
// Exportar instancia singleton
export const connectorQueue = ConnectorQueue.getInstance();
