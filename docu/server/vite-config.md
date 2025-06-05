# Documentación de Configuración Vite

Este archivo documenta el sistema de configuración de Vite implementado en `server/vite.ts`, que maneja tanto el desarrollo con HMR como el servicio de archivos estáticos en producción.

## Propósito General

El sistema de Vite proporciona:
- **Desarrollo rápido**: Hot Module Replacement (HMR) para cambios instantáneos
- **Build optimizado**: Servicio de archivos estáticos en producción
- **SSR Support**: Server-Side Rendering para aplicaciones isomórficas
- **Logging personalizado**: Sistema de logs integrado con el servidor
- **Template processing**: Transformación de HTML con cachebuster

## Arquitectura del Sistema

### Importaciones y Configuración

```typescript
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { dirname } from "path";
```

#### Dependencias explicadas:

- **Vite**: Build tool y dev server moderno
- **express**: Integración con middleware de Express
- **fs/path**: Operaciones de sistema de archivos
- **nanoid**: Generación de IDs únicos para cache busting
- **viteConfig**: Configuración principal de Vite

### Configuración de Directorios

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Compatibilidad ES Modules**: Equivalente a `__dirname` en módulos CommonJS.

## Sistema de Logging

### Función de Logging Personalizada

```typescript
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

#### Características del logging:

- **Timestamp formateado**: Hora legible en formato 12h
- **Source identification**: Identifica el origen del log
- **Consistent format**: Formato uniforme para todos los logs

#### Ejemplo de output:
```
10:30:45 AM [express] Server started on port 5000
10:30:46 AM [vite] HMR connected
10:31:02 AM [routes] User authenticated: john.doe
```

### Logger de Vite Personalizado

```typescript
const viteLogger = createLogger();

const customLogger = {
  ...viteLogger,
  error: (msg, options) => {
    viteLogger.error(msg, options);
    process.exit(1);
  },
};
```

**Error handling**: Los errores de Vite terminan el proceso (fail-fast approach).

## Configuración de Desarrollo

### Función setupVite

```typescript
export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: customLogger,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  // ... middleware setup
}
```

#### Configuración detallada:

**Server Options**:
- **middlewareMode**: Integra Vite como middleware de Express
- **hmr.server**: Usa el servidor HTTP existente para WebSocket HMR
- **allowedHosts**: Permite conexiones desde cualquier host

**Vite Options**:
- **configFile: false**: No busca archivo de config (usa el importado)
- **customLogger**: Logger personalizado con manejo de errores
- **appType: "custom"**: Aplicación personalizada (no SPA estándar)

### Hot Module Replacement (HMR)

#### Integración con Express

```typescript
app.use(vite.middlewares);
```

**Funcionalidad**:
- **Asset serving**: Vite sirve assets durante desarrollo
- **HMR WebSocket**: Conexión WebSocket para updates en tiempo real
- **Module transformation**: Transformación on-the-fly de módulos

### Middleware de Template

```typescript
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

#### Características del middleware:

1. **Template Loading**: Carga index.html desde disco (siempre fresh)
2. **Cache Busting**: Añade query parameter único para evitar cache
3. **HTML Transformation**: Vite procesa el HTML (inject scripts, etc.)
4. **Error Handling**: Stack trace fixing para mejor debugging

#### Cache Busting Explained:

```typescript
// Antes:
src="/src/main.tsx"

// Después:
src="/src/main.tsx?v=N1aD3j8K4m2P"
```

**Propósito**: Fuerza recarga del módulo principal evitando cache del browser.

## Configuración de Producción

### Función serveStatic

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

#### Funcionalidad de producción:

1. **Static File Serving**: Sirve archivos compilados desde `dist/public`
2. **Build Validation**: Verifica que el directorio de build existe
3. **SPA Fallback**: Cualquier ruta no encontrada sirve index.html

#### Estructura de archivos esperada:

```
dist/
└── public/
    ├── index.html
    ├── assets/
    │   ├── main.js
    │   ├── main.css
    │   └── vendor.js
    └── favicon.ico
```

## Integración con el Servidor Principal

### Configuración Condicional en index.ts

```typescript
// En server/index.ts
if (app.get("env") === "development") {
  await setupVite(app, httpServer as any);
} else {
  serveStatic(app);
}
```

#### Lógica de entornos:

- **Development**: Usa Vite dev server con HMR
- **Production**: Sirve archivos estáticos pre-compilados

### Orden de Middleware

```typescript
// 1. Configurar rutas API primero
await registerRoutes(app);

// 2. Configurar Vite/static AL FINAL
if (development) {
  await setupVite(app, httpServer);
} else {
  serveStatic(app);
}
```

**Importancia del orden**: Vite debe ir AL FINAL para que su catch-all route no interfiera con las rutas API.

## Configuración de Vite Principal

### Archivo vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared')
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
```

#### Configuraciones clave:

- **outDir**: Directorio de salida para build
- **manualChunks**: Separación de código por vendor/ui
- **alias**: Shortcuts para imports
- **proxy**: Proxy de API requests en desarrollo

## Troubleshooting

### Problemas Comunes

#### Error: Build directory not found

```bash
Error: Could not find the build directory: /path/to/dist/public
```

**Solución**:
```bash
# Compilar cliente antes de producción
npm run build
```

#### HMR no funciona

```javascript
// Verificar conexión WebSocket en DevTools
// Console debe mostrar:
[vite] connected.
```

**Posibles causas**:
- Puerto bloqueado
- Proxy configuration issues
- CORS problems

#### Rutas SPA no funcionan

```
Cannot GET /dashboard
```

**Solución**: Verificar que el fallback a index.html está configurado:

```typescript
// En serveStatic
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```

### Debugging

#### Logging de Vite

```typescript
// Habilitar logs detallados de Vite
const vite = await createViteServer({
  logLevel: 'info', // 'error' | 'warn' | 'info' | 'silent'
  // ...
});
```

#### Verificar archivos servidos

```bash
# Listar contenido del directorio dist
ls -la dist/public/

# Verificar tamaño de archivos
du -h dist/public/assets/
```

## Performance y Optimización

### Build Optimization

#### Code Splitting

```typescript
// En vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries
          vendor: ['react', 'react-dom', 'react-router-dom'],
          
          // UI components
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs'
          ],
          
          // Charts and visualization
          charts: ['recharts', 'd3'],
          
          // Utilities
          utils: ['lodash', 'date-fns', 'nanoid']
        }
      }
    }
  }
});
```

#### Asset Optimization

```typescript
export default defineConfig({
  build: {
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    },
    
    // Asset inlining threshold
    assetsInlineLimit: 4096, // 4kb
    
    // CSS code splitting
    cssCodeSplit: true,
    
    // Source maps for production debugging
    sourcemap: false // Set to true if needed
  }
});
```

### Development Optimization

#### Fast Refresh Configuration

```typescript
// En vite.config.ts
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // Fast Refresh options
      fastRefresh: true,
      
      // React Developer Tools
      jsxRuntime: 'automatic'
    })
  ],
  
  // Dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom'
    ],
    exclude: [
      // Don't pre-bundle development-only deps
      '@vitejs/plugin-react'
    ]
  }
});
```

#### Dev Server Caching

```typescript
export default defineConfig({
  server: {
    // File system caching
    fs: {
      strict: false, // Allow serving files outside root
      cachedChecks: false // Disable caching for development
    },
    
    // Module invalidation
    hmr: {
      overlay: true, // Show errors in overlay
      clientPort: undefined // Use same port as server
    }
  }
});
```

## Mejores Prácticas

### 1. **Environment Configuration**

```typescript
// Configuración por entorno
const isDevelopment = process.env.NODE_ENV === 'development';

export default defineConfig({
  plugins: [
    react({
      // Solo en desarrollo
      jsxImportSource: isDevelopment ? '@emotion/react' : undefined
    })
  ],
  
  build: {
    // Solo minificar en producción
    minify: isDevelopment ? false : 'terser',
    
    // Source maps solo en desarrollo
    sourcemap: isDevelopment
  }
});
```

### 2. **Asset Organization**

```
client/
├── src/
│   ├── assets/
│   │   ├── images/
│   │   ├── icons/
│   │   └── styles/
│   ├── components/
│   └── main.tsx
└── public/
    ├── favicon.ico
    └── manifest.json
```

### 3. **Import Path Optimization**

```typescript
// Usar alias para imports limpios
import { Button } from '@/components/ui/button';
import { AlertType } from '@shared/schema';

// En lugar de:
import { Button } from '../../../components/ui/button';
import { AlertType } from '../../shared/schema';
```

### 4. **Bundle Analysis**

```bash
# Analizar tamaño del bundle
npm install --save-dev rollup-plugin-visualizer

# En vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: true
    })
  ]
});
```

### 5. **Progressive Web App (PWA)**

```typescript
// Opcional: Configuración PWA
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'SOC Intelligence Platform',
        short_name: 'SOC',
        description: 'Security Operations Center Platform',
        theme_color: '#000000',
        background_color: '#ffffff'
      }
    })
  ]
});
```

## Monitoreo y Métricas

### Build Metrics

```typescript
// Plugin personalizado para métricas de build
function buildMetrics() {
  return {
    name: 'build-metrics',
    generateBundle(options, bundle) {
      const stats = {
        totalSize: 0,
        chunks: {}
      };
      
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          stats.chunks[fileName] = chunk.code.length;
          stats.totalSize += chunk.code.length;
        }
      }
      
      console.log('Build Stats:', stats);
    }
  };
}
```

### Performance Monitoring

```typescript
// En el cliente
if (process.env.NODE_ENV === 'development') {
  // Performance monitoring en desarrollo
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      console.log('Performance:', entry.name, entry.duration);
    });
  });
  
  observer.observe({ entryTypes: ['navigation', 'resource'] });
}
```