/**
 * Gestor de conectores - maneja el ciclo de vida de todos los conectores
 */
import { EventEmitter } from 'events';
import { SyslogConnector } from './syslog-connector';
import { ApiPollingConnector } from './api-connector';
import { WebhookConnector } from './webhook-connector';
import { FileConnector } from './file-connector';
import { log } from '../../vite';
import { db, pool } from '../../db';
import { connectors, connectorLogs, eventsRaw } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getIo } from '../../socket';
import { credentialsManager } from './credentials-manager';
export class ConnectorManager extends EventEmitter {
    static instance;
    connectors = new Map();
    metricsInterval;
    healthCheckInterval;
    constructor() {
        super();
        this.setupMetricsCollection();
        this.setupHealthChecks();
        this.setupDatabaseNotifications();
    }
    static getInstance() {
        if (!ConnectorManager.instance) {
            ConnectorManager.instance = new ConnectorManager();
        }
        return ConnectorManager.instance;
    }
    /**
     * Inicializa el gestor y carga conectores activos
     */
    async initialize() {
        try {
            log('Inicializando ConnectorManager...', 'connector-manager');
            const activeConnectors = await this.loadActiveConnectors();
            for (const connectorData of activeConnectors) {
                try {
                    await this.createAndStartConnector(connectorData);
                }
                catch (error) {
                    log(`Error iniciando conector ${connectorData.id}: ${error}`, 'connector-manager');
                    await this.updateConnectorStatus(connectorData.id.toString(), 'error', `${error}`);
                }
            }
            log(`ConnectorManager iniciado con ${this.connectors.size} conectores`, 'connector-manager');
        }
        catch (error) {
            log(`Error inicializando ConnectorManager: ${error}`, 'connector-manager');
            throw error;
        }
    }
    /**
     * Detiene todos los conectores
     */
    async shutdown() {
        log('Deteniendo ConnectorManager...', 'connector-manager');
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        const stopPromises = Array.from(this.connectors.values()).map(connector => connector.stop().catch(err => log(`Error deteniendo conector ${connector.id}: ${err}`, 'connector-manager')));
        await Promise.all(stopPromises);
        this.connectors.clear();
        log('ConnectorManager detenido', 'connector-manager');
    }
    /**
     * Crea un nuevo conector
     */
    async createConnector(config) {
        try {
            const insertData = {
                name: config.name,
                type: config.type,
                vendor: 'Generic',
                status: 'active',
                isActive: true,
                configuration: config,
                organizationId: parseInt(config.orgId) || undefined
            };
            const result = await db.insert(connectors).values(insertData).returning();
            const connectorId = result[0].id.toString();
            // Notify listeners about new connector
            await pool.query('NOTIFY connectors_changed, $1', [connectorId]);
            // Crear e iniciar el conector
            const connectorData = await this.loadConnector(result[0].id);
            if (connectorData) {
                await this.createAndStartConnector(connectorData);
            }
            log(`Conector ${connectorId} creado y iniciado`, 'connector-manager');
            return connectorId;
        }
        catch (error) {
            log(`Error creando conector: ${error}`, 'connector-manager');
            throw error;
        }
    }
    /**
     * Actualiza un conector existente
     */
    async updateConnector(id, updates) {
        try {
            const connectorId = parseInt(id);
            // Detener conector actual si existe
            const existingConnector = this.connectors.get(id);
            if (existingConnector) {
                await existingConnector.stop();
                this.connectors.delete(id);
            }
            // Actualizar en base de datos (sin updatedAt manual)
            const updateData = {
                configuration: updates
            };
            await db.update(connectors)
                .set(updateData)
                .where(eq(connectors.id, connectorId));
            // Notify listeners about connector update
            await pool.query('NOTIFY connectors_changed, $1', [id]);
            // Recargar y reiniciar conector
            const connectorData = await this.loadConnector(connectorId);
            if (connectorData && connectorData.isActive) {
                await this.createAndStartConnector(connectorData);
            }
            log(`Conector ${id} actualizado`, 'connector-manager');
        }
        catch (error) {
            log(`Error actualizando conector ${id}: ${error}`, 'connector-manager');
            throw error;
        }
    }
    /**
     * Elimina un conector
     */
    async deleteConnector(id) {
        try {
            const connectorId = parseInt(id);
            // Detener conector
            const connector = this.connectors.get(id);
            if (connector) {
                await connector.stop();
                this.connectors.delete(id);
            }
            // Eliminar de base de datos
            await db.delete(connectors).where(eq(connectors.id, connectorId));
            // Notify listeners about connector deletion
            await pool.query('NOTIFY connectors_changed, $1', [id]);
            log(`Conector ${id} eliminado`, 'connector-manager');
        }
        catch (error) {
            log(`Error eliminando conector ${id}: ${error}`, 'connector-manager');
            throw error;
        }
    }
    /**
     * Obtiene un conector por ID
     */
    getConnector(id) {
        return this.connectors.get(id);
    }
    /**
     * Obtiene todos los conectores activos
     */
    getAllConnectors() {
        return Array.from(this.connectors.values());
    }
    /**
     * Factory para crear instancias de conectores
     */
    createConnectorInstance(config) {
        switch (config.type) {
            case 'syslog':
                return new SyslogConnector(config);
            case 'api':
                return new ApiPollingConnector(config);
            case 'webhook':
                return new WebhookConnector(config);
            case 'file':
                return new FileConnector(config);
            default:
                throw new Error(`Tipo de conector no soportado: ${config.type}`);
        }
    }
    /**
     * Carga conectores activos desde la base de datos
     */
    async loadActiveConnectors() {
        const result = await db.select().from(connectors)
            .where(eq(connectors.isActive, true));
        return result.map(connector => ({
            id: connector.id,
            organizationId: connector.organizationId || undefined,
            name: connector.name,
            type: connector.type,
            vendor: connector.vendor,
            configuration: connector.configuration || {},
            status: connector.status,
            lastData: connector.lastData || undefined,
            lastSuccessfulConnection: connector.lastSuccessfulConnection || undefined,
            dataVolume: connector.dataVolume || undefined,
            isActive: connector.isActive,
            icon: connector.icon || undefined,
            createdAt: connector.createdAt || new Date(),
            updatedAt: connector.updatedAt || new Date()
        }));
    }
    /**
     * Carga un conector específico desde la base de datos
     */
    async loadConnector(id) {
        const result = await db.select().from(connectors)
            .where(eq(connectors.id, id));
        if (result.length === 0)
            return null;
        const connector = result[0];
        return {
            id: connector.id,
            organizationId: connector.organizationId || undefined,
            name: connector.name,
            type: connector.type,
            vendor: connector.vendor,
            configuration: connector.configuration || {},
            status: connector.status,
            lastData: connector.lastData || undefined,
            lastSuccessfulConnection: connector.lastSuccessfulConnection || undefined,
            dataVolume: connector.dataVolume || undefined,
            isActive: connector.isActive,
            icon: connector.icon || undefined,
            createdAt: connector.createdAt || new Date(),
            updatedAt: connector.updatedAt || new Date()
        };
    }
    /**
     * Crea e inicia un conector desde los datos de la BD
     */
    async createAndStartConnector(data) {
        try {
            // Crear configuración completa
            // Decrypt credentials if present
            const decryptedCreds = data.configuration.encryptedCredentials
                ? credentialsManager.decryptCredentials(data.configuration.encryptedCredentials)
                : undefined;
            const config = {
                id: data.id.toString(),
                orgId: data.organizationId?.toString() || '0',
                name: data.name,
                type: data.type,
                ...(decryptedCreds && { credentials: decryptedCreds }),
                ...data.configuration
            };
            // Crear instancia del conector según tipo
            const connector = this.createConnectorInstance(config);
            // Configurar listeners
            this.setupConnectorListeners(connector);
            // Iniciar conector
            await connector.start();
            // Agregar a la colección
            this.connectors.set(data.id.toString(), connector);
        }
        catch (error) {
            await this.updateConnectorStatus(data.id.toString(), 'error', `${error}`);
            throw error;
        }
    }
    /**
     * Configura listeners para eventos del conector
     */
    setupConnectorListeners(connector) {
        connector.on('event', async (event) => {
            this.emit('event', event);
            // Broadcast raw event over WebSocket
            try {
                getIo().emit('connector-event', event);
            }
            catch { }
            // Persist event log
            try {
                await db.insert(connectorLogs)
                    .values({ connectorId: parseInt(connector.id), level: 'info', message: JSON.stringify(event) });
            }
            catch { }
            // Insert into raw events for normalization pipeline and kick off normalization
            try {
                await db.insert(eventsRaw).values({
                    id: event.id,
                    agentId: connector.id,
                    severity: event.severity,
                    category: event.source,
                    engine: connector.type,
                    timestamp: event.timestamp,
                    data: event.rawData
                });
                // Immediately normalize and store
                normalizeAndStoreEvent(event);
            }
            catch { }
        });
        connector.on('error', async (error) => {
            log(`Error en conector ${connector.id}: ${error}`, 'connector-manager');
            this.updateConnectorStatus(connector.id, 'error', error.message);
            // Broadcast error status
            try {
                getIo().emit('connector-status', { id: connector.id, status: 'error' });
            }
            catch { }
            // Persist error log
            try {
                await db.insert(connectorLogs)
                    .values({ connectorId: parseInt(connector.id), level: 'error', message: error.message });
            }
            catch { }
        });
        connector.on('status-change', async (status) => {
            this.updateConnectorStatus(connector.id, status);
            // Broadcast status change
            try {
                getIo().emit('connector-status', { id: connector.id, status });
            }
            catch { }
            // Persist status-change log
            try {
                await db.insert(connectorLogs)
                    .values({ connectorId: parseInt(connector.id), level: 'info', message: `Status changed to ${status}` });
            }
            catch { }
        });
        connector.on('metrics-update', async (metrics) => {
            // Broadcast metrics update
            try {
                getIo().emit('connector-metrics', { id: connector.id, metrics });
            }
            catch { }
            // Persist metrics in DB
            try {
                await db.update(connectors)
                    .set({ lastEventAt: metrics.lastEventAt, eventsPerMin: metrics.eventsPerMinute, errorMessage: null })
                    .where(eq(connectors.id, parseInt(connector.id)));
            }
            catch (err) {
                log(`Error actualizando métricas del conector ${connector.id}: ${err}`, 'connector-manager');
            }
        });
    }
    /**
     * Actualiza el estado de un conector en la BD
     */
    async updateConnectorStatus(id, status, message) {
        try {
            const connectorId = parseInt(id);
            // Update status and optional error message
            await db.update(connectors)
                .set({ status, ...(message ? { errorMessage: message } : {}) })
                .where(eq(connectors.id, connectorId));
        }
        catch (error) {
            log(`Error actualizando estado del conector ${id}: ${error}`, 'connector-manager');
        }
    }
    /**
     * Configura la colección de métricas
     */
    setupMetricsCollection() {
        this.metricsInterval = setInterval(async () => {
            for (const [id, connector] of this.connectors.entries()) {
                try {
                    const metrics = connector.getMetrics();
                    await db.update(connectors)
                        .set({
                        lastData: metrics.lastEventAt?.toISOString()
                    })
                        .where(eq(connectors.id, parseInt(id)));
                }
                catch (error) {
                    log(`Error actualizando métricas del conector ${id}: ${error}`, 'connector-manager');
                }
            }
        }, 60000); // Cada minuto
    }
    /**
     * Configura health checks periódicos
     */
    setupHealthChecks() {
        this.healthCheckInterval = setInterval(async () => {
            for (const [id, connector] of this.connectors.entries()) {
                try {
                    const health = await connector.healthCheck();
                    if (!health.healthy) {
                        await this.updateConnectorStatus(id, 'error', health.message);
                    }
                }
                catch (error) {
                    log(`Error en health check del conector ${id}: ${error}`, 'connector-manager');
                    await this.updateConnectorStatus(id, 'error', `Health check failed: ${error}`);
                }
            }
        }, 60000); // Cada minuto
    }
    /**
     * Configura notificaciones de cambios en la BD
     */
    setupDatabaseNotifications() {
        // Listen to PostgreSQL NOTIFY events for connector changes
        pool.connect().then(client => {
            client.on('notification', async (msg) => {
                if (msg.channel === 'connectors_changed' && msg.payload) {
                    await this.handleDbNotification(msg.payload);
                }
            });
            client.query('LISTEN connectors_changed').catch(err => log(`Failed to LISTEN on connectors_changed: ${err}`, 'connector-manager'));
        }).catch(err => log(`Failed to setup DB notifications: ${err}`, 'connector-manager'));
    }
    /**
     * Handle a database notification payload indicating connector id
     */
    async handleDbNotification(id) {
        try {
            const record = await this.loadConnector(parseInt(id, 10));
            if (!record || !record.isActive) {
                // Connector removed or deactivated
                if (this.connectors.has(id)) {
                    await this.deleteConnector(id);
                }
                return;
            }
            // Connector exists, update or create accordingly
            if (this.connectors.has(id)) {
                await this.updateConnector(id, record.configuration);
            }
            else {
                await this.createAndStartConnector(record);
            }
        }
        catch (error) {
            log(`Error handling DB notification for connector ${id}: ${error}`, 'connector-manager');
        }
    }
    /**
     * Ejecuta una prueba de conexión del conector
     */
    async testConnector(id) {
        const connector = this.getConnector(id);
        if (!connector) {
            throw new Error(`Conector ${id} no encontrado`);
        }
        try {
            const result = await connector.testConnection();
            return result;
        }
        catch (error) {
            return { success: false, message: error.message || String(error) };
        }
    }
    /**
     * Pausa un conector activo
     */
    async pauseConnector(id) {
        const connector = this.connectors.get(id);
        if (!connector) {
            throw new Error(`Conector ${id} no encontrado`);
        }
        await connector.stop();
        this.connectors.delete(id);
        await this.updateConnectorStatus(id, 'paused');
    }
    /**
     * Reanuda un conector pausado
     */
    async resumeConnector(id) {
        // Recarga datos del conector
        const record = await this.loadConnector(parseInt(id));
        if (!record || !record.isActive) {
            throw new Error(`Conector ${id} no existe o no está activo en BD`);
        }
        await this.createAndStartConnector(record);
    }
    /**
     * Activa o pausa un conector según el estado
     */
    async toggleConnector(id, status) {
        if (status === 'paused') {
            await this.pauseConnector(id);
        }
        else if (status === 'active') {
            await this.resumeConnector(id);
        }
        else {
            throw new Error(`Estado no soportado para toggleConnector: ${status}`);
        }
    }
} // end class ConnectorManager
// Export singleton instance of ConnectorManager
export const connectorManager = ConnectorManager.getInstance();
