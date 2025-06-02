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

## Flujo de Ejecución del Agente

### 1. Fase de Inicialización

1. **Carga de Configuración**: Lee configuración desde archivo local o servidor
2. **Inicialización de Core**: Configura logger, transport, queue, etc.
3. **Detección de Plataforma**: Identifica SO y arquitectura
4. **Carga de Colectores**: Carga colectores específicos para la plataforma
5. **Configuración de Seguridad**: Establece certificados y encriptación

### 2. Fase de Operación

1. **Inicio de Colectores**: Activa colectores de datos
2. **Inicio de Heartbeat**: Comienza envío de señales de vida
3. **Procesamiento de Comandos**: Escucha comandos del servidor
4. **Recolección de Datos**: Ejecuta colectores según configuración
5. **Envío de Datos**: Transmite datos al servidor periódicamente

### 3. Fase de Mantenimiento

1. **Auto-actualización**: Verifica y aplica actualizaciones
2. **Limpieza de Cola**: Mantiene cola de eventos en tamaño óptimo
3. **Rotación de Logs**: Gestiona archivos de log
4. **Monitoreo de Performance**: Recolecta métricas propias

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