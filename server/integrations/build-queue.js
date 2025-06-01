/**
 * Sistema de cola de construcción de agentes
 * 
 * Maneja la cola de trabajos de construcción de agentes para evitar sobrecarga
 * del servidor y proporcionar un mejor manejo de múltiples solicitudes concurrentes
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Estados posibles de un trabajo de construcción
 */
export const BuildJobStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress', 
    COMPLETED: 'completed',
    FAILED: 'failed'
};

/**
 * Clase para manejar la cola de construcción de agentes
 */
export class BuildQueue extends EventEmitter {
    constructor() {
        super();
        this.jobs = new Map(); // jobId -> job details
        this.queue = []; // Array de jobIds pendientes
        this.concurrentBuilds = 2; // Máximo 2 construcciones simultáneas
        this.activeBuilds = 0;
        this.isProcessing = false;
    }

    /**
     * Añade un nuevo trabajo de construcción a la cola
     */
    addBuildJob(userId, buildConfig) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            userId,
            config: buildConfig,
            status: BuildJobStatus.PENDING,
            createdAt: new Date(),
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            logs: []
        };

        this.jobs.set(jobId, job);
        this.queue.push(jobId);
        
        this.log(jobId, `Build job queued for ${buildConfig.os} (${buildConfig.architecture || 'universal'})`);
        
        // Emitir evento de trabajo añadido
        this.emit('jobAdded', { jobId, userId, config: buildConfig });
        
        // Procesar la cola
        this.processQueue();
        
        return jobId;
    }

    /**
     * Obtiene el estado de un trabajo
     */
    getJobStatus(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }

        return {
            id: job.id,
            userId: job.userId,
            status: job.status,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            result: job.result,
            error: job.error,
            logs: job.logs.slice(-10), // Últimos 10 logs
            config: {
                os: job.config.os,
                architecture: job.config.architecture,
                customName: job.config.customName
            }
        };
    }

    /**
     * Obtiene trabajos por usuario
     */
    getUserJobs(userId, limit = 10) {
        const userJobs = [];
        for (const [jobId, job] of this.jobs.entries()) {
            if (job.userId === userId) {
                userJobs.push(this.getJobStatus(jobId));
            }
        }
        
        // Ordenar por fecha de creación (más recientes primero)
        userJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return userJobs.slice(0, limit);
    }

    /**
     * Procesa la cola de trabajos
     */
    async processQueue() {
        if (this.isProcessing || this.activeBuilds >= this.concurrentBuilds) {
            return;
        }

        if (this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        
        while (this.queue.length > 0 && this.activeBuilds < this.concurrentBuilds) {
            const jobId = this.queue.shift();
            const job = this.jobs.get(jobId);
            
            if (!job || job.status !== BuildJobStatus.PENDING) {
                continue;
            }

            this.activeBuilds++;
            this.processBuildJob(jobId);
        }

        this.isProcessing = false;
    }

    /**
     * Procesa un trabajo individual de construcción
     */
    async processBuildJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            this.activeBuilds--;
            return;
        }

        try {
            // Actualizar estado
            job.status = BuildJobStatus.IN_PROGRESS;
            job.startedAt = new Date();
            
            this.log(jobId, 'Starting build process...');
            this.emit('jobStarted', { jobId, userId: job.userId });

            // Importar el AgentBuilder dinámicamente para evitar dependencias circulares
            const { AgentBuilder } = await import('./agent-builder.js');
            const agentBuilder = new AgentBuilder();

            // Ejecutar la construcción
            const result = await agentBuilder.buildAgent(job.config);

            // Actualizar estado con resultado
            job.status = result.success ? BuildJobStatus.COMPLETED : BuildJobStatus.FAILED;
            job.completedAt = new Date();
            job.result = result;
            
            if (result.success) {
                this.log(jobId, `Build completed successfully. Download: ${result.downloadUrl}`);
                this.emit('jobCompleted', { 
                    jobId, 
                    userId: job.userId, 
                    result: {
                        downloadUrl: result.downloadUrl,
                        agentId: result.agentId
                    }
                });
            } else {
                job.error = result.message;
                this.log(jobId, `Build failed: ${result.message}`);
                this.emit('jobFailed', { jobId, userId: job.userId, error: result.message });
            }

        } catch (error) {
            // Error inesperado
            job.status = BuildJobStatus.FAILED;
            job.completedAt = new Date();
            job.error = error.message;
            
            this.log(jobId, `Build failed with error: ${error.message}`);
            this.emit('jobFailed', { jobId, userId: job.userId, error: error.message });
            
            console.error(`Build job ${jobId} failed:`, error);
        } finally {
            this.activeBuilds--;
            
            // Procesar siguiente trabajo en la cola
            setTimeout(() => this.processQueue(), 1000);
        }
    }

    /**
     * Cancela un trabajo (solo si está pendiente)
     */
    cancelJob(jobId, userId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return { success: false, message: 'Job not found' };
        }

        if (job.userId !== userId) {
            return { success: false, message: 'Unauthorized' };
        }

        if (job.status !== BuildJobStatus.PENDING) {
            return { success: false, message: 'Job cannot be cancelled' };
        }

        // Remover de la cola
        const queueIndex = this.queue.indexOf(jobId);
        if (queueIndex > -1) {
            this.queue.splice(queueIndex, 1);
        }

        // Marcar como fallado
        job.status = BuildJobStatus.FAILED;
        job.completedAt = new Date();
        job.error = 'Cancelled by user';
        
        this.log(jobId, 'Job cancelled by user');
        this.emit('jobCancelled', { jobId, userId });

        return { success: true, message: 'Job cancelled' };
    }

    /**
     * Limpia trabajos antiguos (más de 24 horas)
     */
    cleanupOldJobs() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const toDelete = [];

        for (const [jobId, job] of this.jobs.entries()) {
            if (job.createdAt < oneDayAgo && 
                (job.status === BuildJobStatus.COMPLETED || job.status === BuildJobStatus.FAILED)) {
                toDelete.push(jobId);
            }
        }

        toDelete.forEach(jobId => {
            this.jobs.delete(jobId);
            console.log(`Cleaned up old build job: ${jobId}`);
        });

        return toDelete.length;
    }

    /**
     * Obtiene estadísticas de la cola
     */
    getQueueStats() {
        let pending = 0;
        let inProgress = 0;
        let completed = 0;
        let failed = 0;

        for (const job of this.jobs.values()) {
            switch (job.status) {
                case BuildJobStatus.PENDING:
                    pending++;
                    break;
                case BuildJobStatus.IN_PROGRESS:
                    inProgress++;
                    break;
                case BuildJobStatus.COMPLETED:
                    completed++;
                    break;
                case BuildJobStatus.FAILED:
                    failed++;
                    break;
            }
        }

        return {
            totalJobs: this.jobs.size,
            pending,
            inProgress,
            completed,
            failed,
            queueLength: this.queue.length,
            activeBuilds: this.activeBuilds,
            maxConcurrentBuilds: this.concurrentBuilds
        };
    }

    /**
     * Añade un log a un trabajo
     */
    log(jobId, message) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.logs.push({
                timestamp: new Date().toISOString(),
                message
            });
            
            // Mantener solo los últimos 50 logs por trabajo
            if (job.logs.length > 50) {
                job.logs = job.logs.slice(-50);
            }
        }
        
        console.log(`[BuildQueue:${jobId}] ${message}`);
    }
}

// Instancia singleton de la cola de construcción
export const buildQueue = new BuildQueue();

// Limpieza automática cada hora
setInterval(() => {
    const cleaned = buildQueue.cleanupOldJobs();
    if (cleaned > 0) {
        console.log(`Build queue cleanup: removed ${cleaned} old jobs`);
    }
}, 60 * 60 * 1000); // 1 hora