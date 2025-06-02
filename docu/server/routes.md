# Documentación del Servidor Backend - routes.ts

## Propósito

El archivo `routes.ts` es el **núcleo del enrutamiento de la API** del servidor SOC. Este archivo define y registra todas las rutas HTTP que permiten la comunicación entre el frontend y el backend, incluyendo endpoints para:

- Gestión de alertas y incidentes de seguridad
- Administración de usuarios y autenticación
- Integraciones con servicios de IA
- Conectores de datos externos
- Métricas y analíticas en tiempo real
- Funcionalidades de SOAR (Security Orchestration and Response)
- Gestión de agentes de monitoreo
- Integración con servicios de pago (Stripe)

## Estructura del Archivo

### 1. Imports y Dependencias Principales

#### Framework Web y HTTP
```typescript
import { Router } from "express";
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
```

**Explicación de cada import**:
- **Router**: Clase de Express para crear grupos de rutas modulares
- **express**: Framework principal para crear el servidor web
- **Express, Request, Response, NextFunction**: Tipos TypeScript para tipado estricto
- **createServer, Server**: Para crear el servidor HTTP que usará Express

#### Schemas y Validación
```typescript
import { SeverityTypes, AlertStatusTypes, IncidentStatusTypes, PlaybookTriggerTypes, PlaybookStatusTypes, insertThreatFeedSchema, insertPlaybookSchema } from "@shared/schema";
import { z } from "zod";
```

**Schemas importados**:
- **SeverityTypes**: Enum para niveles de severidad (Low, Medium, High, Critical)
- **AlertStatusTypes**: Estados de alertas (Open, In Progress, Resolved, False Positive)
- **IncidentStatusTypes**: Estados de incidentes (New, Investigating, Contained, Resolved)
- **PlaybookTriggerTypes**: Tipos de triggers para playbooks automatizados
- **PlaybookStatusTypes**: Estados de ejecución de playbooks
- **insertThreatFeedSchema**: Schema de validación para fuentes de inteligencia
- **insertPlaybookSchema**: Schema de validación para playbooks

**Zod**: Librería de validación que asegura que los datos recibidos tengan el formato correcto.

#### Servicios de Almacenamiento y Autenticación
```typescript
import { storage } from "./storage";
import { setupAuth } from "./auth";
```

**storage**: Interfaz principal para operaciones de base de datos
**setupAuth**: Configuración del sistema de autenticación con Passport.js

#### Servicios de Inteligencia Artificial

##### AI Básico
```typescript
import { 
  generateAlertInsight, 
  correlateAlerts, 
  analyzeThreatIntel, 
  generateSecurityRecommendations,
  initializeOpenAI,
  isOpenAIConfigured
} from "./ai-service";
```

**Funciones del AI básico**:
- **generateAlertInsight**: Genera análisis de alertas usando IA
- **correlateAlerts**: Correlaciona alertas relacionadas
- **analyzeThreatIntel**: Analiza inteligencia de amenazas
- **generateSecurityRecommendations**: Genera recomendaciones de seguridad
- **initializeOpenAI**: Inicializa la conexión con OpenAI
- **isOpenAIConfigured**: Verifica si OpenAI está configurado

##### AI Avanzado (Multi-Proveedor)
```typescript
import {
  AIModelType,
  AnalysisType,
  initializeOpenAI as initOpenAI,
  initializeAnthropic,
  isOpenAIConfigured as isOpenAIReady,
  isAnthropicConfigured,
  generateAlertInsight as generateAdvancedAlertInsight,
  correlateAlerts as correlateAlertsAdvanced,
  analyzeThreatIntel as analyzeThreatIntelAdvanced,
  generateSecurityRecommendations as generateAdvancedRecommendations,
  analyzeLogPatterns,
  analyzeNetworkTraffic,
  detectAnomalies
} from "./advanced-ai-service";
```

**Capacidades avanzadas**:
- **AIModelType**: Enum para tipos de modelos (OpenAI, Anthropic, local)
- **AnalysisType**: Tipos de análisis disponibles
- **analyzeLogPatterns**: Análisis de patrones en logs
- **analyzeNetworkTraffic**: Análisis de tráfico de red
- **detectAnomalies**: Detección de anomalías usando ML

#### Integraciones y Conectores
```typescript
import { importAllFeeds } from "./integrations/threatFeeds";
import { importAllAlerts } from "./integrations/alerts";
import { updateAllData, updateSystemMetrics } from "./integrations/scheduler";
import { RealtimeMonitor } from "./integrations/connectors/real-time-monitor";
import { 
  initializeConnectors, 
  executeConnector, 
  toggleConnector,
  getActiveConnectors
} from "./integrations/connectors";
```

**Sistemas de integración**:
- **threatFeeds**: Importación de feeds de inteligencia de amenazas
- **alerts**: Importación y procesamiento de alertas
- **scheduler**: Tareas programadas y actualizaciones automáticas
- **RealtimeMonitor**: Monitoreo en tiempo real con WebSockets
- **connectors**: Gestión de conectores a fuentes de datos externas

#### Servicios de Negocio
```typescript
import stripeRoutes from "./integrations/stripe/stripe-routes";
import { StripeService } from "./integrations/stripe-service";
import { createCheckoutSession as createStripeCheckoutSession } from "./integrations/stripe-service-wrapper";
```

**Stripe Integration**: Sistema completo de pagos y facturación

#### Automatización y SOAR
```typescript
import { playbookExecutor } from "./src/services/playbookExecutor";
import { advancedRouter } from "./advanced-routes";
import { 
  registerAgent, 
  processAgentData, 
  processAgentHeartbeat, 
  generateAgentRegistrationKey, 
  buildAgentPackage 
} from "./integrations/agents";
```

**SOAR Components**:
- **playbookExecutor**: Ejecutor de playbooks de automatización
- **advancedRouter**: Rutas para funcionalidades avanzadas
- **agents**: Gestión completa de agentes de monitoreo

#### Utilidades del Sistema
```typescript
import cron from "node-cron";
import { log } from "./vite";
import * as fs from 'fs';
import * as path from 'path';
```

**Sistema utilities**:
- **node-cron**: Programación de tareas automáticas
- **log**: Sistema de logging personalizado
- **fs/path**: Operaciones del sistema de archivos

### 2. Función Principal - registerRoutes

```typescript
export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Initializar los conectores - para recibir datos de fuentes externas
  // Almacenamos una referencia a Express global para que los conectores puedan registrar endpoints
  (global as any).expressApp = app;
```

**Propósito**: Esta función es el punto de entrada principal para configurar todas las rutas de la aplicación.

**Parámetros**:
- **app**: Instancia de Express donde se registrarán las rutas
- **Return**: Promise<Server> - Servidor HTTP configurado

**Pasos de inicialización**:
1. **Setup Authentication**: Configura Passport.js y middleware de autenticación
2. **Global Express Reference**: Permite que otros módulos accedan a la app de Express
3. **Initialize Connectors**: Inicializa conectores de datos externos
4. **Register Route Groups**: Registra grupos de rutas organizados por funcionalidad

## Grupos de Rutas Principales

### 1. API Router Base
```typescript
const apiRouter = Router();
app.use("/api", apiRouter);
```

**Propósito**: Todas las rutas de API se agrupan bajo el prefijo `/api`

### 2. Rutas de Autenticación
```typescript
// Authentication routes
apiRouter.post("/auth/register", async (req: Request, res: Response) => {
  // Registro de usuarios con validación
});

apiRouter.post("/auth/login", async (req: Request, res: Response) => {
  // Login con Passport.js
});

apiRouter.post("/auth/logout", async (req: Request, res: Response) => {
  // Logout y limpieza de sesión
});
```

### 3. Rutas de Alertas y Seguridad
```typescript
// Alerts management
apiRouter.get("/alerts", isAuthenticated, async (req: Request, res: Response) => {
  // Lista todas las alertas con paginación
});

apiRouter.post("/alerts", isAuthenticated, async (req: Request, res: Response) => {
  // Crea nueva alerta con enriquecimiento automático
});

apiRouter.put("/alerts/:id", isAuthenticated, async (req: Request, res: Response) => {
  // Actualiza alerta existente
});
```

### 4. Rutas de IA y Análisis
```typescript
// AI-powered analysis
apiRouter.post("/ai/analyze-alert/:id", isAuthenticated, async (req: Request, res: Response) => {
  // Análisis de alerta con IA
});

apiRouter.post("/ai/correlate", isAuthenticated, async (req: Request, res: Response) => {
  // Correlación de alertas
});

apiRouter.post("/ai/threat-analysis", isAuthenticated, async (req: Request, res: Response) => {
  // Análisis de inteligencia de amenazas
});
```

### 5. Métricas y Dashboard
```typescript
// Dashboard metrics
apiRouter.get("/metrics/overview", isAuthenticated, async (req: Request, res: Response) => {
  // Métricas generales del SOC
});

apiRouter.get("/metrics/alert-trends", isAuthenticated, async (req: Request, res: Response) => {
  // Tendencias de alertas
});

apiRouter.get("/metrics/threat-summary", isAuthenticated, async (req: Request, res: Response) => {
  // Resumen de amenazas
});
```

## Middleware de Seguridad

### 1. isAuthenticated
```typescript
import { isAuthenticated, requireRole } from './middleware/auth';
```

**Uso**: Protege rutas que requieren autenticación
**Ejemplo**:
```typescript
apiRouter.get("/sensitive-data", isAuthenticated, async (req, res) => {
  // Solo usuarios autenticados pueden acceder
});
```

### 2. requireRole
```typescript
apiRouter.delete("/admin/users/:id", isAuthenticated, requireRole('admin'), async (req, res) => {
  // Solo administradores pueden eliminar usuarios
});
```

## Patrones de Manejo de Errores

### Patrón Estándar
```typescript
apiRouter.get("/example", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await someAsyncOperation();
    res.json(result);
  } catch (error: any) {
    console.error('Operation failed:', error);
    res.status(500).json({ 
      message: error.message || 'Internal server error' 
    });
  }
});
```

### Validación con Zod
```typescript
apiRouter.post("/validated-endpoint", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = someSchema.parse(req.body);
    const result = await processValidatedData(validatedData);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.errors 
      });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});
```

## Integración con WebSockets

### Configuración del Servidor
```typescript
const server = createServer(app);
// El servidor se retorna para que socket.ts pueda configurar WebSockets
return server;
```

**Propósito**: El servidor HTTP retornado se usa en `socket.ts` para habilitar comunicación en tiempo real.

## Tareas Programadas (Cron Jobs)

### Actualización Automática de Datos
```typescript
// Programar actualizaciones automáticas cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  try {
    await updateAllData();
    log('Scheduled update completed');
  } catch (error) {
    console.error('Scheduled update failed:', error);
  }
});
```

### Métricas del Sistema
```typescript
// Actualizar métricas cada minuto
cron.schedule('* * * * *', async () => {
  try {
    await updateSystemMetrics();
  } catch (error) {
    console.error('Metrics update failed:', error);
  }
});
```

## Consideraciones de Seguridad

### 1. Autenticación Obligatoria
- Todas las rutas sensibles requieren autenticación
- Uso de middleware `isAuthenticated` en rutas protegidas

### 2. Validación de Entrada
- Uso extensivo de Zod para validar datos de entrada
- Sanitización de parámetros de URL y body

### 3. Autorización por Roles
- Middleware `requireRole` para operaciones administrativas
- Separación clara entre usuarios normales y administradores

### 4. Manejo Seguro de Errores
- No exposición de información sensible en mensajes de error
- Logging detallado para debugging sin comprometer seguridad

## Consideraciones de Performance

### 1. Paginación
```typescript
const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
const offset = parseInt(req.query.offset as string) || 0;
```

### 2. Caché de Operaciones Costosas
- Métricas se calculan y cachean
- Uso de workers para operaciones pesadas

### 3. Lazy Loading de Integraciones
- Importaciones dinámicas para servicios opcionales
- Inicialización condicional basada en configuración

## Integración con Otros Módulos

### Storage
- **Usado para**: Todas las operaciones de base de datos
- **Patrón**: `await storage.operationName()`

### AI Services
- **Básico**: Para análisis estándar
- **Avanzado**: Para análisis complejos con múltiples proveedores

### Connectors
- **Propósito**: Recibir datos de fuentes externas
- **Gestión**: Activación/desactivación dinámica

### Real-time Updates
- **WebSockets**: Para actualizaciones en tiempo real
- **Events**: Sistema de eventos para comunicación entre módulos

---

Este archivo es el **centro neurálgico** del servidor SOC, coordinando todas las funcionalidades principales y proporcionando una API robusta y segura para el frontend y integraciones externas.