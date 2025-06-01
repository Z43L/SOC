/**
 * Colector de procesos en Linux
 */

import { spawn } from 'child_process';
import { Collector, CollectorConfig, ProcessEventDetails } from '../types';
import { Logger } from '../../core/logger';

// Intervalo de sondeo para procesos
let processInterval: NodeJS.Timeout | null = null;

// Último estado de procesos para detectar cambios
let lastProcessState: Map<number, ProcessInfo> = new Map();

// Callback para procesar eventos
let processEventCallback: ((event: any) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

// Intervalo de sondeo en milisegundos (default: 60 segundos)
const POLL_INTERVAL = 60 * 1000;

// Interfaz para información del proceso
interface ProcessInfo {
  pid: number;
  ppid: number;
  uid: number;
  command: string;
  startTime?: Date;
}

/**
 * Colector de procesos para Linux
 */
export const processCollector: Collector = {
  name: 'process',
  description: 'Monitorea procesos en ejecución en sistemas Linux',
  compatibleSystems: ['linux'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    processEventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo de procesos
   */
  async start(): Promise<boolean> {
    try {
      // Inicializar estado actual
      await collectProcesses();
      
      // Configurar monitoreo periódico
      processInterval = setInterval(async () => {
        await collectProcesses();
      }, POLL_INTERVAL);
      
      console.log('Colector de procesos iniciado');
      return true;
    } catch (error) {
      console.error('Error al iniciar colector de procesos:', error);
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo de procesos
   */
  async stop(): Promise<boolean> {
    try {
      if (processInterval) {
        clearInterval(processInterval);
        processInterval = null;
        console.log('Colector de procesos detenido');
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
 * Obtiene la lista de procesos de forma no bloqueante usando spawn
 */
function getProcessListAsync(): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('ps', ['-eo', 'pid,ppid,uid,comm']);
    let stdout = '';
    let stderr = '';
    
    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ps.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ps command failed with code ${code}: ${stderr}`));
      }
    });
    
    ps.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Recopila información de procesos en ejecución usando spawn (no bloqueante)
 */
async function collectProcesses(): Promise<void> {
  try {
    const processData = await getProcessListAsync();
    
    // Analizar la salida
    const currentProcesses = new Map<number, ProcessInfo>();
    const lines = processData.trim().split('\n');
    
    // Procesar cada línea (saltar la primera línea que es el encabezado)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      const parts = line.split(/\s+/);
      
      // Asegurarse de tener suficientes partes
      if (parts.length >= 4) {
        const pid = parseInt(parts[0]);
        const ppid = parseInt(parts[1]);
        const uid = parseInt(parts[2]);
        const command = parts.slice(3).join(' ');
        
        // Crear objeto de información del proceso
        const processInfo: ProcessInfo = { pid, ppid, uid, command };
        
        // Almacenar en el mapa actual
        currentProcesses.set(pid, processInfo);
        
        // Verificar si es un proceso nuevo
        if (!lastProcessState.has(pid)) {
          // Proceso nuevo detectado
          processNewProcess(processInfo);
        }
      }
    }
    
    // Detectar procesos terminados
    for (const [pid, processInfo] of lastProcessState.entries()) {
      if (!currentProcesses.has(pid)) {
        // Proceso terminado
        processTerminatedProcess(processInfo);
      }
    }
    
    // Actualizar estado para la próxima ejecución
    lastProcessState = currentProcesses;
  } catch (error) {
    if (logger) {
      logger.error('Error al recopilar información de procesos:', error);
    }
  }
}

/**
 * Procesa un nuevo proceso detectado
 */
function processNewProcess(processInfo: ProcessInfo): void {
  // Crear evento para el nuevo proceso
  let severity: 'info' | 'medium' = 'info';
  let message = `Nuevo proceso: ${processInfo.command} (PID: ${processInfo.pid})`;
  
  // Verificar si el proceso es sospechoso
  if (isSuspiciousProcess(processInfo)) {
    severity = 'medium';
    message = `Proceso sospechoso detectado: ${processInfo.command} (PID: ${processInfo.pid})`;
  }
  
  const event = {
    eventType: 'process' as const,
    severity,
    timestamp: new Date(),
    message,
    details: {
      process: processInfo,
      reason: 'New process detected'
    } as ProcessEventDetails
  };
  
  // Enviar evento
  if (processEventCallback) {
    processEventCallback(event);
  }
}

/**
 * Procesa un proceso terminado
 */
function processTerminatedProcess(processInfo: ProcessInfo): void {
  // Crear evento para el proceso terminado
  const event = {
    eventType: 'process' as const,
    severity: 'info' as const,
    timestamp: new Date(),
    message: `Proceso terminado: ${processInfo.command} (PID: ${processInfo.pid})`,
    details: {
      process: processInfo,
      reason: 'Process terminated'
    } as ProcessEventDetails
  };
  
  // Enviar evento
  if (processEventCallback) {
    processEventCallback(event);
  }
}

/**
 * Verifica si un proceso es potencialmente sospechoso
 */
function isSuspiciousProcess(processInfo: ProcessInfo): boolean {
  // Lista de comandos sospechosos
  const suspiciousCommands = [
    'nc', 'netcat', 'ncat', 'nmap', 'wireshark', 'tcpdump',
    'metasploit', 'msfconsole', 'msfvenom', 'mimikatz',
    'hydra', 'john', 'hashcat', 'responder'
  ];
  
  // Verificar si el comando coincide con alguno de los sospechosos
  for (const cmd of suspiciousCommands) {
    if (processInfo.command.includes(cmd)) {
      return true;
    }
  }
  
  // Verificar si es un proceso con UID 0 (root) pero un nombre sospechoso
  if (processInfo.uid === 0) {
    // Procesos que no deberían ejecutarse como root normalmente
    const unusualRootCommands = [
      'bash', 'sh', 'zsh', 'python', 'perl', 'ruby', 'wget',
      'curl', 'base64', 'gcc', 'cc'
    ];
    
    for (const cmd of unusualRootCommands) {
      if (processInfo.command === cmd) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: Omit<import('../types').AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void) {
  processEventCallback = callback;
}