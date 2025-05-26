/**
 * Implementación de conectores de tipo Agente
 * Gestiona la comunicación con agentes instalados en sistemas objetivo
 */

import { Connector, InsertAlert } from '@shared/schema';
import { BaseConnector, ConnectorConfig, ConnectorResult } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import express from 'express';
import crypto from 'crypto';
import { aiParser } from '../ai-parser-service';
import { generateAlertInsight } from '../../advanced-ai-service';
import { createIncidentIfNeededAndLinkAlert } from '../../utils/incident-linker'; // Utilidad para incidentes automáticos
import { notifyCriticalEvent } from '../../utils/notifier'; // Utilidad para notificaciones

/**
 * Configuración específica para conectores de tipo Agente
 */
export interface AgentConnectorConfig extends ConnectorConfig {
  // Configuración de gestión de agentes
  registrationKey?: string;
  heartbeatInterval?: number; // en segundos
  agentTimeout?: number; // en segundos
  dataEndpoint?: string;
  registrationEndpoint?: string;
  // Lista de agentes registrados
  agents?: {
    [agentId: string]: {
      hostname: string;
      ip: string;
      os: string;
      version: string;
      status: 'active' | 'inactive' | 'warning' | 'error';
      lastHeartbeat: string;
      capabilities: string[];
      config?: any;
    }
  };
  // Configuración de seguridad
  signatureVerification?: boolean;
  publicKey?: string;
  useJWT?: boolean;
  jwtSecret?: string;
}

/**
 * Datos que envía un agente al registrarse
 */
interface AgentRegistration {
  hostname: string;
  ip: string;
  os: string;
  version: string;
  capabilities: string[];
  // Opcional, para verificación de firma
  signature?: string;
  publicKey?: string;
}

/**
 * Datos que envía un agente periódicamente (heartbeat)
 */
interface AgentHeartbeat {
  agentId: string;
  timestamp: string;
  status: 'active' | 'warning' | 'error';
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
  };
  // Opcional, para verificación de firma
  signature?: string;
}

/**
 * Datos de evento enviados por un agente
 */
interface AgentEvent {
  agentId: string;
  timestamp: string;
  eventType: string;
  severity: string;
  message: string;
  details: any;
  // Opcional, para verificación de firma
  signature?: string;
}

/**
 * Conector para gestionar agentes remotos
 */
export class AgentConnector extends BaseConnector {
  protected config: AgentConnectorConfig;
  private pendingEvents: AgentEvent[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private agentEndpoints: express.Router;
  
  constructor(connector: Connector) {
    super(connector);
    this.config = this.connector.configuration as AgentConnectorConfig;
    
    // Crear endpoints para la comunicación con agentes
    this.agentEndpoints = express.Router();
    this.setupEndpoints();
  }
  
  /**
   * Validar la configuración del conector
   */
  public validateConfig(): boolean {
    // Verificar campos obligatorios
    if (!this.config.registrationKey) {
      log(`Conector ${this.connector.name} no tiene clave de registro configurada`, 'connector');
      // Generar una clave aleatoria en lugar de fallar
      this.config.registrationKey = crypto.randomBytes(16).toString('hex');
      log(`Se ha generado automáticamente una clave de registro: ${this.config.registrationKey}`, 'connector');
    }
    
    // Configurar valores por defecto
    if (!this.config.heartbeatInterval || this.config.heartbeatInterval < 60) {
      this.config.heartbeatInterval = 300; // 5 minutos por defecto
    }
    
    if (!this.config.agentTimeout || this.config.agentTimeout < this.config.heartbeatInterval) {
      this.config.agentTimeout = this.config.heartbeatInterval * 2; // Doble del intervalo de heartbeat
    }
    
    // Inicializar registro de agentes si no existe
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
  private setupEndpoints(): void {
    // Endpoint de registro de agentes
    this.agentEndpoints.post(this.config.registrationEndpoint || '/api/agents/register', express.json(), async (req, res) => {
      try {
        const registration = req.body as AgentRegistration;
        
        // Validar datos básicos
        if (!registration.hostname || !registration.os || !registration.version) {
          return res.status(400).json({ success: false, message: 'Datos de registro incompletos' });
        }
        
        // Verificar clave de registro
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        if (!apiKey || apiKey !== this.config.registrationKey) {
          return res.status(401).json({ success: false, message: 'Clave de registro inválida' });
        }
        
        // Verificar firma si está habilitado
        if (this.config.signatureVerification && registration.signature) {
          const isValid = this.verifySignature(
            JSON.stringify({ ...registration, signature: undefined }),
            registration.signature,
            registration.publicKey || this.config.publicKey
          );
          
          if (!isValid) {
            return res.status(401).json({ success: false, message: 'Firma inválida' });
          }
        }
        
        // Generar ID único para el agente
        const agentId = crypto.randomUUID();
        
        // Registrar agente
        this.config.agents[agentId] = {
          hostname: registration.hostname,
          ip: registration.ip || req.ip || 'unknown',
          os: registration.os,
          version: registration.version,
          capabilities: registration.capabilities || [],
          status: 'active',
          lastHeartbeat: new Date().toISOString(),
          config: {}
        };
        
        // Guardar configuración actualizada
        await this.updateConfig();
        
        // Responder con ID y configuración
        res.status(200).json({
          success: true,
          agentId,
          config: {
            heartbeatInterval: this.config.heartbeatInterval,
            endpoints: {
              data: this.config.dataEndpoint,
              heartbeat: this.config.dataEndpoint + '/heartbeat'
            }
          }
        });
        
        log(`Nuevo agente registrado: ${registration.hostname} (${agentId})`, 'connector');
      } catch (error) {
        log(`Error en registro de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
        res.status(500).json({ success: false, message: 'Error interno' });
      }
    });
    
    // Endpoint de heartbeat
    this.agentEndpoints.post(`${this.config.dataEndpoint}/heartbeat`, express.json(), async (req, res) => {
      try {
        const heartbeat = req.body as AgentHeartbeat;
        
        // Validar datos básicos
        if (!heartbeat.agentId) {
          return res.status(400).json({ success: false, message: 'ID de agente requerido' });
        }
        
        // Verificar que el agente existe
        if (!this.config.agents[heartbeat.agentId]) {
          return res.status(404).json({ success: false, message: 'Agente no registrado' });
        }
        
        // Verificar firma si está habilitado
        if (this.config.signatureVerification && heartbeat.signature) {
          const agent = this.config.agents[heartbeat.agentId];
          const publicKey = this.config.agents[heartbeat.agentId].config?.publicKey || this.config.publicKey;
          
          const isValid = this.verifySignature(
            JSON.stringify({ ...heartbeat, signature: undefined }),
            heartbeat.signature,
            publicKey
          );
          
          if (!isValid) {
            return res.status(401).json({ success: false, message: 'Firma inválida' });
          }
        }
        
        // Actualizar estado del agente
        this.config.agents[heartbeat.agentId].lastHeartbeat = new Date().toISOString();
        this.config.agents[heartbeat.agentId].status = heartbeat.status || 'active';
        
        // Guardar métricas si existen
        if (heartbeat.metrics) {
          this.config.agents[heartbeat.agentId].metrics = heartbeat.metrics;
        }
        
        // Guardar configuración actualizada
        await this.updateConfig();
        
        // Responder con OK y configuración actualizada si la hay
        res.status(200).json({
          success: true,
          config: this.config.agents[heartbeat.agentId].config || {}
        });
      } catch (error) {
        log(`Error en heartbeat de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
        res.status(500).json({ success: false, message: 'Error interno' });
      }
    });
    
    // Endpoint para recibir datos
    this.agentEndpoints.post(this.config.dataEndpoint, express.json(), async (req, res) => {
      try {
        const event = req.body as AgentEvent;
        
        // Validar datos básicos
        if (!event.agentId || !event.eventType) {
          return res.status(400).json({ success: false, message: 'Datos incompletos' });
        }
        
        // Verificar que el agente existe
        if (!this.config.agents[event.agentId]) {
          return res.status(404).json({ success: false, message: 'Agente no registrado' });
        }
        
        // Verificar firma si está habilitado
        if (this.config.signatureVerification && event.signature) {
          const agent = this.config.agents[event.agentId];
          const publicKey = this.config.agents[event.agentId].config?.publicKey || this.config.publicKey;
          
          const isValid = this.verifySignature(
            JSON.stringify({ ...event, signature: undefined }),
            event.signature,
            publicKey
          );
          
          if (!isValid) {
            return res.status(401).json({ success: false, message: 'Firma inválida' });
          }
        }
        
        // Actualizar timestamp de último contacto
        this.config.agents[event.agentId].lastHeartbeat = new Date().toISOString();
        
        // Añadir evento a la cola de procesamiento
        this.pendingEvents.push(event);
        
        // Actualizar estadísticas
        this.state.dataProcessed++;
        this.state.bytesProcessed += JSON.stringify(event).length;
        
        // Si hay muchos eventos pendientes, procesarlos
        if (this.pendingEvents.length >= 20) {
          this.processAgentEvents();
        }
        
        res.status(200).json({ success: true });
      } catch (error) {
        log(`Error recibiendo datos de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
        res.status(500).json({ success: false, message: 'Error interno' });
      }
    });
    
    // Endpoint para consultar agentes registrados
    this.agentEndpoints.get('/api/agents', async (req, res) => {
      try {
        const agents = Object.entries(this.config.agents || {}).map(([id, data]) => ({ id, ...data }));
        res.status(200).json({ success: true, agents });
      } catch (error) {
        log(`Error consultando agentes: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
        res.status(500).json({ success: false, message: 'Error interno' });
      }
    });

    // Endpoint para consultar eventos recientes
    this.agentEndpoints.get('/api/agents/events', async (req, res) => {
      try {
        res.status(200).json({ success: true, events: this.pendingEvents.slice(-50) });
      } catch (error) {
        log(`Error consultando eventos: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
        res.status(500).json({ success: false, message: 'Error interno' });
      }
    });
  }
  
  /**
   * Ejecutar el conector
   */
  public async execute(): Promise<ConnectorResult> {
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
            key: this.config.registrationKey ? '***' + this.config.registrationKey.substring(this.config.registrationKey.length - 4) : 'No configurada'
          }
        },
        metrics: {
          itemsProcessed: this.state.dataProcessed,
          bytesProcessed: this.state.bytesProcessed,
          executionTime: this.state.executionTime
        }
      };
    } catch (error) {
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
  public getRouter(): express.Router {
    return this.agentEndpoints;
  }
  
  /**
   * Procesa los eventos pendientes de agentes
   */
  private async processAgentEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return;
    const eventsToProcess = [...this.pendingEvents];
    this.pendingEvents = [];
    log(`Procesando ${eventsToProcess.length} eventos de agentes`, 'connector');
    const alerts: InsertAlert[] = [];
    for (const event of eventsToProcess) {
      try {
        // Auditoría de evento
        log(`[AUDIT] Evento recibido de agente ${event.agentId}: ${event.eventType} (${event.severity})`, 'connector');
        let alert: InsertAlert | null = null;
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
                } else {
                  log(`Insight IA inválido para alerta ${createdAlert.id}`, 'connector');
                }
                // Notificación de evento crítico
                await notifyCriticalEvent(createdAlert);
                // Vincular a incidente o crear uno nuevo si es necesario
                await createIncidentIfNeededAndLinkAlert(createdAlert);
              } catch (err) {
                log(`Error generando insight IA o vinculando incidente para alerta ${createdAlert.id}: ${err instanceof Error ? err.message : err}`, 'connector');
              }
            }
            // --- FIN: Disparador de análisis IA ---
          }
        }
      } catch (error) {
        log(`[AUDIT] Error procesando evento de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      }
    }
    log(`[AUDIT] Creadas ${alerts.length} alertas de ${eventsToProcess.length} eventos de agentes`, 'connector');
  }

  /**
   * Verifica si hay agentes inactivos
   */
  private async checkInactiveAgents(): Promise<void> {
    const now = new Date();
    let updated = false;
    for (const [agentId, agent] of Object.entries(this.config.agents || {})) {
      if (!agent.lastHeartbeat) continue;
      const lastHeartbeat = new Date(agent.lastHeartbeat);
      const timeDiff = now.getTime() - lastHeartbeat.getTime();
      const timeoutMs = (this.config.agentTimeout || 600) * 1000;
      if (timeDiff > timeoutMs && agent.status === 'active') {
        log(`[AUDIT] Agente ${agent.hostname} (${agentId}) marcado como inactivo por falta de comunicación`, 'connector');
        agent.status = 'inactive';
        updated = true;
        // Crear alerta por agente inactivo
        const alert: InsertAlert = {
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
      await this.updateConfig();
    }
  }
  
  /**
   * Determina si un evento de agente debe generar una alerta
   */
  private shouldCreateAlert(event: AgentEvent): boolean {
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
  private createAlertFromAgentEvent(event: AgentEvent): InsertAlert | null {
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
        }
      };
    } catch (error) {
      log(`Error creando alerta desde evento de agente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      return null;
    }
  }
  
  /**
   * Actualiza la configuración en la base de datos
   */
  private async updateConfig(): Promise<void> {
    await storage.updateConnector(this.connector.id, {
      configuration: this.config
    });
  }
  
  /**
   * Verifica la firma de un mensaje
   */
  private verifySignature(message: string, signature: string, publicKeyStr?: string): boolean {
    try {
      if (!publicKeyStr) {
        log('No se puede verificar firma: clave pública no disponible', 'connector');
        return false;
      }
      
      const verifier = crypto.createVerify('SHA256');
      verifier.update(message);
      
      return verifier.verify(publicKeyStr, Buffer.from(signature, 'base64'));
    } catch (error) {
      log(`Error verificando firma: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      return false;
    }
  }

  /**
   * Limita intentos de registro fallidos y bloquea IPs sospechosas
   */
  private failedAttempts: Record<string, number> = {};
  private blockedIps: Set<string> = new Set();

  // Refuerza el endpoint de registro
  // ...en setupEndpoints, dentro del endpoint de registro...
  // Antes de procesar el registro:
  //   if (this.blockedIps.has(req.ip)) {
  //     return res.status(403).json({ success: false, message: 'IP bloqueada por múltiples intentos fallidos' });
  //   }
  //   // ...si el registro falla por clave...
  //   this.failedAttempts[req.ip] = (this.failedAttempts[req.ip] || 0) + 1;
  //   if (this.failedAttempts[req.ip] > 5) {
  //     this.blockedIps.add(req.ip);
  //     log(`[SECURITY] IP ${req.ip} bloqueada por múltiples intentos de registro fallidos`, 'connector');
  //   }
  //   // ...si el registro es exitoso, resetear contador...
  //   this.failedAttempts[req.ip] = 0;
}