/**
 * Implementación de conectores de tipo Agente
 * Gestiona la comunicación con agentes instalados en sistemas objetivo
 */
// DataSource import removed - not available in schema
import { BaseConnector } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import express from 'express';
import crypto from 'crypto';
import { aiParser } from '../ai-parser-service';
import { generateAlertInsight } from '../../advanced-ai-service';
import { createIncidentIfNeededAndLinkAlert } from '../../utils/incident-linker'; // Utilidad para incidentes automáticos
import { notifyCriticalEvent } from '../../utils/notifier'; // Utilidad para notificaciones
import { CredentialsManager } from './credentials-manager'; // Added import
/**
 * Conector para gestionar agentes remotos
 */
export class AgentConnector extends BaseConnector {
    config;
    pendingEvents = [];
    processingInterval = null;
    agentEndpoints;
    credentialsManager; // Added instance
    agentCheckInterval = null; // For checking inactive agents
    constructor(connector) {
        super(connector);
        this.config = this.connector.configuration;
        this.credentialsManager = CredentialsManager.getInstance(); // Initialize CredentialsManager
        // Ensure agents object is initialized
        if (!this.config.agents) {
            this.config.agents = {};
        }
        // Crear endpoints para la comunicación con agentes
        this.agentEndpoints = express.Router();
        this.setupEndpoints();
    }
    /**
     * Validar la configuración del conector
     */
    validateConfig() {
        // Verificar campos obligatorios
        if (!this.config.masterRegistrationToken) {
            log(`Conector ${this.connector.name} no tiene masterRegistrationToken configurado. Generando uno.`, 'connector');
            this.config.masterRegistrationToken = crypto.randomBytes(32).toString('hex');
            log(`Se ha generado automáticamente un masterRegistrationToken: ${this.config.masterRegistrationToken}`, 'connector');
            // Persist this generated token
            this.updateConfig(this.config).catch(err => log(`Error saving generated master token: ${err}`, 'connector'));
        }
        // Configurar valores por defecto
        if (!this.config.heartbeatInterval || this.config.heartbeatInterval < 60) {
            this.config.heartbeatInterval = 300; // 5 minutos por defecto
        }
        if (!this.config.agentTimeout || this.config.agentTimeout < this.config.heartbeatInterval) {
            this.config.agentTimeout = this.config.heartbeatInterval * 2; // Doble del intervalo de heartbeat
        }
        // Inicializar registro de agentes si no existe (redundant due to constructor check, but safe)
        if (!this.config.agents) {
            this.config.agents = {};
        }
        // Configurar endpoints si no están definidos
        if (!this.config.dataEndpoint) {
            this.config.dataEndpoint = '/api/agents/data';
        }
        if (!this.config.registrationEndpoint) {
            this.config.registrationEndpoint = '/api/agents/register';
        }
        return true;
    }
    /**
     * Configurar endpoints para la comunicación con agentes
     */
    setupEndpoints() {
        // Endpoint de registro de agentes
        this.agentEndpoints.post(this.config.registrationEndpoint || '/api/agents/register', express.json(), async (req, res) => {
            try {
                const registration = req.body;
                const providedMasterToken = req.headers['x-registration-token'];
                if (!registration.hostname || !registration.os || !registration.version) {
                    return res.status(400).json({ success: false, message: 'Datos de registro incompletos' });
                }
                if (!providedMasterToken || providedMasterToken !== this.config.masterRegistrationToken) {
                    log(`Intento de registro fallido para ${this.connector.name}. Token maestro inválido.`, 'connector');
                    return res.status(401).json({ success: false, message: 'Token de registro maestro inválido' });
                }
                const agentId = crypto.randomUUID();
                const organizationId = this.connector.organizationId || 1; // Placeholder
                const agentAuthToken = this.credentialsManager.generateAgentToken(agentId, organizationId);
                if (!this.config.agents) { // Ensure agents is initialized
                    this.config.agents = {};
                }
                this.config.agents[agentId] = {
                    hostname: registration.hostname,
                    ip: registration.ip || req.ip || 'unknown',
                    os: registration.os,
                    version: registration.version,
                    capabilities: registration.capabilities || [],
                    status: 'active',
                    lastHeartbeat: new Date().toISOString(),
                    config: {},
                    authToken: agentAuthToken
                };
                await this.updateConfig(this.config);
                res.status(200).json({
                    success: true,
                    agentId,
                    authToken: agentAuthToken,
                    message: 'Agente registrado exitosamente.'
                });
            }
            catch (error) {
                log(`Error en el registro de agente para ${this.connector.name}: ${error.message}`, 'connector');
                res.status(500).json({ success: false, message: 'Error interno del servidor durante el registro' });
            }
        });
        // Endpoint de recepción de datos de agentes
        this.agentEndpoints.post(this.config.dataEndpoint || '/api/agents/data', express.json(), async (req, res) => {
            try {
                const event = req.body;
                const authHeader = req.headers.authorization;
                const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
                if (!authToken) {
                    return res.status(401).json({ success: false, message: 'Token de autenticación no proporcionado' });
                }
                const { valid, agentId: validatedAgentId } = this.credentialsManager.validateAgentToken(authToken);
                if (!valid || !validatedAgentId || validatedAgentId !== event.agentId) {
                    log(`Token inválido o no coincide para el agente ${event.agentId} en ${this.connector.name}.`, 'connector');
                    return res.status(401).json({ success: false, message: 'Token de autenticación inválido o no coincide con el agente' });
                }
                const agent = this.config.agents?.[validatedAgentId];
                if (!agent || agent.authToken !== authToken) {
                    log(`Agente ${validatedAgentId} no encontrado o token no coincide en la configuración para ${this.connector.name}.`, 'connector');
                    return res.status(401).json({ success: false, message: 'Agente no encontrado o token desactualizado.' });
                }
                // Verificar firma si está habilitado (revisitar esta lógica para message signing)
                // if (this.config.signatureVerification && event.signature) {
                //   const agent = this.config.agents?.[event.agentId];
                //   if (!agent) {
                //     return res.status(404).json({ success: false, message: 'Agente no encontrado' });
                //   }
                //   const isValid = this.verifySignature(
                //     JSON.stringify({ ...event, signature: undefined }),
                //     event.signature,
                //     agent.publicKey || this.config.publicKey // Assuming agent might have its own key
                //   );
                //   if (!isValid) {
                //     return res.status(401).json({ success: false, message: 'Firma de evento inválida' });
                //   }
                // }
                // Procesar el evento (ejemplo básico)
                log(`Evento recibido del agente ${event.agentId} (${this.connector.name}): ${event.message}`, 'connector');
                this.pendingEvents.push(event);
                // Actualizar último heartbeat si el evento es de tipo heartbeat (o si se considera cualquier comunicación como heartbeat)
                if (this.config.agents && this.config.agents[event.agentId]) {
                    this.config.agents[event.agentId].lastHeartbeat = new Date().toISOString();
                    this.config.agents[event.agentId].status = 'active';
                    await this.updateConfig(this.config); // Persist heartbeat update
                }
                res.status(200).json({ success: true, message: 'Evento recibido' });
            }
            catch (error) {
                log(`Error procesando evento de agente para ${this.connector.name}: ${error.message}`, 'connector');
                res.status(500).json({ success: false, message: 'Error interno del servidor' });
            }
        });
        // Endpoint de heartbeat de agentes
        this.agentEndpoints.post('/api/agents/heartbeat', express.json(), async (req, res) => {
            try {
                const heartbeat = req.body;
                const authHeader = req.headers.authorization;
                const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
                if (!authToken) {
                    return res.status(401).json({ success: false, message: 'Token de autenticación no proporcionado' });
                }
                const { valid, agentId: validatedAgentId } = this.credentialsManager.validateAgentToken(authToken);
                if (!valid || !validatedAgentId || validatedAgentId !== heartbeat.agentId) {
                    log(`Token inválido o no coincide para el heartbeat del agente ${heartbeat.agentId} en ${this.connector.name}.`, 'connector');
                    return res.status(401).json({ success: false, message: 'Token de autenticación inválido o no coincide con el agente' });
                }
                const agent = this.config.agents?.[validatedAgentId];
                if (!agent || agent.authToken !== authToken) {
                    log(`Agente ${validatedAgentId} no encontrado o token no coincide en la configuración para heartbeat en ${this.connector.name}.`, 'connector');
                    return res.status(401).json({ success: false, message: 'Agente no encontrado o token desactualizado.' });
                }
                // Verificar firma si está habilitado (revisitar)
                // if (this.config.signatureVerification && heartbeat.signature) {
                //   const agent = this.config.agents?.[heartbeat.agentId];
                //   if (!agent) {
                //     return res.status(404).json({ success: false, message: 'Agente no encontrado' });
                //   }
                //   const isValid = this.verifySignature(
                //     JSON.stringify({ ...heartbeat, signature: undefined }),
                //     heartbeat.signature,
                //     agent.publicKey || this.config.publicKey
                //   );
                //   if (!isValid) {
                //     return res.status(401).json({ success: false, message: 'Firma de heartbeat inválida' });
                //   }
                // }
                // Actualizar estado del agente
                if (this.config.agents && this.config.agents[heartbeat.agentId]) {
                    this.config.agents[heartbeat.agentId].lastHeartbeat = new Date(heartbeat.timestamp).toISOString();
                    this.config.agents[heartbeat.agentId].status = heartbeat.status;
                    // Opcional: actualizar métricas si se envían
                    // if (heartbeat.metrics) { ... }
                    await this.updateConfig(this.config); // Persist heartbeat update
                    log(`Heartbeat recibido del agente ${heartbeat.agentId} (${this.connector.name})`, 'connector');
                    res.status(200).json({ success: true, message: 'Heartbeat recibido' });
                }
                else {
                    log(`Heartbeat de agente desconocido: ${heartbeat.agentId} (${this.connector.name})`, 'connector');
                    res.status(404).json({ success: false, message: 'Agente no registrado' });
                }
            }
            catch (error) {
                log(`Error procesando heartbeat de agente para ${this.connector.name}: ${error.message}`, 'connector');
                res.status(500).json({ success: false, message: 'Error interno del servidor' });
            }
        });
    }
    /**
     * Ejecutar el conector
     */
    async execute() {
        const startTime = Date.now();
        try {
            // Validar configuración
            if (!this.validateConfig()) {
                await this.updateConnectorStatus(false, 'Configuración inválida');
                return {
                    success: false,
                    message: 'Configuración del conector inválida'
                };
            }
            log(`Ejecutando conector de Agentes ${this.connector.name}`, 'connector');
            // Comprobar agentes inactivos
            await this.checkInactiveAgents();
            // Configurar procesamiento periódico de eventos
            if (!this.processingInterval) {
                this.processingInterval = setInterval(() => {
                    this.processAgentEvents();
                }, 15000); // Procesar cada 15 segundos
            }
            // Actualizar estadísticas
            this.state.executionTime = Date.now() - startTime;
            // Actualizar estado del conector
            await this.updateConnectorStatus(true);
            // Retornar resumen
            const activeAgents = Object.values(this.config.agents || {})
                .filter(agent => agent.status === 'active').length;
            return {
                success: true,
                message: `Conector de agentes activo. ${activeAgents} agentes conectados.`,
                data: {
                    activeAgents,
                    totalAgents: Object.keys(this.config.agents || {}).length,
                    registration: {
                        endpoint: this.config.registrationEndpoint,
                        key: this.config.masterRegistrationToken ? '***' + this.config.masterRegistrationToken.substring(this.config.masterRegistrationToken.length - 4) : 'No configurada'
                    }
                },
                metrics: {
                    itemsProcessed: this.state.dataProcessed,
                    bytesProcessed: this.state.bytesProcessed,
                    executionTime: this.state.executionTime
                }
            };
        }
        catch (error) {
            log(`Error ejecutando conector de Agentes ${this.connector.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
            // Actualizar estado
            await this.updateConnectorStatus(false, error instanceof Error ? error.message : 'Error desconocido');
            return {
                success: false,
                message: `Error ejecutando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
    /**
     * Obtiene el router de Express con los endpoints de agentes
     */
    getRouter() {
        return this.agentEndpoints;
    }
    /**
     * Procesa los eventos pendientes de agentes
     */
    async processAgentEvents() {
        if (this.pendingEvents.length === 0)
            return;
        const eventsToProcess = [...this.pendingEvents];
        this.pendingEvents = [];
        log(`Procesando ${eventsToProcess.length} eventos de agentes`, 'connector');
        const alerts = [];
        for (const event of eventsToProcess) {
            try {
                // Auditoría de evento
                log(`[AUDIT] Evento recibido de agente ${event.agentId}: ${event.eventType} (${event.severity})`, 'connector');
                let alert = null;
                if (this.shouldCreateAlert(event)) {
                    alert = this.createAlertFromAgentEvent(event);
                    // Fallback IA si el parser convencional no extrae datos relevantes
                    if (!alert) {
                        const aiResult = await aiParser.parseToAlert(event, this.connector);
                        if (aiResult.success && aiResult.data) {
                            alert = aiResult.data;
                            alert.metadata = { ...alert.metadata, parser: 'ai' };
                        }
                    }
                    if (alert) {
                        const createdAlert = await storage.createAlert(alert);
                        alerts.push(alert);
                        // --- INICIO: Disparador de análisis IA ---
                        if (["high", "critical"].includes((alert.severity || '').toLowerCase()) && createdAlert.organizationId) {
                            try {
                                const insight = await generateAlertInsight({ ...createdAlert });
                                if (insight && insight.severity && insight.title && insight.description) {
                                    await storage.createAiInsight({ ...insight, organizationId: createdAlert.organizationId });
                                    log(`Insight IA generado y almacenado para alerta ${createdAlert.id}`, 'connector');
                                }
                                else {
                                    log(`Insight IA inválido para alerta ${createdAlert.id}`, 'connector');
                                }
                                // Notificación de evento crítico
                                await notifyCriticalEvent(createdAlert);
                                // Vincular a incidente o crear uno nuevo si es necesario
                                await createIncidentIfNeededAndLinkAlert(createdAlert);
                            }
                            catch (err) {
                                log(`Error generando insight IA o vinculando incidente para alerta ${createdAlert.id}: ${err instanceof Error ? err.message : err}`, 'connector');
                            }
                        }
                        // --- FIN: Disparador de análisis IA ---
                    }
                }
            }
            catch (error) {
                log(`[AUDIT] Error procesando evento de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
            }
        }
        log(`[AUDIT] Creadas ${alerts.length} alertas de ${eventsToProcess.length} eventos de agentes`, 'connector');
    }
    /**
     * Verifica si hay agentes inactivos
     */
    async checkInactiveAgents() {
        const now = new Date();
        let updated = false;
        for (const [agentId, agent] of Object.entries(this.config.agents || {})) {
            if (!agent.lastHeartbeat)
                continue;
            const lastHeartbeat = new Date(agent.lastHeartbeat);
            const timeDiff = now.getTime() - lastHeartbeat.getTime();
            const timeoutMs = (this.config.agentTimeout || 600) * 1000;
            if (timeDiff > timeoutMs && agent.status === 'active') {
                log(`[AUDIT] Agente ${agent.hostname} (${agentId}) marcado como inactivo por falta de comunicación`, 'connector');
                agent.status = 'inactive';
                updated = true;
                // Crear alerta por agente inactivo
                const alert = {
                    title: `Agente ${agent.hostname} inactivo`,
                    description: `El agente ${agent.hostname} (${agentId}) no ha enviado señales en ${Math.round(timeDiff / 60000)} minutos.`,
                    severity: 'medium',
                    source: `Agente (${this.connector.name})`,
                    sourceIp: agent.ip || null,
                    status: 'new',
                    metadata: {
                        agentId,
                        hostname: agent.hostname,
                        os: agent.os,
                        lastHeartbeat: agent.lastHeartbeat
                    }
                };
                const createdAlert = await storage.createAlert(alert);
                // Notificación de agente inactivo
                await notifyCriticalEvent(createdAlert);
                // Vincular a incidente si es necesario
                await createIncidentIfNeededAndLinkAlert(createdAlert);
            }
        }
        if (updated) {
            await this.updateConfig(this.config);
        }
    }
    /**
     * Determina si un evento de agente debe generar una alerta
     */
    shouldCreateAlert(event) {
        // Eventos de seguridad siempre generan alertas
        if (event.eventType.includes('security')) {
            return true;
        }
        // Eventos críticos o altos
        if (['critical', 'high'].includes(event.severity.toLowerCase())) {
            return true;
        }
        // Detección de amenazas
        if (event.eventType.includes('threat') ||
            event.eventType.includes('malware') ||
            event.eventType.includes('attack')) {
            return true;
        }
        // Cambios en archivos críticos
        if (event.eventType === 'file_change' &&
            event.details?.path &&
            (event.details.path.includes('/etc/') ||
                event.details.path.includes('/bin/') ||
                event.details.path.includes('C:\\Windows\\System32\\'))) {
            return true;
        }
        return false;
    }
    /**
     * Crea una alerta a partir de un evento de agente
     */
    createAlertFromAgentEvent(event) {
        try {
            const agent = this.config.agents[event.agentId];
            if (!agent) {
                log(`Agente no encontrado para ID ${event.agentId}`, 'connector');
                return null;
            }
            // Construir título según tipo de evento
            let title = '';
            switch (event.eventType) {
                case 'malware_detected':
                    title = `Malware detectado en ${agent.hostname}`;
                    break;
                case 'suspicious_process':
                    title = `Proceso sospechoso en ${agent.hostname}`;
                    break;
                case 'unauthorized_access':
                    title = `Acceso no autorizado en ${agent.hostname}`;
                    break;
                case 'file_change':
                    title = `Modificación de archivo crítico en ${agent.hostname}`;
                    break;
                case 'network_scan':
                    title = `Escaneo de red detectado desde ${agent.hostname}`;
                    break;
                default:
                    title = `${event.eventType.replace(/_/g, ' ')} en ${agent.hostname}`;
            }
            return {
                title,
                description: event.message,
                severity: event.severity,
                source: `Agente ${agent.hostname} (${this.connector.name})`,
                sourceIp: agent.ip || null,
                destinationIp: event.details?.destinationIp || null,
                status: 'new',
                metadata: {
                    agentId: event.agentId,
                    hostname: agent.hostname,
                    os: agent.os,
                    eventType: event.eventType,
                    timestamp: event.timestamp || new Date().toISOString(),
                    details: event.details || {}
                },
                // dataSource: DataSource.AGENT removed - field not in schema
            };
        }
        catch (error) {
            log(`Error creando alerta desde evento de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
            return null;
        }
    }
    /**
     * Actualiza la configuración en la base de datos
     */
    async updateConfig(config) {
        await storage.updateConnector(this.connector.id, {
            configuration: config
        });
    }
    // This method is not used with token-based auth but kept for potential future message signing
    verifySignature(message, signature, publicKeyStr) {
        if (!publicKeyStr) {
            log('No se proporcionó clave pública para la verificación de firma', 'connector');
            return false;
        }
        try {
            const verifier = crypto.createVerify('SHA256');
            verifier.update(message);
            return verifier.verify(publicKeyStr, Buffer.from(signature, 'base64'));
        }
        catch (error) {
            log(`Error verificando firma: ${error.message}`, 'connector');
            return false;
        }
    }
    getExpressRouter() {
        return this.agentEndpoints;
    }
}
// TODO:
// - Implementar registro seguro de los endpoints (this.agentEndpoints) con el servidor Express principal.
// - Implementar HTTPS para los endpoints de agente.
// - Implementar firma de mensajes para integridad de datos (revisitar verifySignature).
// - Mejorar la lógica de `shouldCreateAlert` y `createAlertFromAgentEvent`.
// - Gestión de estado de agentes más robusta (active, inactive, warning, error).
// - Desregistro automático de agentes que han estado inactivos por mucho tiempo.
// - Considerar rate limiting y protección contra fuerza bruta en el endpoint de registro.
