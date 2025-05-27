/**
 * Colector de conexiones de red para Linux
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Collector } from '../index';

// Convertir exec a Promise
const execAsync = promisify(exec);

// Intervalo de sondeo para conexiones de red
let networkInterval: NodeJS.Timeout | null = null;

// Último estado de conexiones para detectar cambios
let lastNetworkState: Map<string, NetworkConnection> = new Map();

// Callback para procesar eventos
let networkEventCallback: ((event: any) => void) | null = null;

// Intervalo de sondeo en milisegundos (default: 60 segundos)
const POLL_INTERVAL = 60 * 1000;

// Interfaz para información de la conexión de red
interface NetworkConnection {
  protocol: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  pid?: number;
  processName?: string;
}

/**
 * Colector de conexiones de red para Linux
 */
export const networkCollector: Collector = {
  name: 'network',
  description: 'Monitorea conexiones de red en sistemas Linux usando ss',
  
  /**
   * Inicia el monitoreo de red
   */
  async start(): Promise<boolean> {
    try {
      // Inicializar estado actual
      await collectNetworkConnections();
      
      // Configurar monitoreo periódico
      networkInterval = setInterval(async () => {
        await collectNetworkConnections();
      }, POLL_INTERVAL);
      
      console.log('Colector de red iniciado');
      return true;
    } catch (error) {
      console.error('Error al iniciar colector de red:', error);
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo de red
   */
  async stop(): Promise<boolean> {
    try {
      if (networkInterval) {
        clearInterval(networkInterval);
        networkInterval = null;
        console.log('Colector de red detenido');
      }
      return true;
    } catch (error) {
      console.error('Error al detener colector de red:', error);
      return false;
    }
  }
};

/**
 * Recopila información de conexiones de red
 */
async function collectNetworkConnections(): Promise<void> {
  try {
    let output: string;
    
    // Intentar usar ss primero (más moderno y rápido)
    try {
      const { stdout } = await execAsync('ss -tunap');
      output = stdout;
    } catch (error) {
      // Si ss falla, usar netstat como alternativa
      console.log('ss no disponible, usando netstat como alternativa');
      const { stdout } = await execAsync('netstat -tunap');
      output = stdout;
    }
    
    // Analizar la salida
    const currentConnections = new Map<string, NetworkConnection>();
    const lines = output.trim().split('\n');
    
    // Determinar si estamos usando ss o netstat basado en el encabezado
    const isSS = lines[0].includes('Netid') || lines[0].includes('State');
    
    // Procesar cada línea (saltar la primera línea que es el encabezado)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      let connection: NetworkConnection | null = null;
      
      if (isSS) {
        connection = parseSsLine(line);
      } else {
        connection = parseNetstatLine(line);
      }
      
      if (connection) {
        // Crear clave única para esta conexión
        const key = `${connection.protocol}-${connection.localAddress}:${connection.localPort}-${connection.remoteAddress}:${connection.remotePort}`;
        
        // Almacenar en el mapa actual
        currentConnections.set(key, connection);
        
        // Verificar si es una conexión nueva
        if (!lastNetworkState.has(key)) {
          // Conexión nueva detectada
          processNewConnection(connection);
        }
      }
    }
    
    // Detectar conexiones cerradas
    for (const [key, connection] of lastNetworkState.entries()) {
      if (!currentConnections.has(key)) {
        // Conexión cerrada
        processClosedConnection(connection);
      }
    }
    
    // Actualizar estado para la próxima ejecución
    lastNetworkState = currentConnections;
  } catch (error) {
    console.error('Error al recopilar información de conexiones de red:', error);
  }
}

/**
 * Procesa una nueva conexión detectada
 */
function processNewConnection(connection: NetworkConnection): void {
  // Crear evento para la nueva conexión
  const event = {
    source: 'network',
    type: 'connection_established',
    timestamp: new Date(),
    severity: 'info',
    message: `Nueva conexión: ${connection.protocol} ${connection.localAddress}:${connection.localPort} -> ${connection.remoteAddress}:${connection.remotePort} (${connection.state})`,
    details: {
      protocol: connection.protocol,
      localAddress: connection.localAddress,
      localPort: connection.localPort,
      remoteAddress: connection.remoteAddress,
      remotePort: connection.remotePort,
      state: connection.state,
      pid: connection.pid,
      processName: connection.processName
    }
  };
  
  // Verificar si la conexión es sospechosa
  if (isSuspiciousConnection(connection)) {
    event.severity = 'medium';
    event.message = `Conexión de red sospechosa: ${connection.protocol} ${connection.localAddress}:${connection.localPort} -> ${connection.remoteAddress}:${connection.remotePort}`;
  }
  
  // Enviar evento
  if (networkEventCallback) {
    networkEventCallback(event);
  }
}

/**
 * Procesa una conexión cerrada
 */
function processClosedConnection(connection: NetworkConnection): void {
  // Crear evento para la conexión cerrada
  const event = {
    source: 'network',
    type: 'connection_closed',
    timestamp: new Date(),
    severity: 'info',
    message: `Conexión cerrada: ${connection.protocol} ${connection.localAddress}:${connection.localPort} -> ${connection.remoteAddress}:${connection.remotePort}`,
    details: {
      protocol: connection.protocol,
      localAddress: connection.localAddress,
      localPort: connection.localPort,
      remoteAddress: connection.remoteAddress,
      remotePort: connection.remotePort,
      state: connection.state,
      pid: connection.pid,
      processName: connection.processName
    }
  };
  
  // Enviar evento
  if (networkEventCallback) {
    networkEventCallback(event);
  }
}

/**
 * Verifica si una conexión es potencialmente sospechosa
 */
function isSuspiciousConnection(connection: NetworkConnection): boolean {
  // Lista de puertos sospechosos
  const suspiciousPorts = [
    4444, 5555, 6666, 31337, 12345, 54321, // Puertos asociados con backdoors y troyanos
    8080, 8888, 9999                        // Puertos HTTP alternativos a menudo usados para C&C
  ];
  
  // Verificar puertos sospechosos
  if (suspiciousPorts.includes(connection.remotePort)) {
    return true;
  }
  
  // Verificar conexiones a puertos privilegiados desde procesos no privilegiados
  if (connection.remotePort < 1024 && connection.processName) {
    const suspiciousProcesses = [
      'bash', 'sh', 'python', 'perl', 'ruby', 'nc', 'netcat'
    ];
    
    for (const proc of suspiciousProcesses) {
      if (connection.processName.includes(proc)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Parsea una línea de la salida del comando ss
 */
function parseSsLine(line: string): NetworkConnection | null {
  // Formato aproximado:
  // Netid  State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
  
  const parts = line.trim().split(/\s+/);
  
  if (parts.length < 5) {
    return null;
  }
  
  const protocol = parts[0].toLowerCase();
  
  // Extraer dirección local y puerto
  const localParts = parts[4].split(':');
  const localPort = parseInt(localParts.pop() || '0', 10);
  const localAddress = localParts.join(':').replace(/[\[\]]/g, '');
  
  // Extraer dirección remota y puerto
  const remoteParts = parts[5].split(':');
  const remotePort = parseInt(remoteParts.pop() || '0', 10);
  const remoteAddress = remoteParts.join(':').replace(/[\[\]]/g, '');
  
  // Estado (puede no estar presente en UDP)
  const state = parts.length > 1 ? parts[1] : 'UNKNOWN';
  
  // Información del proceso (si está disponible)
  let pid: number | undefined;
  let processName: string | undefined;
  
  if (parts.length >= 7) {
    const processPart = parts[6];
    const procMatch = processPart.match(/pid=(\d+)/);
    
    if (procMatch) {
      pid = parseInt(procMatch[1], 10);
      
      // Intentar obtener el nombre del proceso
      const nameMatch = processPart.match(/users:\(\(([^,]+)/);
      if (nameMatch) {
        processName = nameMatch[1];
      }
    }
  }
  
  return {
    protocol,
    localAddress,
    localPort,
    remoteAddress,
    remotePort,
    state,
    pid,
    processName
  };
}

/**
 * Parsea una línea de la salida del comando netstat
 */
function parseNetstatLine(line: string): NetworkConnection | null {
  // Formato aproximado:
  // Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
  
  const parts = line.trim().split(/\s+/);
  
  if (parts.length < 5) {
    return null;
  }
  
  const protocol = parts[0].toLowerCase();
  
  // Extraer dirección local y puerto
  const localParts = parts[3].split(':');
  const localPort = parseInt(localParts.pop() || '0', 10);
  const localAddress = localParts.join(':');
  
  // Extraer dirección remota y puerto
  const remoteParts = parts[4].split(':');
  const remotePort = parseInt(remoteParts.pop() || '0', 10);
  const remoteAddress = remoteParts.join(':');
  
  // Estado (puede no estar presente en UDP)
  const state = protocol === 'tcp' ? parts[5] : 'UNKNOWN';
  
  // Información del proceso (si está disponible)
  let pid: number | undefined;
  let processName: string | undefined;
  
  if (parts.length >= 7) {
    const processPart = parts[6];
    const procMatch = processPart.match(/(\d+)\/([^/]+)/);
    
    if (procMatch) {
      pid = parseInt(procMatch[1], 10);
      processName = procMatch[2];
    }
  }
  
  return {
    protocol,
    localAddress,
    localPort,
    remoteAddress,
    remotePort,
    state,
    pid,
    processName
  };
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  networkEventCallback = callback;
}