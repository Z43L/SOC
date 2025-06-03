# Documentación Completa del Sistema de Agentes

## Propósito General

El sistema de agentes del SOC Inteligente SaaS es responsable de recolectar datos de seguridad directamente desde los endpoints (dispositivos cliente). Los agentes funcionan como binarios autónomos instalados en sistemas Windows, Linux y macOS.

### ¿Qué hace un Agente SOC?

Imagina el agente como un **guardián de seguridad digital** que se instala en cada computadora de tu empresa. Su trabajo es:
- **Observar** todo lo que pasa en esa computadora
- **Recopilar** información de eventos importantes
- **Reportar** al centro de control (servidor SOC)
- **Responder** a comandos remotos cuando sea necesario

### Características Principales

- **Multiplataforma**: Compatible con Windows, Linux y macOS
- **Modular**: Sistema de colectores intercambiables según la plataforma
- **Seguro**: Comunicación encriptada y validación de integridad
- **Autónomo**: Funciona independientemente sin requerir servicios externos
- **Configurable**: Personalizable según las necesidades de seguridad
- **Auto-actualizable**: Capacidad de actualizarse automáticamente

## Arquitectura del Sistema de Agentes

### Estructura Modular Actual

```
agents/
├── core/                         # Funcionalidades centrales
│   ├── agent-config.ts          # Gestión de configuración con encriptación
│   ├── logger.ts               # Sistema de logging con rotación
│   ├── transport.ts            # Transporte HTTPS/WebSocket seguro
│   ├── queue.ts                # Cola persistente de eventos
│   ├── metrics.ts              # Recolección de métricas del sistema
│   ├── heartbeat.ts            # Gestión de heartbeats y estado
│   └── index.ts                # Exports centralizados
├── collectors/                   # Sistema de colectores modulares
│   ├── types.ts               # Interfaces y tipos compartidos
│   ├── index.ts               # Carga dinámica de colectores
│   ├── linux/                 # Colectores específicos para Linux
│   │   ├── filesystem.ts      # Monitor de cambios en archivos
│   │   ├── journald.ts        # Colector de systemd journald
│   │   ├── network.ts         # Monitor de conexiones de red
│   │   ├── process.ts         # Monitor de procesos
│   │   ├── module.ts          # Monitor de módulos del kernel
│   │   └── index.ts           # Exports de Linux
│   ├── windows/               # Colectores específicos para Windows
│   │   ├── event-log.ts       # Monitor de Event Log
│   │   ├── process.ts         # Monitor de procesos (WMI)
│   │   ├── registry.ts        # Monitor del registro
│   │   ├── services.ts        # Monitor de servicios
│   │   └── index.ts           # Exports de Windows
│   └── macos/                 # Colectores específicos para macOS
│       └── index.ts           # Exports de macOS (en desarrollo)
├── commands/                     # Sistema de comandos remotos
│   ├── executor.ts            # Ejecutor de comandos seguros
│   └── index.ts               # Exports de comandos
├── updater/                      # Sistema de auto-actualización
│   ├── updater.ts             # Lógica de actualización
│   └── index.ts               # Exports del updater
├── common/                       # Utilidades compartidas
├── main.ts                       # Punto de entrada principal completo
├── main-simple.ts               # Versión simplificada para testing
├── main-windows.ts              # Versión específica para Windows
├── main-enhanced.ts             # Versión con características avanzadas
└── windows-agent.ts             # Implementación específica de Windows
```

### Principios de Diseño

1. **Modularidad**: Cada componente tiene una responsabilidad específica
2. **Compatibilidad Multiplataforma**: Carga dinámica según el sistema operativo
3. **Seguridad por Diseño**: Validación, encriptación y autenticación en todos los niveles
4. **Tolerancia a Fallos**: Manejo robusto de errores y reconexión automática
5. **Configurabilidad**: Cada aspecto del agente es configurable
6. **Observabilidad**: Logging detallado y métricas para monitoreo

## Documentación Detallada por Archivo

### Archivos Principales (Entry Points)

#### 1. `main.ts` - Punto de Entrada Completo

**Propósito**: Implementación completa del agente con todas las características.

**Estructura del Código**:
```typescript
/**
 * Punto de entrada principal para el agente SOC
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  loadConfig,
  AgentConfig,
  EventQueue,
  Transport,
  Logger,
  MetricsCollector,
  HeartbeatManager,
  AgentEvent
} from './core';
import { loadEnabledCollectors, startCollectors, stopCollectors } from './collectors';
import { CommandExecutor, CommandType } from './commands';
import { Updater } from './updater';

// Versión actual del agente
const AGENT_VERSION = '1.0.0';

/**
 * Clase principal del agente
 */
class Agent {
  private config: AgentConfig;
  private logger: Logger;
  private transport: Transport;
  private eventQueue: EventQueue;
  private metricsCollector: MetricsCollector;
  private heartbeatManager: HeartbeatManager;
  private commandExecutor: CommandExecutor;
  private updater: Updater | null = null;
  
  private collectors: any[] = [];
  private running: boolean = false;
  private uploadTimer: NodeJS.Timeout | null = null;
  
  constructor(configPath: string) {
    // Inicialización de componentes core
  }
}
```

**Funcionalidades Principales**:
- Inicialización de todos los módulos core
- Gestión del ciclo de vida completo del agente
- Coordinación entre colectores, transporte y cola de eventos
- Manejo de comandos remotos
- Sistema de auto-actualización

#### 2. `main-simple.ts` - Versión Simplificada

**Propósito**: Implementación minimalista para testing y despliegues básicos.

**Diferencias con main.ts**:
- Sin sistema de comandos remotos
- Sin auto-actualización
- Configuración simplificada
- Ideal para pruebas y desarrollo

#### 3. `main-windows.ts` - Versión Específica para Windows

**Propósito**: Implementación optimizada para sistemas Windows con características específicas.

**Características Especiales**:
- Integración con servicios de Windows
- Colectores específicos de Windows (Event Log, Registry, WMI)
- Manejo de permisos administrativos

#### 4. `windows-agent.ts` - Implementación Windows Nativa

**Propósito**: Clase especializada para funcionalidades específicas de Windows.

**Funcionalidades**:
- Interacción con APIs nativas de Windows
- Gestión de servicios Windows
- Monitoreo avanzado del registro

### Imports y Dependencias

```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  loadConfig,
  AgentConfig,
  EventQueue,
  Transport,
  Logger,
  MetricsCollector,
  HeartbeatManager,
  AgentEvent
} from './core';
import { loadEnabledCollectors, startCollectors, stopCollectors } from './collectors';
import { CommandExecutor, CommandType } from './commands';
import { Updater } from './updater';
```

**Dependencias Core**:
- **OS/Path/FS**: APIs nativas de Node.js para interacción con sistema
- **Core modules**: Módulos centrales del agente
- **Collectors**: Sistema de recolección de datos modular
- **Commands**: Ejecutor de comandos remotos
- **Updater**: Sistema de auto-actualización

### Constantes Globales

```typescript
const AGENT_VERSION = '1.0.0';
```

**Variables Globales**:
- **AGENT_VERSION**: Versión actual del agente (usado para actualizaciones y reporting)

### Clase Principal: Agent

#### Propiedades de la Clase

```typescript
class Agent {
  private config: AgentConfig;           // Configuración del agente
  private logger: Logger;                // Sistema de logging
  private transport: Transport;          // Transporte de datos al servidor
  private eventQueue: EventQueue;       // Cola de eventos locales
  private metricsCollector: MetricsCollector;  // Recolector de métricas
  private heartbeatManager: HeartbeatManager;  // Gestor de heartbeats
  private commandExecutor: CommandExecutor;    // Ejecutor de comandos remotos
  private updater: Updater | null = null;     // Sistema de actualización
  
  private collectors: any[] = [];        // Colectores activos
  private running: boolean = false;      // Estado de ejecución
  private uploadTimer: NodeJS.Timeout | null = null;  // Timer para uploads
}
```

**Estado del Agente**:
- **config**: Configuración cargada desde archivo o servidor
- **logger**: Instancia de logging centralizado
- **transport**: Maneja comunicación HTTPS/WSS con servidor
- **eventQueue**: Cola local para eventos antes de envío
- **metricsCollector**: Recolecta métricas de performance del agente
- **heartbeatManager**: Envía señales de vida al servidor
- **commandExecutor**: Procesa comandos recibidos del servidor
- **updater**: Gestiona actualizaciones automáticas del agente
- **collectors**: Array de colectores de datos activos
- **running**: Bandera de estado de ejecución
- **uploadTimer**: Timer para envíos periódicos al servidor

#### Constructor

```typescript
constructor(configPath: string) {
  // Inicializar con valores temporales hasta cargar configuración
  this.config = {} as AgentConfig;
  this.logger = new Logger({ level: 'info', enableConsole: true });
  this.transport = {} as Transport;
  this.eventQueue = {} as EventQueue;
  this.metricsCollector = {} as MetricsCollector;
  this.heartbeatManager = {} as HeartbeatManager;
  this.commandExecutor = {} as CommandExecutor;
}
```

**Parámetros**:
- **configPath**: Ruta al archivo de configuración del agente

**Inicialización**:
- Inicializa todas las propiedades con valores temporales
- Logger configurado con nivel 'info' y output a consola
- Los otros componentes se inicializan después de cargar configuración

## Flujo de Ejecución del Agente - Explicación Detallada para Principiantes

### ¿Qué hace un Agente SOC?

Imagina el agente como un **guardián de seguridad digital** que se instala en cada computadora de tu empresa. Su trabajo es:
- **Observar** todo lo que pasa en esa computadora
- **Recopilar** información de eventos importantes
- **Reportar** al centro de control (servidor SOC)
- **Responder** a comandos remotos cuando sea necesario

### Anatomía del Agente - Comparación con el Cuerpo Humano

Para entender mejor cómo funciona, usemos la analogía del cuerpo humano:

```
Agente SOC ≈ Cuerpo Humano
├── 🧠 Core (Cerebro)          → Coordinación central
├── 👀 Collectors (Ojos)       → Observación del entorno  
├── 📡 Transport (Sistema Nervioso) → Comunicación
├── 📝 Logger (Memoria)        → Registro de eventos
├── 💾 Queue (Estómago)        → Almacenamiento temporal
└── ❤️ Heartbeat (Corazón)     → Señales de vida
```

### 1. Fase de Inicialización (Despertar del Agente)

#### ¿Qué pasa cuando el agente se inicia?

```typescript
// Ejemplo simplificado del proceso de inicialización
async function startAgent() {
  console.log('🚀 Iniciando Agente SOC...');
  
  // 1. Cargar configuración (como leer instrucciones de trabajo)
  const config = await loadConfig();
  
  // 2. Inicializar sistemas internos (preparar herramientas)
  const logger = new Logger(config.logging);
  const transport = new Transport(config.server);
  
  // 3. Detectar en qué tipo de computadora estamos
  const platform = detectPlatform(); // Windows, Linux, macOS
  
  // 4. Cargar los "sensores" apropiados para esta plataforma
  const collectors = await loadCollectors(platform);
  
  console.log(`✅ Agente listo en ${platform} con ${collectors.length} sensores`);
}
```

**Paso a paso en lenguaje sencillo**:

**1. Leer las instrucciones (Configuración)**:
```json
{
  "servidor_central": "https://soc.miempresa.com",
  "intervalo_recoleccion": "30 segundos",
  "que_monitorear": ["procesos", "conexiones_red", "archivos"],
  "nivel_detalle": "medio"
}
```

**2. Preparar herramientas internas**:
- **Logger**: Como un cuaderno para anotar todo lo que pasa
- **Transport**: Como un walkie-talkie para hablar con el servidor
- **Queue**: Como una caja temporal para guardar información

**3. Detectar el entorno**:
```typescript
function detectPlatform(): string {
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'darwin') return 'macOS';
  if (process.platform === 'linux') return 'Linux';
  return 'Unknown';
}
```

**4. Cargar sensores específicos**:
```typescript
// En Windows, carga estos colectores:
const windowsCollectors = [
  new WindowsProcessCollector(),    // Vigila programas que se ejecutan
  new WindowsEventLogCollector(),   // Lee logs de Windows
  new WindowsRegistryCollector()    // Vigila cambios en el registro
];

// En Linux, carga estos otros:
const linuxCollectors = [
  new LinuxProcessCollector(),      // Vigila procesos
  new SyslogCollector(),           // Lee logs del sistema
  new SystemdCollector()           // Vigila servicios
];
```

### 2. Fase de Operación (El Agente Trabajando)

#### El Ciclo Diario del Agente

Como un vigilante que hace rondas cada 30 segundos:

```typescript
async function workLoop() {
  while (agent.isRunning) {
    try {
      // 🔍 PASO 1: Observar (como hacer una ronda de seguridad)
      console.log('🔍 Iniciando ronda de recolección...');
      const events = [];
      
      // Preguntar a cada "sensor" qué ha visto
      for (const collector of this.collectors) {
        const newEvents = await collector.collect();
        events.push(...newEvents);
        console.log(`📊 ${collector.name}: ${newEvents.length} eventos nuevos`);
      }
      
      // 📦 PASO 2: Guardar temporalmente (como poner en una caja)
      await this.eventQueue.add(events);
      console.log(`📦 Total de eventos en cola: ${this.eventQueue.size()}`);
      
      // 📡 PASO 3: Enviar al servidor si hay suficientes eventos
      if (this.eventQueue.size() >= 100) {
        await this.sendEventsToServer();
      }
      
      // ⏰ PASO 4: Descansar hasta la próxima ronda
      console.log('😴 Esperando 30 segundos hasta la próxima ronda...');
      await sleep(30000);
      
    } catch (error) {
      console.error('❌ Error durante la ronda:', error);
      await sleep(5000); // Esperar menos tiempo si hay error
    }
  }
}
```

#### Ejemplo de Eventos Recopilados

**Lo que ve el agente vs. Lo que reporta**:

```typescript
// Lo que el colector de procesos ve internamente:
const rawData = `
notepad.exe    1234  C:\\Windows\\System32\\notepad.exe
chrome.exe     5678  C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --new-window
```

// Lo que convierte en evento estructurado:
const events = [
  {
    type: 'process_started',
    timestamp: '2024-01-15T14:30:00Z',
    data: {
      name: 'notepad.exe',
      pid: 1234,
      path: 'C:\\Windows\\System32\\notepad.exe',
      user: 'EMPRESA\\juan.perez',
      suspicious_score: 0.1  // Puntuación de riesgo: baja
    }
  },
  {
    type: 'process_started', 
    timestamp: '2024-01-15T14:30:02Z',
    data: {
      name: 'chrome.exe',
      pid: 5678,
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      user: 'EMPRESA\\juan.perez',
      suspicious_score: 0.3  // Puntuación ligeramente mayor
    }
  }
];
```

#### Comunicación con el Servidor

**El agente como reportero de noticias**:

```typescript
async function sendEventsToServer() {
  // 1. Preparar el "paquete de noticias"
  const events = await this.eventQueue.getBatch(100);
  
  const report = {
    agentId: 'laptop-juan-marketing-001',
    computerName: 'LAPTOP-JUAN',
    timestamp: new Date(),
    eventCount: events.length,
    events: events
  };
  
  // 2. Enviar al servidor central
  try {
    const response = await fetch('https://soc.miempresa.com/api/agent/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(report)
    });
    
    if (response.ok) {
      console.log('✅ Eventos enviados exitosamente');
      await this.eventQueue.markAsSent(events);
    } else {
      console.error('❌ Error enviando eventos:', response.status);
    }
    
  } catch (error) {
    console.error('❌ Error de conexión:', error);
    // Los eventos se quedan en la cola para reintentar después
  }
}
```

### 3. Fase de Mantenimiento (Cuidado Personal del Agente)

#### Auto-cuidado del Agente

Como una persona que se mantiene saludable:

```typescript
class AgentMaintenance {
  async performMaintenance() {
    // 🔄 Verificar si hay actualizaciones disponibles
    await this.checkForUpdates();
    
    // 🧹 Limpiar archivos temporales viejos
    await this.cleanupOldFiles();
    
    // 📊 Revisar el estado de salud
    await this.performHealthCheck();
    
    // 💾 Optimizar uso de memoria
    await this.optimizeMemory();
  }
  
  async checkForUpdates() {
    const currentVersion = '1.0.0';
    const latestVersion = await this.getLatestVersion();
    
    if (latestVersion > currentVersion) {
      console.log(`🔄 Nueva versión disponible: ${latestVersion}`);
      await this.downloadAndInstallUpdate(latestVersion);
    }
  }
  
  async performHealthCheck() {
    const health = {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      collectorsRunning: this.collectors.filter(c => c.isActive).length,
      queueSize: this.eventQueue.size(),
      lastServerContact: this.transport.lastSuccessfulConnection
    };
    
    // Enviar reporte de salud al servidor
    await this.sendHealthReport(health);
  }
}
```

### Manejo de Comandos Remotos

#### El Agente como Asistente Personal

El agente puede recibir "órdenes" del servidor central:

```typescript
class CommandHandler {
  async handleCommand(command: Command) {
    console.log(`📞 Comando recibido: ${command.type}`);
    
    switch (command.type) {
      case 'COLLECT_NOW':
        console.log('⚡ Realizando recolección inmediata...');
        await this.forceCollection();
        break;
        
      case 'UPDATE_CONFIG':
        console.log('⚙️ Actualizando configuración...');
        await this.updateConfiguration(command.data);
        break;
        
      case 'RESTART':
        console.log('🔄 Reiniciando agente...');
        await this.gracefulRestart();
        break;
        
      case 'GET_STATUS':
        console.log('📊 Enviando estado actual...');
        await this.sendStatusReport();
        break;
        
      default:
        console.log(`❓ Comando desconocido: ${command.type}`);
    }
  }
}
```

**Ejemplo de uso práctico**:
```
Administrador SOC ve comportamiento extraño en la laptop de Juan
↓
Envía comando "COLLECT_NOW" al agente en esa laptop
↓
Agente responde inmediatamente con datos detallados
↓
Administrador puede investigar el incidente
```

### Seguridad del Agente

#### Protecciones Implementadas

**1. Autenticación**:
```typescript
class AgentSecurity {
  private apiKey: string;
  
  async authenticate() {
    // El agente tiene una "cédula de identidad" única
    const credentials = {
      agentId: 'laptop-juan-001',
      secretKey: this.apiKey,
      timestamp: new Date(),
      signature: this.generateSignature()
    };
    
    const response = await this.sendToServer('/auth', credentials);
    return response.authenticated;
  }
}
```

**2. Encriptación**:
```typescript
// Todos los datos se envían encriptados
const encryptedData = encrypt(sensitiveData, this.encryptionKey);
await this.sendToServer('/events', encryptedData);
```

**3. Validación de Comandos**:
```typescript
async validateCommand(command: Command): Promise<boolean> {
  // ¿El comando viene del servidor correcto?
  if (!this.isFromTrustedServer(command.source)) return false;
  
  // ¿La firma digital es válida?
  if (!this.verifySignature(command)) return false;
  
  // ¿Tenemos permisos para este comando?
  if (!this.hasPermission(command.type)) return false;
  
  return true;
}
```

## Módulos Core - Documentación Detallada

### 1. `core/agent-config.ts` - Gestión de Configuración

**Propósito**: Gestión centralizada y segura de la configuración del agente.

**Interfaces Principales**:
```typescript
export interface AgentConfig {
  // Configuración de conexión al servidor
  serverUrl: string;
  organizationKey: string;
  
  // Identificación del agente
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
  encryptedOrganizationKey?: string;
  validateCertificates: boolean;
  expectedBinaryHash?: string;
  maxMessageSize: number;
  allowInsecureConnections: boolean;
  
  // Capacidades
  capabilities: AgentCapabilities;
  
  // Almacenamiento y registros
  configPath: string;
  logFilePath: string;
  maxStorageSize: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Cola de eventos
  queueSize: number;
  queuePersistPath?: string;
  
  // Transporte
  transport: 'https' | 'websocket';
  compressionEnabled: boolean;
  
  // Comandos push
  enableCommands: boolean;
  allowedCommands?: string[];
}

export interface AgentCapabilities {
  fileSystemMonitoring: boolean;
  processMonitoring: boolean;
  networkMonitoring: boolean;
  registryMonitoring: boolean; // Solo Windows
  securityLogsMonitoring: boolean;
  malwareScanning: boolean;
  vulnerabilityScanning: boolean;
}
```

**Funciones de Seguridad**:
```typescript
// Validación de integridad del binario
export async function validateAgentIntegrity(expectedHash?: string): Promise<boolean>

// Encriptación de valores sensibles
export function encryptConfigValue(value: string, secret: string): string
export function decryptConfigValue(encryptedValue: string, secret: string): string

// Aplicación de variables de entorno
function applyEnvironmentOverrides(config: AgentConfig): void
```

**Configuración Predeterminada**:
```typescript
export const DEFAULT_CONFIG: Omit<AgentConfig, 'configPath'> = {
  serverUrl: 'https://soc.example.com',
  organizationKey: '',
  heartbeatInterval: 60,
  dataUploadInterval: 300,
  scanInterval: 3600,
  registrationEndpoint: '/api/agents/register',
  dataEndpoint: '/api/agents/data',
  heartbeatEndpoint: '/api/agents/heartbeat',
  signMessages: false,
  validateCertificates: true,
  maxMessageSize: 1048576, // 1MB
  allowInsecureConnections: false,
  capabilities: {
    fileSystemMonitoring: true,
    processMonitoring: true,
    networkMonitoring: true,
    registryMonitoring: false,
    securityLogsMonitoring: true,
    malwareScanning: false,
    vulnerabilityScanning: false
  },
  logLevel: 'info',
  maxStorageSize: 500,
  queueSize: 1000,
  transport: 'https',
  compressionEnabled: true,
  enableCommands: false,
  cpuAlertThreshold: 90
};
```

### 2. `core/logger.ts` - Sistema de Logging

**Propósito**: Sistema de logging robusto con rotación automática y múltiples salidas.

**Interfaz Principal**:
```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  level: LogLevel;
  filePath?: string;
  maxSizeBytes?: number;
  maxAgeDays?: number;
  enableConsole?: boolean;
  rotationCount?: number;
}

export class Logger {
  constructor(options: LogOptions)
  
  // Métodos de logging
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
  
  // Gestión de archivos
  private initLogFile(): void
  private rotateLogFile(): void
  private compressOldLogFile(filePath: string): Promise<void>
}
```

**Características**:
- **Rotación Automática**: Por tamaño (50MB) y antigüedad (30 días)
- **Compresión**: Archivos antiguos se comprimen con gzip
- **Multi-salida**: Archivo y consola simultáneamente
- **Niveles Configurables**: debug, info, warn, error
- **Thread-safe**: Manejo seguro de escritura concurrente

**Ejemplo de Uso**:
```typescript
const logger = new Logger({
  level: 'info',
  filePath: '/var/log/soc-agent/agent.log',
  maxSizeBytes: 52428800, // 50MB
  maxAgeDays: 30,
  enableConsole: true,
  rotationCount: 5
});

logger.info('Agente iniciado correctamente');
logger.warn('Conexión inestable detectada');
logger.error('Error crítico en colector', { error: err.message });
```

### 3. `core/transport.ts` - Transporte Seguro

**Propósito**: Comunicación segura y confiable con el servidor SOC mediante HTTPS y WebSockets.

**Interfaces Principales**:
```typescript
export interface TransportOptions {
  serverUrl: string;
  token?: string;
  serverCA?: string;
  enableCompression: boolean;
  autoReconnect?: boolean;
}

export interface TransportRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  headers?: Record<string, string>;
}

export interface TransportResponse {
  success: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

export type CommandHandler = (command: Record<string, unknown>) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}>;
```

**Clase Transport**:
```typescript
export class Transport extends EventEmitter {
  constructor(options: TransportOptions, config?: AgentConfig)
  
  // Peticiones HTTP/HTTPS
  async request(req: TransportRequest): Promise<TransportResponse>
  
  // Conexión WebSocket para comandos en tiempo real
  connectWebSocket(): void
  disconnect(): void
  
  // Gestión de comandos
  registerCommandHandler(command: string, handler: CommandHandler): void
  
  // Reconexión automática
  private reconnect(): void
  private resetReconnectAttempts(): void
}
```

**Características de Seguridad**:
- **TLS 1.3**: Encriptación de transporte
- **Certificate Pinning**: Validación de certificados específicos
- **Límites de Mensaje**: Máximo 1MB por mensaje
- **Retry Logic**: Reconexión exponencial con límites
- **Compresión**: Compresión gzip opcional
- **Timeouts**: Timeouts configurables para todas las operaciones

**Reconexión Inteligente**:
```typescript
const RECONNECT_INTERVALS = [5000, 10000, 30000, 60000, 120000];
const MAX_RECONNECT_ATTEMPTS = 20;
const RECONNECT_RESET_INTERVAL = 10 * 60 * 1000; // 10 minutos
```

### 4. `core/queue.ts` - Cola de Eventos

**Propósito**: Gestión de cola persistente para eventos del agente con recuperación tras fallos.

**Funcionalidades**:
- **Persistencia**: Los eventos se guardan en disco
- **Compresión**: Compresión automática de eventos antiguos
- **Límites**: Control de tamaño y cantidad de eventos
- **Recuperación**: Recuperación automática tras reinicio
- **Batch Processing**: Procesamiento por lotes para eficiencia

### 5. `core/metrics.ts` - Recolección de Métricas

**Propósito**: Recolección y agregación de métricas del sistema y del agente.

**Métricas Recolectadas**:
- CPU y memoria del agente
- Número de eventos procesados
- Errores y excepciones
- Latencia de comunicación
- Estado de colectores
- Métricas del sistema operativo

### 6. `core/heartbeat.ts` - Gestión de Heartbeats

**Propósito**: Comunicación periódica con el servidor para mantener estado de conexión.

**Funcionalidades**:
- Envío periódico de estado
- Detección de desconexión
- Sincronización de configuración
- Reporte de métricas básicas

## Sistema de Colectores - Documentación Completa

### Arquitectura Modular

Los colectores siguen una arquitectura de plugin que permite cargar dinámicamente solo los colectores compatibles con el sistema operativo actual:

```typescript
// collectors/types.ts - Interfaz común para todos los colectores
export interface Collector {
  name: string;
  description: string;
  compatibleSystems: ('linux' | 'darwin' | 'win32')[];
  
  // Métodos de ciclo de vida
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  
  // Configuración opcional
  configure?: (config: CollectorConfig) => Promise<void>;
}

// Configuración para colectores
export interface CollectorConfig {
  eventCallback?: (event: Omit<AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void;
  logger?: Logger;
  [key: string]: unknown; // Configuración específica del colector
}
```

### `collectors/index.ts` - Carga Dinámica de Colectores

**Propósito**: Gestión centralizada de la carga y coordinación de colectores según la plataforma.

**Funciones Principales**:
```typescript
// Obtiene todos los colectores compatibles con el SO actual
export async function getCompatibleCollectors(logger: Logger): Promise<Collector[]> {
  const platform = os.platform();
  const collectors: Collector[] = [];
  
  switch (platform) {
    case 'linux':
      const linuxModules = await import('./linux');
      Object.values(linuxModules).forEach(collector => {
        if (isCollector(collector)) {
          collectors.push(collector);
        }
      });
      break;
      
    case 'darwin':
      const macosModules = await import('./macos');
      Object.values(macosModules).forEach(collector => {
        if (isCollector(collector)) {
          collectors.push(collector);
        }
      });
      break;
      
    case 'win32':
      const windowsModules = await import('./windows');
      Object.values(windowsModules).forEach(collector => {
        if (isCollector(collector)) {
          collectors.push(collector);
        }
      });
      break;
  }
  
  return collectors;
}

// Carga solo los colectores habilitados en configuración
export async function loadEnabledCollectors(
  enabledCollectors: string[],
  logger: Logger
): Promise<Collector[]>

// Inicia todos los colectores especificados
export async function startCollectors(collectors: Collector[], logger: Logger): Promise<void>

// Detiene todos los colectores especificados
export async function stopCollectors(collectors: Collector[], logger: Logger): Promise<void>
```

### Colectores Windows - Documentación Específica

#### 1. `collectors/windows/process.ts` - Monitor de Procesos

**Propósito**: Monitorea procesos en ejecución utilizando WMI y tasklist de Windows.

**Código Principal**:
```typescript
export const processCollector: Collector = {
  name: 'windows-process',
  description: 'Monitorea procesos en ejecución en Windows utilizando WMI y tasklist',
  compatibleSystems: ['win32'],
  
  async configure(config: CollectorConfig): Promise<void> {
    eventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  async start(): Promise<boolean> {
    // Verificar que estamos en Windows
    if (process.platform !== 'win32') {
      return false;
    }
    
    // Realizar escaneo inicial
    await scanProcesses();
    
    // Configurar monitoreo periódico cada 30 segundos
    monitoringInterval = setInterval(scanProcesses, 30000);
    
    return true;
  },
  
  async stop(): Promise<boolean> {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    return true;
  }
};
```

**Funcionalidades**:
- **Detección de Procesos Nuevos**: Identifica procesos recién iniciados
- **Procesos Sospechosos**: Lista de procesos potencialmente peligrosos
- **Métricas de Proceso**: CPU, memoria, tiempo de ejecución
- **Árbol de Procesos**: Relación padre-hijo entre procesos

**Procesos Sospechosos Monitoreados**:
```typescript
const SUSPICIOUS_PROCESSES = new Set([
  'cmd.exe',         // Línea de comandos
  'powershell.exe',  // PowerShell
  'pwsh.exe',        // PowerShell Core
  'wscript.exe',     // Windows Script Host
  'cscript.exe',     // Command Script Host
  'regsvr32.exe',    // Registro de DLL
  'rundll32.exe',    // Ejecutor de DLL
  'mshta.exe',       // HTML Application Host
  'certutil.exe',    // Utilidad de certificados
  'bitsadmin.exe',   // BITS Admin
  'schtasks.exe',    // Programador de tareas
  'at.exe',          // Programador de tareas legacy
  'sc.exe',          // Service Control
  'reg.exe',         // Editor de registro
  'wmic.exe',        // WMI Command
  'taskkill.exe',    // Terminador de procesos
  'net.exe',         // Comandos de red
  'netsh.exe'        // Network Shell
]);
```

#### 2. `collectors/windows/event-log.ts` - Monitor Event Log

**Propósito**: Monitorea los Event Logs de Windows para detectar eventos de seguridad.

**Logs Monitoreados**:
- **Security Log**: Eventos de autenticación y autorización
- **System Log**: Eventos del sistema
- **Application Log**: Eventos de aplicaciones
- **Setup Log**: Eventos de instalación
- **PowerShell Log**: Eventos de PowerShell

#### 3. `collectors/windows/registry.ts` - Monitor del Registro

**Propósito**: Monitorea cambios críticos en el registro de Windows.

**Claves Monitoreadas**:
- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` - Programas de inicio
- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce` - Programas de inicio único
- `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` - Programas de inicio del usuario
- `HKLM\SYSTEM\CurrentControlSet\Services` - Servicios del sistema

#### 4. `collectors/windows/services.ts` - Monitor de Servicios

**Propósito**: Monitorea servicios de Windows y detecta cambios sospechosos.

**Características**:
- **Estado de Servicios**: Running, Stopped, Paused
- **Servicios Nuevos**: Detección de servicios recién instalados
- **Cambios de Configuración**: Modificaciones en servicios existentes

### Colectores Linux - Documentación Específica

#### 1. `collectors/linux/process.ts` - Monitor de Procesos Linux

**Propósito**: Monitorea procesos en sistemas Linux utilizando `/proc`.

**Fuentes de Datos**:
- `/proc/[pid]/stat` - Estadísticas del proceso
- `/proc/[pid]/status` - Estado detallado del proceso
- `/proc/[pid]/cmdline` - Línea de comandos
- `/proc/[pid]/exe` - Ejecutable del proceso

#### 2. `collectors/linux/filesystem.ts` - Monitor del Sistema de Archivos

**Propósito**: Monitorea cambios en el sistema de archivos utilizando inotify.

**Eventos Monitoreados**:
```typescript
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
}
```

**Directorios Monitoreados**:
- `/etc/` - Archivos de configuración
- `/bin/`, `/sbin/`, `/usr/bin/`, `/usr/sbin/` - Binarios del sistema
- `/home/` - Directorios de usuario
- `/var/log/` - Archivos de log
- `/tmp/`, `/var/tmp/` - Directorios temporales

#### 3. `collectors/linux/journald.ts` - Monitor de Systemd Journal

**Propósito**: Monitorea logs de systemd journal para eventos del sistema.

**Servicios Monitoreados**:
- **sshd**: Conexiones SSH
- **sudo**: Comandos con privilegios elevados
- **systemd**: Eventos del sistema
- **cron**: Tareas programadas

#### 4. `collectors/linux/network.ts` - Monitor de Red Linux

**Propósito**: Monitorea conexiones de red y tráfico utilizando netstat y ss.

**Métricas Recolectadas**:
```typescript
export interface NetworkConnection {
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  protocol: 'tcp' | 'udp';
  state?: string;
  processId?: number;
  processName?: string;
  bytesIn?: number;
  bytesOut?: number;
  established: Date;
}
```

#### 5. `collectors/linux/module.ts` - Monitor de Módulos del Kernel

**Propósito**: Monitorea carga y descarga de módulos del kernel Linux.

**Fuentes de Datos**:
- `/proc/modules` - Módulos cargados actualmente
- `/sys/module/` - Información detallada de módulos
- `dmesg` - Mensajes del kernel

### Tipos de Eventos y Estructuras de Datos

#### Evento Principal del Agente
```typescript
export interface AgentEvent {
  agentId: string;
  eventType: 'system' | 'process' | 'file' | 'network' | 'registry' | 'auth' | 'malware' | 'vulnerability';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  details: EventDetails;
  signature?: string; // Firma digital opcional
  hostId?: string;
  agentVersion?: string;
  tags?: string[];
}
```

#### Métricas del Sistema
```typescript
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
  networkConnections?: number;
}
```

#### Información de Proceso
```typescript
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
```

### Gestión de Colectores

#### Configuración Dinámica
Los colectores pueden ser habilitados/deshabilitados dinámicamente:

```typescript
// En la configuración del agente
{
  "enabledCollectors": [
    "windows-process",
    "windows-event-log",
    "windows-registry",
    "windows-services"
  ]
}
```

#### Manejo de Errores
```typescript
export async function startCollectors(collectors: Collector[], logger: Logger): Promise<void> {
  for (const collector of collectors) {
    try {
      logger.info(`Starting collector: ${collector.name}`);
      const success = await collector.start();
      
      if (success) {
        logger.info(`Collector ${collector.name} started successfully`);
      } else {
        logger.warn(`Collector ${collector.name} failed to start`);
      }
    } catch (error) {
      logger.error(`Error starting collector ${collector.name}: ${error.message}`);
    }
  }
}
```

#### Filtrado y Procesamiento
Cada colector puede implementar filtros específicos para reducir el ruido:

```typescript
// Ejemplo de filtro en process collector
function shouldReportProcess(process: ProcessInfo): boolean {
  // No reportar procesos del sistema básicos
  if (SYSTEM_PROCESSES.has(process.name.toLowerCase())) {
    return false;
  }
  
  // Reportar procesos sospechosos siempre
  if (SUSPICIOUS_PROCESSES.has(process.name.toLowerCase())) {
    return true;
  }
  
  // Reportar procesos con alto uso de CPU
  if (process.cpuUsage > 80) {
    return true;
  }
  
  // Reportar procesos con alto uso de memoria
  if (process.memoryUsage > 500 * 1024 * 1024) { // 500MB
    return true;
  }
  
  return false;
}
```

## Seguridad del Agente

### 1. Comunicación Segura
- **TLS 1.3**: Encriptación de transporte
- **Certificate Pinning**: Validación de certificados
- **Mutual Authentication**: Autenticación mutua
- **Message Integrity**: Validación de integridad de mensajes

### 2. Protección Local
- **Code Signing**: Verificación de firma digital
- **Tampering Detection**: Detección de modificaciones
- **Secure Storage**: Almacenamiento seguro de configuración
- **Process Protection**: Protección del proceso del agente

### 3. Privacidad
- **Data Minimization**: Recolección mínima necesaria
- **Local Filtering**: Filtrado local de datos sensibles
- **Encryption at Rest**: Encriptación de datos locales
- **Secure Deletion**: Borrado seguro de datos temporales

## Sistema de Comandos Remotos

### `commands/executor.ts` - Ejecutor de Comandos

**Propósito**: Ejecución segura de comandos remotos enviados desde el servidor SOC.

**Tipos de Comandos Soportados**:
```typescript
export type CommandType = 'script' | 'configUpdate' | 'isolate' | 'upgrade';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface CommandExecutorOptions {
  allowedCommands: CommandType[];
  tempDir?: string;
  maxExecutionTime?: number; // en milisegundos
}
```

**Clase CommandExecutor**:
```typescript
export class CommandExecutor {
  constructor(options: CommandExecutorOptions)
  
  // Ejecuta un script con parámetros
  async executeScript(params: {
    script: string;
    args?: string[];
    interpreter?: string;
  }): Promise<CommandResult>
  
  // Actualiza la configuración del agente
  async updateConfig(newConfig: any): Promise<CommandResult>
  
  // Aísla el endpoint de la red
  async isolateEndpoint(): Promise<CommandResult>
  
  // Inicia el proceso de actualización
  async upgradeAgent(version: string): Promise<CommandResult>
  
  // Verifica si un comando está permitido
  private isCommandAllowed(command: CommandType): boolean
  
  // Valida la seguridad de un script
  private validateScriptSecurity(script: string): boolean
}
```

**Características de Seguridad**:
- **Lista de Comandos Permitidos**: Solo se ejecutan comandos específicamente habilitados
- **Timeout de Ejecución**: Límite de tiempo configurable (1 minuto por defecto)
- **Validación de Scripts**: Verificación de contenido antes de ejecución
- **Sandbox**: Ejecución en directorio temporal aislado
- **Logging Completo**: Registro de todos los comandos ejecutados

**Ejemplo de Uso**:
```typescript
const executor = new CommandExecutor({
  allowedCommands: ['script', 'configUpdate'],
  maxExecutionTime: 30000, // 30 segundos
  tempDir: '/tmp/soc-agent'
});

// Ejecutar un script de diagnóstico
const result = await executor.executeScript({
  script: 'systeminfo',
  interpreter: 'cmd.exe'
});

console.log(`Salida: ${result.stdout}`);
console.log(`Duración: ${result.durationMs}ms`);
```

### Procesamiento de Comandos Push

#### Flujo de Comandos
1. **Recepción**: Comando recibido via WebSocket desde el servidor
2. **Autenticación**: Verificación de la firma digital del comando
3. **Autorización**: Verificación de permisos y comando permitido
4. **Validación**: Validación de parámetros y contenido
5. **Ejecución**: Procesamiento seguro del comando
6. **Respuesta**: Envío del resultado al servidor

#### Estructura de Comando
```typescript
interface RemoteCommand {
  id: string;                    // ID único del comando
  type: CommandType;             // Tipo de comando
  timestamp: Date;               // Timestamp de creación
  source: string;                // Origen del comando
  signature: string;             // Firma digital
  parameters: {                  // Parámetros específicos
    [key: string]: any;
  };
  timeout?: number;              // Timeout específico
  priority: 'low' | 'normal' | 'high' | 'critical';
}
```

#### Comandos Específicos

**1. Script Execution**:
```typescript
// Comando para ejecutar script de diagnóstico
{
  type: 'script',
  parameters: {
    script: 'Get-Process | Where-Object {$_.CPU -gt 50}',
    interpreter: 'powershell.exe',
    args: ['-ExecutionPolicy', 'Bypass']
  }
}
```

**2. Configuration Update**:
```typescript
// Comando para actualizar configuración
{
  type: 'configUpdate',
  parameters: {
    config: {
      dataUploadInterval: 600,
      enabledCollectors: ['windows-process', 'windows-event-log']
    }
  }
}
```

**3. Endpoint Isolation**:
```typescript
// Comando para aislar endpoint
{
  type: 'isolate',
  parameters: {
    duration: 3600, // 1 hora
    allowedHosts: ['soc.company.com'],
    reason: 'Malware detection'
  }
}
```

## Sistema de Auto-actualización

### `updater/updater.ts` - Gestor de Actualizaciones

**Propósito**: Actualización automática y segura del binario del agente.

**Configuración del Updater**:
```typescript
export interface UpdaterOptions {
  serverUrl: string;
  currentVersion: string;
  binaryPath: string;
  backupPath?: string;
  checksumType?: 'sha256' | 'sha512';
  updateEndpoint?: string;
  restartCommand?: string;
  platform?: string;
  arch?: string;
  enableSignatureVerification?: boolean;
  publicKeyPath?: string;
  trustedCertificate?: string;
}
```

**Clase Updater**:
```typescript
export class Updater {
  constructor(options: UpdaterOptions)
  
  // Verifica si hay actualizaciones disponibles
  async checkForUpdate(): Promise<{
    hasUpdate: boolean;
    latestVersion?: string;
    downloadUrl?: string;
    releaseNotes?: string;
    critical?: boolean;
  }>
  
  // Descarga y aplica la actualización
  async performUpdate(): Promise<{
    success: boolean;
    error?: string;
    backupPath?: string;
  }>
  
  // Revierte a la versión anterior
  async rollback(): Promise<boolean>
  
  // Verifica la integridad del archivo
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean>
  
  // Verifica la firma digital
  private async verifySignature(filePath: string): Promise<boolean>
  
  // Crea backup del binario actual
  private async createBackup(): Promise<string>
}
```

### Proceso de Actualización Segura

#### 1. Verificación de Actualizaciones
```typescript
// El agente verifica periódicamente nuevas versiones
const updateInfo = await updater.checkForUpdate();

if (updateInfo.hasUpdate) {
  console.log(`Nueva versión disponible: ${updateInfo.latestVersion}`);
  
  if (updateInfo.critical) {
    // Actualización crítica - aplicar inmediatamente
    await updater.performUpdate();
  } else {
    // Programar actualización para ventana de mantenimiento
    scheduleUpdate(updateInfo);
  }
}
```

#### 2. Descarga Segura
```typescript
async downloadUpdate(url: string, outputPath: string): Promise<boolean> {
  try {
    // Descargar archivo
    await this.downloadFile(url, outputPath);
    
    // Verificar checksum
    const checksumValid = await this.verifyChecksum(outputPath, expectedChecksum);
    if (!checksumValid) {
      throw new Error('Checksum verification failed');
    }
    
    // Verificar firma digital
    if (this.options.enableSignatureVerification) {
      const signatureValid = await this.verifySignature(outputPath);
      if (!signatureValid) {
        throw new Error('Digital signature verification failed');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}
```

#### 3. Aplicación de Actualización
```typescript
async performUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Crear backup del binario actual
    const backupPath = await this.createBackup();
    
    // 2. Descargar nueva versión
    const downloadSuccess = await this.downloadUpdate();
    if (!downloadSuccess) {
      return { success: false, error: 'Download failed' };
    }
    
    // 3. Detener agente actual
    await this.gracefulShutdown();
    
    // 4. Reemplazar binario
    await this.replaceBinary();
    
    // 5. Reiniciar con nueva versión
    await this.restart();
    
    return { success: true };
  } catch (error) {
    // En caso de error, revertir
    await this.rollback();
    return { success: false, error: error.message };
  }
}
```

#### 4. Mecanismo de Rollback
```typescript
async rollback(): Promise<boolean> {
  try {
    // Restaurar backup
    if (await this.restoreBackup()) {
      // Reiniciar con versión anterior
      await this.restart();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Rollback failed:', error);
    return false;
  }
}
```

### Seguridad de Actualizaciones

#### Verificaciones de Integridad
- **Checksums**: Verificación SHA256/SHA512 de archivos descargados
- **Firma Digital**: Verificación de firma del publisher
- **TLS**: Descarga sobre HTTPS con validación de certificados
- **Backup Automático**: Respaldo antes de cualquier actualización

#### Política de Actualizaciones
```typescript
interface UpdatePolicy {
  // Ventanas de mantenimiento permitidas
  maintenanceWindows: {
    start: string; // HH:mm
    end: string;   // HH:mm
    days: number[]; // 0=domingo, 6=sábado
  }[];
  
  // Tipos de actualización automática
  autoUpdate: {
    critical: boolean;     // Actualizaciones críticas
    security: boolean;     // Parches de seguridad
    features: boolean;     // Nuevas características
    bugfixes: boolean;     // Corrección de errores
  };
  
  // Configuración de rollback
  rollback: {
    automatic: boolean;    // Rollback automático en caso de error
    timeout: number;       // Tiempo antes de rollback automático
    healthChecks: string[]; // Verificaciones de salud post-actualización
  };
}
```

### Ejemplo de Configuración Completa

```typescript
const updater = new Updater({
  serverUrl: 'https://updates.soc.company.com',
  currentVersion: '1.0.0',
  binaryPath: process.execPath,
  backupPath: '/var/lib/soc-agent/backup',
  checksumType: 'sha256',
  updateEndpoint: '/api/agents/updates',
  platform: 'linux',
  arch: 'x64',
  enableSignatureVerification: true,
  publicKeyPath: '/etc/soc-agent/update-key.pub',
  trustedCertificate: '/etc/soc-agent/update-ca.crt'
});

// Verificar actualizaciones cada 6 horas
setInterval(async () => {
  try {
    const updateInfo = await updater.checkForUpdate();
    
    if (updateInfo.hasUpdate) {
      console.log(`Update available: ${updateInfo.latestVersion}`);
      
      if (updateInfo.critical || isMaintenanceWindow()) {
        const result = await updater.performUpdate();
        
        if (result.success) {
          console.log('Update completed successfully');
        } else {
          console.error('Update failed:', result.error);
        }
      }
    }
  } catch (error) {
    console.error('Update check failed:', error);
  }
}, 6 * 60 * 60 * 1000); // 6 horas
```

---

El sistema de agentes está diseñado para ser robusto, seguro y eficiente, proporcionando visibilidad completa de seguridad en endpoints distribuidos.