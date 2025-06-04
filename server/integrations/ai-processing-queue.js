/**
 * Sistema de procesamiento asíncrono y triaje inteligente para análisis de IA
 *
 * Este módulo implementa:
 * 1. Un sistema de colas para gestionar grandes volúmenes de solicitudes de análisis
 * 2. Un mecanismo de triaje que clasifica y prioriza las alertas
 * 3. Procesamiento distribuido para diferentes tipos de análisis
 */
import { storage } from "../storage";
import { log } from "../vite";
import { generateAlertInsight, correlateAlerts, analyzeThreatIntel, analyzeLogPatterns, analyzeNetworkTraffic, detectAnomalies, isOpenAIConfigured, isAnthropicConfigured } from "../advanced-ai-service";
// Niveles de prioridad para elementos de la cola
var PriorityLevel;
(function (PriorityLevel) {
    PriorityLevel[PriorityLevel["CRITICAL"] = 0] = "CRITICAL";
    PriorityLevel[PriorityLevel["HIGH"] = 1] = "HIGH";
    PriorityLevel[PriorityLevel["MEDIUM"] = 2] = "MEDIUM";
    PriorityLevel[PriorityLevel["LOW"] = 3] = "LOW";
})(PriorityLevel || (PriorityLevel = {}));
// Clase principal para gestión de colas de procesamiento
export class AIProcessingQueue {
    static instance;
    queue = [];
    processing = false;
    maxConcurrent = 3; // Máximo de procesamientos concurrentes
    currentConcurrent = 0;
    processingMap = new Map();
    failedItems = [];
    // Configuración
    config = {
        alertTriageSeverityThreshold: "low", // Umbral de severidad para análisis de alertas
        defaultMaxAttempts: 3, // Intentos predeterminados
        processingInterval: 1000, // Intervalo de procesamiento (ms)
        alertBatchSize: 10, // Tamaño del lote para correlación
        priorityBoost: {
            critical: 2,
            highConfidence: 1,
            recentActivity: 1,
            knownActors: 2
        }
    };
    constructor() {
        // Iniciar el procesador de cola
        setInterval(() => this.processQueue(), this.config.processingInterval);
        log("Sistema de procesamiento de IA inicializado", "ai-queue");
    }
    // Patrón Singleton para asegurar una única instancia
    static getInstance() {
        if (!AIProcessingQueue.instance) {
            AIProcessingQueue.instance = new AIProcessingQueue();
        }
        return AIProcessingQueue.instance;
    }
    /**
     * Añade una alerta para análisis de IA
     */
    async enqueueAlertAnalysis(alert, modelPreference) {
        // Verificar si el sistema está configurado
        if (!this.isAIConfigured()) {
            log("No se puede encolar análisis de alerta: IA no configurada", "ai-queue");
            return null;
        }
        // Aplicar triaje para determinar si procesar
        if (!this.shouldProcessAlert(alert)) {
            log(`Alerta ID ${alert.id} no alcanza umbral para análisis de IA`, "ai-queue");
            return null;
        }
        // Calcular prioridad basada en severidad
        const priority = this.calculateAlertPriority(alert);
        // Crear ID único
        const queueId = `alert_${alert.id}_${Date.now()}`;
        // Encolar para procesamiento
        this.queue.push({
            id: queueId,
            type: "alert_analysis",
            priority,
            data: alert,
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        // Ordenar cola por prioridad
        this.sortQueue();
        log(`Análisis de alerta ID ${alert.id} encolado con prioridad ${priority}`, "ai-queue");
        return queueId;
    }
    /**
     * Añade un conjunto de alertas para correlación
     */
    async enqueueAlertCorrelation(alerts, modelPreference) {
        if (!this.isAIConfigured() || alerts.length === 0) {
            return null;
        }
        // Calcular prioridad (la más alta de las alertas)
        const highestPriority = Math.min(...alerts.map(a => this.calculateAlertPriority(a)));
        const queueId = `correlation_${Date.now()}`;
        this.queue.push({
            id: queueId,
            type: "correlation",
            priority: highestPriority,
            data: alerts,
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        this.sortQueue();
        log(`Correlación para ${alerts.length} alertas encolada con prioridad ${highestPriority}`, "ai-queue");
        return queueId;
    }
    /**
     * Añade datos de threat intel para análisis
     */
    async enqueueThreatIntelAnalysis(intel, modelPreference) {
        if (!this.isAIConfigured()) {
            return null;
        }
        // Calcular prioridad basada en severidad de la intel
        const severityMap = {
            critical: PriorityLevel.CRITICAL,
            high: PriorityLevel.HIGH,
            medium: PriorityLevel.MEDIUM,
            low: PriorityLevel.LOW
        };
        const priority = severityMap[intel.severity.toLowerCase()] || PriorityLevel.MEDIUM;
        const queueId = `intel_${intel.id}_${Date.now()}`;
        this.queue.push({
            id: queueId,
            type: "threat_intel",
            priority,
            data: intel,
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        this.sortQueue();
        log(`Análisis de inteligencia ID ${intel.id} encolado con prioridad ${priority}`, "ai-queue");
        return queueId;
    }
    /**
     * Añade logs para análisis de patrones
     */
    async enqueueLogAnalysis(logs, context = {}, priority = PriorityLevel.MEDIUM, modelPreference) {
        if (!this.isAIConfigured() || logs.length === 0) {
            return null;
        }
        const queueId = `logs_${Date.now()}`;
        this.queue.push({
            id: queueId,
            type: "log_analysis",
            priority,
            data: { logs, context },
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        this.sortQueue();
        log(`Análisis de ${logs.length} logs encolado con prioridad ${priority}`, "ai-queue");
        return queueId;
    }
    /**
     * Añade datos de tráfico de red para análisis
     */
    async enqueueNetworkAnalysis(trafficData, context = {}, priority = PriorityLevel.MEDIUM, modelPreference) {
        if (!this.isAIConfigured() || trafficData.length === 0) {
            return null;
        }
        const queueId = `network_${Date.now()}`;
        this.queue.push({
            id: queueId,
            type: "network_analysis",
            priority,
            data: { trafficData, context },
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        this.sortQueue();
        log(`Análisis de ${trafficData.length} registros de tráfico encolado con prioridad ${priority}`, "ai-queue");
        return queueId;
    }
    /**
     * Añade datos de series temporales para detección de anomalías
     */
    async enqueueAnomalyDetection(timeSeriesData, context = {}, priority = PriorityLevel.MEDIUM, modelPreference) {
        if (!this.isAIConfigured() || timeSeriesData.length === 0) {
            return null;
        }
        const queueId = `anomaly_${Date.now()}`;
        this.queue.push({
            id: queueId,
            type: "anomaly_detection",
            priority,
            data: { timeSeriesData, context },
            attempts: 0,
            maxAttempts: this.config.defaultMaxAttempts,
            createdAt: new Date(),
            modelPreference
        });
        this.sortQueue();
        log(`Detección de anomalías para ${timeSeriesData.length} puntos de datos encolada con prioridad ${priority}`, "ai-queue");
        return queueId;
    }
    /**
     * Busca alertas recientes y activa correlación automática
     */
    async triggerAutomaticCorrelation(timeWindowHours = 24, minAlerts = 3) {
        // Obtener alertas recientes no resueltas
        const recentAlerts = await storage.listAlerts();
        const activeAlerts = recentAlerts.filter(a => a.status !== 'resolved' &&
            a.timestamp &&
            new Date(a.timestamp).getTime() > Date.now() - (timeWindowHours * 60 * 60 * 1000));
        if (activeAlerts.length < minAlerts) {
            log(`No hay suficientes alertas activas para correlación (${activeAlerts.length} < ${minAlerts})`, "ai-queue");
            return;
        }
        // Agrupar por criterios simples para crear lotes potencialmente relacionados
        const alertGroups = {};
        // Agrupar por IPs comunes
        for (const alert of activeAlerts) {
            // Agrupar por IPs de origen/destino
            if (alert.sourceIp) {
                const key = `src_${alert.sourceIp}`;
                if (!alertGroups[key])
                    alertGroups[key] = [];
                alertGroups[key].push(alert);
            }
            if (alert.destinationIp) {
                const key = `dst_${alert.destinationIp}`;
                if (!alertGroups[key])
                    alertGroups[key] = [];
                alertGroups[key].push(alert);
            }
            // También podríamos agrupar por otros criterios como severidad, fuente, etc.
        }
        // Encolar grupos que tengan suficientes alertas
        for (const [key, alerts] of Object.entries(alertGroups)) {
            if (alerts.length >= minAlerts) {
                // Limitar a un tamaño de lote máximo para evitar sobrecargar la IA
                const batchedAlerts = alerts.slice(0, this.config.alertBatchSize);
                this.enqueueAlertCorrelation(batchedAlerts);
                log(`Correlación automática activada para grupo ${key} con ${batchedAlerts.length} alertas`, "ai-queue");
            }
        }
    }
    /**
     * Estado actual de la cola de procesamiento
     */
    getQueueStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            currentConcurrent: this.currentConcurrent,
            failedItems: this.failedItems.length,
            nextItems: this.queue.slice(0, 5).map(item => ({
                id: item.id,
                type: item.type,
                priority: item.priority
            }))
        };
    }
    /**
     * Reintentar elementos fallidos
     */
    retryFailedItems() {
        const count = this.failedItems.length;
        // Reiniciar contador de intentos y reencolar
        for (const item of this.failedItems) {
            item.attempts = 0;
            this.queue.push(item);
        }
        this.failedItems = [];
        this.sortQueue();
        log(`${count} elementos fallidos reencolados para reintento`, "ai-queue");
        return count;
    }
    /**
     * Actualizar configuración del sistema de colas
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        log("Configuración de sistema de colas actualizada", "ai-queue");
    }
    /**
     * Determina si una alerta debe ser procesada según criterios de triaje
     */
    shouldProcessAlert(alert) {
        // Verificar umbral de severidad configurado
        const severityLevels = ['low', 'medium', 'high', 'critical'];
        const alertSeverityIndex = severityLevels.indexOf(alert.severity.toLowerCase());
        const thresholdIndex = severityLevels.indexOf(this.config.alertTriageSeverityThreshold);
        // Solo procesar si la severidad es mayor o igual al umbral
        return alertSeverityIndex >= thresholdIndex;
    }
    /**
     * Calcula la prioridad para una alerta basada en criterios múltiples
     */
    calculateAlertPriority(alert) {
        // Mapeo básico de severidad a prioridad
        const basePriority = {
            'critical': PriorityLevel.CRITICAL,
            'high': PriorityLevel.HIGH,
            'medium': PriorityLevel.MEDIUM,
            'low': PriorityLevel.LOW
        }[alert.severity.toLowerCase()] || PriorityLevel.MEDIUM;
        // Aquí podrían aplicarse otros criterios para ajustar la prioridad
        // Por ejemplo: alertas de una fuente específica, con ciertos IoCs, etc.
        return basePriority;
    }
    /**
     * Verifica si hay algún servicio de IA configurado
     */
    isAIConfigured() {
        return isOpenAIConfigured() || isAnthropicConfigured();
    }
    /**
     * Ordena la cola por prioridad
     */
    sortQueue() {
        this.queue.sort((a, b) => a.priority - b.priority);
    }
    /**
     * Procesador principal de la cola
     */
    async processQueue() {
        // Evitar procesamiento concurrente del mismo elemento o si la cola está vacía
        if (this.queue.length === 0 || this.currentConcurrent >= this.maxConcurrent) {
            return;
        }
        this.processing = true;
        // Procesar mientras haya elementos y no se exceda el máximo concurrente
        while (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
            // Obtener el siguiente elemento de mayor prioridad
            const item = this.queue.shift();
            // Verificar si este elemento ya está siendo procesado
            if (this.processingMap.has(item.id)) {
                continue;
            }
            // Marcar como en procesamiento
            this.currentConcurrent++;
            this.processingMap.set(item.id, true);
            // Procesar de forma asíncrona
            this.processItem(item).finally(() => {
                this.currentConcurrent--;
                this.processingMap.delete(item.id);
            });
        }
        this.processing = this.currentConcurrent > 0;
    }
    /**
     * Procesa un elemento individual de la cola
     */
    async processItem(item) {
        try {
            log(`Procesando elemento ${item.id} (${item.type}) - Intento ${item.attempts + 1}/${item.maxAttempts}`, "ai-queue");
            item.attempts++;
            let result = null;
            // Procesamiento según tipo
            switch (item.type) {
                case "alert_analysis":
                    result = await this.processAlertAnalysis(item);
                    break;
                case "correlation":
                    result = await this.processAlertCorrelation(item);
                    break;
                case "threat_intel":
                    result = await this.processThreatIntelAnalysis(item);
                    break;
                case "log_analysis":
                    result = await this.processLogAnalysis(item);
                    break;
                case "network_analysis":
                    result = await this.processNetworkAnalysis(item);
                    break;
                case "anomaly_detection":
                    result = await this.processAnomalyDetection(item);
                    break;
            }
            // Verificar resultado
            if (result) {
                log(`Procesamiento exitoso para ${item.id}`, "ai-queue");
            }
            else {
                throw new Error(`No se pudo completar el procesamiento de ${item.id}`);
            }
        }
        catch (error) {
            log(`Error procesando ${item.id}: ${error.message}`, "ai-queue");
            // Verificar si hay intentos restantes
            if (item.attempts < item.maxAttempts) {
                // Reencolar con menor prioridad
                item.priority = Math.min(PriorityLevel.LOW, item.priority + 1);
                this.queue.push(item);
                this.sortQueue();
            }
            else {
                // Mover a la cola de fallidos
                this.failedItems.push(item);
                log(`Elemento ${item.id} movido a fallidos después de ${item.attempts} intentos`, "ai-queue");
            }
        }
    }
    /**
     * Procesa un análisis de alerta
     */
    async processAlertAnalysis(item) {
        const alert = item.data;
        const insight = await generateAlertInsight(alert, item.modelPreference);
        if (!insight) {
            throw new Error("No se pudo generar insight para la alerta");
        }
        // Guardar el resultado en la base de datos
        return await storage.createAiInsight(insight);
    }
    /**
     * Procesa correlación de alertas
     */
    async processAlertCorrelation(item) {
        const alerts = item.data;
        const incident = await correlateAlerts(alerts, item.modelPreference);
        if (!incident) {
            // No es un error, simplemente no hay correlación significativa
            log(`No se encontró correlación significativa entre las alertas`, "ai-queue");
            return true;
        }
        // Crear incidente en la base de datos
        return await storage.createIncident(incident);
    }
    /**
     * Procesa análisis de threat intel
     */
    async processThreatIntelAnalysis(item) {
        const intel = item.data;
        const insight = await analyzeThreatIntel(intel, item.modelPreference);
        if (!insight) {
            throw new Error("No se pudo generar insight para la inteligencia de amenazas");
        }
        // Guardar el resultado en la base de datos
        return await storage.createAiInsight(insight);
    }
    /**
     * Procesa análisis de logs
     */
    async processLogAnalysis(item) {
        const { logs, context } = item.data;
        const insight = await analyzeLogPatterns(logs, context, item.modelPreference);
        if (!insight) {
            throw new Error("No se pudo generar insight para los logs");
        }
        // Guardar el resultado en la base de datos
        return await storage.createAiInsight(insight);
    }
    /**
     * Procesa análisis de tráfico de red
     */
    async processNetworkAnalysis(item) {
        const { trafficData, context } = item.data;
        const insight = await analyzeNetworkTraffic(trafficData, context, item.modelPreference);
        if (!insight) {
            throw new Error("No se pudo generar insight para el tráfico de red");
        }
        // Guardar el resultado en la base de datos
        return await storage.createAiInsight(insight);
    }
    /**
     * Procesa detección de anomalías
     */
    async processAnomalyDetection(item) {
        const { timeSeriesData, context } = item.data;
        const insight = await detectAnomalies(timeSeriesData, context, item.modelPreference);
        if (!insight) {
            throw new Error("No se pudo generar insight para la detección de anomalías");
        }
        // Guardar el resultado en la base de datos
        return await storage.createAiInsight(insight);
    }
}
// Exportar una instancia única
export const aiQueue = AIProcessingQueue.getInstance();
