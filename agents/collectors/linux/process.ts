/**
 * Colector de procesos en Linux
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Collector } from '../index';

// Convertir exec a Promise
const execAsync = promisify(exec);

// Intervalo de sondeo para procesos
let processInterval: NodeJS.Timeout | null = null;

// Último estado de procesos para detectar cambios
let lastProcessState: Map<number, ProcessInfo> = new Map();

// Callback para procesar eventos
let processEventCallback: ((event: any) => void) | null = null;

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
      console.error('Error al detener colector de procesos:', error);
      return false;
    }
  }
};

/**
 * Recopila información de procesos en ejecución
 */
async function collectProcesses(): Promise<void> {
  try {
    // Ejecutar el comando ps para obtener información de procesos
    const { stdout } = await execAsync('ps -eo pid,ppid,uid,comm');
    
    // Analizar la salida
    const currentProcesses = new Map<number, ProcessInfo>();
    const lines = stdout.trim().split('\n');
    
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
    console.error('Error al recopilar información de procesos:', error);
  }
}

/**
 * Procesa un nuevo proceso detectado
 */
function processNewProcess(processInfo: ProcessInfo): void {
  // Crear evento para el nuevo proceso
  const event = {
    source: 'process',
    type: 'process_started',
    timestamp: new Date(),
    severity: 'info',
    message: `Nuevo proceso: ${processInfo.command} (PID: ${processInfo.pid})`,
    details: {
      pid: processInfo.pid,
      ppid: processInfo.ppid,
      uid: processInfo.uid,
      command: processInfo.command
    }
  };
  
  // Verificar si el proceso es sospechoso
  if (isSuspiciousProcess(processInfo)) {
    event.severity = 'medium';
    event.message = `Proceso sospechoso detectado: ${processInfo.command} (PID: ${processInfo.pid})`;
  }
  
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
    source: 'process',
    type: 'process_terminated',
    timestamp: new Date(),
    severity: 'info',
    message: `Proceso terminado: ${processInfo.command} (PID: ${processInfo.pid})`,
    details: {
      pid: processInfo.pid,
      ppid: processInfo.ppid,
      uid: processInfo.uid,
      command: processInfo.command
    }
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
export function registerEventCallback(callback: (event: any) => void) {
  processEventCallback = callback;
}