# Documentación del Servidor Backend - socket.ts

## Propósito

El archivo `socket.ts` implementa el **sistema completo de comunicación en tiempo real** del SOC, proporcionando:

- WebSockets bidireccionales para comunicación real-time
- Socket.IO para aplicaciones web con fallbacks automáticos
- Rate limiting y protección contra abuse
- Múltiples endpoints especializados (dashboard, connectores)
- Monitoreo de conexiones y logging detallado
- Validación robusta de mensajes y seguridad

## Arquitectura de Comunicación en Tiempo Real

### Dual WebSocket System

El sistema utiliza **dos tecnologías de WebSocket** para diferentes propósitos:

1. **Socket.IO**: Para el frontend web con características avanzadas
2. **Raw WebSockets**: Para conectores y sistemas externos de alto rendimiento

## Estructura del Archivo

### 1. Imports y Dependencias

#### Librerías de WebSocket
```typescript
import { Server as IOServer } from 'socket.io';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';
```

**Tecnologías utilizadas**:
- **Socket.IO**: Comunicación web robusta con fallbacks (polling, etc.)
- **ws**: WebSocket nativo de Node.js para máximo rendimiento
- **http**: Servidor HTTP base para ambos sistemas
- **url**: Parsing de URLs para routing de WebSocket

### 2. Variables Globales y Estado

#### Instancias de Servidor
```typescript
let io: IOServer;
let wss: WebSocketServer;
```

**Gestión de estado**:
- **io**: Instancia global de Socket.IO
- **wss**: Servidor WebSocket nativo
- **Patrón Singleton**: Una instancia por aplicación

#### Sistema de Rate Limiting
```typescript
const connectionCounts = new Map<string, number>();
const messageRateLimits = new Map<string, { count: number; lastReset: number }>();
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGES_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
```

**Configuración de límites**:
- **MAX_CONNECTIONS_PER_IP**: 10 conexiones simultáneas por IP
- **MAX_MESSAGES_PER_MINUTE**: 60 mensajes por minuto por IP
- **RATE_LIMIT_WINDOW**: Ventana de 1 minuto para rate limiting

**Estructuras de datos**:
- **connectionCounts**: Map<IP, número_de_conexiones>
- **messageRateLimits**: Map<IP, {count, lastReset}>

### 3. Utilidades de Seguridad

#### Extracción de IP del Cliente
```typescript
function getClientIP(req: http.IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         (req.headers['x-real-ip'] as string) ||
         req.socket.remoteAddress ||
         'unknown';
}
```

**Orden de prioridad para IP detection**:
1. **x-forwarded-for**: Para reverse proxies (Nginx, Cloudflare)
2. **x-real-ip**: Header alternativo de proxy
3. **remoteAddress**: IP directa de la conexión
4. **'unknown'**: Fallback si no se puede determinar

**Casos de uso**:
- **Load Balancers**: Cloudflare, AWS ALB, Nginx
- **Direct Connection**: Conexión directa al servidor
- **Security**: Rate limiting basado en IP real

#### Límite de Conexiones por IP
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

**Protección contra DoS**:
- **Connection Tracking**: Cuenta conexiones activas por IP
- **Automatic Increment**: Incrementa al conectar
- **Automatic Decrement**: Decrementa al desconectar
- **Overflow Protection**: Previene valores negativos

#### Rate Limiting de Mensajes
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

**Algoritmo de Rate Limiting**:
1. **Window-based**: Ventana deslizante de 1 minuto
2. **Auto-reset**: Resetea contador automáticamente
3. **Per-IP tracking**: Límites independientes por IP
4. **Memory efficient**: Lazy initialization de contadores

### 4. Inicialización del Sistema WebSocket

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
  wss = new WebSocketServer({ 
    server,
    path: '/ws'  // This will handle /ws/* paths
  });
```

#### Configuración de Socket.IO

**CORS Configuration**:
- **origin**: URL del cliente frontend (configurable via ENV)
- **methods**: Solo GET y POST permitidos
- **credentials**: Implícitamente habilitado para cookies/auth

**Características de Socket.IO**:
- **Auto-reconnection**: Reconexión automática del cliente
- **Fallback mechanisms**: Polling si WebSocket falla
- **Room/Namespace support**: Agrupación lógica de conexiones
- **Message acknowledgment**: Confirmación de mensajes

#### Configuración de WebSocket Nativo

**Path-based routing**:
- **path: '/ws'**: Todas las conexiones a `/ws/*`
- **Performance**: Sin overhead de Socket.IO
- **Direct control**: Control total sobre protocolo

### 5. Routing de Conexiones WebSocket

```typescript
wss.on('connection', (ws, req) => {
  const pathname = url.parse(req.url!).pathname;
  const clientIP = getClientIP(req);
  
  console.log(`[WebSocket] Client connected to ${pathname} from ${clientIP}`);
  
  // Check connection limits
  if (!checkConnectionLimit(clientIP)) {
    ws.close(1008, 'Connection limit exceeded');
    return;
  }
  
  // Handle different WebSocket endpoints
  if (pathname === '/ws/dashboard') {
    handleDashboardConnection(ws, clientIP);
  } else if (pathname === '/api/ws/connectors') {
    handleConnectorsConnection(ws, clientIP);
  } else {
    console.log(`[WebSocket] Unknown endpoint: ${pathname}`);
    removeConnection(clientIP);
    ws.close(1002, 'Unknown endpoint');
  }
});
```

**Sistema de Routing**:
1. **URL Parsing**: Extrae pathname de la URL
2. **IP Detection**: Identifica IP del cliente
3. **Security Check**: Verifica límites de conexión
4. **Path Routing**: Dirige a handler específico
5. **Unknown Path Handling**: Cierra conexiones inválidas

**Endpoints soportados**:
- **`/ws/dashboard`**: Dashboard en tiempo real
- **`/api/ws/connectors`**: Conectores de datos externos

### 6. Handler del Dashboard

```typescript
function handleDashboardConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Dashboard client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 10; // 10KB max message size
```

#### Validación de Mensajes Dashboard
```typescript
ws.on('message', (data) => {
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
```

**Capas de validación**:
1. **Rate Limiting**: Verifica límites de frecuencia
2. **Size Validation**: Máximo 10KB por mensaje
3. **JSON Parsing**: Validación de formato
4. **Type Checking**: Verificación de estructura básica

#### Updates Periódicos del Dashboard
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
```

**Sistema de Updates**:
- **Frecuencia**: Cada 30 segundos
- **Health Check**: Verifica estado de conexión
- **Error Handling**: Limpia intervalos en error
- **Structured Data**: Formato JSON consistente

### 7. Handler de Conectores

```typescript
function handleConnectorsConnection(ws: WebSocket, clientIP: string) {
  console.log('[WebSocket] Connectors client connected');
  
  let messageCount = 0;
  const maxMessageSize = 1024 * 50; // 50KB max for connector messages
```

**Diferencias con Dashboard**:
- **Message Size**: 50KB vs 10KB (conectores envían más datos)
- **Purpose**: Datos de conectores externos vs UI updates
- **Frequency**: Variable según conector vs updates regulares

#### Validación Especializada para Conectores
```typescript
// Message size validation
if (data.length > maxMessageSize) {
  console.warn(`[WebSocket] Connector message too large from ${clientIP}: ${data.length} bytes`);
  ws.close(1009, 'Message too large');
  return;
}
```

**Límites específicos**:
- **50KB max**: Para datos de logs/alertas complejas
- **Rate limiting**: Mismo que dashboard pero diferente contexto
- **Error codes**: Códigos WebSocket estándar (1008, 1009)

### 8. Gestión de Eventos y Errores

#### Event Handlers Comunes
```typescript
ws.on('close', (code, reason) => {
  console.log(`[WebSocket] Dashboard client disconnected: ${code} ${reason}`);
  removeConnection(clientIP);
});

ws.on('error', (error) => {
  console.error(`[WebSocket] Dashboard connection error from ${clientIP}:`, error);
  removeConnection(clientIP);
});
```

**Cleanup automático**:
- **Connection counting**: Actualiza contadores
- **Interval cleanup**: Limpia timers activos
- **Resource management**: Previene memory leaks

#### Códigos de Error WebSocket
```typescript
ws.close(1008, 'Rate limit exceeded');      // Policy violation
ws.close(1009, 'Message too large');        // Message too big
ws.close(1002, 'Unknown endpoint');         // Protocol error
```

**Códigos estándar utilizados**:
- **1002**: Protocol error (endpoint desconocido)
- **1008**: Policy violation (rate limiting)
- **1009**: Message too big (límite de tamaño)

### 9. Funciones de Acceso Global

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

**Patrón de acceso**:
- **Lazy access**: Verifica inicialización antes de retornar
- **Error throwing**: Falla rápido si no está inicializado
- **Global access**: Permite acceso desde otros módulos

## Casos de Uso del Sistema

### 1. Dashboard en Tiempo Real
```typescript
// En el frontend
const ws = new WebSocket('ws://localhost:5000/ws/dashboard');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'dashboard_update') {
    updateDashboardMetrics(data.data);
  }
};
```

### 2. Conectores de Datos
```typescript
// En un conector externo
const ws = new WebSocket('ws://localhost:5000/api/ws/connectors');
ws.send(JSON.stringify({
  type: 'alert_data',
  connector_id: 'syslog-001',
  data: {
    timestamp: new Date(),
    severity: 'high',
    message: 'Suspicious activity detected'
  }
}));
```

### 3. Uso de Socket.IO para Features Avanzadas
```typescript
// En routes.ts u otros módulos
import { getIo } from './socket';

// Broadcast a todas las conexiones
const io = getIo();
io.emit('system_alert', {
  type: 'security_breach',
  severity: 'critical',
  message: 'Unauthorized access attempt detected'
});

// Envío a sala específica
io.to('organization_123').emit('org_update', data);
```

## Consideraciones de Seguridad

### 1. Rate Limiting Multinivel
- **Connection limits**: 10 conexiones por IP
- **Message limits**: 60 mensajes por minuto
- **Size limits**: 10KB (dashboard) / 50KB (conectores)

### 2. Input Validation
- **JSON parsing**: Try-catch para mensajes malformados
- **Type checking**: Validación de estructura básica
- **Size validation**: Prevención de memory exhaustion

### 3. Resource Management
- **Connection tracking**: Prevención de connection leaks
- **Interval cleanup**: Prevención de memory leaks
- **Error isolation**: Un error no afecta otras conexiones

### 4. Monitoring y Logging
```typescript
console.log(`[WebSocket] Client connected to ${pathname} from ${clientIP}`);
console.warn(`[WebSocket] Connection limit exceeded for IP: ${ip}`);
console.error(`[WebSocket] Error parsing message from ${clientIP}:`, error);
```

**Logging structure**:
- **Info level**: Conexiones/desconexiones normales
- **Warn level**: Límites alcanzados, mensajes sospechosos
- **Error level**: Errores de parsing, errores de conexión

## Configuración de Producción

### Variables de Entorno
```bash
CLIENT_URL=https://dashboard.soc.company.com
NODE_ENV=production
```

### Configuración de Proxy
```nginx
# Nginx configuration for WebSocket
location /ws/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### Tuning de Performance
```typescript
// Configuración avanzada para producción
const io = new IOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  },
  transports: ['websocket'], // Solo WebSocket en producción
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB max buffer
  allowEIO3: false // Forzar Engine.IO v4
});
```

## Monitoring y Debugging

### Health Checks
```typescript
// Health check endpoint
export function getConnectionStats() {
  return {
    socketIoConnections: io?.engine?.clientsCount || 0,
    webSocketConnections: wss?.clients?.size || 0,
    connectionsByIP: Object.fromEntries(connectionCounts),
    rateLimitStatus: Object.fromEntries(messageRateLimits)
  };
}
```

### Debug Mode
```typescript
if (process.env.NODE_ENV === 'development') {
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });
}
```

---

Este sistema de WebSocket proporciona una **infraestructura robusta y escalable** para comunicación en tiempo real, con múltiples capas de seguridad y optimizaciones para diferentes casos de uso del SOC.