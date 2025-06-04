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

**Explicación detallada de cada import**:

#### Express Framework
```typescript
import express, { type Request, Response, NextFunction } from "express";
```
- **express**: Función principal para crear la aplicación web
- **Request**: Tipo TypeScript que describe la estructura de una petición HTTP
- **Response**: Tipo TypeScript que describe la estructura de una respuesta HTTP  
- **NextFunction**: Tipo para funciones middleware que pasan control al siguiente middleware

**¿Qué es Express?**: Es como un organizador para tu aplicación web. Te ayuda a:
- Recibir peticiones HTTP (GET, POST, PUT, DELETE)
- Procesar datos enviados por usuarios
- Enviar respuestas de vuelta
- Organizar el código en rutas lógicas

#### CORS (Cross-Origin Resource Sharing)
```typescript
import cors from 'cors';
```
**¿Qué es CORS?**: Es un mecanismo de seguridad de los navegadores web. Sin CORS:
- Tu frontend en `localhost:5173` no podría comunicarse con tu backend en `localhost:3000`
- Los navegadores bloquearían las peticiones por "política de mismo origen"

**Ejemplo sin CORS**:
```
❌ Frontend (localhost:5173) → Backend (localhost:3000) = BLOQUEADO
```

**Ejemplo con CORS**:
```
✅ Frontend (localhost:5173) → Backend (localhost:3000) = PERMITIDO
```

#### Funciones Locales
```typescript
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
```

**registerRoutes**: Función que registra todas las rutas de la API
- Ejemplo: `/api/users`, `/api/alerts`, `/api/agents`
- Organiza qué código se ejecuta para cada URL

**setupVite**: Configura el servidor de desarrollo
- En desarrollo: Servidor rápido con hot reload
- En producción: Sirve archivos estáticos optimizados

**serveStatic**: Sirve archivos estáticos (HTML, CSS, JS, imágenes)

**log**: Sistema de logging personalizado para registrar eventos

### 3. Configuración de Express - Explicación Paso a Paso

```typescript
const app = express();
```
**¿Qué hace?**: Crea una nueva aplicación Express
**Analogía**: Es como crear un nuevo restaurante vacío - tienes el edificio pero necesitas añadir mesas, menú, cocineros, etc.

```typescript
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
```
**Configuración CORS detallada**:
- **origin**: URL desde la cual permitimos peticiones
  - `process.env.CLIENT_URL`: Variable de entorno (en producción: tu dominio real)
  - `'http://localhost:5173'`: Valor por defecto para desarrollo
- **credentials: true**: Permite envío de cookies de autenticación

**Ejemplo práctico**:
```javascript
// ✅ Permitido - petición desde localhost:5173
fetch('http://localhost:3000/api/users', { credentials: 'include' })

// ❌ Bloqueado - petición desde otro dominio
fetch('http://localhost:3000/api/users') // desde localhost:8080
```

```typescript
app.use(express.json());
```
**¿Qué hace?**: Configura Express para entender peticiones con contenido JSON
**Sin esto**: Si envías `{"name": "Juan"}`, Express no sabría cómo procesarlo
**Con esto**: Express convierte automáticamente el JSON en un objeto JavaScript

**Ejemplo**:
```javascript
// Cliente envía:
fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Juan', email: 'juan@email.com' })
})

// Servidor recibe (gracias a express.json()):
req.body = { name: 'Juan', email: 'juan@email.com' }
```

```typescript
app.use(express.urlencoded({ extended: false }));
```
**¿Qué hace?**: Permite procesar formularios HTML tradicionales
**extended: false**: Usa la biblioteca 'querystring' (más simple) en lugar de 'qs' (más compleja)

**Ejemplo de formulario HTML**:
```html
<form method="POST" action="/api/contact">
  <input name="name" value="Juan">
  <input name="email" value="juan@email.com">
  <button type="submit">Enviar</button>
</form>
```
**Resultado en el servidor**:
```javascript
req.body = { name: 'Juan', email: 'juan@email.com' }
```

### 4. Middleware de Logging Personalizado

Este middleware es una parte fundamental del sistema que registra información detallada sobre cada petición HTTP. Veamos línea por línea:

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
```

**Explicación línea por línea**:
- `app.use()`: Registra un middleware que se ejecuta en TODAS las peticiones HTTP
- `(req, res, next)`: Función que recibe:
  - `req` (request): Información de la petición del cliente
  - `res` (response): Objeto para enviar respuesta al cliente  
  - `next`: Función para continuar al siguiente middleware
- `const start = Date.now()`: Guarda el momento exacto (en milisegundos) cuando empieza la petición
- `const path = req.path`: Extrae la ruta de la URL (ej: "/api/users")
- `let capturedJsonResponse`: Variable para almacenar la respuesta JSON que enviamos al cliente

```typescript
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
```

**¿Qué hace este código?**:
- `originalResJson = res.json`: Guarda la función original que envía respuestas JSON
- `res.json = function (bodyJson, ...args)`: Reemplaza la función original con nuestra versión
- `capturedJsonResponse = bodyJson`: Captura el contenido JSON antes de enviarlo
- `return originalResJson.apply(...)`: Llama a la función original para enviar la respuesta

**¿Por qué hacemos esto?**: Queremos saber qué datos enviamos al cliente para incluirlos en los logs, pero sin interferir con el funcionamiento normal.

```typescript
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
```

**Explicación del evento "finish"**:
- `res.on("finish", ...)`: Escucha el evento que se dispara cuando la respuesta se envía completamente
- `duration = Date.now() - start`: Calcula cuánto tiempo tomó procesar la petición
- `if (path.startsWith("/api"))`: Solo registra peticiones que empiecen con "/api" (ignora archivos estáticos)
- `logLine = ...`: Construye una línea de log con formato: "MÉTODO /ruta CÓDIGO_STATUS en XXXms"
- `JSON.stringify(capturedJsonResponse)`: Convierte el objeto JSON a texto para incluir en el log
- `if (logLine.length > 80)`: Si el log es muy largo, lo corta para mantener legibilidad
- `log(logLine)`: Escribe el log usando nuestro sistema de logging

```typescript
  next();
});
```

**Finalización**:
- `next()`: Llama al siguiente middleware en la cadena (muy importante, sin esto la petición se "cuelga")

**Ejemplo de log generado**:
```
GET /api/users 200 in 45ms :: {"users":[{"id":1,"name":"Juan"}]}
POST /api/alerts 201 in 123ms :: {"id":42,"status":"created"}
```

**Beneficios de este sistema**:
1. **Monitoreo de performance**: Sabemos qué peticiones son lentas
2. **Debugging**: Podemos ver exactamente qué datos devolvemos
3. **Auditoría**: Registro completo de la actividad de la API
4. **Análisis**: Datos para optimizar el rendimiento

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