/**
 * Tipos comunes para eventos y colectores
 */

/**
 * Representa un evento generado por el agente
 */
export interface AgentEvent {
  agentId: string;
  eventType: 'system' | 'process' | 'file' | 'network' | 'registry' | 'auth' | 'malware' | 'vulnerability';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  details: any;
  signature?: string; // Firma digital opcional para verificar autenticidad
  hostId?: string;
  agentVersion?: string;
  tags?: string[];
}

/**
 * Métricas del sistema
 */
export interface SystemMetrics {
  cpuUsage: number;        // Porcentaje 0-100
  memoryUsage: number;     // Porcentaje 0-100
  diskUsage: number;       // Porcentaje 0-100
  networkIn: number;       // Bytes/s
  networkOut: number;      // Bytes/s
  openFileDescriptors?: number;
  runningProcesses: number;
  timestamp: Date;
  uptime?: number;
  processCount?: number;
  networkConnections?: number;
}

/**
 * Información de un proceso
 */
export interface ProcessInfo {
  pid: number;
  ppid?: number;
  uid?: number;
  name: string;
  path?: string;
  command?: string;
  user?: string;
  cpuUsage: number;
  memoryUsage: number;
  startTime: Date;
  status: string;
  cmdline?: string;
  args?: string[];
}

/**
 * Evento de cambio en archivos
 */
export interface FileEvent {
  path: string;
  action: 'create' | 'modify' | 'delete' | 'rename' | 'permission_change';
  timestamp: Date;
  user?: string;
  process?: {
    pid: number;
    name: string;
  };
  hash?: string;
  oldPath?: string; // Para acciones 'rename'
  fileName?: string;
}

/**
 * Conexión de red detectada
 */
export interface NetworkConnection {
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  protocol: 'tcp' | 'udp' | string;
  state?: string;
  processId?: number;
  processName?: string;
  bytesIn?: number;
  bytesOut?: number;
  established: Date;
}

/**
 * Detección de malware
 */
export interface MalwareDetection {
  filePath: string;
  fileHash: string;
  malwareName: string;
  confidence: number;
  quarantined?: boolean;
  deleted?: boolean;
}

/**
 * Vulnerabilidad detectada
 */
export interface VulnerabilityDetection {
  softwareName: string;
  version: string;
  cveId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fixAvailable?: boolean;
  fixVersion?: string;
}

/**
 * Evento de autenticación
 */
export interface AuthEvent {
  user: string;
  source: string;
  success: boolean;
  method: string;
  timestamp: Date;
  sourceIp?: string;
  targetUser?: string;
  details?: any;
}

/**
 * Interfaz para los colectores
 */
export interface Collector {
  name: string;
  description: string;
  compatibleSystems: ('linux' | 'darwin' | 'win32')[];
  
  // Métodos de ciclo de vida
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  
  // Opcional: configuración específica
  configure?: (config: any) => Promise<void>;
}