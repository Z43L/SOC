# Referencia de API del Sistema de Agentes

## Introducción

Esta documentación proporciona una referencia completa de todas las clases, interfaces y métodos disponibles en el sistema de agentes del SOC-Inteligente.

## Índice

- [Clase AgentBase](#clase-agentbase)
- [Clase AgentCommunication](#clase-agentcommunication)  
- [Configuración del Agente](#configuración-del-agente)
- [Sistema de Colectores](#sistema-de-colectores)
- [Sistema de Cola de Eventos](#sistema-de-cola-de-eventos)
- [Sistema de Logging](#sistema-de-logging)
- [Interfaces y Tipos](#interfaces-y-tipos)

---

## Clase AgentBase

La clase base abstracta que implementa la funcionalidad común de todos los agentes.

### Constructor

```typescript
constructor(configPath: string)
```

**Parámetros:**
- `configPath`: Ruta al archivo de configuración del agente

**Ejemplo:**
```typescript
const agent = new WindowsAgent('./config/agent-config.json');
```

### Métodos Públicos

#### initialize(): Promise<boolean>

Inicializa el agente, carga la configuración y registra el agente en el servidor.

**Retorna:** `Promise<boolean>` - `true` si la inicialización fue exitosa

**Ejemplo:**
```typescript
const agent = new WindowsAgent('./config/agent-config.json');
const initialized = await agent.initialize();
if (initialized) {
  console.log('Agente inicializado correctamente');
} else {
  console.error('Error en la inicialización');
}
```

#### start(): Promise<boolean>

Inicia la ejecución del agente, comenzando todos los colectores y temporizadores.

**Retorna:** `Promise<boolean>` - `true` si el inicio fue exitoso

**Ejemplo:**
```typescript
const started = await agent.start();
if (started) {
  console.log('Agente iniciado y recolectando datos');
}
```

#### stop(): Promise<boolean>

Detiene la ejecución del agente de forma segura.

**Retorna:** `Promise<boolean>` - `true` si la detención fue exitosa

**Ejemplo:**
```typescript
// Detener agente al recibir señal de cierre
process.on('SIGINT', async () => {
  console.log('Deteniendo agente...');
  await agent.stop();
  process.exit(0);
});
```

### Métodos Protegidos

#### queueEvent(event: Omit<AgentEvent, 'agentId' | 'signature'>): Promise<void>

Encola un evento para su posterior envío al servidor.

**Parámetros:**
- `event`: Evento a encolar (sin agentId ni signature)

**Ejemplo:**
```typescript
protected async collectSystemInfo() {
  const cpuUsage = await this.getCpuUsage();
  
  await this.queueEvent({
    type: 'system_metric',
    timestamp: new Date(),
    data: {
      metric: 'cpu_usage',
      value: cpuUsage,
      unit: 'percentage'
    }
  });
}
```

#### abstract startMonitoring(): Promise<void>

Método abstracto que debe implementar cada plataforma para iniciar el monitoreo específico.

**Ejemplo de implementación (Windows):**
```typescript
protected async startMonitoring(): Promise<void> {
  // Iniciar colectores específicos de Windows
  this.processCollector = new WindowsProcessCollector();
  this.eventLogCollector = new WindowsEventLogCollector();
  this.registryCollector = new WindowsRegistryCollector();
  
  // Configurar intervalos de recolección
  setInterval(() => this.collectProcessData(), 30000);
  setInterval(() => this.collectEventLogs(), 60000);
}
```

---

## Clase AgentCommunication

Gestiona toda la comunicación con el servidor SOC.

### Constructor

```typescript
constructor(config: AgentConfig)
```

**Parámetros:**
- `config`: Configuración del agente

### Métodos Públicos

#### registerAgent(hostname, ip, os, version, capabilities): Promise<RegistrationResult>

Registra el agente con el servidor SOC.

**Parámetros:**
- `hostname`: Nombre del host
- `ip`: Dirección IP del agente
- `os`: Sistema operativo
- `version`: Versión del agente
- `capabilities`: Array de capacidades soportadas

**Retorna:** `Promise<RegistrationResult>`

**Ejemplo:**
```typescript
const communication = new AgentCommunication(config);

const result = await communication.registerAgent(
  'DESKTOP-USUARIO',
  '192.168.1.100',
  'Windows 11 Pro',
  '1.0.0',
  ['fileSystemMonitoring', 'processMonitoring', 'registryMonitoring']
);

if (result.success) {
  console.log(`Agente registrado con ID: ${result.agentId}`);
  // Guardar el agentId en la configuración
  config.agentId = result.agentId;
  await saveConfig(config);
}
```

#### sendEvents(events): Promise<SendResult>

Envía eventos al servidor SOC.

**Parámetros:**
- `events`: Array de eventos a enviar

**Ejemplo:**
```typescript
const events = [
  {
    type: 'file_access',
    timestamp: new Date(),
    data: {
      path: 'C:\\Windows\\System32\\config\\SAM',
      action: 'read',
      process: 'explorer.exe',
      user: 'USUARIO'
    }
  },
  {
    type: 'process_start',
    timestamp: new Date(),
    data: {
      processName: 'powershell.exe',
      commandLine: 'powershell.exe -ExecutionPolicy Bypass',
      parentProcess: 'cmd.exe',
      user: 'USUARIO'
    }
  }
];

const result = await communication.sendEvents(events);
if (result.success) {
  console.log('Eventos enviados correctamente');
}
```

#### sendHeartbeat(status, metrics): Promise<HeartbeatResult>

Envía un heartbeat al servidor con el estado actual del agente.

**Parámetros:**
- `status`: Estado del agente ('active', 'warning', 'error', 'inactive')
- `metrics`: Métricas del sistema (opcional)

**Ejemplo:**
```typescript
// Heartbeat simple
await communication.sendHeartbeat('active');

// Heartbeat con métricas
await communication.sendHeartbeat('active', {
  cpuUsage: 45.2,
  memoryUsage: 68.1,
  diskUsage: 32.7
});
```

---

## Configuración del Agente

### Interface AgentConfig

Define la estructura de configuración del agente.

```typescript
interface AgentConfig {
  // Configuración de conexión
  serverUrl: string;
  registrationKey: string;
  agentId?: string;
  
  // Intervalos (en segundos)
  heartbeatInterval: number;
  dataUploadInterval: number;
  scanInterval: number;
  
  // Endpoints
  registrationEndpoint: string;
  dataEndpoint: string;
  heartbeatEndpoint: string;
  
  // Seguridad
  signMessages: boolean;
  privateKeyPath?: string;
  serverPublicKeyPath?: string;
  
  // Capacidades
  capabilities: AgentCapabilities;
  
  // Logging y almacenamiento
  configPath: string;
  logFilePath: string;
  maxStorageSize: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Personalización
  directoriesToScan?: string[];
  cpuAlertThreshold?: number;
  connectorId?: string;
}
```

### Configuración por Defecto

```typescript
const DEFAULT_CONFIG: Omit<AgentConfig, 'configPath'> = {
  serverUrl: 'https://soc-inteligente.replit.app',
  registrationKey: 'default-registration-key',
  heartbeatInterval: 60,
  dataUploadInterval: 300,
  scanInterval: 3600,
  registrationEndpoint: '/api/agents/register',
  dataEndpoint: '/api/agents/data',
  heartbeatEndpoint: '/api/agents/heartbeat',
  signMessages: false,
  capabilities: {
    fileSystemMonitoring: true,
    processMonitoring: true,
    networkMonitoring: true,
    registryMonitoring: false,
    securityLogsMonitoring: true,
    malwareScanning: false,
    vulnerabilityScanning: false
  },
  logFilePath: './agent.log',
  maxStorageSize: 100,
  logLevel: 'info',
  directoriesToScan: ['/tmp', '/var/tmp', '/dev/shm', '/home'],
  cpuAlertThreshold: 90
};
```

### Funciones de Configuración

#### loadConfig(configPath): Promise<AgentConfig>

Carga la configuración desde un archivo.

**Ejemplo:**
```typescript
try {
  const config = await loadConfig('./config/agent-config.json');
  console.log(`Configuración cargada para servidor: ${config.serverUrl}`);
} catch (error) {
  console.error('Error cargando configuración:', error);
  // Usar configuración por defecto
  const config = { ...DEFAULT_CONFIG, configPath: './config/agent-config.json' };
}
```

#### saveConfig(config, configPath?): Promise<void>

Guarda la configuración en un archivo.

**Ejemplo:**
```typescript
// Modificar configuración
config.heartbeatInterval = 30; // Heartbeat cada 30 segundos
config.logLevel = 'debug';     // Habilitar logging detallado

// Guardar cambios
await saveConfig(config);
console.log('Configuración guardada');
```

---

## Sistema de Colectores

### Interface Collector

Define la estructura base para todos los colectores.

```typescript
interface Collector {
  name: string;
  platform: string;
  enabled: boolean;
  
  collect(): Promise<CollectorEvent[]>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
```

### Ejemplo de Implementación de Colector

```typescript
class WindowsProcessCollector implements Collector {
  name = 'Windows Process Collector';
  platform = 'windows';
  enabled = true;
  
  async collect(): Promise<CollectorEvent[]> {
    const events: CollectorEvent[] = [];
    
    try {
      // Obtener lista de procesos usando PowerShell
      const processes = await this.getProcessList();
      
      for (const process of processes) {
        // Detectar procesos sospechosos
        if (this.isSuspiciousProcess(process)) {
          events.push({
            type: 'suspicious_process',
            timestamp: new Date(),
            severity: 'medium',
            data: {
              processName: process.name,
              pid: process.pid,
              commandLine: process.commandLine,
              parentPid: process.parentPid,
              user: process.owner,
              startTime: process.startTime
            }
          });
        }
      }
      
      return events;
    } catch (error) {
      console.error('Error en WindowsProcessCollector:', error);
      return [];
    }
  }
  
  private async getProcessList(): Promise<ProcessInfo[]> {
    // Implementación específica para obtener procesos en Windows
    const command = 'Get-Process | Select-Object Name,Id,CommandLine,ParentId';
    const result = await execPowerShell(command);
    return this.parseProcessOutput(result);
  }
  
  private isSuspiciousProcess(process: ProcessInfo): boolean {
    const suspiciousPatterns = [
      /powershell.*-EncodedCommand/i,
      /cmd.*\/c.*echo/i,
      /.*\.tmp\.exe$/i,
      /svchost.*-k.*netsvcs/i
    ];
    
    return suspiciousPatterns.some(pattern => 
      pattern.test(process.commandLine || process.name)
    );
  }
}
```

### Gestión Dinámica de Colectores

```typescript
// Cargar colectores según la plataforma
const collectors = await loadCollectors(process.platform);

console.log(`Colectores cargados para ${process.platform}:`);
collectors.forEach(collector => {
  console.log(`- ${collector.name}: ${collector.enabled ? 'Habilitado' : 'Deshabilitado'}`);
});

// Iniciar todos los colectores habilitados
for (const collector of collectors) {
  if (collector.enabled && collector.start) {
    await collector.start();
  }
}

// Recolectar datos de todos los colectores
const allEvents = [];
for (const collector of collectors) {
  if (collector.enabled) {
    const events = await collector.collect();
    allEvents.push(...events);
  }
}
```

---

## Sistema de Cola de Eventos

### Clase EventQueue

Gestiona la cola de eventos antes del envío al servidor.

```typescript
class EventQueue {
  private events: AgentEvent[] = [];
  private maxSize: number;
  
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }
  
  async add(events: AgentEvent[]): Promise<void>;
  async getBatch(count: number): Promise<AgentEvent[]>;
  size(): number;
  clear(): void;
}
```

**Ejemplo de uso:**
```typescript
const eventQueue = new EventQueue(500); // Máximo 500 eventos

// Agregar eventos a la cola
await eventQueue.add([
  {
    agentId: 'agent-001',
    type: 'file_access',
    timestamp: new Date(),
    data: { path: '/etc/passwd', action: 'read' }
  }
]);

// Obtener lote de eventos para envío
if (eventQueue.size() >= 100) {
  const batch = await eventQueue.getBatch(100);
  const result = await communication.sendEvents(batch);
  
  if (result.success) {
    console.log(`Enviados ${batch.length} eventos`);
  }
}
```

---

## Sistema de Logging

### Configuración del Logger

```typescript
import { logger } from './core/logger';

// Configurar nivel de logging
logger.setLevel('debug');

// Logging básico
logger.info('Agente iniciado correctamente');
logger.warn('Conexión lenta al servidor');
logger.error('Error al procesar evento', error);
logger.debug('Datos de depuración', { data: debugInfo });

// Logging estructurado
logger.info('Evento procesado', {
  eventType: 'file_access',
  fileName: 'document.pdf',
  userId: 'usuario@empresa.com',
  timestamp: new Date()
});
```

### Configuración Avanzada

```typescript
// Configurar salida a archivo
const logConfig = {
  level: 'info',
  file: './logs/agent.log',
  maxSize: '10MB',
  maxFiles: 5,
  format: 'json'
};

// Logging condicional por severidad
if (event.severity === 'critical') {
  logger.error('Evento crítico detectado', {
    eventId: event.id,
    type: event.type,
    data: event.data
  });
  
  // Envío inmediato de eventos críticos
  await communication.sendEvents([event]);
}
```

---

## Interfaces y Tipos

### AgentEvent

```typescript
interface AgentEvent {
  agentId: string;
  type: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  signature?: string;
}
```

### CollectorEvent

```typescript
interface CollectorEvent {
  type: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  collector?: string;
  source?: string;
}
```

### SystemMetrics

```typescript
interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkActivity?: {
    bytesIn: number;
    bytesOut: number;
  };
  processCount?: number;
  timestamp: Date;
}
```

### RegistrationResult

```typescript
interface RegistrationResult {
  success: boolean;
  agentId?: string;
  token?: string;
  message?: string;
  config?: {
    heartbeatInterval?: number;
    endpoints?: {
      data?: string;
      heartbeat?: string;
    };
  };
}
```

---

## Ejemplos de Integración Completa

### Agente Básico

```typescript
import { AgentBase } from './common/agent-base';
import { loadConfig } from './common/agent-config';

class BasicAgent extends AgentBase {
  constructor(configPath: string) {
    super(configPath);
  }
  
  protected async startMonitoring(): Promise<void> {
    // Monitoreo básico cada 30 segundos
    setInterval(async () => {
      await this.collectBasicMetrics();
    }, 30000);
  }
  
  private async collectBasicMetrics(): Promise<void> {
    const metrics = await this.getSystemMetrics();
    
    await this.queueEvent({
      type: 'system_metrics',
      timestamp: new Date(),
      data: metrics
    });
  }
  
  private async getSystemMetrics(): Promise<SystemMetrics> {
    // Implementación específica de métricas
    return {
      cpuUsage: process.cpuUsage().user / 1000000,
      memoryUsage: (process.memoryUsage().rss / 1024 / 1024),
      diskUsage: 0, // Implementar según la plataforma
      timestamp: new Date()
    };
  }
}

// Uso
async function main() {
  const agent = new BasicAgent('./config/agent-config.json');
  
  const initialized = await agent.initialize();
  if (!initialized) {
    console.error('Error en inicialización');
    process.exit(1);
  }
  
  const started = await agent.start();
  if (!started) {
    console.error('Error al iniciar agente');
    process.exit(1);
  }
  
  console.log('Agente ejecutándose...');
  
  // Manejo de señales para cierre limpio
  process.on('SIGINT', async () => {
    console.log('Cerrando agente...');
    await agent.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

Esta documentación de API proporciona una referencia completa para desarrolladores que trabajen con el sistema de agentes del SOC-Inteligente.