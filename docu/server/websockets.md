# Documentación del Sistema WebSocket

Este archivo documenta el sistema completo de comunicación en tiempo real implementado en `server/socket.ts`, que incluye tanto Socket.IO como WebSockets nativos.

## Propósito General

El sistema WebSocket proporciona:
- **Comunicación bidireccional** en tiempo real entre servidor y cliente
- **Actualizaciones push** para dashboards y monitores
- **Conexiones para conectores** de datos externos
- **Rate limiting y seguridad** para prevenir abuso
- **Múltiples endpoints** especializados por funcionalidad

## Arquitectura del Sistema

### Tecnologías Utilizadas

```typescript
import { Server as IOServer } from 'socket.io';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import http from 'http';
import url from 'url';
```

#### Dual WebSocket Implementation:

1. **Socket.IO**: Para comunicación general, manejo de eventos, y reconexión automática
2. **Native WebSockets**: Para conexiones de alto rendimiento y protocolos específicos

### Variables Globales

```typescript
let io: IOServer;              // Instancia de Socket.IO
let wss: WebSocketServer;      // Servidor WebSocket nativo

// Connection tracking and rate limiting
const connectionCounts = new Map<string, number>();
const messageRateLimits = new Map<string, { count: number; lastReset: number }>();
```

#### Configuración de Límites:
- **MAX_CONNECTIONS_PER_IP**: 50 conexiones por IP
- **MAX_MESSAGES_PER_MINUTE**: 60 mensajes por minuto por IP
- **RATE_LIMIT_WINDOW**: 60000ms (1 minuto)

## Funciones de Seguridad y Rate Limiting

### Obtención de IP del Cliente

```typescript
function getClientIP(req: http.IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         (req.headers['x-real-ip'] as string) ||
         req.socket.remoteAddress ||
         'unknown';
}
```

**Orden de prioridad**:
1. **x-forwarded-for**: Para aplicaciones detrás de proxies/load balancers
2. **x-real-ip**: Header alternativo de proxy
3. **req.socket.remoteAddress**: IP directa del socket
4. **'unknown'**: Fallback si no se puede determinar

### Control de Límites de Conexión

```typescript
function checkConnectionLimit(ip: string): boolean {
  const currentConnections = connectionCounts.get(ip) || 0;
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    console.warn(`[WebSocket] Connection limit exceeded for IP: ${ip}`);
    return false;
  }
  connectionCounts.set(ip, currentConnections + 1);
  return true;
}

function removeConnection(ip: string): void {
  const currentConnections = connectionCounts.get(ip) || 0;
  if (currentConnections > 0) {
    connectionCounts.set(ip, currentConnections - 1);
  }
}
```

**Características**:
- **Tracking por IP**: Mantiene conteo de conexiones activas
- **Límite configurable**: Previene ataques de agotamiento de conexiones
- **Cleanup automático**: Reduce conteo cuando se cierra conexión

### Rate Limiting de Mensajes

```typescript
function checkMessageRateLimit(ip: string): boolean {
  const now = Date.now();
  const rateInfo = messageRateLimits.get(ip) || { count: 0, lastReset: now };
  
  // Reset counter if window has passed
  if (now - rateInfo.lastReset > RATE_LIMIT_WINDOW) {
    rateInfo.count = 0;
    rateInfo.lastReset = now;
  }
  
  if (rateInfo.count >= MAX_MESSAGES_PER_MINUTE) {
    console.warn(`[WebSocket] Message rate limit exceeded for IP: ${ip}`);
    return false;
  }
  
  rateInfo.count++;
  messageRateLimits.set(ip, rateInfo);
  return true;
}
```

**Algoritmo sliding window**:
- **Ventana deslizante**: Resetea contadores cada minuto
- **Límite por IP**: Previene spam de mensajes
- **Logging**: Registra violaciones para análisis

## Inicialización del Sistema WebSocket

### Función Principal de Inicialización

```typescript
export function initWebSocket(server: http.Server) {
  // Initialize Socket.IO for general purpose
  io = new IOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  // Initialize WebSocket Server for raw WebSocket connections
  wss = new WebSocketServer({ server });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const pathname = url.parse(req.url!).pathname;
    const clientIP = getClientIP(req);
    
    console.log(`[WebSocket] Client connected to ${pathname} from ${clientIP}`);
    
    // Check connection limits
    if (!checkConnectionLimit(clientIP)) {
      ws.close(1008, 'Connection limit exceeded');
      return;
    }
    
    // Route to appropriate handler
    if (pathname === '/api/ws/dashboard') {
      handleDashboardConnection(ws, clientIP);
    } else if (pathname === '/api/ws/connectors') {
      handleConnectorsConnection(ws, clientIP);
    } else {
      console.log(`[WebSocket] Unknown endpoint: ${pathname}`);
      removeConnection(clientIP);
      ws.close(1002, 'Unknown endpoint');
    }
  });

  return io;
}
```

#### Características de inicialización:

1. **Socket.IO Setup**: Configuración con CORS para frontend
2. **WebSocket Server**: Servidor nativo para conexiones específicas
3. **Connection Routing**: Ruteo por pathname a handlers específicos
4. **Security First**: Verificación de límites antes de establecer conexión

### Endpoints WebSocket Disponibles

#### 1. `/api/ws/dashboard` - Dashboard en Tiempo Real
- **Propósito**: Actualizaciones de métricas y estado del sistema
- **Frecuencia**: Updates cada 30 segundos
- **Límite de mensaje**: 10KB máximo

#### 2. `/api/ws/connectors` - Conectores de Datos
- **Propósito**: Ingesta de datos de fuentes externas
- **Frecuencia**: Variable según el conector
- **Límite de mensaje**: 50KB máximo

#### 3. `/api/ws/agents` - Agentes SOC
- **Propósito**: Comunicación en tiempo real con agentes instalados
- **Frecuencia**: Heartbeats cada 60s, logs bajo demanda
- **Límite de mensaje**: 100KB máximo
- **Autenticación**: Token JWT de agente requerido en query string
- **Tipos de mensaje**: heartbeat, log_batch, status_update, metrics
- **Seguridad**: Validación JWT completa y verificación de agentId

### Seguridad de Agentes (Mejoras v2.0)

#### Autenticación JWT Mejorada
```typescript
// Validación completa del token JWT
const { verifyAgentToken } = await import('./integrations/connectors/jwt-auth.js');
authenticatedAgent = verifyAgentToken(token, true);

if (!authenticatedAgent || !authenticatedAgent.agentId) {
  console.warn(`[WebSocket] Invalid or expired token from ${clientIP}`);
  safeClose(ws, 1008, 'Invalid or expired token');
  removeConnection(clientIP);
  return;
}
```

#### Protección Contra Spoofing de AgentId
```typescript
// Validar que el agentId del mensaje coincida con el token
if (message.agentId && message.agentId !== authenticatedAgent.agentId) {
  console.warn(`[WebSocket] AgentId mismatch: ${message.agentId} vs ${authenticatedAgent.agentId}`);
  ws.send(JSON.stringify({
    type: 'error',
    message: 'AgentId mismatch with authentication token'
  }));
  return;
}

// Siempre usar el agentId autenticado
message.agentId = authenticatedAgent.agentId;
```

#### Características de Seguridad
- **Token JWT completo**: Verificación de firma, expiración y tipo
- **Prevención de spoofing**: AgentId siempre tomado del token autenticado
- **Logging de seguridad**: Registro detallado de intentos de autenticación
- **Códigos de cierre apropiados**: 1008 para violaciones de política
- **Procesamiento asíncrono**: Eventos procesados en background para mejor rendimiento

## Manejo de Conexiones del Dashboard

### Configuración del Handler

```typescript
function handleDashboardConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Dashboard client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 10; // 10KB max message size
  
  // Message handling, cleanup, and periodic updates
}
```

### Procesamiento de Mensajes

```typescript
ws.on('message', (data: RawData) => {
  try {
    // Rate limiting
    if (!checkMessageRateLimit(clientIP)) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    
    // Message size validation
    if (data.length > maxMessageSize) {
      console.warn(`[WebSocket] Message too large from ${clientIP}: ${data.length} bytes`);
      ws.close(1009, 'Message too large');
      return;
    }
    
    const message = JSON.parse(data.toString());
    
    // Basic message validation
    if (typeof message !== 'object' || message === null) {
      console.warn(`[WebSocket] Invalid message format from ${clientIP}`);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Invalid message format' 
      }));
      return;
    }
    
    console.log('[WebSocket] Dashboard message:', { 
      type: message.type, 
      from: clientIP,
      messageId: ++messageCount 
    });
    
    // Handle dashboard-specific messages
    
  } catch (error) {
    console.error(`[WebSocket] Error parsing dashboard message from ${clientIP}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      dataLength: data.length,
      messageCount
    });
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Message parsing failed' 
      }));
    }
  }
});
```

#### Validaciones implementadas:

1. **Rate limiting**: Verifica límites de mensajes por minuto
2. **Size validation**: Limita tamaño de mensajes (10KB para dashboard)
3. **JSON validation**: Verifica formato válido de mensaje
4. **Error handling**: Responses estructuradas para errores

### Actualizaciones Periódicas

```typescript
// Send periodic updates (demo)
const interval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: 'dashboard_update',
        timestamp: new Date().toISOString(),
        data: { status: 'active' }
      }));
    } catch (error) {
      console.error(`[WebSocket] Error sending dashboard update to ${clientIP}:`, error);
      clearInterval(interval);
    }
  } else {
    clearInterval(interval);
  }
}, 30000);

// Clean up interval on close
ws.on('close', () => clearInterval(interval));
```

**Características**:
- **Updates cada 30 segundos**: Mantiene conexión activa
- **Error handling**: Limpia intervalos si hay errores
- **Cleanup automático**: Evita memory leaks

### Manejo de Desconexiones y Errores

```typescript
ws.on('close', (code: number, reason: any) => {
  console.log(`[WebSocket] Dashboard client disconnected: ${code} ${reason}`);
  removeConnection(clientIP);
});

ws.on('error', (error: Error) => {
  console.error(`[WebSocket] Dashboard connection error from ${clientIP}:`, error);
  removeConnection(clientIP);
});
```

## Manejo de Conexiones de Conectores

### Configuración Específica para Conectores

```typescript
function handleConnectorsConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Connectors client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 50; // 50KB max for connector messages
}
```

**Diferencias con dashboard**:
- **Límite de mensaje mayor**: 50KB vs 10KB (datos más complejos)
- **Sin updates periódicos**: Los conectores envían datos bajo demanda
- **Logging especializado**: Identificación específica para troubleshooting

### Procesamiento de Mensajes de Conectores

Similar al dashboard pero con límites ajustados:

```typescript
// Message size validation
if (data.length > maxMessageSize) {
  console.warn(`[WebSocket] Connector message too large from ${clientIP}: ${data.length} bytes`);
  ws.close(1009, 'Message too large');
  return;
}

// El resto del procesamiento es similar al dashboard
console.log('[WebSocket] Connectors message:', { 
  type: message.type, 
  from: clientIP,
  messageId: ++messageCount 
});
```

## Funciones de Exportación

### Acceso a Instancias WebSocket

```typescript
export function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function getWebSocketServer() {
  if (!wss) throw new Error('WebSocket server not initialized');
  return wss;
}
```

**Uso en otros módulos**:

```typescript
import { getIo } from './socket';

// Enviar notificación a todos los clientes conectados
const io = getIo();
io.emit('alert_created', { alertId: 123, severity: 'high' });

// Enviar a usuarios específicos
io.to(userId).emit('notification', { message: 'Nueva alerta asignada' });
```

## Códigos de Cierre WebSocket

### Códigos Utilizados

- **1002**: Unknown endpoint - Endpoint no reconocido
- **1008**: Rate limit exceeded - Límite de conexiones o mensajes excedido
- **1009**: Message too large - Mensaje excede límite de tamaño

### Ejemplo de uso desde cliente:

```javascript
ws.addEventListener('close', (event) => {
  switch(event.code) {
    case 1002:
      console.error('Endpoint WebSocket no válido');
      break;
    case 1008:
      console.error('Límite de rate excedido, reintentando en 60 segundos');
      setTimeout(reconnect, 60000);
      break;
    case 1009:
      console.error('Mensaje demasiado grande');
      break;
  }
});
```

## Integración con el Sistema SOC

### Uso en Alertas en Tiempo Real

```typescript
// En el procesador de alertas
import { getIo } from './socket';

export async function processNewAlert(alert: Alert) {
  // Procesar alerta...
  const processedAlert = await enrichAlert(alert);
  
  // Notificar a clientes conectados
  const io = getIo();
  io.emit('new_alert', {
    alert: processedAlert,
    timestamp: new Date().toISOString()
  });
  
  // Notificar solo a usuarios de la organización
  io.to(`org_${alert.organizationId}`).emit('org_alert', processedAlert);
}
```

### Salas por Organización

```typescript
// En el handler de autenticación Socket.IO
io.on('connection', (socket) => {
  socket.on('authenticate', async (data) => {
    const { token } = data;
    const user = await validateToken(token);
    
    if (user) {
      // Unir a sala de organización
      socket.join(`org_${user.organizationId}`);
      socket.emit('authenticated', { success: true });
    } else {
      socket.emit('auth_error', { message: 'Token inválido' });
      socket.disconnect();
    }
  });
});
```

### Métricas en Tiempo Real

```typescript
// Envío periódico de métricas del dashboard
setInterval(async () => {
  const metrics = await calculateSystemMetrics();
  
  // Enviar métricas por organización
  for (const orgId of Object.keys(metrics)) {
    io.to(`org_${orgId}`).emit('metrics_update', {
      organizationId: orgId,
      metrics: metrics[orgId],
      timestamp: new Date().toISOString()
    });
  }
}, 30000);
```

## Consideraciones de Seguridad

### 1. **Rate Limiting Multinivel**
- Límites por IP para conexiones simultáneas
- Límites por IP para mensajes por minuto
- Límites de tamaño de mensaje por tipo de endpoint

### 2. **Validación de Input**
- Verificación de formato JSON
- Validación de estructura de mensaje
- Sanitización de datos de entrada

### 3. **Connection Management**
- Cleanup automático de conexiones muertas
- Tracking de recursos por IP
- Prevención de memory leaks

### 4. **Error Handling**
- No exposición de información sensible en errores
- Logging detallado para debugging
- Graceful degradation en fallos

## Manejo de Conexiones de Agentes

### Configuración Específica para Agentes

```typescript
function handleAgentsConnection(ws: WebSocket, clientIP: string, req: IncomingMessage) {
  console.log('[WebSocket] Agent client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 100; // 100KB max for agent messages
  
  // Extract and validate token
  const query = url.parse(req.url, true).query;
  const token = query.token;
  
  if (!token) {
    ws.close(1008, 'Authentication token required');
    return;
  }
}
```

**Diferencias con otros endpoints**:
- **Límite de mensaje mayor**: 100KB vs 50KB (logs pueden ser grandes)
- **Autenticación requerida**: Token de agente obligatorio
- **Tipos de mensaje específicos**: heartbeat, log_batch, status_update, metrics
- **Integración con almacenamiento**: Actualiza base de datos en tiempo real

### Tipos de Mensajes de Agentes

#### 1. Heartbeat Messages

```typescript
{
  type: 'heartbeat',
  agentId: 'agent-uuid',
  timestamp: '2024-01-15T10:30:00Z',
  status: 'active',
  metrics: {
    cpu: 25.5,
    memory: 1024,
    disk: 512
  }
}
```

#### 2. Log Batch Messages

```typescript
{
  type: 'log_batch',
  agentId: 'agent-uuid',
  timestamp: '2024-01-15T10:30:00Z',
  events: [
    {
      eventType: 'security_alert',
      severity: 'high',
      message: 'Suspicious process detected',
      timestamp: '2024-01-15T10:30:00Z'
    }
  ]
}
```

#### 3. Status Update Messages

```typescript
{
  type: 'status_update',
  agentId: 'agent-uuid',
  status: 'inactive' | 'active' | 'error',
  timestamp: '2024-01-15T10:30:00Z'
}
```

### Integración con AgentConnector

Los mensajes de agentes se integran con el sistema existente:

```typescript
// Actualización de heartbeat
if (agentConnector && agentConnector.configuration.agents) {
  const agent = agentConnector.configuration.agents[message.agentId];
  if (agent) {
    agent.lastHeartbeat = new Date().toISOString();
    agent.status = 'active';
    
    // Persistir cambios
    await storage.updateConnector(agentConnector.id, {
      configuration: agentConnector.configuration
    });
  }
}

// Procesamiento de logs
const connector = new AgentConnector(agentConnectorConfig);
for (const event of message.events) {
  connector.pendingEvents.push(event);
}
await connector.processAgentEvents();
```

### Ventajas del WebSocket para Agentes

1. **Comunicación en tiempo real**: Los logs se procesan inmediatamente
2. **Heartbeats eficientes**: Menor overhead que HTTP
3. **Detección rápida de desconexión**: Estado del agente se actualiza en tiempo real
4. **Escalabilidad**: Maneja múltiples agentes simultáneamente
5. **Fallback automático**: Si WebSocket falla, los agentes usan HTTP

## Performance y Escalabilidad

### 1. **Connection Pooling**
```typescript
// Configuración para entornos de alta carga
const io = new IOServer(server, {
  transports: ['websocket'], // Solo WebSocket, sin polling
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB buffer
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  }
});
```

### 2. **Message Queuing**
```typescript
// Para mensajes de alto volumen
import { EventEmitter } from 'events';

class WebSocketQueue extends EventEmitter {
  private queue: any[] = [];
  private processing = false;
  
  async addMessage(message: any) {
    this.queue.push(message);
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const message = this.queue.shift();
      await this.sendMessage(message);
    }
    this.processing = false;
  }
}
```

### 3. **Memory Management**
```typescript
// Limpieza periódica de maps de tracking
setInterval(() => {
  // Limpiar entradas antiguas de rate limiting
  const now = Date.now();
  for (const [ip, rateInfo] of messageRateLimits.entries()) {
    if (now - rateInfo.lastReset > RATE_LIMIT_WINDOW * 2) {
      messageRateLimits.delete(ip);
    }
  }
  
  // Limpiar conexiones con count 0
  for (const [ip, count] of connectionCounts.entries()) {
    if (count <= 0) {
      connectionCounts.delete(ip);
    }
  }
}, 300000); // Cada 5 minutos
```

## Troubleshooting

### Problemas Comunes

#### Conexión rechazada
```javascript
// Cliente recibe error 1008
ws.addEventListener('close', (event) => {
  if (event.code === 1008) {
    console.log('Rate limit excedido, esperando antes de reconectar...');
    setTimeout(() => {
      // Reconectar después del rate limit window
      connectWebSocket();
    }, 60000);
  }
});
```

#### Mensajes no llegan
- Verificar que el cliente esté en la sala correcta
- Comprobar rate limits en logs del servidor
- Validar formato de mensajes JSON

#### Memory leaks
- Verificar cleanup de intervalos en desconexiones
- Monitorear mapas de tracking de conexiones
- Implementar límites de tiempo para conexiones inactivas

### Debugging

```typescript
// Habilitar debugging detallado
const DEBUG_WEBSOCKET = process.env.DEBUG_WEBSOCKET === 'true';

if (DEBUG_WEBSOCKET) {
  setInterval(() => {
    console.log('[WebSocket Debug]', {
      totalConnections: Array.from(connectionCounts.values()).reduce((a, b) => a + b, 0),
      uniqueIPs: connectionCounts.size,
      rateLimitEntries: messageRateLimits.size,
      memoryUsage: process.memoryUsage()
    });
  }, 60000);
}
```

## Mejores Prácticas

### 1. **Manejo de Reconexión en Cliente**
```javascript
class SOCWebSocket {
  constructor(url) {
    this.url = url;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.connect();
  }
  
  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('WebSocket conectado');
      this.reconnectAttempts = 0;
    };
    
    this.ws.onclose = (event) => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
      }
    };
  }
}
```

### 2. **Rate Limiting Inteligente**
- Implementar backoff exponencial para clientes que exceden límites
- Allowlist para IPs confiables (servicios internos)
- Métricas de rate limiting para monitoreo

### 3. **Monitoreo y Alertas**
- Alertas cuando se exceden límites de conexiones
- Métricas de performance de WebSocket
- Logs estructurados para análisis