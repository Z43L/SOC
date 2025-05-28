import { storage } from '../storage';
import { log } from '../vite';
import { ConnectorType } from './connectors/base';
import * as dgram from 'dgram';
import * as net from 'net';
import * as tls from 'tls';
import { Buffer } from 'buffer';
// Tipos de conectores soportados
var ConnectorProtocol;
(function (ConnectorProtocol) {
    ConnectorProtocol["API"] = "api";
    ConnectorProtocol["SYSLOG"] = "syslog";
    ConnectorProtocol["AGENT"] = "agent";
})(ConnectorProtocol || (ConnectorProtocol = {}));
// Clase base para todos los conectores
export class BaseConnector {
    async handleAPIError(error) {
        if (error.response) {
            const status = error.response.status;
            if (status === 401 || status === 403) {
                await this.updateStatus('error');
                this.log('Error de autenticación: Verifique las credenciales');
                throw new Error('AuthenticationError');
            }
            else if (status >= 500) {
                await this.updateStatus('warning');
                this.log('Error del servidor remoto, reintentando...');
                throw new Error('ServerError');
            }
        }
        else {
            await this.updateStatus('error');
            this.log('Error de conexión: ' + error.message);
            throw error;
        }
    }
    async secureFetch(url, options) {
        try {
            const response = await fetch(url, {
                ...options,
                timeout: 30000 // 30 segundos de timeout
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            await this.handleAPIError(error);
            throw error;
        }
    }
    async handlePagination(data, config) {
        let allData = data.items ? [...data.items] : [];
        let nextPageToken = data.nextPageToken;
        let hasMore = data.hasMore;
        while (hasMore) {
            const nextPageResponse = await this.secureFetch(config.url, {
                ...config.options,
                body: JSON.stringify({ ...config.body, pageToken: nextPageToken })
            });
            allData = allData.concat(nextPageResponse.items || []);
            nextPageToken = nextPageResponse.nextPageToken;
            hasMore = nextPageResponse.hasMore;
        }
        return allData;
    }
    config;
    status;
    constructor(config) {
        this.config = config;
        this.status = 'inactive';
    }
    async updateStatus(status) {
        this.status = status;
        await storage.updateConnectorStatus(this.config.name, status);
    }
    log(message) {
        log(`[Connector ${this.config.name}] ${message}`, 'connectors');
    }
}
// Implementación de conector API
export class APIConnector extends BaseConnector {
    pollInterval = null;
    async start() {
        try {
            const config = this.config;
            await this.updateStatus('active');
            this.log('Conector API iniciado correctamente');
            // Configurar polling
            if (config.configuration.pollingInterval > 0) {
                this.pollInterval = setInterval(() => this.executePolling(), config.configuration.pollingInterval * 1000);
            }
            // Ejecutar primera recolección de datos
            await this.executePolling();
        }
        catch (error) {
            await this.updateStatus('error');
            throw error;
        }
    }
    async executePolling() {
        const config = this.config;
        try {
            const authHeader = this.getAuthHeader(config);
            const response = await this.secureFetch(config.configuration.url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeader
                }
            });
            if (config.configuration.pagination) {
                const allData = await this.handlePagination(response, {
                    url: config.configuration.url,
                    options: {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            ...authHeader
                        }
                    },
                    body: {}
                });
                await this.processData(allData);
            }
            else {
                await this.processData(response);
            }
            await this.updateStatus('active');
        }
        catch (error) {
            await this.handleAPIError(error);
        }
    }
    getAuthHeader(config) {
        switch (config.configuration.authType) {
            case 'apiKey':
                return { 'Authorization': `Bearer ${config.configuration.credentials.apiKey}` };
            case 'basic':
                const basicAuth = Buffer.from(`${config.configuration.credentials.username}:${config.configuration.credentials.password}`).toString('base64');
                return { 'Authorization': `Basic ${basicAuth}` };
            case 'oauth':
                return { 'Authorization': `Bearer ${this.getOAuthToken()}` };
            default:
                return {};
        }
    }
    async stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        await this.updateStatus('inactive');
        this.log('Conector API detenido');
    }
    getStatus() {
        return this.status;
    }
    getOAuthToken() {
        // Implementar obtención de token OAuth si es necesario
        return '';
    }
    async processData(data) {
        // Implementar procesamiento de datos obtenidos del API
        this.log('Datos procesados correctamente');
    }
}
// Implementación de conector Syslog
export class SyslogConnector extends BaseConnector {
    server = null;
    async start() {
        try {
            const config = this.config;
            await this.updateStatus('active');
            this.log('Conector Syslog iniciado correctamente');
            // Crear servidor según protocolo
            if (config.configuration.protocol === 'udp') {
                this.server = dgram.createSocket('udp4');
                this.server.on('message', (msg) => this.processSyslogMessage(msg));
            }
            else {
                this.server = net.createServer((socket) => {
                    socket.on('data', (data) => this.processSyslogMessage(data));
                });
            }
            // Configurar TLS si está habilitado
            if (config.configuration.tls?.enabled) {
                const tlsOptions = {
                    key: config.configuration.tls.key,
                    cert: config.configuration.tls.cert
                };
                this.server = tls.createServer(tlsOptions, (socket) => {
                    socket.on('data', (data) => this.processSyslogMessage(data));
                });
            }
            // Iniciar servidor
            this.server.listen(config.configuration.port, () => {
                this.log(`Servidor Syslog escuchando en puerto ${config.configuration.port}`);
            });
        }
        catch (error) {
            await this.updateStatus('error');
            throw error;
        }
    }
    processSyslogMessage(message) {
        try {
            const parsedMessage = this.parseSyslog(message.toString());
            const normalizedData = this.normalizeSyslogData(parsedMessage);
            if (normalizedData) {
                storage.createAlert(normalizedData);
                this.log(`Mensaje Syslog procesado: ${normalizedData.title}`);
            }
        }
        catch (error) {
            this.log(`Error procesando mensaje Syslog: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }
    parseSyslog(message) {
        // Implementar lógica de parseo de mensajes Syslog
        // Ejemplo simple:
        return { raw: message };
    }
    normalizeSyslogData(message) {
        // Parseo avanzado de mensaje Syslog RFC5424
        const syslogRegex = /<(?<pri>\d+)>(?<version>\d+) (?<timestamp>\S+) (?<host>\S+) (?<app>\S+) (?<pid>\S+) (?<msgid>\S+) (?<msg>\[.*\] \S+)/;
        const match = message.raw.match(syslogRegex);
        if (!match)
            return null;
        const severityMap = {
            '0': 'emergency',
            '1': 'alert',
            '2': 'critical',
            '3': 'error',
            '4': 'warning',
            '5': 'notice',
            '6': 'info',
            '7': 'debug'
        };
        const pri = parseInt(match.groups?.pri || '6');
        const severityCode = pri & 0x7;
        const facility = (pri >> 3) & 0x1f;
        return {
            title: `Alert ${match.groups?.app || 'syslog'} [${match.groups?.host}]`,
            description: match.groups?.msg || message.raw,
            timestamp: match.groups?.timestamp || new Date().toISOString(),
            severity: severityMap[severityCode.toString()] || 'info',
            source: 'syslog',
            metadata: {
                facility: facility,
                host: match.groups?.host,
                application: match.groups?.app,
                processId: match.groups?.pid,
                messageId: match.groups?.msgid
            }
        };
    }
    async stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        await this.updateStatus('inactive');
        this.log('Conector Syslog detenido');
    }
    getStatus() {
        return this.status;
    }
}
// Implementación de conector de Agente
export class AgentConnector extends BaseConnector {
    agents = new Map();
    async start() {
        try {
            const config = this.config;
            await this.updateStatus('active');
            this.log('Conector de Agente iniciado correctamente');
            // Configurar endpoint para registro de agentes
            global.expressApp.post('/agents/register', (req, res) => {
                this.handleAgentRegistration(req, res);
            });
            // Configurar endpoint para recepción de datos
            global.expressApp.post('/agents/data', (req, res) => {
                this.handleAgentData(req, res);
            });
            // Configurar endpoint para heartbeats
            global.expressApp.post('/agents/heartbeat', (req, res) => {
                this.handleAgentHeartbeat(req, res);
            });
        }
        catch (error) {
            await this.updateStatus('error');
            throw error;
        }
    }
    async stop() {
        await this.updateStatus('inactive');
        this.log('Conector de Agente detenido');
    }
    getStatus() {
        return this.status;
    }
}
// Inicialización de conectores
export async function initializeConnectors(app) {
    const connectors = await storage.listConnectors();
    for (const connector of connectors) {
        if (connector.isActive) {
            switch (connector.type) {
                case ConnectorType.API:
                    new APIConnector(connector).start();
                    break;
                case ConnectorType.SYSLOG:
                    new SyslogConnector(connector).start();
                    break;
                case ConnectorType.AGENT:
                    new AgentConnector(connector).start();
                    break;
                default:
                    log(`Tipo de conector no soportado: ${connector.type}`, 'connectors');
            }
        }
    }
}
// Add these missing exported functions that other files are trying to import
/**
 * Execute a specific connector by ID
 * @param connectorId The ID of the connector to execute
 * @returns Result of the execution
 */
export async function executeConnector(connectorId) {
    try {
        const connector = await storage.getConnector(connectorId);
        if (!connector) {
            return { success: false, message: 'Connector not found' };
        }
        // Execute the connector based on its type
        switch (connector.type) {
            case ConnectorType.API:
                const apiConnector = new APIConnector(connector);
                await apiConnector.start();
                return { success: true, message: 'API connector executed successfully' };
            case ConnectorType.SYSLOG:
                const syslogConnector = new SyslogConnector(connector);
                await syslogConnector.start();
                return { success: true, message: 'Syslog connector executed successfully' };
            case ConnectorType.AGENT:
                const agentConnector = new AgentConnector(connector);
                await agentConnector.start();
                return { success: true, message: 'Agent connector executed successfully' };
            default:
                return { success: false, message: `Unsupported connector type: ${connector.type}` };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error executing connector ${connectorId}: ${errorMessage}`, 'connectors');
        return { success: false, message: `Error: ${errorMessage}` };
    }
}
/**
 * Toggle a connector's active state
 * @param connectorId The ID of the connector to toggle
 * @param isActive The new active state
 * @returns Result of the operation
 */
export async function toggleConnector(connectorId, isActive) {
    try {
        const connector = await storage.getConnector(connectorId);
        if (!connector) {
            return { success: false, message: 'Connector not found' };
        }
        // Update the connector's active state
        await storage.updateConnector(connectorId, {
            isActive: isActive
        });
        // If activating, start the connector; if deactivating, stop it
        if (isActive) {
            // Execute the connector based on its type
            switch (connector.type) {
                case ConnectorType.API:
                    const apiConnector = new APIConnector(connector);
                    await apiConnector.start();
                    break;
                case ConnectorType.SYSLOG:
                    const syslogConnector = new SyslogConnector(connector);
                    await syslogConnector.start();
                    break;
                case ConnectorType.AGENT:
                    const agentConnector = new AgentConnector(connector);
                    await agentConnector.start();
                    break;
                default:
                    return { success: false, message: `Unsupported connector type: ${connector.type}` };
            }
            return { success: true, message: `Connector ${connectorId} activated successfully` };
        }
        else {
            // Find active connectors and stop them
            // This is a simplified approach - in a real implementation you'd need to track active connector instances
            switch (connector.type) {
                case ConnectorType.API:
                    const apiConnector = new APIConnector(connector);
                    await apiConnector.stop();
                    break;
                case ConnectorType.SYSLOG:
                    const syslogConnector = new SyslogConnector(connector);
                    await syslogConnector.stop();
                    break;
                case ConnectorType.AGENT:
                    const agentConnector = new AgentConnector(connector);
                    await agentConnector.stop();
                    break;
            }
            return { success: true, message: `Connector ${connectorId} deactivated successfully` };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error toggling connector ${connectorId}: ${errorMessage}`, 'connectors');
        return { success: false, message: `Error: ${errorMessage}` };
    }
}
/**
 * Get all active connectors
 * @returns List of active connectors
 */
export async function getActiveConnectors() {
    try {
        const connectors = await storage.listConnectors();
        return connectors.filter(connector => connector.isActive);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error getting active connectors: ${errorMessage}`, 'connectors');
        return [];
    }
}
