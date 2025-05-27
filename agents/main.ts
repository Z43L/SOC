/**
 * Punto de entrada principal para el agente SOC
 */

import * as os from 'os';
import * as path from 'path';
import {
  loadConfig,
  AgentConfig,
  EventQueue,
  Transport,
  Logger,
  MetricsCollector,
  HeartbeatManager,
  AgentEvent
} from './core';
import { loadEnabledCollectors, startCollectors, stopCollectors } from './collectors';
import { CommandExecutor } from './commands';
import { Updater } from './updater';

// Versión actual del agente
const AGENT_VERSION = '1.0.0';

/**
 * Clase principal del agente
 */
class Agent {
  private config: AgentConfig;
  private logger: Logger;
  private transport: Transport;
  private eventQueue: EventQueue;
  private metricsCollector: MetricsCollector;
  private heartbeatManager: HeartbeatManager;
  private commandExecutor: CommandExecutor;
  private updater: Updater | null = null;
  
  private collectors: any[] = [];
  private running: boolean = false;
  private uploadTimer: NodeJS.Timeout | null = null;
  
  /**
   * Constructor
   */
  constructor(configPath: string) {
    // Inicializar con valores temporales hasta cargar configuración
    this.config = {} as AgentConfig;
    this.logger = new Logger({ level: 'info', enableConsole: true });
    this.transport = {} as Transport;
    this.eventQueue = {} as EventQueue;
    this.metricsCollector = {} as MetricsCollector;
    this.heartbeatManager = {} as HeartbeatManager;
    this.commandExecutor = {} as CommandExecutor;
    
    // Guardar ruta de configuración para inicialización
    this.config = { configPath } as AgentConfig;
  }
  
  /**
   * Inicializa el agente
   */
  async initialize(): Promise<boolean> {
    try {
      // Cargar configuración
      this.logger.info('Initializing agent...');
      this.logger.info(`Platform: ${os.platform()}, Architecture: ${os.arch()}`);
      this.logger.info(`Loading configuration from ${this.config.configPath}`);
      
      this.config = await loadConfig(this.config.configPath);
      
      // Inicializar logger con configuración actualizada
      this.logger = new Logger({
        level: this.config.logLevel,
        filePath: this.config.logFilePath,
        enableConsole: true,
        maxSizeBytes: this.config.maxStorageSize * 1024 * 1024
      });
      
      this.logger.info('Configuration loaded successfully');
      
      // Inicializar cola de eventos
      this.eventQueue = new EventQueue({
        maxSize: this.config.queueSize,
        persistPath: this.config.queuePersistPath
      });
      
      await this.eventQueue.initialize();
      this.logger.info('Event queue initialized');
      
      // Inicializar colector de métricas
      this.metricsCollector = new MetricsCollector({
        enableEndpoint: true,
        port: 9090
      });
      
      await this.metricsCollector.start();
      this.logger.info('Metrics collector started');
      
      // Inicializar transporte
      this.transport = new Transport({
        serverUrl: this.config.serverUrl,
        token: this.config.agentId,
        enableCompression: this.config.compressionEnabled
      });
      
      // Inicializar heartbeat manager
      this.heartbeatManager = new HeartbeatManager(
        {
          interval: this.config.heartbeatInterval,
          endpoint: this.config.heartbeatEndpoint,
          agentId: this.config.agentId || 'unregistered'
        },
        this.transport,
        this.metricsCollector
      );
      
      // Inicializar ejecutor de comandos
      this.commandExecutor = new CommandExecutor({
        allowedCommands: this.config.enableCommands ? 
          (this.config.allowedCommands || ['script', 'configUpdate', 'isolate', 'upgrade']) : 
          []
      });
      
      // Registrar manejadores de comandos
      this.registerCommandHandlers();
      
      // Inicializar actualizador si estamos registrados
      if (this.config.agentId) {
        this.initializeUpdater();
      }
      
      // Registro inicial si es necesario
      if (!this.config.agentId) {
        await this.registerAgent();
      }
      
      this.logger.info('Agent initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Error initializing agent: %s', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  
  /**
   * Inicia el agente
   */
  async start(): Promise<boolean> {
    if (this.running) {
      this.logger.warn('Agent is already running');
      return true;
    }
    
    try {
      this.logger.info('Starting agent...');
      
      // Cargar y iniciar colectores
      const enabledCollectors = Object.entries(this.config.capabilities)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);
      
      this.collectors = await loadEnabledCollectors(enabledCollectors, this.logger);
      
      // Configurar callback para eventos
      this.configureEventCallbacks();
      
      // Iniciar colectores
      await startCollectors(this.collectors, this.logger);
      
      // Iniciar heartbeats
      this.heartbeatManager.start();
      
      // Iniciar temporizador de subida de eventos
      this.setupEventUploader();
      
      // Iniciar conexión WebSocket si está configurada
      if (this.config.transport === 'websocket') {
        await this.transport.connectWebsocket();
      }
      
      this.running = true;
      this.logger.info('Agent started successfully');
      
      return true;
    } catch (error) {
      this.logger.error('Error starting agent: %s', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  
  /**
   * Detiene el agente
   */
  async stop(): Promise<boolean> {
    if (!this.running) {
      this.logger.warn('Agent is not running');
      return true;
    }
    
    try {
      this.logger.info('Stopping agent...');
      
      // Detener temporizador de subida de eventos
      if (this.uploadTimer) {
        clearInterval(this.uploadTimer);
        this.uploadTimer = null;
      }
      
      // Detener heartbeats
      this.heartbeatManager.stop();
      
      // Detener colectores
      await stopCollectors(this.collectors, this.logger);
      
      // Cerrar conexión WebSocket
      await this.transport.close();
      
      // Subir eventos pendientes
      await this.uploadEvents();
      
      // Cerrar cola de eventos
      await this.eventQueue.close();
      
      // Detener colector de métricas
      await this.metricsCollector.stop();
      
      this.running = false;
      this.logger.info('Agent stopped successfully');
      
      return true;
    } catch (error) {
      this.logger.error('Error stopping agent: %s', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  
  /**
   * Registra el agente con el servidor
   */
  private async registerAgent(): Promise<boolean> {
    try {
      this.logger.info('Registering agent with organization key...');
      
      // Obtener información del sistema
      const hostname = os.hostname();
      const platform = os.platform();
      const arch = os.arch();
      
      // Enviar solicitud de registro
      const response = await this.transport.request({
        endpoint: this.config.registrationEndpoint,
        method: 'POST',
        data: {
          hostname,
          os: platform,
          arch,
          organizationKey: this.config.organizationKey,
          version: AGENT_VERSION
        }
      });
      
      if (!response.success) {
        throw new Error(`Registration failed: ${response.error || 'Unknown error'}`);
      }
      
      // Guardar ID de agente y token
      this.config.agentId = response.data.agentId;
      
      // Actualizar transporte con el nuevo token
      this.transport = new Transport({
        serverUrl: this.config.serverUrl,
        token: response.data.jwtAgent,
        serverCA: response.data.serverRootCA,
        enableCompression: this.config.compressionEnabled
      });
      
      // Actualizar heartbeat manager con el nuevo ID
      this.heartbeatManager = new HeartbeatManager(
        {
          interval: this.config.heartbeatInterval,
          endpoint: this.config.heartbeatEndpoint,
          agentId: this.config.agentId
        },
        this.transport,
        this.metricsCollector
      );
      
      // Inicializar actualizador ahora que estamos registrados
      this.initializeUpdater();
      
      // Guardar configuración actualizada
      await loadConfig(this.config.configPath);
      
      this.logger.info(`Agent registered successfully with ID: ${this.config.agentId}`);
      return true;
    } catch (error) {
      this.logger.error('Registration failed: %s', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  
  /**
   * Configura callbacks para eventos de colectores
   */
  private configureEventCallbacks(): void {
    // Método para manejar eventos desde colectores
    const handleEvent = async (event: Omit<AgentEvent, 'agentId'>) => {
      const fullEvent: AgentEvent = {
        ...event,
        agentId: this.config.agentId || 'unregistered',
        agentVersion: AGENT_VERSION,
        hostId: os.hostname()
      };
      
      await this.eventQueue.push(fullEvent);
      this.metricsCollector.incrementCounter('soc_agent_events_total', 1, { type: fullEvent.eventType });
    };
    
    // Configurar callback en cada colector
    for (const collector of this.collectors) {
      if (typeof collector.configure === 'function') {
        collector.configure({ eventCallback: handleEvent });
      }
    }
  }
  
  /**
   * Configura temporizador para subida de eventos
   */
  private setupEventUploader(): void {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
    }
    
    this.uploadTimer = setInterval(() => {
      this.uploadEvents().catch(error => {
        this.logger.error('Error uploading events: %s', error instanceof Error ? error.message : String(error));
      });
    }, this.config.dataUploadInterval * 1000);
  }
  
  /**
   * Sube eventos pendientes al servidor
   */
  private async uploadEvents(): Promise<void> {
    // Verificar si hay eventos
    const isEmpty = await this.eventQueue.isEmpty();
    if (isEmpty) {
      return;
    }
    
    try {
      // Obtener eventos (hasta 100 por vez)
      const events = await this.eventQueue.pop(100);
      
      if (events.length === 0) {
        return;
      }
      
      this.logger.info(`Uploading ${events.length} events to server`);
      
      // Enviar eventos
      const response = await this.transport.request({
        endpoint: this.config.dataEndpoint,
        method: 'POST',
        data: { events }
      });
      
      if (!response.success) {
        throw new Error(`Failed to upload events: ${response.error || 'Unknown error'}`);
      }
      
      // Actualizar métrica de cola
      const queueSize = await this.eventQueue.size();
      this.metricsCollector.updateQueueSize(queueSize);
      
      this.logger.info(`Successfully uploaded ${events.length} events`);
    } catch (error) {
      this.logger.error('Error uploading events: %s', error instanceof Error ? error.message : String(error));
      this.metricsCollector.incrementCounter('soc_agent_failed_push_total');
      
      // Añadir error al próximo heartbeat
      this.heartbeatManager.setLastError(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Inicializa el actualizador
   */
  private initializeUpdater(): void {
    this.updater = new Updater({
      serverUrl: this.config.serverUrl,
      currentVersion: AGENT_VERSION,
      binaryPath: process.execPath,
      updateEndpoint: '/api/agents/latest'
    });
  }
  
  /**
   * Registra manejadores de comandos
   */
  private registerCommandHandlers(): void {
    // Comando de script
    this.transport.registerCommandHandler('script', async (data) => {
      return this.commandExecutor.executeScript({
        script: data.script,
        args: data.args,
        interpreter: data.interpreter
      });
    });
    
    // Comando de actualización de configuración
    this.transport.registerCommandHandler('configUpdate', async (data) => {
      return this.commandExecutor.executeConfigUpdate({
        configPath: this.config.configPath,
        configData: data.config
      });
    });
    
    // Comando de aislamiento
    this.transport.registerCommandHandler('isolate', async (data) => {
      return this.commandExecutor.executeIsolate({
        enable: data.enable,
        allowOutbound: data.allowOutbound,
        allowInbound: data.allowInbound,
        allowLocalOnly: data.allowLocalOnly
      });
    });
    
    // Comando de actualización
    this.transport.registerCommandHandler('upgrade', async (data) => {
      if (!this.updater) {
        return {
          stdout: '',
          stderr: 'Updater not initialized',
          exitCode: 1,
          durationMs: 0
        };
      }
      
      try {
        const updateInfo = await this.updater.checkForUpdate();
        
        if (!updateInfo.hasUpdate && !data.force) {
          return {
            stdout: 'No updates available',
            stderr: '',
            exitCode: 0,
            durationMs: 0
          };
        }
        
        if (!updateInfo.downloadUrl || !updateInfo.checksum) {
          return {
            stdout: '',
            stderr: 'Invalid update information received',
            exitCode: 1,
            durationMs: 0
          };
        }
        
        const newBinaryPath = await this.updater.downloadUpdate(
          updateInfo.downloadUrl,
          updateInfo.checksum
        );
        
        const success = await this.updater.performUpdate(newBinaryPath);
        
        if (success) {
          return {
            stdout: `Update to version ${updateInfo.latestVersion} successful`,
            stderr: '',
            exitCode: 0,
            durationMs: 0
          };
        } else {
          return {
            stdout: '',
            stderr: 'Update failed',
            exitCode: 1,
            durationMs: 0
          };
        }
      } catch (error) {
        return {
          stdout: '',
          stderr: `Update error: ${error instanceof Error ? error.message : String(error)}`,
          exitCode: 1,
          durationMs: 0
        };
      }
    });
  }
}

/**
 * Función principal
 */
async function main() {
  // Determinar ruta de configuración
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  // Si no se especificó, usar ruta por defecto según plataforma
  if (!configPath) {
    const platform = os.platform();
    
    switch (platform) {
      case 'win32':
        configPath = path.join(process.env.ProgramData || 'C:\\ProgramData', 'SOC-Agent', 'agent.yaml');
        break;
      case 'darwin':
        configPath = '/etc/soc-agent/agent.yaml';
        break;
      default: // linux y otros
        configPath = '/etc/soc-agent/agent.yaml';
    }
  }
  
  // Crear e inicializar el agente
  const agent = new Agent(configPath);
  
  // Manejar señales para cierre ordenado
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, stopping agent...');
    await agent.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, stopping agent...');
    await agent.stop();
    process.exit(0);
  });
  
  // Inicializar y arrancar
  const initialized = await agent.initialize();
  
  if (!initialized) {
    console.error('Failed to initialize agent');
    process.exit(1);
  }
  
  const started = await agent.start();
  
  if (!started) {
    console.error('Failed to start agent');
    process.exit(1);
  }
  
  // Mantener proceso activo
  console.log('Agent running. Press Ctrl+C to stop.');
}

// Ejecutar función principal
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});