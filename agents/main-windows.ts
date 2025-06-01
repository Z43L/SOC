/**
 * Main agent entry point with enhanced Windows support
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from './core/logger';
import { 
  getWindowsSystemInfo, 
  getWindowsSystemMetrics, 
  startWindowsCollectors, 
  stopWindowsCollectors,
  performWindowsScans 
} from './windows-agent';

// Versión actual del agente
const AGENT_VERSION = '1.0.0';

/**
 * Clase principal del agente con soporte mejorado para Windows
 */
class EnhancedAgent {
  private logger: Logger;
  private platform: string;
  private configPath: string;
  private running: boolean = false;
  private events: any[] = [];
  private scanInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.platform = os.platform();
    
    // Inicializar logger
    this.logger = new Logger({
      level: 'info',
      enableConsole: true,
      filePath: this.getLogPath()
    });
  }

  /**
   * Obtiene la ruta del archivo de log según la plataforma
   */
  private getLogPath(): string {
    switch (this.platform) {
      case 'win32':
        return path.join(process.env.TEMP || 'C:\\temp', 'soc-agent.log');
      case 'darwin':
        return '/tmp/soc-agent.log';
      default: // linux
        return '/tmp/soc-agent.log';
    }
  }

  /**
   * Inicializa el agente
   */
  async initialize(): Promise<boolean> {
    try {
      this.logger.info(`Initializing SOC Agent v${AGENT_VERSION}`);
      this.logger.info(`Platform: ${this.platform}`);
      this.logger.info(`Architecture: ${os.arch()}`);
      this.logger.info(`Config path: ${this.configPath}`);

      // Verificar si el archivo de configuración existe
      try {
        await fs.access(this.configPath);
        this.logger.info('Configuration file found');
      } catch {
        this.logger.warn('Configuration file not found, using defaults');
      }

      // Obtener información específica del sistema
      if (this.platform === 'win32') {
        try {
          const systemInfo = await getWindowsSystemInfo();
          this.logger.info(`Windows system detected: ${systemInfo.os} ${systemInfo.version}`);
          this.logger.info(`Hostname: ${systemInfo.hostname}, IP: ${systemInfo.ip}`);
        } catch (error) {
          this.logger.error('Failed to get Windows system info:', error);
        }
      }

      this.logger.info('Agent initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize agent:', error);
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

      // Callback para manejar eventos de los colectores
      const handleEvent = (event: any) => {
        this.events.push({
          ...event,
          agentId: 'soc-agent-' + os.hostname(),
          agentVersion: AGENT_VERSION,
          hostId: os.hostname(),
          timestamp: event.timestamp || new Date()
        });

        // Mostrar evento en log
        this.logger.info(`Event: ${event.eventType} - ${event.severity} - ${event.message}`);

        // Limitar eventos en memoria
        if (this.events.length > 1000) {
          this.events = this.events.slice(-800);
        }
      };

      // Iniciar colectores específicos de la plataforma
      if (this.platform === 'win32') {
        this.logger.info('Starting Windows-specific collectors...');
        const windowsStarted = await startWindowsCollectors(this.logger, handleEvent);
        
        if (windowsStarted) {
          this.logger.info('Windows collectors started successfully');
        } else {
          this.logger.warn('Some Windows collectors failed to start');
        }
      } else {
        this.logger.info(`Platform ${this.platform} - using basic monitoring`);
      }

      // Configurar escaneos periódicos
      this.setupPeriodicTasks(handleEvent);

      // Realizar escaneo inicial
      await this.performInitialScan(handleEvent);

      this.running = true;
      this.logger.info('Agent started successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to start agent:', error);
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

      // Limpiar intervalos
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }

      // Detener colectores específicos de la plataforma
      if (this.platform === 'win32') {
        this.logger.info('Stopping Windows collectors...');
        await stopWindowsCollectors();
      }

      // Mostrar resumen de eventos
      this.logger.info(`Agent session summary: ${this.events.length} events collected`);

      this.running = false;
      this.logger.info('Agent stopped successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to stop agent:', error);
      return false;
    }
  }

  /**
   * Configura tareas periódicas
   */
  private setupPeriodicTasks(eventCallback: (event: any) => void): void {
    // Escaneos cada 5 minutos
    this.scanInterval = setInterval(() => {
      this.performPeriodicScans(eventCallback).catch(error => {
        this.logger.error('Error in periodic scans:', error);
      });
    }, 5 * 60 * 1000);

    // Métricas cada minuto
    this.metricsInterval = setInterval(() => {
      this.collectMetrics(eventCallback).catch(error => {
        this.logger.error('Error collecting metrics:', error);
      });
    }, 60 * 1000);

    this.logger.info('Periodic tasks configured');
  }

  /**
   * Realiza escaneo inicial
   */
  private async performInitialScan(eventCallback: (event: any) => void): Promise<void> {
    try {
      this.logger.info('Performing initial system scan...');

      if (this.platform === 'win32') {
        await performWindowsScans(eventCallback);
      } else {
        // Escaneo básico para otras plataformas
        eventCallback({
          eventType: 'system',
          severity: 'info',
          message: `Initial scan completed on ${this.platform}`,
          details: {
            platform: this.platform,
            scanType: 'initial_scan'
          }
        });
      }

      this.logger.info('Initial scan completed');
    } catch (error) {
      this.logger.error('Error in initial scan:', error);
    }
  }

  /**
   * Realiza escaneos periódicos
   */
  private async performPeriodicScans(eventCallback: (event: any) => void): Promise<void> {
    try {
      this.logger.info('Performing periodic scans...');

      if (this.platform === 'win32') {
        await performWindowsScans(eventCallback);
      }

      this.logger.info('Periodic scans completed');
    } catch (error) {
      this.logger.error('Error in periodic scans:', error);
    }
  }

  /**
   * Recopila métricas del sistema
   */
  private async collectMetrics(eventCallback: (event: any) => void): Promise<void> {
    try {
      let metrics;

      if (this.platform === 'win32') {
        metrics = await getWindowsSystemMetrics();
      } else {
        // Métricas básicas para otras plataformas
        metrics = {
          cpuUsage: 0,
          memoryUsage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
          diskUsage: 0,
          networkIn: 0,
          networkOut: 0,
          runningProcesses: 0,
          timestamp: new Date(),
          uptime: os.uptime()
        };
      }

      eventCallback({
        eventType: 'system',
        severity: 'info',
        message: `System metrics collected - CPU: ${metrics.cpuUsage}%, Memory: ${metrics.memoryUsage}%`,
        details: {
          metrics,
          platform: this.platform
        }
      });

    } catch (error) {
      this.logger.error('Error collecting metrics:', error);
    }
  }

  /**
   * Obtiene estadísticas del agente
   */
  getStats(): any {
    return {
      version: AGENT_VERSION,
      platform: this.platform,
      running: this.running,
      eventsCollected: this.events.length,
      uptime: this.running ? process.uptime() : 0,
      lastEventTime: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : null
    };
  }
}

/**
 * Función principal
 */
async function main() {
  // Determinar ruta de configuración
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  if (!configPath) {
    const platform = os.platform();
    const execDir = path.dirname(process.execPath);
    
    switch (platform) {
      case 'win32':
        configPath = path.join(execDir, 'agent.yaml');
        break;
      case 'darwin':
        configPath = path.join(execDir, 'agent.yaml');
        break;
      default: // linux
        configPath = path.join(execDir, 'agent.yaml');
    }
  }

  // Crear e inicializar el agente
  const agent = new EnhancedAgent(configPath);

  // Manejar señales para cierre ordenado
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, stopping agent...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, stopping agent...');
    await agent.stop();
    process.exit(0);
  });

  // Mostrar estadísticas periódicamente
  setInterval(() => {
    const stats = agent.getStats();
    console.log(`\n=== Agent Stats ===`);
    console.log(`Version: ${stats.version}`);
    console.log(`Platform: ${stats.platform}`);
    console.log(`Running: ${stats.running}`);
    console.log(`Events: ${stats.eventsCollected}`);
    console.log(`Uptime: ${Math.round(stats.uptime)} seconds`);
    console.log(`===================`);
  }, 30000); // Cada 30 segundos

  try {
    // Inicializar
    const initialized = await agent.initialize();
    if (!initialized) {
      console.error('Failed to initialize agent');
      process.exit(1);
    }

    // Iniciar
    const started = await agent.start();
    if (!started) {
      console.error('Failed to start agent');
      process.exit(1);
    }

    // Mantener proceso activo
    console.log('SOC Agent running. Press Ctrl+C to stop.');
    console.log(`Version: ${AGENT_VERSION}`);
    console.log(`Platform: ${os.platform()}`);
    console.log(`PID: ${process.pid}`);
    
  } catch (error) {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
}

// Ejecutar función principal
main();