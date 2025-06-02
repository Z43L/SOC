# Documentación del Servidor Backend - index.ts

## Propósito
`server/index.ts` es el **punto de entrada principal** del servidor backend. Este archivo es responsable de:
- Inicializar el servidor Express
- Configurar middleware y rutas
- Establecer conexiones WebSocket
- Inicializar servicios críticos
- Gestionar el ciclo de vida de la aplicación

## Estructura del Archivo

### 1. Imports y Configuración Inicial

```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**Variables**:
- `__filename`: Ruta absoluta del archivo actual (necesario en ES modules)
- `__dirname`: Directorio del archivo actual (polyfill para ES modules)

**Propósito**: Compatibilidad con ES modules para operaciones de filesystem.

### 2. Dependencias Principales

```typescript
import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
```

**Dependencies Críticas**:
- **Express**: Framework web para Node.js
- **CORS**: Middleware para Cross-Origin Resource Sharing
- **registerRoutes**: Función que registra todas las rutas de la API
- **Vite helpers**: Utilidades para desarrollo y producción

### 3. Configuración de Express

```typescript
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
```

**Variables de Configuración**:
- **app**: Instancia principal de Express
- **cors origin**: URL permitida para requests cross-origin (default: desarrollo en puerto 5173)
- **credentials: true**: Permite envío de cookies en requests CORS

**Middleware Configurado**:
- **JSON parser**: Parsea body de requests como JSON
- **URL encoded parser**: Parsea formularios URL-encoded

### 4. Middleware de Logging Personalizado

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});
```

**Funcionalidad**:
- **Performance Monitoring**: Mide tiempo de respuesta de cada request
- **Response Capturing**: Captura respuesta JSON para logging
- **Selective Logging**: Solo loggea rutas que empiecen con "/api"
- **Log Truncation**: Limita longitud de logs a 80 caracteres

**Variables**:
- `start`: Timestamp de inicio del request
- `path`: Ruta del request
- `capturedJsonResponse`: Response JSON capturada
- `duration`: Tiempo total de procesamiento
- `logLine`: String final del log

## Función Principal Asíncrona

### 1. Inicialización de Servicios

```typescript
(async () => {
  // Seed database with sample data, including test user
  // await initializeDatabase();
  
  // Create HTTP server for Socket.io
  const httpServer = http.createServer(app);
  // Setup routes and middleware
  await registerRoutes(app);
  // Initialize WebSocket on HTTP server
  initWebSocket(httpServer);
```

**Servicios Inicializados**:
- **HTTP Server**: Servidor HTTP base para Express y WebSockets
- **Routes**: Registro de todas las rutas de la API
- **WebSocket**: Comunicación en tiempo real

**Nota**: `initializeDatabase()` está comentado - se ejecuta manualmente o en deployment

### 2. Inicialización de SOAR WebSocket

```typescript
try {
  const { initializeWebSocket } = await import('./src/services/SoarWebSocketService');
  const soarWebSocket = initializeWebSocket(httpServer);
  console.log('[Server] SOAR WebSocket service initialized successfully');
} catch (error) {
  console.error('[Server] Failed to initialize SOAR WebSocket service:', error);
}
```

**Propósito**: 
- **SOAR**: Security Orchestration, Automation and Response
- **WebSocket Service**: Comunicación en tiempo real para playbooks automatizados
- **Error Handling**: Captura errores sin detener el servidor

### 3. Error Handler Global

```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({ message });
  throw err;
});
```

**Funcionalidad**:
- **Error Normalization**: Normaliza diferentes formatos de error
- **HTTP Status**: Extrae código de estado HTTP (default: 500)
- **JSON Response**: Responde con formato JSON consistente
- **Error Propagation**: Re-lanza el error para logging adicional

### 4. Configuración de Entorno

```typescript
if (app.get("env") === "development") {
  await setupVite(app, httpServer as any);
} else {
  serveStatic(app);
}
```

**Entornos**:
- **Development**: Configura Vite dev server con HMR (Hot Module Replacement)
- **Production**: Sirve archivos estáticos compilados

### 5. Inicialización del Servidor

```typescript
const port = 5000;
httpServer.listen({
  port,
  host: "0.0.0.0",
  reusePort: true,
}, async () => {
  log(`serving on port ${port}`);
```

**Configuración de Red**:
- **port**: 5000 (fijo para el proyecto)
- **host**: "0.0.0.0" (acepta conexiones desde cualquier IP)
- **reusePort**: true (permite reiniciar servidor sin esperar timeout)

### 6. Servicios Post-Inicio

#### A) Worker de Procesamiento de Alertas

```typescript
// Start the enrichment worker immediately
processAlerts().catch(err => console.error('Error processing alerts:', err));
// Start analytics rollup worker
startAnalyticsRollupWorker();
```

**Servicios**:
- **processAlerts()**: Worker que procesa y enriquece alertas
- **startAnalyticsRollupWorker()**: Worker que agrega datos de analíticas

#### B) Configuración de Polling Periódico

```typescript
try {
  const enrichersPath = path.join(process.cwd(), 'server', 'enrichers.yaml');
  const enrichersYaml = fs.readFileSync(enrichersPath, 'utf8');
  const enrichersConfig = yaml.load(enrichersYaml) as any;
  const pollInterval = enrichersConfig?.pollInterval || 60000;
  
  setInterval(() => {
    processAlerts().catch(err => console.error('Error processing alerts:', err));
  }, pollInterval);
} catch (error) {
  console.error('Error reading enrichers config, using default interval:', error);
  setInterval(() => {
    processAlerts().catch(err => console.error('Error processing alerts:', err));
  }, 60000);
}
```

**Configuración**:
- **enrichersPath**: Ruta al archivo de configuración YAML
- **pollInterval**: Intervalo de polling (default: 60000ms = 1 minuto)
- **Fallback**: Si falla la lectura del config, usa 60 segundos por defecto

#### C) Inicialización de SOAR PlaybookExecutor

```typescript
try {
  const playbookExecutor = new PlaybookExecutor();
  log('SOAR PlaybookExecutor initialized and started');
} catch (err) {
  console.error('Failed to initialize SOAR PlaybookExecutor', err);
}
```

**Propósito**: Ejecutor de playbooks de seguridad automatizados

#### D) AI Alert Listener

```typescript
try {
  const { initAiAlertListener } = await import('./integrations/ai-alert-listener');
  initAiAlertListener();
  log('AI Alert Listener initialized and subscribed to events');
} catch (err) {
  console.error('Failed to initialize AI Alert Listener', err);
}
```

**Propósito**: Listener que procesa alertas con inteligencia artificial

#### E) PlaybookTriggerEngine

```typescript
try {
  const { playbookTriggerEngine } = await import('./src/services/PlaybookTriggerEngine');
  log('PlaybookTriggerEngine initialized and listening for events');
} catch (err) {
  console.error('Failed to initialize PlaybookTriggerEngine', err);
}
```

**Propósito**: Motor que detecta condiciones para trigger automático de playbooks

## Variables de Entorno Utilizadas

- **CLIENT_URL**: URL del cliente frontend (default: http://localhost:5173)
- **NODE_ENV**: Entorno de ejecución (development/production)
- **PORT**: Puerto del servidor (aunque está hardcoded a 5000)

## Patrones de Diseño Implementados

### 1. **Graceful Degradation**
- Si falla la inicialización de un servicio, el servidor continúa funcionando
- Cada servicio tiene su propio try-catch

### 2. **Dependency Injection**
- Servicios se importan dinámicamente con `await import()`
- Permite lazy loading y mejor gestión de errores

### 3. **Observer Pattern**
- WebSockets para comunicación en tiempo real
- Event-driven architecture con EventBus

### 4. **Worker Pattern**
- Procesamiento asíncrono de alertas
- Workers separados para diferentes tareas

## Dependencias Críticas

- **Express**: Framework web
- **Socket.io**: WebSockets
- **YAML**: Parser para configuración
- **CORS**: Seguridad cross-origin
- **HTTP**: Servidor base de Node.js

## Consideraciones de Seguridad

1. **CORS Configuration**: Restringido a CLIENT_URL específica
2. **Credentials**: Habilitado para autenticación
3. **Error Handling**: No expone stack traces en producción
4. **Host Binding**: 0.0.0.0 permite acceso desde cualquier IP (considerar en producción)

## Performance

- **HTTP Server**: Reutilización de puerto para reinicio rápido
- **Async/Await**: No bloquea el event loop
- **Workers**: Procesamiento asíncrono de tareas pesadas
- **Logging**: Limitado a rutas API para reducir overhead

---

Este archivo es el **corazón del servidor** y coordina todos los servicios principales del sistema SOC.