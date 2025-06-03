# API de Agentes - Referencia Completa

## Introducción

Esta documentación cubre todas las APIs y interfaces disponibles para interactuar con los agentes SOC, incluyendo APIs internas del agente y APIs del servidor para gestión de agentes.

## APIs Internas del Agente

### Core APIs

#### AgentConfig API

```typescript
interface AgentConfig {
  // Propiedades de configuración
  serverUrl: string;
  organizationKey: string;
  agentId?: string;
  heartbeatInterval: number;
  dataUploadInterval: number;
  scanInterval: number;
  capabilities: AgentCapabilities;
  enabledCollectors: string[];
  logLevel: LogLevel;
  
  // Métodos
  load(configPath: string): Promise<AgentConfig>;
  save(configPath?: string): Promise<void>;
  validate(): Promise<ValidationResult>;
  merge(updates: Partial<AgentConfig>): AgentConfig;
  clone(): AgentConfig;
}

// Funciones de utilidad
export async function loadConfig(configPath: string): Promise<AgentConfig>;
export async function saveConfig(config: AgentConfig, configPath?: string): Promise<void>;
export async function validateAgentIntegrity(expectedHash?: string): Promise<boolean>;
export function encryptConfigValue(value: string, secret: string): string;
export function decryptConfigValue(encryptedValue: string, secret: string): string;
```

**Ejemplo de Uso:**
```typescript
import { loadConfig, saveConfig } from './core/agent-config';

// Cargar configuración
const config = await loadConfig('/etc/soc-agent/agent-config.yaml');

// Modificar configuración
config.dataUploadInterval = 600;
config.enabledCollectors = ['process', 'network'];

// Guardar cambios
await saveConfig(config);

// Validar integridad
const isValid = await validateAgentIntegrity(config.expectedBinaryHash);
```

#### Logger API

```typescript
interface LogOptions {
  level: LogLevel;
  filePath?: string;
  maxSizeBytes?: number;
  maxAgeDays?: number;
  enableConsole?: boolean;
  rotationCount?: number;
}

class Logger {
  constructor(options: LogOptions);
  
  // Métodos de logging
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  
  // Logging estructurado
  logEvent(event: LogEvent): void;
  logMetric(metric: LogMetric): void;
  
  // Gestión de archivos
  rotate(): Promise<void>;
  compress(filePath: string): Promise<void>;
  cleanup(): Promise<void>;
  
  // Configuración dinámica
  setLevel(level: LogLevel): void;
  setOutputFile(filePath: string): void;
  
  // Estado
  getStats(): LogStats;
}

interface LogEvent {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  correlationId?: string;
}

interface LogMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface LogStats {
  totalMessages: number;
  messagesByLevel: Record<LogLevel, number>;
  currentFileSize: number;
  lastRotation: Date;
}
```

**Ejemplo de Uso:**
```typescript
import { Logger } from './core/logger';

const logger = new Logger({
  level: 'info',
  filePath: '/var/log/soc-agent/agent.log',
  maxSizeBytes: 52428800, // 50MB
  enableConsole: true
});

// Logging básico
logger.info('Agente iniciado correctamente');
logger.warn('Conexión inestable detectada', { retries: 3 });
logger.error('Error crítico', { error: err.message, stack: err.stack });

// Logging estructurado
logger.logEvent({
  timestamp: new Date(),
  level: 'info',
  category: 'collector',
  message: 'Proceso sospechoso detectado',
  data: { pid: 1234, name: 'suspicious.exe' },
  correlationId: 'evt-123'
});

// Métricas
logger.logMetric({
  name: 'events_processed',
  value: 150,
  unit: 'count',
  timestamp: new Date(),
  tags: { collector: 'process' }
});
```

#### Transport API

```typescript
interface TransportOptions {
  serverUrl: string;
  token?: string;
  enableCompression: boolean;
  autoReconnect?: boolean;
  timeout?: number;
}

interface TransportRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

interface TransportResponse {
  success: boolean;
  status: number;
  data?: unknown;
  error?: string;
  headers?: Record<string, string>;
}

class Transport extends EventEmitter {
  constructor(options: TransportOptions, config?: AgentConfig);
  
  // HTTP/HTTPS requests
  async request(req: TransportRequest): Promise<TransportResponse>;
  async get(endpoint: string, params?: any): Promise<TransportResponse>;
  async post(endpoint: string, data?: any): Promise<TransportResponse>;
  async put(endpoint: string, data?: any): Promise<TransportResponse>;
  async delete(endpoint: string): Promise<TransportResponse>;
  
  // WebSocket connections
  connectWebSocket(): void;
  disconnect(): void;
  sendWebSocketMessage(message: any): Promise<void>;
  
  // Command handling
  registerCommandHandler(command: string, handler: CommandHandler): void;
  unregisterCommandHandler(command: string): void;
  
  // Connection management
  isConnected(): boolean;
  getConnectionStatus(): ConnectionStatus;
  
  // Events
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'command', listener: (command: Command) => void): this;
}

interface ConnectionStatus {
  connected: boolean;
  lastSuccessfulConnection: Date;
  reconnectAttempts: number;
  latency: number;
}

type CommandHandler = (command: Record<string, unknown>) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}>;
```

**Ejemplo de Uso:**
```typescript
import { Transport } from './core/transport';

const transport = new Transport({
  serverUrl: 'https://soc.company.com',
  enableCompression: true,
  autoReconnect: true
});

// HTTP request
const response = await transport.post('/api/agents/events', {
  events: [
    {
      type: 'process',
      severity: 'high',
      timestamp: new Date(),
      message: 'Suspicious process detected'
    }
  ]
});

// WebSocket connection
transport.connectWebSocket();

transport.on('connected', () => {
  console.log('WebSocket conectado');
});

transport.on('command', async (command) => {
  console.log('Comando recibido:', command);
  // Procesar comando
});

// Register command handler
transport.registerCommandHandler('collect_now', async (params) => {
  // Ejecutar recolección inmediata
  return {
    stdout: 'Collection completed',
    stderr: '',
    exitCode: 0,
    durationMs: 1500
  };
});
```

### Collectors API

#### Collector Interface

```typescript
interface Collector {
  name: string;
  description: string;
  compatibleSystems: ('linux' | 'darwin' | 'win32')[];
  
  // Lifecycle methods
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  
  // Configuration
  configure?(config: CollectorConfig): Promise<void>;
  
  // Status
  getStatus?(): CollectorStatus;
  getMetrics?(): CollectorMetrics;
}

interface CollectorConfig {
  eventCallback?: (event: Omit<AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void;
  logger?: Logger;
  scanInterval?: number;
  enabled?: boolean;
  
  // Configuración específica del colector
  [key: string]: unknown;
}

interface CollectorStatus {
  name: string;
  running: boolean;
  lastScan: Date;
  eventsCollected: number;
  errors: number;
  health: 'healthy' | 'warning' | 'error';
}

interface CollectorMetrics {
  scanDuration: number;
  eventsPerSecond: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}
```

#### Collector Management API

```typescript
// Funciones de gestión de colectores
export async function getCompatibleCollectors(logger: Logger): Promise<Collector[]>;
export async function loadEnabledCollectors(enabledCollectors: string[], logger: Logger): Promise<Collector[]>;
export async function startCollectors(collectors: Collector[], logger: Logger): Promise<void>;
export async function stopCollectors(collectors: Collector[], logger: Logger): Promise<void>;

// Registro dinámico de colectores
export class CollectorRegistry {
  private collectors: Map<string, Collector> = new Map();
  
  register(collector: Collector): void;
  unregister(name: string): boolean;
  get(name: string): Collector | undefined;
  getAll(): Collector[];
  getByPlatform(platform: string): Collector[];
  
  async startCollector(name: string): Promise<boolean>;
  async stopCollector(name: string): Promise<boolean>;
  
  getStatus(name?: string): CollectorStatus | CollectorStatus[];
  getMetrics(name?: string): CollectorMetrics | CollectorMetrics[];
}
```

**Ejemplo de Uso:**
```typescript
import { CollectorRegistry, getCompatibleCollectors } from './collectors';

const registry = new CollectorRegistry();

// Cargar colectores compatibles
const collectors = await getCompatibleCollectors(logger);
collectors.forEach(collector => registry.register(collector));

// Iniciar colector específico
await registry.startCollector('process');

// Obtener estado de todos los colectores
const status = registry.getStatus();
console.log('Estado de colectores:', status);

// Crear colector personalizado
const customCollector: Collector = {
  name: 'custom-monitor',
  description: 'Monitor personalizado',
  compatibleSystems: ['linux'],
  
  async start(): Promise<boolean> {
    // Lógica de inicio
    return true;
  },
  
  async stop(): Promise<boolean> {
    // Lógica de parada
    return true;
  },
  
  getStatus(): CollectorStatus {
    return {
      name: this.name,
      running: true,
      lastScan: new Date(),
      eventsCollected: 100,
      errors: 0,
      health: 'healthy'
    };
  }
};

registry.register(customCollector);
```

### Event System API

#### Event Types

```typescript
interface AgentEvent {
  agentId: string;
  eventType: 'system' | 'process' | 'file' | 'network' | 'registry' | 'auth' | 'malware' | 'vulnerability';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  details: EventDetails;
  signature?: string;
  hostId?: string;
  agentVersion?: string;
  tags?: string[];
}

type EventDetails = SystemEventDetails | ProcessEventDetails | FileEventDetails | NetworkEventDetails | MalwareEventDetails | VulnerabilityEventDetails | AuthEventDetails;

interface SystemEventDetails {
  metrics?: SystemMetrics;
  error?: string;
  component?: string;
}

interface ProcessEventDetails {
  process?: ProcessInfo;
  reason?: string;
  parentProcess?: ProcessInfo;
}

interface FileEventDetails {
  file?: FileEvent;
  permissions?: number;
  owner?: string;
  group?: string;
}

interface NetworkEventDetails {
  connection?: NetworkConnection;
  reason?: string;
  geoLocation?: {
    country?: string;
    city?: string;
    coordinates?: [number, number];
  };
}
```

#### Event Queue API

```typescript
interface EventQueueOptions {
  maxSize: number;
  persistPath?: string;
  compressionEnabled?: boolean;
  batchSize?: number;
}

class EventQueue {
  constructor(options: EventQueueOptions);
  
  // Event management
  enqueue(event: AgentEvent): Promise<void>;
  dequeue(): Promise<AgentEvent | null>;
  getBatch(size: number): Promise<AgentEvent[]>;
  
  // Queue status
  size(): number;
  isEmpty(): boolean;
  isFull(): boolean;
  
  // Persistence
  persist(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
  
  // Compression
  compress(): Promise<void>;
  decompress(): Promise<void>;
  
  // Statistics
  getStats(): QueueStats;
}

interface QueueStats {
  currentSize: number;
  maxSize: number;
  totalEnqueued: number;
  totalDequeued: number;
  oldestEvent: Date;
  newestEvent: Date;
  compressionRatio: number;
}
```

**Ejemplo de Uso:**
```typescript
import { EventQueue } from './core/queue';

const queue = new EventQueue({
  maxSize: 1000,
  persistPath: '/var/lib/soc-agent/queue',
  compressionEnabled: true,
  batchSize: 50
});

// Agregar evento a la cola
const event: AgentEvent = {
  agentId: 'agent-001',
  eventType: 'process',
  severity: 'high',
  timestamp: new Date(),
  message: 'Suspicious process detected',
  details: {
    process: {
      pid: 1234,
      name: 'malware.exe',
      path: 'C:\\temp\\malware.exe',
      cpuUsage: 95,
      memoryUsage: 512000000,
      startTime: new Date(),
      status: 'running'
    }
  }
};

await queue.enqueue(event);

// Procesar eventos en lotes
const batch = await queue.getBatch(10);
for (const event of batch) {
  console.log('Procesando evento:', event.message);
}

// Estadísticas de la cola
const stats = queue.getStats();
console.log(`Cola: ${stats.currentSize}/${stats.maxSize} eventos`);
```

## APIs del Servidor para Gestión de Agentes

### Agent Registration API

```typescript
// POST /api/agents/register
interface AgentRegistrationRequest {
  organizationKey: string;
  hostname: string;
  ipAddress: string;
  operatingSystem: 'windows' | 'linux' | 'macos';
  version: string;
  capabilities: AgentCapabilities;
  systemInfo?: SystemInfo;
}

interface AgentRegistrationResponse {
  success: boolean;
  agentId?: string;
  token?: string;
  config?: Partial<AgentConfig>;
  endpoints?: {
    data: string;
    heartbeat: string;
    commands: string;
    updates: string;
  };
  error?: string;
}

interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  cpuCount: number;
  totalMemory: number;
  networkInterfaces: NetworkInterface[];
}
```

### Agent Data API

```typescript
// POST /api/agents/data
interface AgentDataRequest {
  agentId: string;
  timestamp: Date;
  events: AgentEvent[];
  metrics?: SystemMetrics;
  signature?: string;
}

interface AgentDataResponse {
  success: boolean;
  eventsReceived: number;
  eventsProcessed: number;
  alertsGenerated?: number;
  nextUploadInterval?: number;
  commands?: Command[];
  error?: string;
}
```

### Agent Heartbeat API

```typescript
// POST /api/agents/heartbeat
interface AgentHeartbeatRequest {
  agentId: string;
  timestamp: Date;
  status: 'running' | 'error' | 'updating' | 'stopped';
  metrics: AgentMetrics;
  activeCollectors: string[];
  lastEventTimestamp?: Date;
  version: string;
}

interface AgentHeartbeatResponse {
  success: boolean;
  configUpdate?: Partial<AgentConfig>;
  commands?: Command[];
  updateAvailable?: UpdateInfo;
  error?: string;
}

interface AgentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  eventsInQueue: number;
  uptime: number;
  lastScan: Date;
  collectorsStatus: CollectorStatus[];
}
```

### Agent Commands API

```typescript
// POST /api/agents/{agentId}/commands
interface SendCommandRequest {
  type: CommandType;
  parameters: Record<string, any>;
  timeout?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

interface SendCommandResponse {
  success: boolean;
  commandId?: string;
  estimatedCompletion?: Date;
  error?: string;
}

// GET /api/agents/{agentId}/commands/{commandId}
interface CommandStatusResponse {
  commandId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: CommandResult;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}
```

### Agent Management API

```typescript
// GET /api/agents
interface ListAgentsResponse {
  agents: AgentInfo[];
  total: number;
  page: number;
  pageSize: number;
}

interface AgentInfo {
  agentId: string;
  name: string;
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
  version: string;
  status: 'online' | 'offline' | 'error';
  lastSeen: Date;
  capabilities: AgentCapabilities;
  organization: string;
  metrics: AgentMetrics;
}

// GET /api/agents/{agentId}
interface GetAgentResponse {
  agent: AgentInfo;
  configuration: AgentConfig;
  recentEvents: AgentEvent[];
  collectorsStatus: CollectorStatus[];
  commandHistory: CommandHistory[];
}

// PUT /api/agents/{agentId}/config
interface UpdateAgentConfigRequest {
  config: Partial<AgentConfig>;
  applyImmediately?: boolean;
  restartRequired?: boolean;
}

// DELETE /api/agents/{agentId}
interface DeleteAgentResponse {
  success: boolean;
  message: string;
}
```

### Agent Builder API

```typescript
// POST /api/agents/build
interface BuildAgentRequest {
  operatingSystem: 'windows' | 'linux' | 'macos';
  capabilities: AgentCapabilities;
  customName?: string;
  configuration?: Partial<AgentConfig>;
}

interface BuildAgentResponse {
  success: boolean;
  downloadUrl?: string;
  agentId?: string;
  expiresAt?: Date;
  size?: number;
  checksum?: string;
  error?: string;
}

// GET /api/agents/download/{token}
// Descarga el binario del agente compilado
```

## Webhooks y Eventos

### Webhook Configuration

```typescript
interface WebhookConfig {
  url: string;
  secret: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

type WebhookEvent = 
  | 'agent.registered'
  | 'agent.connected'
  | 'agent.disconnected'
  | 'agent.error'
  | 'agent.updated'
  | 'alert.generated'
  | 'command.completed';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  agentId: string;
  data: any;
  signature: string;
}
```

### Event Streaming API

```typescript
// WebSocket /api/stream/events
interface StreamEventMessage {
  type: 'event' | 'heartbeat' | 'command' | 'alert';
  agentId: string;
  timestamp: Date;
  data: any;
}

// Server-Sent Events /api/stream/sse
interface SSEMessage {
  id: string;
  event: string;
  data: string;
  retry?: number;
}
```

## SDK y Libraries

### JavaScript/TypeScript SDK

```typescript
import { SOCAgentSDK } from '@soc-platform/agent-sdk';

const sdk = new SOCAgentSDK({
  serverUrl: 'https://api.soc.company.com',
  apiKey: 'your-api-key'
});

// Gestión de agentes
const agents = await sdk.agents.list();
const agent = await sdk.agents.get('agent-001');

// Envío de comandos
const command = await sdk.agents.sendCommand('agent-001', {
  type: 'collect_now',
  parameters: {}
});

// Monitoreo de eventos
sdk.events.on('agent.connected', (event) => {
  console.log('Agente conectado:', event.agentId);
});

// Construcción de agentes
const build = await sdk.agents.build({
  operatingSystem: 'linux',
  capabilities: {
    processMonitoring: true,
    fileSystemMonitoring: true
  }
});

console.log('Agente construido:', build.downloadUrl);
```

### Python SDK

```python
from soc_agent_sdk import SOCAgentClient

client = SOCAgentClient(
    server_url='https://api.soc.company.com',
    api_key='your-api-key'
)

# Gestión de agentes
agents = client.agents.list()
agent = client.agents.get('agent-001')

# Envío de comandos
result = client.agents.send_command('agent-001', {
    'type': 'collect_now',
    'parameters': {}
})

# Construcción de agentes
build = client.agents.build(
    operating_system='linux',
    capabilities={
        'process_monitoring': True,
        'file_system_monitoring': True
    }
)

print(f"Agent built: {build['download_url']}")
```

## Rate Limits y Autenticación

### Rate Limits

```
GET /api/agents: 100 requests/minute
POST /api/agents/data: 1000 requests/minute  
POST /api/agents/heartbeat: 200 requests/minute
POST /api/agents/commands: 50 requests/minute
```

### Autenticación

#### API Key Authentication

```http
Authorization: Bearer your-api-key
```

#### Agent Token Authentication

```http
Authorization: Agent agent-token
```

#### Webhook Signature Verification

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

Esta documentación API proporciona una referencia completa para desarrolladores que trabajen con el sistema de agentes SOC.