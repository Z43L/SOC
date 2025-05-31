/**
 * Clase base para implementaciones de agentes de SOC-Inteligente
 */

import { AgentConfig, loadConfig, saveConfig } from './agent-config';
import { AgentCommunication } from './communication';
import * as Monitoring from './monitoring';
import { initScanner, scanAll } from './scanner';
import { ScanResult } from './scanner/types';
import { logger } from './logger';

/**
 * Clase abstracta que implementa la funcionalidad común de todos los agentes
 */
export abstract class AgentBase {
  protected config: AgentConfig;
  protected communication: AgentCommunication;
  protected running: boolean = false;
  protected pendingEvents: Monitoring.AgentEvent[] = [];
  
  // Temporizadores para tareas programadas
  protected heartbeatTimer: NodeJS.Timeout | null = null;
  protected dataUploadTimer: NodeJS.Timeout | null = null;
  protected scanTimer: NodeJS.Timeout | null = null;
  
  /**
   * Constructor
   */
  constructor(configPath: string) {
    // Inicializar con configuración vacía hasta que se cargue
    this.config = {
      serverUrl: '',
      registrationKey: '',
      heartbeatInterval: 60,
      dataUploadInterval: 300,
      scanInterval: 3600,
      registrationEndpoint: '/api/agents/register',
      dataEndpoint: '/api/agents/data',
      heartbeatEndpoint: '/api/agents/heartbeat',
      signMessages: false,
      capabilities: {
        fileSystemMonitoring: false,
        processMonitoring: false,
        networkMonitoring: false,
        registryMonitoring: false,
        securityLogsMonitoring: false,
        malwareScanning: false,
        vulnerabilityScanning: false
      },
      configPath,
      logFilePath: './agent.log',
      maxStorageSize: 100,
      logLevel: 'info'
    };
    
    // Inicializar comunicación
    this.communication = new AgentCommunication(this.config);
  }
  
  /**
   * Inicializa el agente
   */
  async initialize(): Promise<boolean> {
    try {
      // Cargar configuración
      logger.info(`Loading configuration from ${this.config.configPath}`);
      this.config = await loadConfig(this.config.configPath);
      
      // Actualizar el objeto de comunicación con la nueva configuración
      this.communication = new AgentCommunication(this.config);
      
      // Registrar el agente si no tiene ID
      if (!this.config.agentId) {
        logger.info('Agent not registered, attempting registration...');
        
        // Obtener información del sistema
        const systemInfo = await this.getSystemInfo();
        
        // Convertir capacidades a array de strings
        const capabilities = Object.entries(this.config.capabilities)
          .filter(([_, enabled]) => enabled)
          .map(([capability]) => capability);
        
        // Registrar con el servidor
        const registration = await this.communication.registerAgent(
          systemInfo.hostname,
          systemInfo.ip,
          systemInfo.os,
          systemInfo.version,
          capabilities
        );
        
        if (!registration.success) {
          logger.error(`Registration failed: ${registration.message}`);
          return false;
        }
        
        logger.info(`Successfully registered with agent ID: ${registration.agentId}`);
        
        // Actualizar configuración con el ID recibido
        this.config.agentId = registration.agentId;
        
        // Actualizar endpoints si el servidor los proporciona
        if (registration.config?.endpoints) {
          if (registration.config.endpoints.data) {
            this.config.dataEndpoint = registration.config.endpoints.data;
          }
          
          if (registration.config.endpoints.heartbeat) {
            this.config.heartbeatEndpoint = registration.config.endpoints.heartbeat;
          }
        }
        
        // Actualizar intervalo de heartbeat si el servidor lo solicita
        if (registration.config?.heartbeatInterval) {
          this.config.heartbeatInterval = registration.config.heartbeatInterval;
        }
        
        // Guardar configuración actualizada
        await saveConfig(this.config);
      }
      
      logger.info('Agent initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing agent:', error);
      return false;
    }
  }
  
  /**
   * Inicia la ejecución del agente
   */
  async start(): Promise<boolean> {
    if (this.running) {
      logger.info('Agent is already running');
      return true;
    }
    
    try {
      logger.info('Starting agent...');
      
      // Reinicializar si es necesario
      if (!this.config.agentId) {
        const initialized = await this.initialize();
        if (!initialized) {
          logger.error('Could not initialize agent, aborting start');
          return false;
        }
      }
      
      // Iniciar monitoreo específico de la plataforma
      await this.startMonitoring();

      // Init scan engines
      await initScanner();

      // Programar tareas periódicas
      this.setupTimers();
      
      // Realizar escaneo inicial
      await this.performScan();
      
      // Marcar como en ejecución
      this.running = true;
      
      logger.info('Agent started successfully');
      return true;
    } catch (error) {
      logger.error('Error starting agent:', error);
      return false;
    }
  }
  
  /**
   * Detiene la ejecución del agente
   */
  async stop(): Promise<boolean> {
    if (!this.running) {
      logger.info('Agent is not running');
      return true;
    }
    
    try {
      logger.info('Stopping agent...');
      
      // Limpiar temporizadores
      this.clearTimers();
      
      // Detener monitoreo específico de la plataforma
      await this.stopMonitoring();
      
      // Enviar eventos pendientes antes de cerrar
      if (this.pendingEvents.length > 0) {
        await this.uploadEvents();
      }
      
      // Marcar como detenido
      this.running = false;
      
      logger.info('Agent stopped successfully');
      return true;
    } catch (error) {
      logger.error('Error stopping agent:', error);
      return false;
    }
  }
  
  /**
   * Configura temporizadores para tareas periódicas
   */
  private setupTimers(): void {
    // Limpiar temporizadores existentes
    this.clearTimers();
    
    // Programar heartbeat
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        logger.error('Error in heartbeat timer:', error);
      }
    }, this.config.heartbeatInterval * 1000);
    
    // Programar upload de eventos
    this.dataUploadTimer = setInterval(async () => {
      try {
        await this.uploadEvents();
      } catch (error) {
        logger.error('Error in data upload timer:', error);
      }
    }, this.config.dataUploadInterval * 1000);
    
    // Programar escaneo periódico
    this.scanTimer = setInterval(async () => {
      try {
        await this.performScan();
      } catch (error) {
        logger.error('Error in scan timer:', error);
      }
    }, this.config.scanInterval * 1000);
  }
  
  /**
   * Limpia temporizadores de tareas periódicas
   */
  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.dataUploadTimer) {
      clearInterval(this.dataUploadTimer);
      this.dataUploadTimer = null;
    }
    
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }
  
  /**
   * Encola un evento para su posterior envío al servidor
   */
  protected async queueEvent(event: Omit<Monitoring.AgentEvent, 'agentId' | 'signature'>): Promise<void> {
    this.pendingEvents.push({
      ...event,
      agentId: this.config.agentId || 'unregistered'
    });
    
    // Subir eventos si hay demasiados pendientes
    if (this.pendingEvents.length >= 100) {
      await this.uploadEvents();
    }
  }
  
  /**
   * Sube eventos pendientes al servidor
   */
  private async uploadEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }
    
    try {
      const events = [...this.pendingEvents];
      this.pendingEvents = [];
      
      logger.info(`Uploading ${events.length} events to server`);
      
      // Convertir a formato completo
      const formattedEvents = events.map(event => ({
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
        details: event.details,
        timestamp: event.timestamp
      }));
      
      // Enviar al servidor
      const result = await this.communication.sendEvents(formattedEvents);
      
      if (!result.success) {
        throw new Error(`Failed to upload events: ${result.message || 'Unknown error'}`);
      }
      
      logger.info(`Successfully uploaded ${events.length} events`);
    } catch (error) {
      logger.error('Error uploading events:', error);
      
      // Devolver eventos a la cola si falló
      this.pendingEvents = [...this.pendingEvents, ...this.pendingEvents];
      
      // Limitar el tamaño máximo de la cola para evitar desbordamiento de memoria
      if (this.pendingEvents.length > 1000) {
        logger.warn(`Event queue exceeds 1000 items, discarding oldest events`);
        this.pendingEvents = this.pendingEvents.slice(-1000);
      }
    }
  }
  
  /**
   * Envía heartbeat al servidor
   */
  async sendHeartbeat(): Promise<void> {
    try {
      if (!this.config.agentId) {
        return;
      }
      
      // Obtener métricas del sistema
      const metrics = await this.getSystemMetrics();
      
      // Determinar estado basado en métricas
      let status: 'active' | 'warning' | 'error' = 'active';
      
      // CPU, memoria o disco por encima del 90% es error
      if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90 || metrics.diskUsage > 90) {
        status = 'error';
      }
      // CPU, memoria o disco por encima del 80% es warning
      else if (metrics.cpuUsage > 80 || metrics.memoryUsage > 80 || metrics.diskUsage > 80) {
        status = 'warning';
      }
      
      // Enviar heartbeat
      const heartbeatResult = await this.communication.sendHeartbeat(status, {
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        diskUsage: metrics.diskUsage
      });
      
      if (!heartbeatResult.success) {
        throw new Error(`Failed to send heartbeat: ${heartbeatResult.message || 'Unknown error'}`);
      }
      
      // Actualizar configuración si es necesario
      if (heartbeatResult.config && Object.keys(heartbeatResult.config).length > 0) {
        // Aplicar cambios de configuración
        // En la implementación real, procesaríamos los cambios específicos
        logger.info('Received configuration update from server');
      }
      
      // Subir eventos pendientes aprovechando la conexión
      if (this.pendingEvents.length > 0) {
        await this.uploadEvents();
      }
    } catch (error) {
      logger.error('Error sending heartbeat:', error);
    }
  }
  
  /**
   * Realiza un escaneo completo del sistema
   */
  async performScan(): Promise<void> {
    try {
      logger.info('Performing system scan...');
      
      // Obtener información del sistema
      const metrics = await this.getSystemMetrics();
      const metricsEvent = Monitoring.createSystemMetricsEvent(metrics);
      await this.queueEvent(metricsEvent);
      
      // Realizar escaneos específicos
      if (this.config.capabilities.fileSystemMonitoring) {
        await this.scanFileSystem();
      }
      
      if (this.config.capabilities.processMonitoring) {
        await this.scanProcesses();
      }
      
      if (this.config.capabilities.networkMonitoring) {
        await this.scanNetworkConnections();
      }
      
      if (this.config.capabilities.registryMonitoring) {
        await this.scanRegistry();
      }
      
      logger.info('System scan completed');
    } catch (error) {
      logger.error('Error performing system scan:', error);
    }
  }
  
  // Métodos abstractos que deben implementar las clases específicas por plataforma
  
  /**
   * Obtiene información básica del sistema
   */
  protected abstract getSystemInfo(): Promise<{
    hostname: string;
    ip: string;
    os: string;
    version: string;
  }>;
  
  /**
   * Obtiene métricas del sistema en tiempo real
   */
  protected abstract getSystemMetrics(): Promise<Monitoring.SystemMetrics>;
  
  /**
   * Inicia los monitores específicos de la plataforma
   */
  protected abstract startMonitoring(): Promise<void>;
  
  /**
   * Detiene los monitores específicos de la plataforma
   */
  protected abstract stopMonitoring(): Promise<void>;
  
  /**
   * Realiza un escaneo del sistema de archivos
   */
  protected abstract scanFileSystem(): Promise<void>;
  
  /**
   * Realiza un escaneo de procesos en ejecución
   */
  protected abstract scanProcesses(): Promise<void>;
  
  /**
   * Realiza un escaneo de conexiones de red
   */
  protected abstract scanNetworkConnections(): Promise<void>;
  
  /**
   * Realiza un escaneo del registro (solo Windows)
   */
  protected abstract scanRegistry(): Promise<void>;
}