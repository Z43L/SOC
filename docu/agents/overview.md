# Documentación del Sistema de Agentes

## Propósito General

El sistema de agentes del SOC Inteligente SaaS es responsable de recolectar datos de seguridad directamente desde los endpoints (dispositivos cliente). Los agentes funcionan como binarios autónomos instalados en sistemas Windows, Linux y macOS.

## Arquitectura del Sistema de Agentes

### Estructura Modular

```
agents/
├── core/                    # Funcionalidades centrales
│   ├── agent-config.ts      # Gestión de configuración
│   ├── logger.ts           # Sistema de logging
│   ├── transport.ts        # Transporte seguro al servidor
│   ├── queue.ts            # Cola de eventos
│   ├── metrics.ts          # Recolección de métricas
│   └── heartbeat.ts        # Gestión de heartbeats
├── collectors/             # Sistema de colectores modulares
│   ├── types.ts           # Interfaces compartidas
│   ├── index.ts           # Gestión dinámica de colectores
│   ├── linux/             # Colectores específicos para Linux
│   ├── macos/             # Colectores específicos para macOS
│   └── windows/           # Colectores específicos para Windows
├── commands/              # Ejecutor de comandos remotos
├── updater/               # Sistema de auto-actualización
├── main.ts                # Punto de entrada principal
└── main-simple.ts         # Versión simplificada para testing
```

## Documentación de Archivo Principal: main.ts

### Propósito
`agents/main.ts` es el **punto de entrada principal** del agente. Coordina todos los subsistemas y gestiona el ciclo de vida completo del agente.

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

## Componentes Core del Agente

### 1. AgentConfig (`core/agent-config.ts`)

**Propósito**: Gestión centralizada de configuración

**Propiedades Principales**:
- **serverId**: ID del servidor SOC
- **agentId**: ID único del agente
- **serverUrl**: URL del servidor central
- **uploadInterval**: Intervalo de envío de datos
- **collectors**: Configuración de colectores
- **security**: Configuración de seguridad y certificados

### 2. Logger (`core/logger.ts`)

**Propósito**: Sistema de logging unificado

**Funcionalidades**:
- Múltiples niveles de log (debug, info, warn, error)
- Output a archivo y consola
- Rotación automática de logs
- Correlación de eventos

### 3. Transport (`core/transport.ts`)

**Propósito**: Comunicación segura con el servidor

**Características**:
- HTTPS para envío de datos
- WebSockets para comandos en tiempo real
- Validación SSL/TLS
- Compresión de datos
- Retry logic con backoff exponencial

### 4. EventQueue (`core/queue.ts`)

**Propósito**: Gestión de cola de eventos local

**Funcionalidades**:
- Persistencia en disco
- Compresión de eventos
- Límites de tamaño y tiempo
- Recuperación tras reinicio

### 5. MetricsCollector (`core/metrics.ts`)

**Propósito**: Recolección de métricas del agente

**Métricas Recolectadas**:
- CPU y memoria del agente
- Número de eventos procesados
- Errores y excepciones
- Latencia de comunicación
- Estado de colectores

### 6. HeartbeatManager (`core/heartbeat.ts`)

**Propósito**: Señales de vida al servidor

**Información Enviada**:
- Estado del agente (running, error, updating)
- Versión del agente
- Timestamp último evento
- Métricas básicas
- Lista de colectores activos

## Sistema de Colectores

### Arquitectura Modular

Los colectores siguen un patrón de plugin arquitectura:

```typescript
interface Collector {
  name: string;
  platform: 'windows' | 'linux' | 'macos' | 'all';
  initialize(): Promise<void>;
  collect(): Promise<AgentEvent[]>;
  shutdown(): Promise<void>;
}
```

### Tipos de Colectores

#### 1. System Collectors
- **Process Monitor**: Procesos en ejecución
- **Network Monitor**: Conexiones de red
- **File System Monitor**: Cambios en archivos
- **Registry Monitor**: Cambios en registro (Windows)

#### 2. Security Collectors
- **Auth Monitor**: Eventos de autenticación
- **Privilege Escalation**: Escalación de privilegios
- **Suspicious Activity**: Actividad sospechosa
- **Malware Indicators**: Indicadores de malware

#### 3. Performance Collectors
- **System Resources**: CPU, memoria, disco
- **Network Performance**: Bandwidth, latencia
- **Application Performance**: Performance de apps

### Implementaciones Específicas por Plataforma

#### Windows (`collectors/windows/`)
- **Windows Event Log**: Logs de eventos de Windows
- **WMI Queries**: Consultas WMI para datos del sistema
- **Registry Monitoring**: Monitoreo del registro
- **ETW (Event Tracing)**: Tracing avanzado de eventos

#### Linux (`collectors/linux/`)
- **Syslog Monitoring**: Monitoreo de syslog
- **Process Tree**: Árbol de procesos
- **Network Namespaces**: Namespaces de red
- **Systemd Events**: Eventos de systemd

#### macOS (`collectors/macos/`)
- **Console Logs**: Logs de consola
- **Endpoint Security Framework**: Framework de seguridad
- **LaunchDaemons**: Monitoreo de daemons
- **Keychain Events**: Eventos de keychain

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

## Comandos Remotos

### Tipos de Comandos Soportados

```typescript
enum CommandType {
  COLLECT_NOW = 'collect_now',        // Recolección inmediata
  UPDATE_CONFIG = 'update_config',    // Actualizar configuración
  RESTART = 'restart',                // Reiniciar agente
  UPDATE_AGENT = 'update_agent',      // Actualizar versión
  ENABLE_COLLECTOR = 'enable_collector',   // Habilitar colector
  DISABLE_COLLECTOR = 'disable_collector', // Deshabilitar colector
  GET_STATUS = 'get_status',          // Obtener estado
  RUN_DIAGNOSTIC = 'run_diagnostic'   // Ejecutar diagnóstico
}
```

### Procesamiento de Comandos

1. **Recepción**: Comando recibido via WebSocket
2. **Validación**: Verificación de autenticidad y formato
3. **Autorización**: Verificación de permisos
4. **Ejecución**: Procesamiento del comando
5. **Respuesta**: Envío de resultado al servidor

## Auto-actualización

### Proceso de Actualización

1. **Check de Versión**: Verificación periódica de nuevas versiones
2. **Download**: Descarga segura del nuevo binario
3. **Verification**: Verificación de firma digital
4. **Backup**: Respaldo del binario actual
5. **Replacement**: Reemplazo del binario
6. **Restart**: Reinicio con nueva versión
7. **Rollback**: Rollback en caso de error

### Seguridad de Actualizaciones

- **Firma Digital**: Verificación de firma del publisher
- **Checksum Validation**: Validación de checksums
- **Incremental Updates**: Actualizaciones incrementales
- **Rollback Mechanism**: Mecanismo de rollback automático

---

El sistema de agentes está diseñado para ser robusto, seguro y eficiente, proporcionando visibilidad completa de seguridad en endpoints distribuidos.