/**
 * Módulo para la gestión de agentes
 */
import { storage } from '../storage';
import { AgentBuilder, AgentOS } from './agent-builder';
import { verifyRegistrationKey, generateAgentToken } from './connectors/jwt-auth';
import * as fs from 'fs';
import * as path from 'path';
// Crear directorio de descargas si no existe
const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}
// Builder para agentes
const agentBuilder = new AgentBuilder();
// Configuración de notificaciones push
const pushNotificationConfig = {
    enabled: true,
    endpoint: '/api/agents/notifications',
    retryPolicy: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000
    }
};
async function pushConfigurationUpdate(agentId, config) {
    try {
        // Get agent to find organizationId
        const agent = await storage.getAgent(agentId);
        if (!agent) {
            throw new Error('Agent not found');
        }
        
        const response = await fetch(pushNotificationConfig.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${generateAgentToken(agentId.toString(), agent.userId || 0, agent.organizationId)}`
            },
            body: JSON.stringify(config)
        });
        if (!response.ok) {
            throw new Error('Failed to push configuration update');
        }
        return await response.json();
    }
    catch (error) {
        if (pushNotificationConfig.retryPolicy.maxRetries > 0) {
            await new Promise(resolve => setTimeout(resolve, pushNotificationConfig.retryPolicy.initialDelay));
            return pushConfigurationUpdate(agentId, config);
        }
        throw error;
    }
}
/**
 * Registra un nuevo agente
 */
export async function registerAgent(registrationKey, hostname, ipAddress, operatingSystem, version, capabilities) {
    try {
        // Verificar clave de registro
        const keyVerification = verifyRegistrationKey(registrationKey);
        if (!keyVerification.valid) {
            return {
                success: false,
                message: 'Invalid or expired registration key'
            };
        }
        // Obtener usuario asociado al registro
        const userId = keyVerification.userId;
        const user = await storage.getUser(userId);
        if (!user) {
            return {
                success: false,
                message: 'Invalid user associated with registration key'
            };
        }
        // Verificar si el usuario pertenece a una organización
        if (!user.organizationId) {
            return {
                success: false,
                message: 'User does not belong to any organization'
            };
        }
        // Obtener la organización y su plan
        const organization = await storage.getOrganization(user.organizationId);
        if (!organization) {
            return {
                success: false,
                message: 'Organization not found'
            };
        }
        // Obtener el plan de la organización
        const planId = organization.planId;
        if (typeof planId !== 'number') {
            return {
                success: false,
                message: 'Organization does not have a valid plan assigned'
            };
        }
        const plan = await storage.getPlan(planId);
        if (!plan) {
            return {
                success: false,
                message: 'Subscription plan not found'
            };
        }
        // Verificar el límite de agentes para el plan
        if (plan.maxAgents === 1) {
            const currentAgents = await storage.listAgents(organization.id);
            const activeAgents = currentAgents.filter(agent => agent.status === 'active');
            if (activeAgents.length >= plan.maxAgents) {
                return {
                    success: false,
                    message: 'Agent limit reached for your current plan. Please upgrade to add more agents.'
                };
            }
        }
        // Crear nuevo agente en la base de datos
        const agentData = {
            userId,
            name: hostname,
            hostname,
            operatingSystem,
            version,
            ipAddress,
            capabilities: capabilities,
            status: 'active',
            organizationId: user.organizationId,
            agentIdentifier: `${hostname}-${Date.now()}`
        };
        console.log('[RegisterAgent] Attempting to create agent with data:', agentData);
        const newAgent = await storage.createAgent(agentData);
        console.log('[RegisterAgent] Result from storage.createAgent:', newAgent);
        if (!newAgent) {
            console.error('[RegisterAgent] Failed to create agent in database');
            return {
                success: false,
                message: 'Failed to create agent in database'
            };
        }
        // Generar token JWT para este agente
        const token = generateAgentToken(newAgent.agentIdentifier, userId, user.organizationId);
        // Configuración a devolver al agente
        const agentConfig = {
            heartbeatInterval: 60, // cada minuto
            endpoints: {
                data: '/api/agents/data',
                heartbeat: '/api/agents/heartbeat'
            }
        };
        return {
            success: true,
            agentId: newAgent.agentIdentifier, // Use agentIdentifier instead of numeric id
            token,
            config: agentConfig
        };
    }
    catch (error) {
        console.error('Error registering agent:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
/**
 * Recibe datos desde un agente
 */
const MAX_RETRIES = 5;
const INITIAL_DELAY = 1000; // 1 segundo
async function exponentialBackoff(fn, retries = MAX_RETRIES) {
    try {
        return await fn();
    }
    catch (error) {
        if (retries <= 0)
            throw error;
        const delay = INITIAL_DELAY * Math.pow(2, MAX_RETRIES - retries);
        await new Promise(resolve => setTimeout(resolve, delay));
        return exponentialBackoff(fn, retries - 1);
    }
}
export async function processAgentData(tokenOrAgentId, events) {
    try {
        let agentId = null;
        if (/^\d+$/.test(tokenOrAgentId)) {
            agentId = parseInt(tokenOrAgentId, 10);
        }
        else if (typeof tokenOrAgentId === 'string' && tokenOrAgentId.length > 0) {
            const agentByIdentifier = await storage.getAgentByIdentifier(tokenOrAgentId);
            if (agentByIdentifier) {
                agentId = agentByIdentifier.id;
            }
            else {
                try {
                    const decoded = (tokenOrAgentId.split('.').length === 3)
                        ? (JSON.parse(Buffer.from(tokenOrAgentId.split('.')[1], 'base64').toString('utf-8')))
                        : null;
                    if (decoded && decoded.agentId) {
                        agentId = parseInt(decoded.agentId, 10);
                    }
                }
                catch (e) {
                    // ignore
                }
            }
        }
        if (!agentId || isNaN(agentId)) {
            return {
                success: false,
                message: 'Missing or invalid agentId'
            };
        }
        const agent = await storage.getAgent(agentId);
        if (!agent) {
            return {
                success: false,
                message: 'Agent not found'
            };
        }
        if (events && events.length > 0) {
            await exponentialBackoff(() => processAgentEvents(agentId, events));
        }
        return { success: true };
    }
    catch (error) {
        console.error('Error processing agent data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
/**
 * Procesa eventos de un agente y genera alertas si es necesario
 */
async function processAgentEvents(agentId, events) {
    // Procesar cada evento
    for (const event of events) {
        try {
            // Convertir la severidad del evento al formato de alerta
            let severity = 'low';
            switch (event.severity) {
                case 'critical':
                    severity = 'critical';
                    break;
                case 'high':
                    severity = 'high';
                    break;
                case 'medium':
                    severity = 'medium';
                    break;
                default:
                    severity = 'low';
            }
            // Obtener información del agente para la alerta
            const agent = await storage.getAgent(agentId);
            if (!agent)
                continue;
            // Crear título y descripción según el tipo de evento
            let title = `Agent Alert: ${event.eventType}`;
            let description = event.message || 'No description provided';
            // Crear alerta
            await storage.createAlert({
                title,
                description,
                source: `Agent: ${agent.name}`,
                severity,
                status: 'new',
                metadata: {
                    agentId,
                    eventType: event.eventType,
                    eventDetails: event.details,
                    eventTimestamp: event.timestamp,
                    hostname: agent.name,
                    ipAddress: agent.ipAddress,
                    operatingSystem: agent.operatingSystem
                },
                sourceIp: agent.ipAddress
            });
        }
        catch (error) {
            console.error(`Error processing agent event:`, error);
        }
    }
}
/**
 * Procesa heartbeat de un agente
 */
export async function processAgentHeartbeat(tokenOrAgentId, status, metrics) {
    try {
        console.log('[Heartbeat] Received tokenOrAgentId:', tokenOrAgentId);
        let agentId = null;
        let currentAgent = null; // Use currentAgent to store the agent object
        if (/^\d+$/.test(tokenOrAgentId)) {
            agentId = parseInt(tokenOrAgentId, 10);
            console.log('[Heartbeat] Parsed agentId as number:', agentId);
        }
        else if (typeof tokenOrAgentId === 'string' && tokenOrAgentId.length > 0) {
            const agentIdMatch = tokenOrAgentId.match(/^agent-(.+)$/);
            if (agentIdMatch) {
                console.log('[Heartbeat] Trying to look up agent by identifier:', tokenOrAgentId);
                const agentByIdentifier = await storage.getAgentByIdentifier(tokenOrAgentId);
                if (agentByIdentifier) {
                    agentId = agentByIdentifier.id;
                    currentAgent = agentByIdentifier;
                    console.log('[Heartbeat] Found agent by identifier:', tokenOrAgentId, '->', agentId);
                }
                else if (agentIdMatch && /^agent-\d+$/.test(tokenOrAgentId)) { // Check agentIdMatch is not null
                    agentId = parseInt(agentIdMatch[1], 10);
                    console.log('[Heartbeat] Extracted agentId from agent-<id> format:', agentId);
                }
                else {
                    console.log('[Heartbeat] No agent found with identifier (agent-.* format):', tokenOrAgentId);
                }
            }
            else {
                const agentByIdentifier = await storage.getAgentByIdentifier(tokenOrAgentId);
                if (agentByIdentifier) {
                    agentId = agentByIdentifier.id;
                    currentAgent = agentByIdentifier;
                    console.log('[Heartbeat] Found agent by full identifier (non agent-.* format):', tokenOrAgentId, '->', agentId);
                }
                else {
                    try {
                        const decoded = (tokenOrAgentId.split('.').length === 3)
                            ? (JSON.parse(Buffer.from(tokenOrAgentId.split('.')[1], 'base64').toString('utf-8')))
                            : null;
                        if (decoded && decoded.agentId) {
                            agentId = parseInt(decoded.agentId, 10);
                            console.log('[Heartbeat] Decoded agentId from JWT:', agentId);
                        }
                        else {
                            console.warn('[Heartbeat] Could not decode agentId from JWT (or JWT invalid):', tokenOrAgentId);
                        }
                    }
                    catch (e) {
                        console.warn('[Heartbeat] Error decoding JWT:', e);
                    }
                }
            }
        }
        if (agentId && !currentAgent) {
            currentAgent = await storage.getAgent(agentId);
            if (currentAgent) {
                console.log('[Heartbeat] Fetched agent by ID after initial parse/decode:', agentId);
            }
            else {
                console.log('[Heartbeat] Agent not found by ID after initial parse/decode:', agentId);
                agentId = null;
            }
        }
        // Auto-registration logic
        if (!currentAgent && process.env.ENABLE_AGENT_AUTO_REGISTER === 'true' && typeof tokenOrAgentId === 'string' && tokenOrAgentId.startsWith('agent-')) {
            console.log('[Heartbeat] Agent not found, attempting auto-registration for:', tokenOrAgentId);
            const defaultOrgId = parseInt(process.env.DEFAULT_ORG_ID_FOR_AUTO_REGISTER || '1', 10);
            const defaultUserId = parseInt(process.env.DEFAULT_USER_ID_FOR_AUTO_REGISTER || '1', 10);
            try {
                const newAgentData = {
                    agentIdentifier: tokenOrAgentId,
                    name: tokenOrAgentId,
                    hostname: 'unknown_auto_registered',
                    operatingSystem: 'unknown',
                    version: 'pending',
                    ipAddress: '',
                    capabilities: [],
                    status: 'active',
                    organizationId: defaultOrgId,
                    userId: defaultUserId,
                };
                const createdAgent = await storage.createAgent(newAgentData);
                if (createdAgent) {
                    agentId = createdAgent.id;
                    currentAgent = createdAgent;
                    console.log('[Heartbeat] Auto-registered new agent:', tokenOrAgentId, '-> New ID:', agentId);
                }
                else {
                    console.error('[Heartbeat] Auto-registration failed for:', tokenOrAgentId, '- could not create agent in DB.');
                }
            }
            catch (creationError) {
                console.error('[Heartbeat] Error during auto-registration for:', tokenOrAgentId, creationError);
            }
        }
        if (!agentId || isNaN(agentId) || !currentAgent) {
            console.warn('[Heartbeat] Missing or invalid agentId, or agent not found after all attempts:', tokenOrAgentId, 'Resolved agentId:', agentId);
            return {
                success: false,
                message: 'Missing or invalid agentId, or agent not found'
            };
        }
        // Prepare update data
        const updateData = {
            status,
            lastHeartbeat: new Date(),
            ipAddress: currentAgent?.ipAddress || '',
            version: currentAgent?.version || 'pending',
            operatingSystem: currentAgent?.operatingSystem || 'unknown',
            hostname: currentAgent?.hostname || 'unknown',
            name: currentAgent?.name || tokenOrAgentId,
            agentIdentifier: currentAgent?.agentIdentifier || tokenOrAgentId
        };
        if (metrics) {
            updateData.lastMetrics = metrics; // Store the received metrics object
            console.log('[Heartbeat] Metrics received and will be updated:', metrics);
        }
        await storage.updateAgent(agentId, updateData);
        console.log(`[Heartbeat] Agent ${agentId} updated with status ${status}`);
        // Create alert if status is 'error' and memory usage is high
        if (status === 'error' && metrics && typeof metrics.memoryUsage === 'number' && metrics.memoryUsage > 0.90 && currentAgent) {
            const alertTitle = `High Memory Usage on ${currentAgent.name || `Agent ${agentId}`}`;
            const alertDescription = `Agent ${currentAgent.name || `Agent ${agentId}`} reported memory usage of ${(metrics.memoryUsage * 100).toFixed(1)}%, exceeding the 90% threshold.`;
            let alertSeverity = 'high';
            if (metrics.memoryUsage > 0.95) { // Example: > 95% is critical
                alertSeverity = 'critical';
            }
            const alertData = {
                title: alertTitle,
                description: alertDescription,
                source: `Agent: ${currentAgent.name || `Agent ${agentId}`}`,
                severity: alertSeverity,
                status: 'new',
                metadata: {
                    agentId: agentId,
                    eventType: 'high_memory_usage_heartbeat',
                    eventDetails: { ...metrics },
                    eventTimestamp: new Date().toISOString(),
                    hostname: currentAgent.hostname || currentAgent.name || `Agent ${agentId}`,
                    ipAddress: currentAgent.ipAddress || 'N/A',
                    operatingSystem: currentAgent.operatingSystem || 'unknown'
                },
                organizationId: currentAgent.organizationId, // Ensure organizationId is included
                sourceIp: currentAgent.ipAddress || 'N/A',
            };
            try {
                await storage.createAlert(alertData);
                console.log(`[Heartbeat] Alert created for high memory usage on agent ${agentId}`);
            }
            catch (alertError) {
                console.error(`[Heartbeat] Failed to create alert for agent ${agentId}:`, alertError);
                // Continue, as heartbeat itself was processed.
            }
        }
        const updatedAgent = await storage.getAgent(agentId);
        if (!updatedAgent) {
            console.error('[Heartbeat] Failed to fetch agent after update:', agentId);
            return { success: false, message: 'Failed to fetch agent details after update' };
        }
        return {
            success: true,
            message: 'Heartbeat processed',
            config: updatedAgent.configuration,
        };
    }
    catch (error) {
        console.error('[Heartbeat] Error processing heartbeat:', error);
        return {
            success: false,
            message: 'Error processing heartbeat'
        };
    }
}
/**
 * Genera una clave de registro para agentes
 */
export async function generateAgentRegistrationKey(userId) {
    // Esta función simplemente llama a la implementación en jwt-auth.ts
    return await import('./connectors/jwt-auth').then(module => module.generateRegistrationKey(userId));
}
/**
 * Construye un paquete de agente para descarga
 */
export async function buildAgentPackage(userId, operatingSystem, serverUrl, registrationKey, customName, capabilities) {
    try {
        // Verificar si el usuario pertenece a una organización
        const user = await storage.getUser(userId);
        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }
        if (!user.organizationId) {
            return {
                success: false,
                message: 'User does not belong to any organization'
            };
        }
        // Obtener la organización y su plan
        const organization = await storage.getOrganization(user.organizationId);
        if (!organization) {
            return {
                success: false,
                message: 'Organization not found'
            };
        }
        // Obtener el plan de la organización
        const planId = organization.planId;
        if (typeof planId !== 'number') {
            return {
                success: false,
                message: 'Organization does not have a valid plan assigned'
            };
        }
        const plan = await storage.getPlan(planId);
        if (!plan) {
            return {
                success: false,
                message: 'Subscription plan not found'
            };
        }
        // Verificar el límite de agentes para el plan gratuito
        if (plan.maxAgents === 1) {
            const currentAgents = await storage.listAgents(organization.id);
            const activeAgents = currentAgents.filter(agent => agent.status === 'active');
            if (activeAgents.length >= plan.maxAgents) {
                return {
                    success: false,
                    message: 'You have reached the agent limit for your current plan. Please upgrade to add more agents.'
                };
            }
        }
        // Determinar el tipo de OS
        let agentOS;
        switch (operatingSystem.toLowerCase()) {
            case 'windows':
                agentOS = AgentOS.WINDOWS;
                break;
            case 'macos':
            case 'mac':
            case 'osx':
                agentOS = AgentOS.MACOS;
                break;
            case 'linux':
                agentOS = AgentOS.LINUX;
                break;
            default:
                return {
                    success: false,
                    message: `Unsupported operating system: ${operatingSystem}`
                };
        }
        // Crear el agente en la base de datos con estado 'inactive' si no existe
        let agentRecord = null;
        if (customName) {
            // Buscar por nombre personalizado y organización
            const existingAgents = await storage.listAgents(user.organizationId);
            agentRecord = existingAgents.find(a => a.name === customName);
        }
        if (!agentRecord) {
            const agentData = {
                userId,
                name: customName || `Agente-${Date.now()}`,
                hostname: customName || `host-${Date.now()}`,
                operatingSystem,
                version: 'pending',
                ipAddress: '',
                capabilities: capabilities,
                status: 'inactive',
                organizationId: user.organizationId,
                agentIdentifier: `${customName || 'agent'}-${Date.now()}`
            };
            agentRecord = await storage.createAgent(agentData);
        }
        // Configurar la construcción del agente
        const config = {
            os: agentOS,
            serverUrl,
            registrationKey,
            userId,
            customName,
            capabilities
        };
        // Construir el agente
        const result = await agentBuilder.buildAgent(config);
        return {
            success: result.success,
            message: result.message || 'Agent package created successfully',
            downloadUrl: result.downloadUrl,
            agentId: agentRecord ? agentRecord.id.toString() : result.agentId
        };
    }
    catch (error) {
        console.error('Error building agent package:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
