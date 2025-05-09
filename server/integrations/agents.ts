/**
 * Módulo para la gestión de agentes
 */

import { storage } from '../storage';
import { AgentBuilder, AgentOS, AgentBuildConfig } from './agent-builder';
import { verifyAgentToken, verifyRegistrationKey, generateAgentToken } from './connectors/jwt-auth';
import { agents } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Crear directorio de descargas si no existe
const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Builder para agentes
const agentBuilder = new AgentBuilder();

/**
 * Registra un nuevo agente
 */
export async function registerAgent(
  registrationKey: string, 
  hostname: string, 
  ip: string, 
  os: string, 
  version: string, 
  capabilities: string[]
): Promise<{
  success: boolean;
  message?: string;
  agentId?: string;
  token?: string;
  config?: any;
}> {
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
    const plan = await storage.getPlan(organization.planId);
    if (!plan) {
      return {
        success: false,
        message: 'Subscription plan not found'
      };
    }
    
    // Verificar el límite de agentes para el plan
    // Si agentLimit == 1 (Plan Gratuito), verificar cuántos agentes ya tiene
    if (plan.agentLimit === 1) {
      const currentAgents = await storage.listAgents(undefined, organization.id);
      const activeAgents = currentAgents.filter(agent => agent.status === 'active');
      
      if (activeAgents.length >= plan.agentLimit) {
        return {
          success: false,
          message: 'Agent limit reached for your current plan. Please upgrade to add more agents.'
        };
      }
    }
    // Si agentLimit == -1, significa que tiene agentes ilimitados (plan de pago)
    
    // Crear nuevo agente en la base de datos
    const newAgent = await storage.createAgent({
      userId,
      name: hostname,
      description: `Agent for ${hostname} (${os} ${version})`,
      ip,
      os,
      version,
      capabilities: capabilities as any,
      status: 'active',
      lastHeartbeat: new Date(),
      config: {},
      organizationId: user.organizationId // Asignar el agente a la organización
    });
    
    if (!newAgent) {
      return {
        success: false,
        message: 'Failed to create agent in database'
      };
    }
    
    // Generar token JWT para este agente
    const token = generateAgentToken(newAgent.id.toString(), userId);
    
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
      agentId: newAgent.id.toString(),
      token,
      config: agentConfig
    };
  } catch (error) {
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
export async function processAgentData(
  token: string,
  events: any[]
): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    // Verificar token
    const tokenData = verifyAgentToken(token);
    if (!tokenData) {
      return {
        success: false,
        message: 'Invalid or expired agent token'
      };
    }
    
    // Obtener información del agente
    const agentId = parseInt(tokenData.agentId, 10);
    const agent = await storage.getAgent(agentId);
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent not found'
      };
    }
    
    // Procesar eventos
    if (events && events.length > 0) {
      await processAgentEvents(agentId, events);
    }
    
    return { success: true };
  } catch (error) {
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
async function processAgentEvents(agentId: number, events: any[]): Promise<void> {
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
      if (!agent) continue;
      
      // Crear título y descripción según el tipo de evento
      let title = `Agent Alert: ${event.eventType}`;
      let description = event.message || 'No description provided';
      
      // Añadir IOCs si están disponibles
      const iocs: any = {};
      
      // Extraer IOCs según el tipo de evento
      switch (event.eventType) {
        case 'network':
          if (event.details?.connection?.remoteIp) {
            if (!iocs.ips) iocs.ips = [];
            iocs.ips.push(event.details.connection.remoteIp);
          }
          break;
          
        case 'process':
          // No hay IOCs claros para procesos, pero podríamos añadir hash del proceso en el futuro
          break;
          
        case 'file':
          if (event.details?.file?.path) {
            if (!iocs.files) iocs.files = [];
            iocs.files.push(event.details.file.path);
          }
          break;
          
        case 'malware':
          if (event.details?.detection?.fileHash) {
            if (!iocs.hashes) iocs.hashes = [];
            iocs.hashes.push(event.details.detection.fileHash);
          }
          break;
          
        case 'vulnerability':
          if (event.details?.vulnerability?.cveId) {
            if (!iocs.other) iocs.other = [];
            iocs.other.push(event.details.vulnerability.cveId);
          }
          break;
      }
      
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
          ip: agent.ip,
          os: agent.os
        },
        iocs: Object.keys(iocs).length > 0 ? iocs : undefined,
        sourceIp: agent.ip,
        // No tenemos destinationIp para la mayoría de alertas de agente
      });
      
    } catch (error) {
      console.error(`Error processing agent event:`, error);
    }
  }
}

/**
 * Procesa heartbeat de un agente
 */
export async function processAgentHeartbeat(
  token: string,
  status: 'active' | 'warning' | 'error' | 'inactive',
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  }
): Promise<{
  success: boolean;
  message?: string;
  config?: any;
}> {
  try {
    // Verificar token
    const tokenData = verifyAgentToken(token);
    if (!tokenData) {
      return {
        success: false,
        message: 'Invalid or expired agent token'
      };
    }
    
    // Obtener información del agente
    const agentId = parseInt(tokenData.agentId, 10);
    const agent = await storage.getAgent(agentId);
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent not found'
      };
    }
    
    // Actualizar estado del agente
    await storage.updateAgent(agentId, {
      status,
      lastHeartbeat: new Date(),
      metrics: metrics || {}
    });
    
    // Configuración a devolver al agente
    // Aquí podríamos devolver cambios de configuración si es necesario
    const agentConfig = {};
    
    return { 
      success: true,
      config: agentConfig
    };
  } catch (error) {
    console.error('Error processing agent heartbeat:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Genera una clave de registro para agentes
 */
export async function generateAgentRegistrationKey(userId: number): Promise<string> {
  // Esta función simplemente llama a la implementación en jwt-auth.ts
  return await import('./connectors/jwt-auth').then(
    module => module.generateRegistrationKey(userId)
  );
}

/**
 * Construye un paquete de agente para descarga
 */
export async function buildAgentPackage(
  userId: number,
  os: string,
  serverUrl: string,
  registrationKey: string,
  customName?: string,
  capabilities?: {
    fileSystemMonitoring?: boolean;
    processMonitoring?: boolean;
    networkMonitoring?: boolean;
    registryMonitoring?: boolean;
    securityLogsMonitoring?: boolean;
    malwareScanning?: boolean;
    vulnerabilityScanning?: boolean;
  }
): Promise<{
  success: boolean;
  message: string;
  downloadUrl?: string;
  agentId?: string;
}> {
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
    const plan = await storage.getPlan(organization.planId);
    if (!plan) {
      return {
        success: false,
        message: 'Subscription plan not found'
      };
    }
    
    // Verificar el límite de agentes para el plan gratuito
    if (plan.agentLimit === 1) {
      const currentAgents = await storage.listAgents(undefined, organization.id);
      const activeAgents = currentAgents.filter(agent => agent.status === 'active');
      
      if (activeAgents.length >= plan.agentLimit) {
        return {
          success: false,
          message: 'You have reached the agent limit for your current plan. Please upgrade to add more agents.'
        };
      }
    }
    
    // Determinar el tipo de OS
    let agentOS: AgentOS;
    
    switch (os.toLowerCase()) {
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
          message: `Unsupported operating system: ${os}`
        };
    }
    
    // Configurar la construcción del agente
    const config: AgentBuildConfig = {
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
      agentId: result.agentId
    };
  } catch (error) {
    console.error('Error building agent package:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}