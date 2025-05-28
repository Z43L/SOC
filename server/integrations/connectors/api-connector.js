import { BaseConnector } from './base-connector';
import axios from 'axios';
import { z } from 'zod';
import { log } from '../../vite';
/**
 * Esquema de validación para respuestas de API
 */
const ApiResponseSchema = z.object({
    data: z.unknown(),
    timestamp: z.string().optional(),
    records: z.array(z.unknown()).optional()
});
/**
 * Conector para ingestión de datos via API Polling
 * Soporta autenticación múltiple, paginación y filtros
 */
export class ApiPollingConnector extends BaseConnector {
    pollingInterval;
    lastPollTime;
    nextPageToken;
    retryCount = 0;
    maxRetries = 3;
    constructor(config) {
        super(config);
        // Validar configuración específica de API
        const apiConfig = this._config;
        if (!apiConfig.url) {
            throw new Error('API URL is required for ApiPollingConnector');
        }
        this.validateApiConfig(apiConfig);
    }
    /**
     * Valida la configuración de API
     */
    validateApiConfig(apiConfig) {
        if (!apiConfig.url) {
            throw new Error('API URL is required');
        }
        if (!apiConfig.interval || apiConfig.interval < 1) {
            throw new Error('Poll interval must be at least 1 second');
        }
    }
    /**
     * Implementación de doStart - requerido por BaseConnector
     */
    async doStart() {
        // Realizar una prueba de conectividad inicial
        const testResult = await this.doTestConnection();
        if (!testResult.success) {
            throw new Error(`Connection test failed: ${testResult.message}`);
        }
        // Configurar el polling
        this.setupPolling();
        this.emitEvent({
            timestamp: new Date(),
            source: this._config.url,
            message: `API Polling connector started for ${this._config.url}`,
            severity: 'info',
            rawData: {}
        });
    }
    /**
     * Implementación de doStop - requerido por BaseConnector
     */
    async doStop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
        }
        this.emitEvent({
            timestamp: new Date(),
            source: this._config.url,
            message: 'API Polling connector stopped',
            severity: 'info',
            rawData: {}
        });
    }
    /**
     * Implementación de doHealthCheck - requerido por BaseConnector
     */
    async doHealthCheck() {
        try {
            const startTime = Date.now();
            const response = await this.makeApiRequest({
                method: 'HEAD',
                timeout: 5000
            });
            const latency = Date.now() - startTime;
            const healthy = response.status >= 200 && response.status < 300;
            return {
                healthy,
                message: healthy ? 'API endpoint accessible' : `HTTP ${response.status}`,
                latency,
                lastChecked: new Date()
            };
        }
        catch (error) {
            return {
                healthy: false,
                message: `Health check failed: ${error}`,
                lastChecked: new Date()
            };
        }
    }
    /**
     * Implementación de doTestConnection - requerido por BaseConnector
     */
    async doTestConnection() {
        try {
            const config = this.buildRequestConfig(1);
            config.timeout = 10000; // Timeout más corto para pruebas
            const response = await this.makeApiRequest(config);
            return {
                success: true,
                message: `Connection successful (HTTP ${response.status})`
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error}`
            };
        }
    }
    /**
     * Configura el polling de datos
     */
    setupPolling() {
        const apiConfig = this._config;
        this.pollingInterval = setInterval(async () => {
            try {
                await this.pollData();
            }
            catch (error) {
                log(`Error during polling: ${error}`, 'api-connector');
            }
        }, apiConfig.interval * 1000);
        // Realizar el primer poll inmediatamente
        setImmediate(() => this.pollData());
    }
    /**
     * Realiza un poll de datos desde la API
     */
    async pollData() {
        const startTime = Date.now();
        try {
            const apiConfig = this._config;
            let hasMoreData = true;
            let currentPage = 1;
            let totalRecords = 0;
            while (hasMoreData) {
                const requestConfig = this.buildRequestConfig(currentPage);
                const response = await this.makeApiRequest(requestConfig);
                // Validar respuesta
                const validatedResponse = ApiResponseSchema.safeParse(response.data);
                if (!validatedResponse.success) {
                    throw new Error(`Invalid API response format: ${validatedResponse.error.message}`);
                }
                // Procesar datos
                const processedRecords = await this.processApiResponse(response.data);
                totalRecords += processedRecords;
                // Determinar si hay más páginas
                hasMoreData = this.hasMorePages(response, currentPage);
                currentPage++;
                // Respetar límites de paginación (máximo 10 páginas por poll)
                if (currentPage > 10) {
                    break;
                }
            }
            // Actualizar métricas
            const latency = Date.now() - startTime;
            this.updateConnectorMetrics(totalRecords, 0, latency);
            this.lastPollTime = new Date();
            this.retryCount = 0; // Reset contador de reintentos en éxito
            this.emitEvent({
                timestamp: new Date(),
                source: apiConfig.url,
                message: `Successfully polled ${totalRecords} records`,
                severity: 'info',
                rawData: {
                    recordCount: totalRecords,
                    latency,
                    currentPage: currentPage - 1
                }
            });
        }
        catch (error) {
            const latency = Date.now() - startTime;
            this.updateConnectorMetrics(0, 1, latency);
            this.retryCount++;
            log(`Polling failed (attempt ${this.retryCount}/${this.maxRetries}): ${error}`, 'api-connector');
            // Si excedemos los reintentos, marcar como error
            if (this.retryCount >= this.maxRetries) {
                this.emitEvent({
                    timestamp: new Date(),
                    source: this._config.url,
                    message: 'Max retries exceeded',
                    severity: 'error',
                    rawData: { error: String(error) }
                });
            }
        }
    }
    /**
     * Construye la configuración de la petición HTTP
     */
    buildRequestConfig(page) {
        const apiConfig = this._config;
        const config = {
            method: apiConfig.method || 'GET',
            url: apiConfig.url,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `SOC-Connector/${this.id}`,
                ...apiConfig.headers
            }
        };
        // Añadir paginación si está configurada
        if (apiConfig.pagination) {
            const pageConfig = apiConfig.pagination;
            if (pageConfig.type === 'offset') {
                config.params = {
                    [pageConfig.paramName]: (page - 1) * 100
                };
            }
            else if (pageConfig.type === 'cursor' && this.nextPageToken) {
                config.params = {
                    [pageConfig.paramName]: this.nextPageToken
                };
            }
        }
        // Añadir filtros temporales
        if (this.lastPollTime) {
            config.params = {
                ...config.params,
                since: this.lastPollTime.toISOString()
            };
        }
        return config;
    }
    /**
     * Realiza la petición HTTP a la API
     */
    async makeApiRequest(config) {
        try {
            const response = await axios(config);
            return response;
        }
        catch (error) {
            if (error.response) {
                // Error de respuesta HTTP
                throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
            }
            else if (error.request) {
                // Error de red
                throw new Error('Network error: No response received');
            }
            else {
                // Error de configuración
                throw new Error(`Request error: ${error.message}`);
            }
        }
    }
    /**
     * Procesa la respuesta de la API y emite eventos
     */
    async processApiResponse(data) {
        let records = [];
        // Extraer registros según la respuesta
        if (Array.isArray(data)) {
            records = data;
        }
        else if (data.data && Array.isArray(data.data)) {
            records = data.data;
        }
        else if (data.results && Array.isArray(data.results)) {
            records = data.results;
        }
        else if (data.items && Array.isArray(data.items)) {
            records = data.items;
        }
        else {
            records = [data]; // Tratar como un solo registro
        }
        // Procesar cada registro
        for (const record of records) {
            this.emitEvent({
                timestamp: new Date(),
                source: this._config.url,
                message: 'API data received',
                severity: 'info',
                rawData: record
            });
        }
        return records.length;
    }
    /**
     * Determina si hay más páginas de datos
     */
    hasMorePages(response, currentPage) {
        const apiConfig = this._config;
        if (!apiConfig.pagination) {
            return false; // Sin paginación, solo una página
        }
        const data = response.data;
        // Verificar por cursor
        if (apiConfig.pagination.type === 'cursor') {
            this.nextPageToken = data.nextToken || data.next_page_token;
            return !!this.nextPageToken;
        }
        // Verificar si la página actual tiene datos
        const records = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
        return records.length > 0;
    }
    /**
     * Actualiza métricas del conector
     */
    updateConnectorMetrics(events, errors, latency) {
        this._metrics.eventsPerMinute = events;
        this._metrics.errorsPerMinute = errors;
        this._metrics.avgLatency = latency;
        this._metrics.lastEventAt = events > 0 ? new Date() : this._metrics.lastEventAt;
        this.emit('metrics-update', this._metrics);
    }
}
