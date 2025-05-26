/**
 * Módulo de monitoreo común para todos los agentes
 */

/**
 * Representa un evento generado por el agente
 */
export interface AgentEvent {
  agentId: string;
  eventType: 'system' | 'process' | 'file' | 'network' | 'registry' | 'malware' | 'vulnerability';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  details: any;
  signature?: string; // Firma digital opcional para verificar autenticidad
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
  uptime?: number; // Añadido para Windows
  processCount?: number; // Añadido para Windows
  networkConnections?: number; // Añadido para Windows
}

/**
 * Información de un proceso
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  path?: string;
  command?: string;
  user?: string;
  cpuUsage: number;
  memoryUsage: number;
  startTime: Date;
  status: string;
  company?: string; // Añadido para Windows
  description?: string; // Añadido para Windows
  cmdline?: string; // Añadido para compatibilidad
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
  fileName?: string; // Añadido para Windows
}

/**
 * Conexión de red detectada
 */
export interface NetworkConnection {
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  protocol: 'tcp' | 'udp' | string; // string para compatibilidad
  state?: string;
  processId?: number;
  processName?: string;
  bytesIn?: number;
  bytesOut?: number;
  established: Date;
  localIp?: string; // Añadido para Windows
  remoteIp?: string; // Añadido para Windows
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
 * Convertir métricas del sistema a un evento para enviar al servidor
 */
export function createSystemMetricsEvent(metrics: SystemMetrics): Omit<AgentEvent, 'agentId' | 'signature'> {
  return {
    eventType: 'system',
    severity: 'info',
    timestamp: new Date(),
    message: `System metrics: CPU ${metrics.cpuUsage.toFixed(1)}%, Memory ${metrics.memoryUsage.toFixed(1)}%, Disk ${metrics.diskUsage.toFixed(1)}%`,
    details: metrics
  };
}

/**
 * Convertir un evento de archivo a un evento para enviar al servidor
 */
export function createFileEvent(fileEvent: FileEvent): Omit<AgentEvent, 'agentId' | 'signature'> {
  let message = `File ${fileEvent.action}: ${fileEvent.path}`;
  
  if (fileEvent.action === 'rename' && fileEvent.oldPath) {
    message = `File renamed from ${fileEvent.oldPath} to ${fileEvent.path}`;
  }
  
  // Determinar severidad basada en el tipo de acción
  let severity: 'info' | 'low' | 'medium' | 'high' | 'critical' = 'info';
  
  // Acciones de borrado o modificación en directorios sensibles son de mayor severidad
  const sensitiveDirectories = [
    '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin', 
    '/boot', '/lib', '/lib64', 'C:\\Windows\\System32',
    'C:\\Program Files', 'C:\\Program Files (x86)'
  ];
  
  const isSensitiveDirectory = sensitiveDirectories.some(dir => 
    fileEvent.path.startsWith(dir)
  );
  
  if (fileEvent.action === 'delete' && isSensitiveDirectory) {
    severity = 'high';
  } else if (fileEvent.action === 'modify' && isSensitiveDirectory) {
    severity = 'medium';
  } else if (fileEvent.action === 'permission_change' && isSensitiveDirectory) {
    severity = 'medium';
  }
  
  return {
    eventType: 'file',
    severity,
    timestamp: fileEvent.timestamp,
    message,
    details: fileEvent
  };
}

/**
 * Convertir información de un proceso sospechoso a un evento
 */
export function createSuspiciousProcessEvent(process: ProcessInfo, reason: string): Omit<AgentEvent, 'agentId' | 'signature'> {
  return {
    eventType: 'process',
    severity: 'medium',
    timestamp: new Date(),
    message: `Suspicious process detected: ${process.name} (PID: ${process.pid}) - ${reason}`,
    details: {
      process,
      reason
    }
  };
}

/**
 * Convertir una conexión de red sospechosa a un evento
 */
export function createSuspiciousConnectionEvent(connection: NetworkConnection, reason: string): Omit<AgentEvent, 'agentId' | 'signature'> {
  return {
    eventType: 'network',
    severity: 'medium',
    timestamp: new Date(),
    message: `Suspicious network connection detected from ${connection.localAddress}:${connection.localPort} to ${connection.remoteAddress}:${connection.remotePort} (${connection.protocol}) - ${reason}`,
    details: {
      connection,
      reason
    }
  };
}

/**
 * Convertir un hallazgo de malware a un evento
 */
export function createMalwareDetectionEvent(
  detection: MalwareDetection
): Omit<AgentEvent, 'agentId' | 'signature'> {
  let severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Determinar severidad basada en la confianza de la detección
  if (detection.confidence >= 0.9) {
    severity = 'critical';
  } else if (detection.confidence >= 0.7) {
    severity = 'high';
  } else if (detection.confidence >= 0.5) {
    severity = 'medium';
  } else {
    severity = 'low';
  }
  
  let status = '';
  if (detection.quarantined) {
    status = ' - Quarantined';
  } else if (detection.deleted) {
    status = ' - Deleted';
  }
  
  return {
    eventType: 'malware',
    severity,
    timestamp: new Date(),
    message: `Malware detected: ${detection.malwareName} in ${detection.filePath} (Confidence: ${(detection.confidence * 100).toFixed(1)}%)${status}`,
    details: detection
  };
}

/**
 * Convertir una vulnerabilidad detectada a un evento
 */
export function createVulnerabilityEvent(
  vulnerability: VulnerabilityDetection
): Omit<AgentEvent, 'agentId' | 'signature'> {  
  const fixInfo = vulnerability.fixAvailable 
    ? ` - Fix available in version ${vulnerability.fixVersion}` 
    : ' - No fix available';
  
  return {
    eventType: 'vulnerability',
    severity: vulnerability.severity,
    timestamp: new Date(),
    message: `Vulnerability detected: ${vulnerability.cveId} in ${vulnerability.softwareName} ${vulnerability.version} - ${vulnerability.description}${fixInfo}`,
    details: vulnerability
  };
}