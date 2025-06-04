/**
 * Interfaces y tipos para conectores de datos
 */

import { EventEmitter } from 'events';
import { ConnectorCredentials } from './credentials-manager';

/**
 * Tipos de conectores soportados
 */
export type ConnectorType = 'syslog' | 'api' | 'webhook' | 'file';

/**
 * Estados de un conector
 */
export type ConnectorStatus = 'active' | 'paused' | 'error' | 'disabled';

/**
 * Configuración base de un conector
 */
export interface ConnectorConfig {
  id: string;
  orgId: string;
  name: string;
  type: ConnectorType;
  subtype?: string;
  credentials?: ConnectorCredentials;
  [key: string]: any;
}

/**
 * Evento crudo ingresado por un conector
 */
export interface RawEvent {
  id: string;
  connectorId: string;
  timestamp: Date;
  source: string;
  message: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  rawData: Record<string, any>;
  iocs?: string[];
}

/**
 * Métricas de un conector
 */
export interface ConnectorMetrics {
  eventsPerMinute: number;
  errorsPerMinute: number;
  lastEventAt?: Date;
  avgLatency: number;
  uptime: number;
}

/**
 * Resultado de health check
 */
export interface HealthCheckResult {
  healthy: boolean;
  message: string;
  latency?: number;
  lastChecked: Date;
}

/**
 * Interfaz principal que deben implementar todos los conectores
 */
export interface IDataConnector extends EventEmitter {
  readonly id: string;
  readonly type: ConnectorType;
  readonly config: ConnectorConfig;
  
  /**
   * Inicia el conector
   */
  start(): Promise<void>;
  
  /**
   * Detiene el conector
   */
  stop(): Promise<void>;
  
  /**
   * Verifica la salud del conector
   */
  healthCheck(): Promise<HealthCheckResult>;
  
  /**
   * Obtiene métricas actuales
   */
  getMetrics(): ConnectorMetrics;
  
  /**
   * Actualiza la configuración sin reiniciar
   */
  updateConfig(newConfig: Partial<ConnectorConfig>): Promise<void>;
  
  /**
   * Prueba la conectividad
   */
  testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * Eventos que emite un conector
 */
export interface ConnectorEvents {
  'event': (event: RawEvent) => void;
  'error': (error: Error) => void;
  'status-change': (status: ConnectorStatus) => void;
  'metrics-update': (metrics: ConnectorMetrics) => void;
}

/**
 * Configuración específica para Syslog
 */
export interface SyslogConfig extends ConnectorConfig {
  type: 'syslog';
  protocol: 'udp' | 'tcp';
  port: number;
  bindAddress?: string;
  parser?: 'rfc5424' | 'rfc3164' | 'custom';
}

/**
 * Configuración específica para API Polling
 */
export interface ApiPollingConfig extends ConnectorConfig {
  type: 'api';
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  interval: number; // segundos
  oauth?: {
    tokenUrl: string;
    scope?: string;
  };
  pagination?: {
    type: 'offset' | 'cursor' | 'nextUrl';
    paramName: string;
  };
}

/**
 * Configuración específica para Webhook
 */
export interface WebhookConfig extends ConnectorConfig {
  type: 'webhook';
  path: string; // ej: /webhook/github
  verifySignature?: boolean;
  signatureHeader?: string;
  signatureSecret?: string;
}

/**
 * Configuración específica para archivos
 */
export interface FileConfig extends ConnectorConfig {
  type: 'file';
  watchPath: string;
  pattern: string; // glob pattern
  moveProcessed?: boolean;
  processedPath?: string;
}

/**
 * Configuración avanzada para monitoreo de archivos
 */
export interface FileMonitorConfig extends ConnectorConfig {
  type: 'file';
  paths: string[]; // Rutas a monitorear
  extensions?: string[]; // Extensiones de archivo a incluir
  includePatterns?: string[]; // Patrones regex de inclusión
  excludePatterns?: string[]; // Patrones regex de exclusión
  highPriorityPatterns?: string[]; // Patrones de alta prioridad
  monitorDirectories?: boolean; // Monitorear cambios en directorios
  includeInitial?: boolean; // Incluir archivos existentes al iniciar
  followSymlinks?: boolean; // Seguir enlaces simbólicos
  maxDepth?: number; // Profundidad máxima de recursión
  usePolling?: boolean; // Usar polling en lugar de eventos del sistema
  pollingInterval?: number; // Intervalo de polling en ms
  binaryInterval?: number; // Intervalo para archivos binarios en ms
  calculateHashes?: boolean; // Calcular hashes SHA256 de archivos
}
