# Guía de Desarrollo de Colectores Personalizados

## Introducción

Esta guía explica cómo desarrollar colectores personalizados para el sistema de agentes del SOC-Inteligente. Los colectores son módulos especializados que recopilan datos específicos del sistema y los convierten en eventos de seguridad.

## Índice

- [Arquitectura de Colectores](#arquitectura-de-colectores)
- [Interface Collector](#interface-collector)
- [Tipos de Eventos](#tipos-de-eventos)
- [Desarrollo Paso a Paso](#desarrollo-paso-a-paso)
- [Ejemplos Prácticos](#ejemplos-prácticos)
- [Mejores Prácticas](#mejores-prácticas)
- [Testing y Debugging](#testing-y-debugging)
- [Distribución e Integración](#distribución-e-integración)

---

## Arquitectura de Colectores

### Estructura del Sistema

```
collectors/
├── types.ts                 # Interfaces y tipos compartidos
├── index.ts                # Gestión dinámica de colectores
├── base/                   # Clases base y utilidades
│   ├── collector-base.ts   # Clase base para colectores
│   └── utils.ts           # Utilidades compartidas
├── windows/               # Colectores específicos de Windows
├── linux/                # Colectores específicos de Linux
├── macos/                # Colectores específicos de macOS
└── custom/               # Colectores personalizados
    ├── database-monitor.ts
    ├── web-server-monitor.ts
    └── application-monitor.ts
```

### Flujo de Datos

```
Sistema Operativo → Collector.collect() → CollectorEvent[] → EventQueue → Servidor SOC
```

---

## Interface Collector

### Definición Base

```typescript
interface Collector {
  // Metadatos del colector
  name: string;
  platform: string;
  version: string;
  enabled: boolean;
  
  // Métodos principales
  collect(): Promise<CollectorEvent[]>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  
  // Configuración
  configure?(config: any): void;
  validate?(): Promise<boolean>;
  
  // Información de estado
  getStatus?(): CollectorStatus;
  getMetrics?(): CollectorMetrics;
}
```

### Clase Base CollectorBase

```typescript
import { Collector, CollectorEvent, CollectorStatus } from '../types';

export abstract class CollectorBase implements Collector {
  public name: string;
  public platform: string;
  public version: string;
  public enabled: boolean = true;
  
  protected config: any = {};
  protected isRunning: boolean = false;
  protected lastCollection: Date | null = null;
  protected errorCount: number = 0;
  
  constructor(name: string, platform: string, version: string = '1.0.0') {
    this.name = name;
    this.platform = platform;
    this.version = version;
  }
  
  // Método abstracto que debe implementar cada colector
  abstract collect(): Promise<CollectorEvent[]>;
  
  // Métodos opcionales con implementación por defecto
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[${this.name}] Collector started`);
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log(`[${this.name}] Collector stopped`);
  }
  
  configure(config: any): void {
    this.config = { ...this.config, ...config };
  }
  
  async validate(): Promise<boolean> {
    return this.enabled && this.isRunning;
  }
  
  getStatus(): CollectorStatus {
    return {
      name: this.name,
      enabled: this.enabled,
      running: this.isRunning,
      lastCollection: this.lastCollection,
      errorCount: this.errorCount,
      health: this.errorCount > 10 ? 'unhealthy' : 'healthy'
    };
  }
  
  protected logError(error: Error, context?: string): void {
    this.errorCount++;
    console.error(`[${this.name}] Error ${context ? `in ${context}` : ''}: ${error.message}`);
  }
  
  protected createEvent(
    type: string,
    data: any,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): CollectorEvent {
    return {
      type,
      timestamp: new Date(),
      severity,
      data,
      collector: this.name,
      source: this.platform
    };
  }
}
```

---

## Tipos de Eventos

### CollectorEvent

```typescript
interface CollectorEvent {
  type: string;                                    // Tipo de evento
  timestamp: Date;                                 // Timestamp del evento
  severity: 'low' | 'medium' | 'high' | 'critical'; // Severidad
  data: any;                                       // Datos específicos del evento
  collector?: string;                              // Nombre del colector
  source?: string;                                 // Fuente (plataforma)
  tags?: string[];                                 // Etiquetas adicionales
  metadata?: { [key: string]: any };               // Metadatos adicionales
}
```

### Tipos de Eventos Comunes

```typescript
// Eventos de proceso
interface ProcessEvent {
  type: 'process_start' | 'process_end' | 'process_suspicious';
  data: {
    pid: number;
    name: string;
    commandLine?: string;
    parentPid?: number;
    user?: string;
    startTime?: Date;
    endTime?: Date;
    exitCode?: number;
  };
}

// Eventos de red
interface NetworkEvent {
  type: 'network_connection' | 'network_listen' | 'network_suspicious';
  data: {
    protocol: 'tcp' | 'udp';
    localAddress: string;
    localPort: number;
    remoteAddress?: string;
    remotePort?: number;
    state: string;
    pid?: number;
    processName?: string;
  };
}

// Eventos de archivo
interface FileEvent {
  type: 'file_access' | 'file_create' | 'file_delete' | 'file_modify';
  data: {
    path: string;
    action: 'read' | 'write' | 'create' | 'delete' | 'rename';
    size?: number;
    permissions?: string;
    user?: string;
    process?: string;
    pid?: number;
  };
}

// Eventos de seguridad
interface SecurityEvent {
  type: 'login_success' | 'login_failure' | 'privilege_escalation' | 'malware_detected';
  data: {
    user?: string;
    source?: string;
    reason?: string;
    details?: any;
  };
}
```

---

## Desarrollo Paso a Paso

### Paso 1: Planificación

1. **Definir el propósito del colector:**
   - ¿Qué datos específicos necesitas recopilar?
   - ¿Qué eventos de seguridad quieres detectar?
   - ¿En qué plataforma(s) funcionará?

2. **Analizar fuentes de datos:**
   - APIs del sistema operativo
   - Archivos de log
   - Registros del sistema
   - Bases de datos
   - Servicios web

### Paso 2: Estructura Básica

```typescript
// custom/mi-colector.ts
import { CollectorBase } from '../base/collector-base';
import { CollectorEvent } from '../types';

export class MiColectorPersonalizado extends CollectorBase {
  private intervalo: NodeJS.Timeout | null = null;
  
  constructor() {
    super('Mi Colector Personalizado', process.platform, '1.0.0');
  }
  
  async start(): Promise<void> {
    await super.start();
    
    // Configurar recolección periódica si es necesario
    if (this.config.interval) {
      this.intervalo = setInterval(
        () => this.collect(),
        this.config.interval * 1000
      );
    }
  }
  
  async stop(): Promise<void> {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
    
    await super.stop();
  }
  
  async collect(): Promise<CollectorEvent[]> {
    if (!this.enabled || !this.isRunning) {
      return [];
    }
    
    try {
      this.lastCollection = new Date();
      const events: CollectorEvent[] = [];
      
      // Implementar lógica de recolección aquí
      const datos = await this.recopilarDatos();
      
      for (const dato of datos) {
        if (this.esEventoRelevante(dato)) {
          events.push(this.createEvent(
            this.determinarTipoEvento(dato),
            dato,
            this.determinarSeveridad(dato)
          ));
        }
      }
      
      return events;
    } catch (error) {
      this.logError(error as Error, 'collect');
      return [];
    }
  }
  
  private async recopilarDatos(): Promise<any[]> {
    // Implementar recolección específica
    return [];
  }
  
  private esEventoRelevante(dato: any): boolean {
    // Implementar filtrado
    return true;
  }
  
  private determinarTipoEvento(dato: any): string {
    // Implementar clasificación
    return 'custom_event';
  }
  
  private determinarSeveridad(dato: any): 'low' | 'medium' | 'high' | 'critical' {
    // Implementar análisis de severidad
    return 'low';
  }
}
```

### Paso 3: Implementación de Lógica Específica

Depende del tipo de datos que estés recopilando. Aquí tienes ejemplos:

---

## Ejemplos Prácticos

### Ejemplo 1: Monitor de Base de Datos

```typescript
// custom/database-monitor.ts
import { CollectorBase } from '../base/collector-base';
import { CollectorEvent } from '../types';
import mysql from 'mysql2/promise';

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  queries: {
    suspicious_queries: string;
    failed_logins: string;
    privilege_changes: string;
  };
}

export class DatabaseMonitor extends CollectorBase {
  private connection: mysql.Connection | null = null;
  private lastCheckTime: Date = new Date();
  
  constructor() {
    super('Database Security Monitor', process.platform, '1.0.0');
  }
  
  async start(): Promise<void> {
    await super.start();
    
    try {
      // Establecer conexión a la base de datos
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database
      });
      
      console.log(`[${this.name}] Connected to database`);
    } catch (error) {
      this.logError(error as Error, 'database connection');
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
    
    await super.stop();
  }
  
  async collect(): Promise<CollectorEvent[]> {
    if (!this.connection || !this.enabled) {
      return [];
    }
    
    const events: CollectorEvent[] = [];
    const currentTime = new Date();
    
    try {
      // Buscar consultas sospechosas
      const suspiciousQueries = await this.checkSuspiciousQueries(currentTime);
      events.push(...suspiciousQueries);
      
      // Buscar intentos de login fallidos
      const failedLogins = await this.checkFailedLogins(currentTime);
      events.push(...failedLogins);
      
      // Buscar cambios de privilegios
      const privilegeChanges = await this.checkPrivilegeChanges(currentTime);
      events.push(...privilegeChanges);
      
      this.lastCheckTime = currentTime;
      this.lastCollection = currentTime;
      
      return events;
    } catch (error) {
      this.logError(error as Error, 'collect');
      return [];
    }
  }
  
  private async checkSuspiciousQueries(currentTime: Date): Promise<CollectorEvent[]> {
    const query = `
      SELECT 
        query_time,
        user_host,
        argument as query_text,
        thread_id
      FROM mysql.general_log 
      WHERE event_time > ? 
        AND command_type = 'Query'
        AND (
          argument LIKE '%DROP%'
          OR argument LIKE '%DELETE%'
          OR argument LIKE '%UPDATE%'
          OR argument LIKE '%INSERT%'
          OR argument LIKE '%GRANT%'
          OR argument LIKE '%REVOKE%'
        )
      ORDER BY event_time DESC
    `;
    
    const [rows] = await this.connection!.execute(query, [this.lastCheckTime]);
    const events: CollectorEvent[] = [];
    
    for (const row of rows as any[]) {
      const severity = this.analyzeSuspiciousQuery(row.query_text);
      
      if (severity !== 'low') {
        events.push(this.createEvent(
          'database_suspicious_query',
          {
            queryTime: row.query_time,
            userHost: row.user_host,
            queryText: row.query_text,
            threadId: row.thread_id,
            riskFactors: this.identifyRiskFactors(row.query_text)
          },
          severity
        ));
      }
    }
    
    return events;
  }
  
  private async checkFailedLogins(currentTime: Date): Promise<CollectorEvent[]> {
    // Implementación similar para logins fallidos
    return [];
  }
  
  private async checkPrivilegeChanges(currentTime: Date): Promise<CollectorEvent[]> {
    // Implementación similar para cambios de privilegios
    return [];
  }
  
  private analyzeSuspiciousQuery(query: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPatterns = [
      /DROP\s+DATABASE/i,
      /DROP\s+TABLE/i,
      /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i
    ];
    
    const highPatterns = [
      /GRANT\s+ALL/i,
      /UPDATE.*SET.*password/i,
      /DELETE\s+FROM\s+mysql\.user/i
    ];
    
    const mediumPatterns = [
      /DROP/i,
      /DELETE/i,
      /GRANT/i,
      /REVOKE/i
    ];
    
    for (const pattern of criticalPatterns) {
      if (pattern.test(query)) return 'critical';
    }
    
    for (const pattern of highPatterns) {
      if (pattern.test(query)) return 'high';
    }
    
    for (const pattern of mediumPatterns) {
      if (pattern.test(query)) return 'medium';
    }
    
    return 'low';
  }
  
  private identifyRiskFactors(query: string): string[] {
    const factors: string[] = [];
    
    if (query.includes('WHERE 1=1')) factors.push('unconditional_where');
    if (query.includes('--')) factors.push('sql_comment');
    if (query.includes(';')) factors.push('multiple_statements');
    if (/\b(DROP|DELETE|UPDATE)\b/i.test(query)) factors.push('destructive_operation');
    
    return factors;
  }
}
```

### Ejemplo 2: Monitor de Servidor Web

```typescript
// custom/web-server-monitor.ts
import { CollectorBase } from '../base/collector-base';
import { CollectorEvent } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { tail } from 'tail';

interface LogEntry {
  timestamp: Date;
  ip: string;
  method: string;
  url: string;
  statusCode: number;
  userAgent: string;
  referer?: string;
  responseTime?: number;
}

export class WebServerMonitor extends CollectorBase {
  private logWatcher: any = null;
  private suspiciousPatterns: RegExp[] = [];
  private attackSignatures: Map<string, string> = new Map();
  
  constructor() {
    super('Web Server Security Monitor', process.platform, '1.0.0');
    this.initializePatterns();
  }
  
  private initializePatterns(): void {
    this.suspiciousPatterns = [
      // SQL Injection
      /('|(\\')|(;)|(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
      // XSS
      /<script[^>]*>.*?<\/script>/gi,
      // Path Traversal
      /(\.\.[\/\\]){3,}/,
      // Command Injection
      /(\||&|;|\$\(|\`)/,
      // LDAP Injection
      /(\*|\)|\(|\\)/
    ];
    
    this.attackSignatures.set('sql_injection', 'union|select|insert|update|delete|drop');
    this.attackSignatures.set('xss', '<script|javascript:|onload=|onerror=');
    this.attackSignatures.set('path_traversal', '\\.\\.\\/|\\.\\.\\\\\');
    this.attackSignatures.set('command_injection', '\\||&|;|\\$\\(|`');
  }
  
  async start(): Promise<void> {
    await super.start();
    
    const logFile = this.config.logFile || '/var/log/nginx/access.log';
    
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }
    
    // Monitorear archivo de log en tiempo real
    this.logWatcher = new tail(logFile);
    
    this.logWatcher.on('line', (line: string) => {
      this.processLogLine(line);
    });
    
    this.logWatcher.on('error', (error: Error) => {
      this.logError(error, 'log watcher');
    });
    
    console.log(`[${this.name}] Monitoring log file: ${logFile}`);
  }
  
  async stop(): Promise<void> {
    if (this.logWatcher) {
      this.logWatcher.unwatch();
      this.logWatcher = null;
    }
    
    await super.stop();
  }
  
  async collect(): Promise<CollectorEvent[]> {
    // Este colector procesa eventos en tiempo real,
    // pero también puede hacer análisis batch si es necesario
    return [];
  }
  
  private async processLogLine(line: string): Promise<void> {
    try {
      const logEntry = this.parseLogLine(line);
      
      if (!logEntry) return;
      
      const threats = this.analyzeLogEntry(logEntry);
      
      for (const threat of threats) {
        const event = this.createEvent(
          threat.type,
          {
            ...logEntry,
            threatDetails: threat,
            rawLogLine: line
          },
          threat.severity
        );
        
        // Enviar evento inmediatamente para amenazas de alta severidad
        if (threat.severity === 'high' || threat.severity === 'critical') {
          this.queueEvent?.(event);
        }
      }
    } catch (error) {
      this.logError(error as Error, 'log line processing');
    }
  }
  
  private parseLogLine(line: string): LogEntry | null {
    // Parser para formato de log común de nginx/apache
    // Formato: IP - - [timestamp] "METHOD URL HTTP/1.1" status size "referer" "user-agent"
    const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]*)" (\d+) \S+ "([^"]*)" "([^"]*)"/;
    const match = line.match(regex);
    
    if (!match) return null;
    
    return {
      ip: match[1],
      timestamp: new Date(match[2]),
      method: match[3],
      url: match[4],
      statusCode: parseInt(match[5]),
      referer: match[6] !== '-' ? match[6] : undefined,
      userAgent: match[7]
    };
  }
  
  private analyzeLogEntry(entry: LogEntry): Array<{type: string, severity: any, details: any}> {
    const threats = [];
    
    // Análisis de URL sospechosas
    const urlThreats = this.analyzeUrl(entry.url);
    threats.push(...urlThreats);
    
    // Análisis de patrones de ataque
    const attackPatterns = this.detectAttackPatterns(entry);
    threats.push(...attackPatterns);
    
    // Análisis de comportamiento anómalo
    const anomalies = this.detectAnomalies(entry);
    threats.push(...anomalies);
    
    return threats;
  }
  
  private analyzeUrl(url: string): Array<{type: string, severity: any, details: any}> {
    const threats = [];
    
    // Detectar inyección SQL
    if (this.attackSignatures.get('sql_injection') && 
        new RegExp(this.attackSignatures.get('sql_injection')!, 'i').test(url)) {
      threats.push({
        type: 'web_sql_injection_attempt',
        severity: 'high' as const,
        details: {
          attackType: 'SQL Injection',
          pattern: 'SQL keywords detected in URL',
          url: url
        }
      });
    }
    
    // Detectar XSS
    if (this.attackSignatures.get('xss') && 
        new RegExp(this.attackSignatures.get('xss')!, 'i').test(url)) {
      threats.push({
        type: 'web_xss_attempt',
        severity: 'medium' as const,
        details: {
          attackType: 'Cross-Site Scripting',
          pattern: 'Script injection detected in URL',
          url: url
        }
      });
    }
    
    // Detectar path traversal
    if (this.attackSignatures.get('path_traversal') && 
        new RegExp(this.attackSignatures.get('path_traversal')!, 'i').test(url)) {
      threats.push({
        type: 'web_path_traversal_attempt',
        severity: 'high' as const,
        details: {
          attackType: 'Path Traversal',
          pattern: 'Directory traversal detected in URL',
          url: url
        }
      });
    }
    
    return threats;
  }
  
  private detectAttackPatterns(entry: LogEntry): Array<{type: string, severity: any, details: any}> {
    const threats = [];
    
    // Detectar escaneo de vulnerabilidades
    if (entry.statusCode === 404 && entry.url.includes('admin')) {
      threats.push({
        type: 'web_admin_scan_attempt',
        severity: 'medium' as const,
        details: {
          attackType: 'Admin Panel Scanning',
          pattern: '404 errors on admin paths',
          url: entry.url,
          ip: entry.ip
        }
      });
    }
    
    // Detectar fuerza bruta
    if (entry.url.includes('login') && entry.statusCode === 401) {
      threats.push({
        type: 'web_brute_force_attempt',
        severity: 'medium' as const,
        details: {
          attackType: 'Brute Force Login',
          pattern: 'Multiple 401 errors on login endpoint',
          url: entry.url,
          ip: entry.ip
        }
      });
    }
    
    return threats;
  }
  
  private detectAnomalies(entry: LogEntry): Array<{type: string, severity: any, details: any}> {
    const threats = [];
    
    // URLs extremadamente largas (posible buffer overflow)
    if (entry.url.length > 1000) {
      threats.push({
        type: 'web_anomalous_request',
        severity: 'medium' as const,
        details: {
          anomalyType: 'Extremely Long URL',
          urlLength: entry.url.length,
          ip: entry.ip
        }
      });
    }
    
    // User-Agent sospechosos
    const suspiciousAgents = ['sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab'];
    const userAgentLower = entry.userAgent.toLowerCase();
    
    for (const agent of suspiciousAgents) {
      if (userAgentLower.includes(agent)) {
        threats.push({
          type: 'web_suspicious_user_agent',
          severity: 'high' as const,
          details: {
            anomalyType: 'Suspicious User Agent',
            userAgent: entry.userAgent,
            detectedTool: agent,
            ip: entry.ip
          }
        });
        break;
      }
    }
    
    return threats;
  }
}
```

### Ejemplo 3: Monitor de Aplicación Personalizada

```typescript
// custom/application-monitor.ts
import { CollectorBase } from '../base/collector-base';
import { CollectorEvent } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ApplicationMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  errorRate: number;
  responseTime: number;
}

interface ApplicationConfig {
  appName: string;
  pidFile?: string;
  logFile?: string;
  metricsEndpoint?: string;
  healthCheckUrl?: string;
  thresholds: {
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
    responseTime: number;
  };
}

export class ApplicationMonitor extends CollectorBase {
  private metrics: ApplicationMetrics | null = null;
  private isHealthy: boolean = true;
  
  constructor() {
    super('Application Performance Monitor', process.platform, '1.0.0');
  }
  
  configure(config: ApplicationConfig): void {
    super.configure(config);
    
    // Validar configuración requerida
    if (!config.appName) {
      throw new Error('Application name is required');
    }
  }
  
  async collect(): Promise<CollectorEvent[]> {
    if (!this.enabled) return [];
    
    const events: CollectorEvent[] = [];
    
    try {
      // Recopilar métricas de la aplicación
      this.metrics = await this.gatherMetrics();
      
      // Verificar estado de salud
      const healthStatus = await this.checkHealth();
      
      // Analizar métricas y generar eventos
      const performanceEvents = this.analyzePerformance(this.metrics);
      events.push(...performanceEvents);
      
      // Verificar si la aplicación está funcionando
      const availabilityEvents = this.checkAvailability(healthStatus);
      events.push(...availabilityEvents);
      
      // Analizar logs de errores
      const errorEvents = await this.analyzeErrorLogs();
      events.push(...errorEvents);
      
      this.lastCollection = new Date();
      return events;
      
    } catch (error) {
      this.logError(error as Error, 'collect');
      
      // Generar evento de error del colector
      events.push(this.createEvent(
        'application_monitor_error',
        {
          error: (error as Error).message,
          appName: this.config.appName
        },
        'medium'
      ));
      
      return events;
    }
  }
  
  private async gatherMetrics(): Promise<ApplicationMetrics> {
    const metrics: ApplicationMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      activeConnections: 0,
      errorRate: 0,
      responseTime: 0
    };
    
    // Método 1: Usar endpoint de métricas si está disponible
    if (this.config.metricsEndpoint) {
      try {
        const response = await fetch(this.config.metricsEndpoint);
        const data = await response.json();
        
        return {
          cpuUsage: data.cpu_usage || 0,
          memoryUsage: data.memory_usage || 0,
          diskUsage: data.disk_usage || 0,
          activeConnections: data.active_connections || 0,
          errorRate: data.error_rate || 0,
          responseTime: data.avg_response_time || 0
        };
      } catch (error) {
        this.logError(error as Error, 'metrics endpoint');
      }
    }
    
    // Método 2: Usar información del proceso
    if (this.config.pidFile) {
      try {
        const pidData = await fs.readFile(this.config.pidFile, 'utf8');
        const pid = parseInt(pidData.trim());
        
        // Obtener información del proceso (específico de la plataforma)
        const processInfo = await this.getProcessInfo(pid);
        
        metrics.cpuUsage = processInfo.cpuUsage;
        metrics.memoryUsage = processInfo.memoryUsage;
        
      } catch (error) {
        this.logError(error as Error, 'process info');
      }
    }
    
    return metrics;
  }
  
  private async getProcessInfo(pid: number): Promise<{cpuUsage: number, memoryUsage: number}> {
    // Implementación específica por plataforma
    if (process.platform === 'linux') {
      return await this.getLinuxProcessInfo(pid);
    } else if (process.platform === 'win32') {
      return await this.getWindowsProcessInfo(pid);
    } else {
      return { cpuUsage: 0, memoryUsage: 0 };
    }
  }
  
  private async getLinuxProcessInfo(pid: number): Promise<{cpuUsage: number, memoryUsage: number}> {
    try {
      // Leer /proc/PID/stat para información del proceso
      const statData = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
      const statFields = statData.split(' ');
      
      // Campos relevantes del archivo stat
      const utime = parseInt(statFields[13]); // Tiempo de CPU en modo usuario
      const stime = parseInt(statFields[14]); // Tiempo de CPU en modo sistema
      
      // Leer /proc/PID/status para memoria
      const statusData = await fs.readFile(`/proc/${pid}/status`, 'utf8');
      const vmRssMatch = statusData.match(/VmRSS:\s*(\d+)\s*kB/);
      const memoryKB = vmRssMatch ? parseInt(vmRssMatch[1]) : 0;
      
      return {
        cpuUsage: (utime + stime) / 100, // Convertir a porcentaje aproximado
        memoryUsage: memoryKB * 1024 // Convertir a bytes
      };
    } catch (error) {
      return { cpuUsage: 0, memoryUsage: 0 };
    }
  }
  
  private async getWindowsProcessInfo(pid: number): Promise<{cpuUsage: number, memoryUsage: number}> {
    // Usar PowerShell para obtener información del proceso
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout } = await execAsync(
        `Get-Process -Id ${pid} | Select-Object CPU,WorkingSet | ConvertTo-Json`
      );
      
      const processInfo = JSON.parse(stdout);
      
      return {
        cpuUsage: processInfo.CPU || 0,
        memoryUsage: processInfo.WorkingSet || 0
      };
    } catch (error) {
      return { cpuUsage: 0, memoryUsage: 0 };
    }
  }
  
  private async checkHealth(): Promise<boolean> {
    if (this.config.healthCheckUrl) {
      try {
        const response = await fetch(this.config.healthCheckUrl, {
          timeout: 5000
        });
        
        return response.ok;
      } catch (error) {
        return false;
      }
    }
    
    // Si no hay URL de health check, verificar que el proceso esté corriendo
    if (this.config.pidFile) {
      try {
        const pidData = await fs.readFile(this.config.pidFile, 'utf8');
        const pid = parseInt(pidData.trim());
        
        // Verificar que el proceso existe
        process.kill(pid, 0); // No mata el proceso, solo verifica si existe
        return true;
      } catch (error) {
        return false;
      }
    }
    
    return true; // Asumir que está saludable si no podemos verificar
  }
  
  private analyzePerformance(metrics: ApplicationMetrics): CollectorEvent[] {
    const events: CollectorEvent[] = [];
    const thresholds = this.config.thresholds;
    
    // Verificar uso de CPU
    if (metrics.cpuUsage > thresholds.cpuUsage) {
      events.push(this.createEvent(
        'application_high_cpu_usage',
        {
          appName: this.config.appName,
          cpuUsage: metrics.cpuUsage,
          threshold: thresholds.cpuUsage,
          timestamp: new Date()
        },
        metrics.cpuUsage > thresholds.cpuUsage * 1.5 ? 'high' : 'medium'
      ));
    }
    
    // Verificar uso de memoria
    if (metrics.memoryUsage > thresholds.memoryUsage) {
      events.push(this.createEvent(
        'application_high_memory_usage',
        {
          appName: this.config.appName,
          memoryUsage: metrics.memoryUsage,
          threshold: thresholds.memoryUsage,
          timestamp: new Date()
        },
        metrics.memoryUsage > thresholds.memoryUsage * 1.5 ? 'high' : 'medium'
      ));
    }
    
    // Verificar tasa de errores
    if (metrics.errorRate > thresholds.errorRate) {
      events.push(this.createEvent(
        'application_high_error_rate',
        {
          appName: this.config.appName,
          errorRate: metrics.errorRate,
          threshold: thresholds.errorRate,
          timestamp: new Date()
        },
        metrics.errorRate > thresholds.errorRate * 2 ? 'critical' : 'high'
      ));
    }
    
    // Verificar tiempo de respuesta
    if (metrics.responseTime > thresholds.responseTime) {
      events.push(this.createEvent(
        'application_slow_response',
        {
          appName: this.config.appName,
          responseTime: metrics.responseTime,
          threshold: thresholds.responseTime,
          timestamp: new Date()
        },
        metrics.responseTime > thresholds.responseTime * 2 ? 'high' : 'medium'
      ));
    }
    
    return events;
  }
  
  private checkAvailability(isHealthy: boolean): CollectorEvent[] {
    const events: CollectorEvent[] = [];
    
    if (!isHealthy && this.isHealthy) {
      // La aplicación se volvió no saludable
      events.push(this.createEvent(
        'application_down',
        {
          appName: this.config.appName,
          timestamp: new Date(),
          previousState: 'healthy'
        },
        'critical'
      ));
    } else if (isHealthy && !this.isHealthy) {
      // La aplicación se recuperó
      events.push(this.createEvent(
        'application_recovered',
        {
          appName: this.config.appName,
          timestamp: new Date(),
          previousState: 'unhealthy'
        },
        'low'
      ));
    }
    
    this.isHealthy = isHealthy;
    return events;
  }
  
  private async analyzeErrorLogs(): Promise<CollectorEvent[]> {
    if (!this.config.logFile) return [];
    
    const events: CollectorEvent[] = [];
    
    try {
      // Leer las últimas líneas del archivo de log
      const logContent = await fs.readFile(this.config.logFile, 'utf8');
      const lines = logContent.split('\n').slice(-100); // Últimas 100 líneas
      
      for (const line of lines) {
        if (this.isErrorLine(line)) {
          const errorDetails = this.parseErrorLine(line);
          
          events.push(this.createEvent(
            'application_error',
            {
              appName: this.config.appName,
              error: errorDetails,
              rawLogLine: line
            },
            this.determineErrorSeverity(errorDetails)
          ));
        }
      }
    } catch (error) {
      this.logError(error as Error, 'log analysis');
    }
    
    return events;
  }
  
  private isErrorLine(line: string): boolean {
    const errorPatterns = [
      /ERROR/i,
      /FATAL/i,
      /CRITICAL/i,
      /Exception/i,
      /Stack trace/i
    ];
    
    return errorPatterns.some(pattern => pattern.test(line));
  }
  
  private parseErrorLine(line: string): any {
    // Parser básico para líneas de error
    const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})/);
    const levelMatch = line.match(/(ERROR|FATAL|CRITICAL|WARN)/i);
    
    return {
      timestamp: timestampMatch ? new Date(timestampMatch[1]) : new Date(),
      level: levelMatch ? levelMatch[1].toUpperCase() : 'UNKNOWN',
      message: line
    };
  }
  
  private determineErrorSeverity(errorDetails: any): 'low' | 'medium' | 'high' | 'critical' {
    switch (errorDetails.level) {
      case 'FATAL':
      case 'CRITICAL':
        return 'critical';
      case 'ERROR':
        return 'high';
      case 'WARN':
        return 'medium';
      default:
        return 'low';
    }
  }
}
```

---

## Mejores Prácticas

### 1. Performance

```typescript
// ✅ Bueno: Implementar timeout en operaciones
async collect(): Promise<CollectorEvent[]> {
  const timeout = this.config.timeout || 30000; // 30 segundos por defecto
  
  return Promise.race([
    this.doCollection(),
    new Promise<CollectorEvent[]>((_, reject) => 
      setTimeout(() => reject(new Error('Collection timeout')), timeout)
    )
  ]);
}

// ✅ Bueno: Usar caché para datos costosos
private cache = new Map<string, {data: any, timestamp: Date}>();

private async getCachedData(key: string, ttl: number = 60000): Promise<any> {
  const cached = this.cache.get(key);
  
  if (cached && (Date.now() - cached.timestamp.getTime()) < ttl) {
    return cached.data;
  }
  
  const data = await this.fetchExpensiveData(key);
  this.cache.set(key, { data, timestamp: new Date() });
  
  return data;
}
```

### 2. Manejo de Errores

```typescript
// ✅ Bueno: Manejo robusto de errores
async collect(): Promise<CollectorEvent[]> {
  const events: CollectorEvent[] = [];
  
  try {
    const data = await this.collectData();
    events.push(...this.processData(data));
  } catch (error) {
    this.logError(error as Error, 'data collection');
    
    // No propagar el error, devolver array vacío
    // El agente principal debe continuar funcionando
    return [];
  }
  
  return events;
}

// ✅ Bueno: Retry con backoff exponencial
private async withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### 3. Configuración y Validación

```typescript
// ✅ Bueno: Validar configuración
configure(config: any): void {
  // Validar campos requeridos
  if (!config.apiKey) {
    throw new Error('API key is required');
  }
  
  // Validar tipos
  if (typeof config.interval !== 'number' || config.interval < 1) {
    throw new Error('Interval must be a positive number');
  }
  
  // Establecer valores por defecto
  this.config = {
    interval: 60,
    timeout: 30000,
    maxEvents: 1000,
    ...config
  };
}

// ✅ Bueno: Validar estado antes de operar
async validate(): Promise<boolean> {
  if (!this.enabled) return false;
  if (!this.isRunning) return false;
  
  // Validar dependencias específicas
  if (this.config.apiEndpoint) {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/health`, {
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  return true;
}
```

### 4. Logging y Debugging

```typescript
// ✅ Bueno: Logging estructurado
private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    collector: this.name,
    level,
    message,
    data
  };
  
  console.log(JSON.stringify(logEntry));
}

// ✅ Bueno: Métricas internas del colector
getMetrics(): CollectorMetrics {
  return {
    name: this.name,
    eventsCollected: this.totalEventsCollected,
    errorsCount: this.errorCount,
    lastCollection: this.lastCollection,
    averageCollectionTime: this.averageCollectionTime,
    health: this.getHealthStatus()
  };
}
```

---

## Testing y Debugging

### Unit Tests

```typescript
// test/collectors/mi-colector.test.ts
import { MiColectorPersonalizado } from '../../src/collectors/custom/mi-colector';

describe('MiColectorPersonalizado', () => {
  let collector: MiColectorPersonalizado;
  
  beforeEach(() => {
    collector = new MiColectorPersonalizado();
    collector.configure({
      interval: 5,
      apiKey: 'test-key'
    });
  });
  
  afterEach(async () => {
    await collector.stop();
  });
  
  test('should initialize correctly', async () => {
    expect(collector.name).toBe('Mi Colector Personalizado');
    expect(collector.enabled).toBe(true);
  });
  
  test('should collect events', async () => {
    await collector.start();
    
    const events = await collector.collect();
    
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(0);
  });
  
  test('should handle errors gracefully', async () => {
    // Simular error
    jest.spyOn(collector as any, 'recopilarDatos')
        .mockRejectedValue(new Error('Test error'));
    
    await collector.start();
    
    const events = await collector.collect();
    
    // Debe devolver array vacío en caso de error
    expect(events).toEqual([]);
  });
  
  test('should create valid events', async () => {
    await collector.start();
    
    const events = await collector.collect();
    
    events.forEach(event => {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('data');
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });
});
```

### Integration Tests

```typescript
// test/integration/colector-integration.test.ts
import { AgentBase } from '../../src/common/agent-base';
import { MiColectorPersonalizado } from '../../src/collectors/custom/mi-colector';

describe('Collector Integration', () => {
  test('should integrate with agent base', async () => {
    const collector = new MiColectorPersonalizado();
    
    // Mock del agente base
    const mockAgent = {
      queueEvent: jest.fn()
    };
    
    collector.configure({
      interval: 1 // 1 segundo para test rápido
    });
    
    await collector.start();
    
    // Esperar que se recopilen eventos
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await collector.stop();
    
    // Verificar que se llamó al método de cola de eventos
    // (si el colector está configurado para enviar eventos automáticamente)
  });
});
```

### Manual Testing

```typescript
// scripts/test-collector.ts
import { MiColectorPersonalizado } from '../src/collectors/custom/mi-colector';

async function testCollector() {
  const collector = new MiColectorPersonalizado();
  
  console.log('Configurando colector...');
  collector.configure({
    interval: 5,
    apiKey: 'test-key',
    debug: true
  });
  
  console.log('Iniciando colector...');
  await collector.start();
  
  console.log('Recopilando eventos...');
  const events = await collector.collect();
  
  console.log(`Eventos recopilados: ${events.length}`);
  events.forEach((event, index) => {
    console.log(`Evento ${index + 1}:`);
    console.log(JSON.stringify(event, null, 2));
  });
  
  console.log('Obteniendo métricas...');
  const metrics = collector.getMetrics?.();
  if (metrics) {
    console.log('Métricas del colector:');
    console.log(JSON.stringify(metrics, null, 2));
  }
  
  console.log('Deteniendo colector...');
  await collector.stop();
  
  console.log('Test completado.');
}

testCollector().catch(console.error);
```

---

## Distribución e Integración

### Registro del Colector

```typescript
// collectors/index.ts
import { MiColectorPersonalizado } from './custom/mi-colector';

// Registrar colector personalizado
export function loadCustomCollectors(): Collector[] {
  const collectors: Collector[] = [];
  
  // Cargar colector personalizado si está habilitado
  if (process.env.ENABLE_CUSTOM_COLLECTOR === 'true') {
    collectors.push(new MiColectorPersonalizado());
  }
  
  return collectors;
}

// Función principal de carga de colectores
export async function loadCollectors(platform: string): Promise<Collector[]> {
  const collectors: Collector[] = [];
  
  // Cargar colectores de plataforma
  collectors.push(...await loadPlatformCollectors(platform));
  
  // Cargar colectores personalizados
  collectors.push(...loadCustomCollectors());
  
  return collectors.filter(c => c.enabled);
}
```

### Configuración

```json
{
  "collectors": {
    "MiColectorPersonalizado": {
      "enabled": true,
      "interval": 60,
      "config": {
        "apiKey": "your-api-key",
        "timeout": 30000,
        "maxEvents": 1000
      }
    }
  }
}
```

### Empaquetado

```bash
# Compilar TypeScript
npm run build

# Crear paquete NPM
npm pack

# Instalar en otro proyecto
npm install ./mi-colector-1.0.0.tgz
```

Esta guía proporciona todo lo necesario para desarrollar colectores personalizados robustos y efectivos para el sistema de agentes del SOC-Inteligente.