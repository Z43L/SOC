# Documentación del Servidor Backend - vite.ts

## Propósito

El archivo `vite.ts` implementa la **integración del servidor de desarrollo Vite** con Express, proporcionando:

- Servidor de desarrollo con Hot Module Replacement (HMR)
- Servicio de archivos estáticos para producción
- Transformación automática de archivos TypeScript/JSX
- Logging personalizado y consistente
- Fallback a index.html para Single Page Applications (SPA)
- Cache busting automático para assets

## Diferencia Entre Desarrollo y Producción

### Desarrollo (npm run dev)
- Usa **Vite Dev Server** integrado con Express
- **HMR (Hot Module Replacement)**: Cambios en tiempo real sin reload
- **Transformación on-the-fly**: TypeScript, JSX, CSS procesados dinámicamente
- **Source Maps**: Debugging completo con archivos originales

### Producción (npm run build && npm start)
- Usa **archivos estáticos compilados** desde `/dist`
- **Assets optimizados**: Minificación, tree-shaking, code splitting
- **Caching**: Headers optimizados para caching de navegador
- **SPA fallback**: Todas las rutas desconocidas sirven index.html

## Estructura del Archivo

### 1. Imports y Configuración Inicial

#### Dependencias Core
```typescript
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
```

**Dependencias explicadas**:
- **express**: Para integración con el servidor Express
- **fs**: Operaciones del sistema de archivos
- **path**: Manipulación de rutas del sistema
- **createViteServer**: Factory para crear servidor Vite
- **createLogger**: Logger personalizable de Vite

#### Configuraciones y Utilidades
```typescript
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { dirname } from "path";
```

**Utilidades específicas**:
- **viteConfig**: Configuración principal de Vite
- **nanoid**: Generador de IDs únicos para cache busting
- **fileURLToPath/dirname**: Compatibilidad con ES modules

#### ES Modules Compatibility
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Propósito**: En ES modules, `__dirname` no existe nativamente. Esta línea recrea la funcionalidad para compatibilidad con código que espera `__dirname`.

### 2. Sistema de Logging Personalizado

```typescript
const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
```

#### Características del Logger

**Formato de Timestamp**:
- **Locale**: "en-US" para formato consistente
- **hour12**: Formato 12 horas con AM/PM
- **Precision**: Hora, minuto, segundo (sin milisegundos)

**Ejemplo de output**:
```
2:45:30 PM [express] Server started on port 5000
2:45:31 PM [vite] HMR ready
2:45:32 PM [storage] Database connected
```

**Uso en otros módulos**:
```typescript
import { log } from './vite';

log('Custom message', 'my-module');
log('Another message'); // Default source: 'express'
```

### 3. Configuración del Servidor de Desarrollo

```typescript
export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };
```

#### Server Options Explicadas

**middlewareMode: true**:
- Vite funciona como middleware de Express en lugar de servidor independiente
- Permite integración perfecta con rutas de API existentes
- Express maneja el routing principal

**hmr: { server }**:
- **Hot Module Replacement** utiliza el servidor HTTP existente
- WebSocket para HMR usa el mismo puerto que la aplicación
- Evita problemas de CORS y puertos múltiples

**allowedHosts: true**:
- Permite conexiones desde cualquier host
- Útil para desarrollo en containers o VMs
- **Nota de seguridad**: Solo para desarrollo

#### Configuración Avanzada de Vite

```typescript
const vite = await createViteServer({
  ...viteConfig,
  configFile: false,
  customLogger: {
    ...viteLogger,
    error: (msg, options) => {
      viteLogger.error(msg, options);
      process.exit(1);
    },
  },
  server: serverOptions,
  appType: "custom",
});
```

**Configuración detallada**:

**...viteConfig**: 
- Spread de configuración desde `vite.config.ts`
- Incluye plugins, resolvers, optimizaciones

**configFile: false**:
- No busca archivo de configuración adicional
- Usa solo la configuración programática

**customLogger con exit(1)**:
- **Fail Fast**: Errores críticos terminan el proceso inmediatamente
- **Development Safety**: Evita estados inconsistentes
- **Clear Feedback**: Desarrolladores ven errores críticos claramente

**appType: "custom"**:
- Indica que no es una SPA estándar
- Permite integración personalizada con Express
- Vite no asume control completo del servidor

### 4. Middleware de Desarrollo y Fallback SPA

```typescript
app.use(vite.middlewares);
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    // resolve index.html from project root
    const clientTemplate = path.resolve(
      process.cwd(),
      "client",
      "index.html"
    );

    // always reload the index.html file from disk incase it changes
    let template = await fs.promises.readFile(clientTemplate, "utf-8");
    template = template.replace(
      `src="/src/main.tsx"`,
      `src="/src/main.tsx?v=${nanoid()}"`,
    );
    const page = await vite.transformIndexHtml(url, template);
    res.status(200).set({ "Content-Type": "text/html" }).end(page);
  } catch (e) {
    vite.ssrFixStacktrace(e as Error);
    next(e);
  }
});
```

#### Flujo de Procesamiento

**1. Vite Middlewares**:
```typescript
app.use(vite.middlewares);
```
- Maneja archivos de desarrollo (`.ts`, `.tsx`, `.css`, etc.)
- Procesa imports y transformaciones
- Sirve assets con transformaciones on-the-fly

**2. SPA Fallback**:
```typescript
app.use("*", async (req, res, next) => {
```
- Captura TODAS las rutas no manejadas previamente
- Implementa el patrón SPA (Single Page Application)
- Permite client-side routing (React Router, etc.)

**3. Template Loading**:
```typescript
const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
let template = await fs.promises.readFile(clientTemplate, "utf-8");
```
- **Always Fresh**: Lee desde disco en cada request
- **Hot Reload**: Cambios en index.html se reflejan inmediatamente
- **Async File I/O**: No bloquea el event loop

**4. Cache Busting**:
```typescript
template = template.replace(
  `src="/src/main.tsx"`,
  `src="/src/main.tsx?v=${nanoid()}"`,
);
```
- **nanoid()**: Genera ID único para cada request
- **Query Parameter**: `?v=abc123` evita caching del navegador
- **Development Only**: Solo para desarrollo, producción usa hashes

**5. Vite Transformation**:
```typescript
const page = await vite.transformIndexHtml(url, template);
```
- **HTML Transform**: Procesa imports, enlaces, etc.
- **Plugin Pipeline**: Ejecuta plugins de Vite
- **URL Context**: Usa la URL actual para resoluciones relativas

**6. Error Handling**:
```typescript
} catch (e) {
  vite.ssrFixStacktrace(e as Error);
  next(e);
}
```
- **Stack Trace Fixing**: Mapea errores a archivos fuente originales
- **Express Error Handling**: Delega a middleware de error de Express
- **Development Debugging**: Stack traces útiles para desarrollo

### 5. Servicio de Archivos Estáticos (Producción)

```typescript
export function serveStatic(app: Express) {
  // resolve built files under project root
  const distPath = path.resolve(process.cwd(), "dist", "public");

  console.log("Serving static from:", distPath);

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

#### Funcionamiento de Producción

**1. Path Resolution**:
```typescript
const distPath = path.resolve(process.cwd(), "dist", "public");
```
- **Build Directory**: Archivos compilados por `npm run build`
- **Public Subfolder**: Separación entre archivos públicos y privados
- **Absolute Path**: Resolución absoluta para evitar problemas de cwd

**2. Build Validation**:
```typescript
if (!fs.existsSync(distPath)) {
  throw new Error(
    `Could not find the build directory: ${distPath}, make sure to build the client first`
  );
}
```
- **Fail Fast**: Error claro si no hay build
- **Developer Guidance**: Mensaje específico sobre qué hacer
- **Startup Validation**: Verifica antes de iniciar servidor

**3. Static File Serving**:
```typescript
app.use(express.static(distPath));
```
- **Express Static**: Middleware optimizado para archivos estáticos
- **Performance**: Headers de cache automáticos
- **MIME Types**: Detección automática de content-type

**4. SPA Fallback para Producción**:
```typescript
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```
- **Catch-All**: Todas las rutas no encontradas sirven index.html
- **Client Routing**: Permite React Router, Vue Router, etc.
- **sendFile**: Más eficiente que readFile + write

## Comparación: Desarrollo vs Producción

### Desarrollo (setupVite)
```typescript
// Hot Module Replacement
vite.middlewares → Transformación dinámica
"*" → index.html + transformaciones + cache busting
```

**Características**:
- ✅ **HMR**: Cambios instantáneos
- ✅ **Source Maps**: Debugging completo
- ✅ **Transform on-the-fly**: No need to rebuild
- ❌ **Performance**: Más lento que archivos estáticos

### Producción (serveStatic)
```typescript
// Archivos optimizados
express.static → Archivos pre-compilados
"*" → index.html estático
```

**Características**:
- ✅ **Performance**: Máxima velocidad
- ✅ **Optimization**: Minificación, tree-shaking
- ✅ **Caching**: Headers optimizados
- ❌ **Development**: No HMR, requires rebuild

## Uso en el Sistema

### En index.ts (Entry Point)
```typescript
import { setupVite, serveStatic } from "./vite";

if (process.env.NODE_ENV === "production") {
  serveStatic(app);
} else {
  await setupVite(app, server);
}
```

### En otros módulos (Logging)
```typescript
import { log } from "./vite";

log("Starting AI service", "ai");
log("Database connected", "storage");
log("WebSocket server ready", "socket");
```

## Configuración de Assets

### Vite Config Integration
```typescript
// vite.config.ts
export default {
  build: {
    outDir: 'dist/public',  // Coincide con serveStatic
    rollupOptions: {
      input: 'client/index.html'
    }
  },
  server: {
    middlewareMode: true      // Coincide con setupVite
  }
}
```

### Asset Optimization
```typescript
// En build automáticamente se optimiza:
// - CSS minification
// - JS bundling y minification  
// - Image optimization
// - Tree shaking
// - Code splitting
```

## Troubleshooting Común

### 1. Build Directory Not Found
```
Error: Could not find the build directory: /path/to/dist/public
```
**Solución**: Ejecutar `npm run build` antes de production

### 2. HMR Not Working
**Causas comunes**:
- WebSocket blocked by firewall
- Proxy configuration incorrecta
- Multiple Vite servers running

### 3. Assets Not Loading
**Development**: Verificar que Vite middlewares estén registrados
**Production**: Verificar que `dist/public` existe y tiene permisos

### 4. SPA Routing Issues
**Síntoma**: 404 en refresh de página
**Causa**: Servidor no configurado para SPA fallback
**Solución**: Verificar que `"*"` handler está último

## Performance Considerations

### Development
- **Transform Caching**: Vite cachea transformaciones
- **Dependency Pre-bundling**: Dependencies se pre-bundle automáticamente
- **HTTP/2 Push**: Vite optimiza carga de modules

### Production
- **Static File Caching**: Express.static optimizado para caching
- **Compression**: Usar middleware de compression
- **CDN Ready**: Assets tienen hashes para caching infinito

---

Este sistema proporciona una **experiencia de desarrollo fluida** con HMR completo y una **deployation de producción optimizada** con assets compilados y caching eficiente.