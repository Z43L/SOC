/**
 * Colector de Procesos para Windows
 */

import { Collector, CollectorConfig, ProcessInfo, AgentEvent } from '../types';
import { Logger } from '../../core/logger';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

// Callback para procesar eventos
let eventCallback: ((event: Omit<AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

// Intervalo de monitoreo
let monitoringInterval: NodeJS.Timeout | null = null;

// Cache de procesos para detectar cambios
let processCache = new Map<number, ProcessInfo>();

// Procesos sospechosos conocidos
const SUSPICIOUS_PROCESSES = new Set([
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'wscript.exe',
  'cscript.exe',
  'regsvr32.exe',
  'rundll32.exe',
  'mshta.exe',
  'certutil.exe',
  'bitsadmin.exe',
  'schtasks.exe',
  'at.exe',
  'sc.exe',
  'reg.exe',
  'wmic.exe',
  'taskkill.exe',
  'net.exe',
  'netsh.exe'
]);

export const processCollector: Collector = {
  name: 'windows-process',
  description: 'Monitorea procesos en ejecución en Windows utilizando WMI y tasklist',
  compatibleSystems: ['win32'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    eventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo de procesos
   */
  async start(): Promise<boolean> {
    try {
      if (logger) {
        logger.info('Iniciando colector de procesos para Windows...');
      }
      
      // Verificar que estamos en Windows
      if (process.platform !== 'win32') {
        if (logger) {
          logger.error('El colector de procesos de Windows solo funciona en sistemas Windows');
        }
        return false;
      }
      
      // Realizar escaneo inicial
      await scanProcesses();
      
      // Configurar monitoreo periódico cada 30 segundos
      monitoringInterval = setInterval(() => {
        scanProcesses().catch(error => {
          if (logger) {
            logger.error('Error en escaneo de procesos periódico:', error);
          }
        });
      }, 30000);
      
      if (logger) {
        logger.info('Colector de procesos iniciado correctamente');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al iniciar colector de procesos:', error);
      }
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo de procesos
   */
  async stop(): Promise<boolean> {
    try {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
      
      // Limpiar cache
      processCache.clear();
      
      if (logger) {
        logger.info('Colector de procesos detenido');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al detener colector de procesos:', error);
      }
      return false;
    }
  }
};

/**
 * Escanea procesos en ejecución
 */
async function scanProcesses(): Promise<void> {
  try {
    // Obtener lista de procesos usando tasklist
    const processes = await getRunningProcesses();
    
    // Detectar nuevos procesos y procesos terminados
    const currentPids = new Set(processes.map(p => p.pid));
    const cachedPids = new Set(processCache.keys());
    
    // Procesos nuevos
    const newPids = new Set([...currentPids].filter(pid => !cachedPids.has(pid)));
    
    // Procesos terminados
    const terminatedPids = new Set([...cachedPids].filter(pid => !currentPids.has(pid)));
    
    // Procesar nuevos procesos
    for (const pid of newPids) {
      const process = processes.find(p => p.pid === pid);
      if (process) {
        processCache.set(pid, process);
        await analyzeNewProcess(process);
      }
    }
    
    // Procesar procesos terminados
    for (const pid of terminatedPids) {
      const process = processCache.get(pid);
      if (process) {
        processCache.delete(pid);
        await reportProcessTermination(process);
      }
    }
    
    // Actualizar cache con procesos actuales
    for (const process of processes) {
      processCache.set(process.pid, process);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error escaneando procesos:', error);
    }
  }
}

/**
 * Obtiene lista de procesos en ejecución usando tasklist
 */
async function getRunningProcesses(): Promise<ProcessInfo[]> {
  try {
    // Usar tasklist con formato CSV para mejor parsing
    const { stdout } = await exec('tasklist /fo csv /v');
    
    const lines = stdout.split('\n').slice(1); // Omitir header
    const processes: ProcessInfo[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        // Parse CSV line (simplificado)
        const columns = line.split('","').map(col => col.replace(/^"|"$/g, ''));
        
        if (columns.length >= 8) {
          const process: ProcessInfo = {
            pid: parseInt(columns[1]) || 0,
            name: columns[0] || 'Unknown',
            status: columns[7] || 'Running',
            cpuUsage: 0, // tasklist no proporciona CPU en tiempo real
            memoryUsage: parseMemoryUsage(columns[4]) || 0,
            startTime: new Date(), // Aproximado
            user: columns[6] || 'Unknown',
            path: columns[0] // tasklist no proporciona path completo
          };
          
          if (process.pid > 0) {
            processes.push(process);
          }
        }
      } catch (parseError) {
        // Ignorar líneas que no se puedan parsear
        continue;
      }
    }
    
    return processes;
  } catch (error) {
    if (logger) {
      logger.error('Error obteniendo lista de procesos:', error);
    }
    return [];
  }
}

/**
 * Parsea uso de memoria desde string de tasklist
 */
function parseMemoryUsage(memStr: string): number {
  try {
    if (!memStr) return 0;
    
    // Remover comas y "K" al final
    const cleanStr = memStr.replace(/[,K]/g, '');
    const memKB = parseInt(cleanStr) || 0;
    
    // Convertir a MB
    return Math.round(memKB / 1024);
  } catch {
    return 0;
  }
}

/**
 * Analiza un nuevo proceso para detectar actividad sospechosa
 */
async function analyzeNewProcess(process: ProcessInfo): Promise<void> {
  try {
    let suspicious = false;
    let reason = '';
    
    // Verificar si es un proceso sospechoso conocido
    const processName = process.name.toLowerCase();
    if (SUSPICIOUS_PROCESSES.has(processName)) {
      suspicious = true;
      reason = `Proceso potencialmente sospechoso: ${process.name}`;
    }
    
    // Verificar procesos con uso alto de memoria
    if (process.memoryUsage > 1000) { // > 1GB
      suspicious = true;
      reason = `Proceso con uso alto de memoria: ${process.memoryUsage}MB`;
    }
    
    // Verificar procesos ejecutándose desde ubicaciones sospechosas
    if (process.path) {
      const suspiciousPaths = [
        '\\temp\\',
        '\\tmp\\',
        '\\appdata\\local\\temp\\',
        '\\windows\\temp\\',
        '\\users\\public\\'
      ];
      
      for (const suspiciousPath of suspiciousPaths) {
        if (process.path.toLowerCase().includes(suspiciousPath)) {
          suspicious = true;
          reason = `Proceso ejecutándose desde ubicación sospechosa: ${process.path}`;
          break;
        }
      }
    }
    
    // Reportar nuevo proceso (siempre) y marcar si es sospechoso
    const severity: 'info' | 'low' | 'medium' | 'high' | 'critical' = suspicious ? 'medium' : 'info';
    
    const event = {
      eventType: 'process' as const,
      severity,
      timestamp: new Date(),
      message: suspicious ? reason : `Nuevo proceso iniciado: ${process.name} (PID: ${process.pid})`,
      details: {
        process,
        reason: suspicious ? reason : undefined
      }
    };
    
    if (eventCallback) {
      eventCallback(event);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error analizando nuevo proceso:', error);
    }
  }
}

/**
 * Reporta la terminación de un proceso
 */
async function reportProcessTermination(process: ProcessInfo): Promise<void> {
  try {
    const event = {
      eventType: 'process' as const,
      severity: 'info' as const,
      timestamp: new Date(),
      message: `Proceso terminado: ${process.name} (PID: ${process.pid})`,
      details: {
        process,
        reason: 'Process terminated'
      }
    };
    
    if (eventCallback) {
      eventCallback(event);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error reportando terminación de proceso:', error);
    }
  }
}