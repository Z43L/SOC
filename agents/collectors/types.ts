/**
 * Tipos comunes para eventos y colectores
 */

import { Logger } from '../core/logger';

/**
 * Configuración para colectores
 */
export interface CollectorConfig {
  eventCallback?: (event: Omit<AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void;
  logger?: Logger;
  [key: string]: unknown; // Allow for collector-specific configuration
}

/**
 * Tipos de detalles para diferentes tipos de eventos
 */
export interface SystemEventDetails {
  metrics?: SystemMetrics;
  error?: string;
  component?: string;
}

export interface ProcessEventDetails {
  process?: ProcessInfo;
  reason?: string;
  parentProcess?: ProcessInfo;
}

export interface FileEventDetails {
  file?: FileEvent;
  permissions?: number;
  owner?: string;
  group?: string;
}

export interface NetworkEventDetails {
  connection?: NetworkConnection;
  reason?: string;
  geoLocation?: {
    country?: string;
    city?: string;
    coordinates?: [number, number];
  };
}

export interface MalwareEventDetails {
  detection?: MalwareDetection;
  confidence?: number;
  scanEngine?: string;
}

export interface VulnerabilityEventDetails {
  vulnerability?: VulnerabilityDetection;
  cveId?: string;
  packageName?: string;
}

export interface AuthEventDetails {
  authEvent?: AuthEvent;
  sourceIp?: string;
  userAgent?: string;
}

export type EventDetails = 
  | SystemEventDetails 
  | ProcessEventDetails 
  | FileEventDetails 
  | NetworkEventDetails 
  | MalwareEventDetails 
  | VulnerabilityEventDetails 
  | AuthEventDetails
  | Record<string, unknown>; // Fallback for extensibility

/**
 * Representa un evento generado por el agente
 */
export interface AgentEvent {
  agentId: string;
  eventType: 'system' | 'process' | 'file' | 'network' | 'registry' | 'auth' | 'malware' | 'vulnerability';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  details: EventDetails;
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
  configure?: (config: CollectorConfig) => Promise<void>;
}