/**
 * Clase base para todos los conectores de datos
 * Define la estructura común y funcionalidades que todos los conectores deben implementar
 */
import { storage } from '../../storage';
import { log } from '../../vite';
import fetch from 'node-fetch';
// Tipos de conectores soportados
export var ConnectorType;
(function (ConnectorType) {
    ConnectorType["API"] = "api";
    ConnectorType["SYSLOG"] = "syslog";
    ConnectorType["AGENT"] = "agent";
    ConnectorType["FILE"] = "file";
    ConnectorType["DATABASE"] = "database";
    ConnectorType["CLOUD"] = "cloud";
    ConnectorType["WEBHOOK"] = "webhook";
    ConnectorType["CUSTOM"] = "custom";
})(ConnectorType || (ConnectorType = {}));
/**
 * Clase abstracta base para todos los conectores
 */
export class BaseConnector {
    connector;
    config;
    state;
    constructor(connector) {
        this.connector = connector;
        this.config = (connector.configuration || {});
        this.state = {
            lastRun: null,
            lastSuccess: null,
            lastError: null,
            errorMessage: null,
            consecutiveErrors: 0,
            dataProcessed: 0,
            bytesProcessed: 0,
            executionTime: 0
        };
    }
    /**
     * Getter for the underlying Connector object
     */
    getConnector() {
        return this.connector;
    }
    /**
     * Actualiza el estado del conector en la base de datos
     */
    async updateConnectorStatus(isSuccess, message) {
        const now = new Date();
        const status = isSuccess ? 'active' : this.state.consecutiveErrors > 3 ? 'error' : 'warning';
        // Actualizar el conector en la base de datos
        await storage.updateConnector(this.connector.id, {
            status,
            lastData: isSuccess ? now.toISOString() : this.connector.lastData,
            lastSuccessfulConnection: isSuccess ? now : this.connector.lastSuccessfulConnection,
            configuration: {
                ...this.connector.configuration,
                executionState: {
                    lastRun: now,
                    lastSuccess: isSuccess ? now : this.state.lastSuccess,
                    lastError: !isSuccess ? now : this.state.lastError,
                    errorMessage: !isSuccess ? message || this.state.errorMessage : null,
                    consecutiveErrors: isSuccess ? 0 : this.state.consecutiveErrors + 1,
                    dataProcessed: this.state.dataProcessed,
                    bytesProcessed: this.state.bytesProcessed,
                    executionTime: this.state.executionTime
                }
            }
        });
    }
    /**
     * Realiza una llamada HTTP con gestión de errores
     */
    async fetchWithRetry(url, options = {}, maxRetries = this.config.maxRetries || 3) {
        let lastError;
        let retries = 0;
        // Configurar timeout por defecto
        const timeout = this.config.timeout || 30000; // 30 segundos por defecto
        options.timeout = options.timeout || timeout;
        // Añadir headers predeterminados si no están presentes
        options.headers = options.headers || {};
        options.headers['User-Agent'] = options.headers['User-Agent'] || 'SOC-Intelligence-Platform/1.0';
        // Añadir API key si está configurada
        if (this.config.apiKey) {
            options.headers['Authorization'] = options.headers['Authorization'] ||
                `Bearer ${this.config.apiKey}`;
        }
        // Basic auth si está configurado
        if (this.config.username && this.config.password) {
            const basicAuthHeader = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
            options.headers['Authorization'] = options.headers['Authorization'] ||
                `Basic ${basicAuthHeader}`;
        }
        while (retries < maxRetries) {
            try {
                const startTime = Date.now();
                const response = await fetch(url, options);
                const endTime = Date.now();
                this.state.executionTime = endTime - startTime;
                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                // Registrar bytes procesados
                const contentLength = response.headers.get('content-length');
                if (contentLength) {
                    this.state.bytesProcessed += parseInt(contentLength, 10);
                }
                else {
                    // Aproximación si no hay content-length
                    this.state.bytesProcessed += JSON.stringify(data).length;
                }
                return data;
            }
            catch (error) {
                lastError = error;
                retries++;
                if (retries < maxRetries) {
                    // Espera exponencial antes de reintentar (1s, 2s, 4s, etc.)
                    const delay = Math.pow(2, retries - 1) * 1000;
                    log(`Retry ${retries}/${maxRetries} for ${url} after ${delay}ms delay`, 'connector');
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        // Si llegamos aquí, todos los intentos fallaron
        this.state.consecutiveErrors++;
        throw lastError;
    }
    /**
     * Método para manejar paginación en API
     */
    async fetchAllPages(baseUrl, options = {}, maxPages = 10, extractItems, getNextPageToken) {
        if (!this.config.paginate) {
            const data = await this.fetchWithRetry(baseUrl, options);
            return extractItems(data);
        }
        let items = [];
        let pageToken = null;
        let page = 1;
        while (page <= maxPages) {
            // Construir URL con token de paginación si existe
            let url = baseUrl;
            if (pageToken && this.config.paginationParamName) {
                const separator = url.includes('?') ? '&' : '?';
                url = `${url}${separator}${this.config.paginationParamName}=${pageToken}`;
            }
            const data = await this.fetchWithRetry(url, options);
            // Extraer items
            const pageItems = extractItems(data);
            if (pageItems && pageItems.length > 0) {
                items = items.concat(pageItems);
            }
            // Obtener token para siguiente página
            pageToken = getNextPageToken(data);
            // Terminar si no hay más páginas
            if (!pageToken) {
                break;
            }
            page++;
        }
        return items;
    }
}
