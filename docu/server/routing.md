# Documentación del Sistema de Rutas

Este archivo documenta el sistema completo de rutas del servidor SOC implementado principalmente en `server/routes.ts` y archivos relacionados.

## Propósito General

El sistema de rutas maneja:
- **API endpoints** para todas las funcionalidades del SOC
- **Autenticación y autorización** de requests
- **Integración de servicios externos** (Stripe, AI, conectores)
- **Gestión de recursos** (usuarios, alertas, incidentes, agentes)
- **WebSocket y tiempo real** para actualizaciones live
- **Tareas automatizadas** y schedulers

## Estructura del Archivo de Rutas

### Importaciones y Dependencias

```typescript
import { Router } from "express";
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { 
  generateAlertInsight, 
  correlateAlerts, 
  analyzeThreatIntel 
} from "./ai-service";
import { processNewAlertWithEnrichment } from './integrations/alertEnrichment';
import stripeRoutes from "./integrations/stripe/stripe-routes";
import { advancedRouter } from "./advanced-routes";
```

#### Categorías de importaciones:

1. **Express core**: Router, tipos TypeScript
2. **Servicios internos**: storage, auth, AI
3. **Integraciones**: Stripe, enrichment, conectores
4. **Rutas especializadas**: billing, SOAR, settings
5. **Servicios externos**: AI providers, threat feeds
6. **Utilidades**: scheduling, logging, analytics

## Estructura de Rutas

### Configuración Principal

```typescript
export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Inicializar conectores
  await initializeConnectors(app);
  
  const apiRouter = Router();
  
  // Registrar sub-routers
  apiRouter.use('/billing', stripeRoutes);
  apiRouter.use('/settings', settingsRoutes);
  apiRouter.use('/connectors', connectorsRoutes);
  apiRouter.use('/soar', playbookBindingsRoutes);
  
  // Aplicar router principal
  app.use('/api', apiRouter);
}
```

#### Características de la configuración:

1. **Setup de autenticación**: Configura Passport y sesiones
2. **Inicialización de conectores**: Carga conectores de datos externos
3. **Sub-routers modulares**: Organización por funcionalidad
4. **Prefijo /api**: Todas las rutas API bajo este namespace

## Categorías de Rutas

### 1. Rutas de Agentes (Sin Autenticación)

Los agentes distribuidos necesitan endpoints públicos para comunicación:

#### Heartbeat de Agentes
```typescript
apiRouter.post("/agents/heartbeat", async (req: Request, res: Response) => {
  try {
    const { token, agentId, status, metrics } = req.body;
    const authToken = token || agentId;
    
    if (!authToken || !status) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing token or status" 
      });
    }
    
    const result = await processAgentHeartbeat(authToken, status, metrics);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

**Características**:
- **Sin autenticación**: Los agentes usan tokens propios
- **Validation**: Verifica token y status requeridos
- **Error handling**: Responses estructuradas con success/error
- **Métricas**: Recibe datos de performance del agente

#### Ingesta de Datos
```typescript
apiRouter.post("/agents/data", async (req: Request, res: Response) => {
  try {
    const { token, agentId, events } = req.body;
    const authToken = token || agentId;
    
    if (!authToken || !Array.isArray(events)) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing token or events" 
      });
    }
    
    const result = await processAgentData(authToken, events);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

**Propósito**:
- **Ingesta masiva**: Recibe arrays de eventos de seguridad
- **Procesamiento asíncrono**: Los eventos se procesan en background
- **Validación de formato**: Verifica estructura de datos

#### Registro de Agentes
```typescript
apiRouter.post("/agents/register", async (req: Request, res: Response) => {
  try {
    const { 
      registrationKey, 
      hostname, 
      ipAddress, 
      operatingSystem, 
      version, 
      capabilities 
    } = req.body;
    
    if (!registrationKey || !hostname || !ipAddress || !operatingSystem || !version) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields" 
      });
    }
    
    const result = await registerAgent(
      registrationKey,
      hostname,
      ipAddress,
      operatingSystem,
      version,
      capabilities || []
    );
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

**Flujo de registro**:
1. **Validation**: Campos requeridos para identificación
2. **Registration key**: Clave pre-generada para autorizar registro
3. **Capabilities**: Lista de capacidades del agente (opcional)
4. **Response**: Token permanente para comunicación futura

### 2. Middleware de Autenticación

#### Middleware Principal
```typescript
const isAuthenticated: import("express").RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    console.log(`Usuario autenticado: ${req.user?.username || 'Desconocido'} accediendo a ${req.path}`);
    return next();
  }
  
  console.log(`Intento de acceso no autorizado a ${req.path}`);
  
  return res.status(401).json({ 
    message: "No autenticado", 
    code: "AUTH_REQUIRED",
    redirectTo: "/auth",
    details: "La sesión ha expirado o no existe. Por favor inicie sesión nuevamente."
  });
};
```

**Características**:
- **Logging detallado**: Registra accesos autorizados y no autorizados
- **Response estructurada**: Información clara sobre el error
- **Redirect hint**: Sugiere ruta de redirección al cliente
- **Session verification**: Usa Passport para verificar autenticación

### 3. Rutas de Métricas y Analytics

#### Endpoint de Health Check
```typescript
apiRouter.get("/health", (req: Request, res: Response) => {
  res.json({ status: "healthy" });
});
```
**Uso**: Monitoring, load balancers, health checks

#### Métricas MITRE ATT&CK
```typescript
apiRouter.get("/metrics/mitre-tactics", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const incidents = await storage.listIncidents(500);
    const tacticCounts: Record<string, number> = {};
    
    incidents.forEach(incident => {
      if (Array.isArray(incident.mitreTactics)) {
        incident.mitreTactics.forEach((tactic: string) => {
          tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
        });
      }
    });
    
    const sorted = Object.entries(tacticCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tactic, count]) => ({ tactic, count }));
      
    res.json(sorted);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

**Funcionalidad**:
- **Análisis MITRE**: Agrupa tácticas por frecuencia
- **Top 5**: Devuelve las tácticas más comunes
- **Data processing**: Procesa arrays de tácticas de incidentes

#### Métricas de Compliance
```typescript
apiRouter.get("/metrics/compliance", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const incidents = await storage.listIncidents(500);
    const openIncidents = incidents.filter(i => 
      i.status !== 'closed' && i.status !== 'resolved'
    ).length;
    
    const compliance = [
      { 
        name: 'ISO 27001', 
        score: Math.max(60, 100 - openIncidents * 2), 
        status: openIncidents < 5 ? 'Compliant' : 'At Risk', 
        lastAssessment: '2 weeks ago' 
      },
      { 
        name: 'NIST CSF', 
        score: Math.max(60, 95 - openIncidents * 2), 
        status: openIncidents < 8 ? 'Compliant' : 'At Risk', 
        lastAssessment: '1 month ago' 
      },
      // ... más frameworks
    ];
    
    res.json(compliance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

**Lógica de compliance**:
- **Score dinámico**: Basado en incidentes abiertos
- **Umbrales**: Diferentes límites por framework
- **Status calculation**: Compliant vs At Risk
- **Múltiples frameworks**: ISO, NIST, GDPR, PCI DSS

#### Resumen de Amenazas
```typescript
apiRouter.get("/metrics/threat-summary", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const alerts = await storage.listAlerts(1000);
    const summary: Record<string, Record<string, number>> = {};
    
    alerts.forEach(alert => {
      const date = new Date(alert.timestamp ?? Date.now());
      const day = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      if (!summary[day]) {
        summary[day] = { critical: 0, high: 0, medium: 0, low: 0 };
      }
      
      if (summary[day][alert.severity] !== undefined) {
        summary[day][alert.severity]++;
      }
    });
    
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

**Análisis temporal**:
- **Agrupación por día**: Datos organizados por día de la semana
- **Severidad**: Cuenta por nivel de severidad
- **Formato para gráficos**: Structure ready para charts

### 4. Rutas de Recursos Principales

#### Gestión de Alertas
```typescript
// Listar alertas
apiRouter.get("/alerts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = await storage.listAlerts(limit, (page - 1) * limit);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Crear alerta
apiRouter.post("/alerts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const alertData = req.body;
    alertData.organizationId = req.user?.organizationId;
    
    const newAlert = await storage.createAlert(alertData);
    
    // Enriquecimiento automático
    try {
      await processNewAlertWithEnrichment(newAlert);
    } catch (enrichmentError) {
      console.error('Error in alert enrichment:', enrichmentError);
    }
    
    res.status(201).json(newAlert);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

**Características de alertas**:
- **Paginación**: Limit y offset para performance
- **Organization scoping**: Filtro por organización del usuario
- **Auto-enrichment**: Enriquecimiento automático con threat intel
- **Error isolation**: Fallos de enrichment no bloquean creación

#### Gestión de Incidentes
```typescript
// Crear incidente desde correlación
apiRouter.post("/incidents/from-alerts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { alertIds, title, description } = req.body;
    
    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({ message: "Se requiere al menos una alerta" });
    }
    
    // Validar que las alertas existen y pertenecen a la organización
    const alerts = await Promise.all(
      alertIds.map(id => storage.getAlert(id))
    );
    
    const invalidAlerts = alerts.filter(alert => 
      !alert || alert.organizationId !== req.user?.organizationId
    );
    
    if (invalidAlerts.length > 0) {
      return res.status(400).json({ message: "Alertas inválidas o no autorizadas" });
    }
    
    // Crear incidente
    const incidentData = {
      title: title || `Incidente correlado - ${new Date().toISOString()}`,
      description: description || `Incidente creado desde ${alerts.length} alertas correlacionadas`,
      status: 'open',
      severity: alerts.some(a => a.severity === 'critical') ? 'critical' : 'high',
      assignedTo: req.user?.id,
      organizationId: req.user?.organizationId,
      relatedAlerts: alertIds,
      mitreTactics: [...new Set(alerts.flatMap(a => a.mitreTactics || []))]
    };
    
    const incident = await storage.createIncident(incidentData);
    res.status(201).json(incident);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

**Flujo de correlación**:
1. **Validation**: Verifica alertas existen y pertenecen a la org
2. **Authorization**: Solo alertas de la organización del usuario
3. **Aggregation**: Combina severidad y tácticas MITRE
4. **Auto-assignment**: Asigna al usuario que crea el incidente

### 5. Integración con Servicios de IA

#### Análisis de Alertas con IA
```typescript
apiRouter.post("/ai/analyze-alert", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { alertId, model = 'gpt-4' } = req.body;
    
    if (!alertId) {
      return res.status(400).json({ message: "Alert ID requerido" });
    }
    
    const alert = await storage.getAlert(alertId);
    if (!alert || alert.organizationId !== req.user?.organizationId) {
      return res.status(404).json({ message: "Alerta no encontrada" });
    }
    
    // Usar servicio avanzado de IA con múltiples proveedores
    let insight;
    if (model.startsWith('claude')) {
      if (!isAnthropicConfigured()) {
        return res.status(503).json({ 
          message: "Anthropic no está configurado" 
        });
      }
      insight = await generateAdvancedAlertInsight(alert, 'anthropic');
    } else {
      if (!isOpenAIReady()) {
        return res.status(503).json({ 
          message: "OpenAI no está configurado" 
        });
      }
      insight = await generateAdvancedAlertInsight(alert, 'openai');
    }
    
    res.json(insight);
    
  } catch (error: any) {
    console.error('Error en análisis de IA:', error);
    res.status(500).json({ 
      message: "Error en análisis de IA", 
      details: error.message 
    });
  }
});
```

**Características de IA**:
- **Multi-provider**: Soporte para OpenAI y Anthropic
- **Model selection**: Usuario puede elegir modelo específico
- **Configuration check**: Verifica providers están configurados
- **Organization scoping**: Solo analiza alertas de la organización

#### Correlación Inteligente
```typescript
apiRouter.post("/ai/correlate-alerts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { alertIds, analysisType = 'comprehensive' } = req.body;
    
    if (!Array.isArray(alertIds) || alertIds.length < 2) {
      return res.status(400).json({ 
        message: "Se requieren al menos 2 alertas para correlación" 
      });
    }
    
    // Obtener alertas y validar permisos
    const alerts = await Promise.all(
      alertIds.map(id => storage.getAlert(id))
    );
    
    const validAlerts = alerts.filter(alert => 
      alert && alert.organizationId === req.user?.organizationId
    );
    
    if (validAlerts.length !== alertIds.length) {
      return res.status(400).json({ 
        message: "Algunas alertas no fueron encontradas o no están autorizadas" 
      });
    }
    
    // Usar IA avanzada para correlación
    const correlation = await correlateAlertsAdvanced(
      validAlerts, 
      analysisType as AnalysisType
    );
    
    res.json(correlation);
    
  } catch (error: any) {
    console.error('Error en correlación:', error);
    res.status(500).json({ 
      message: "Error en correlación de alertas", 
      details: error.message 
    });
  }
});
```

**Tipos de análisis**:
- **comprehensive**: Análisis completo con múltiples modelos
- **quick**: Análisis rápido para respuesta inmediata
- **detailed**: Análisis profundo con contexto histórico

### 6. Gestión de Conectores

#### Listar Conectores Activos
```typescript
apiRouter.get("/connectors/active", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const activeConnectors = await getActiveConnectors();
    res.json(activeConnectors);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

#### Ejecutar Conector Manual
```typescript
apiRouter.post("/connectors/:id/execute", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const connector = await storage.getConnector(parseInt(id));
    
    if (!connector || connector.organizationId !== req.user?.organizationId) {
      return res.status(404).json({ message: "Conector no encontrado" });
    }
    
    const result = await executeConnector(connector.id);
    res.json(result);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

#### Toggle Conector
```typescript
apiRouter.post("/connectors/:id/toggle", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const connector = await storage.getConnector(parseInt(id));
    
    if (!connector || connector.organizationId !== req.user?.organizationId) {
      return res.status(404).json({ message: "Conector no encontrado" });
    }
    
    const result = await toggleConnector(connector.id);
    res.json(result);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

### 7. Rutas de Administración

#### Gestión de Usuarios
```typescript
apiRouter.get("/users", isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Solo administradores pueden ver todos los usuarios
    if (req.user?.role !== 'Administrator') {
      return res.status(403).json({ 
        message: "Acceso denegado: se requieren permisos de administrador" 
      });
    }
    
    const users = await storage.listUsers(req.user.organizationId);
    res.json(users);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

#### Configuración del Sistema
```typescript
apiRouter.get("/system/config", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const config = {
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      features: {
        aiAnalysis: isOpenAIReady() || isAnthropicConfigured(),
        stripeIntegration: !!process.env.STRIPE_SECRET_KEY,
        emailNotifications: !!process.env.SENDGRID_API_KEY,
        soarAutomation: true
      },
      limits: {
        maxAlerts: 10000,
        maxIncidents: 1000,
        maxUsers: 100
      }
    };
    
    res.json(config);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

## Patrones de Diseño en Rutas

### 1. **Consistent Error Handling**

```typescript
try {
  // Lógica de la ruta
  const result = await someOperation();
  res.json(result);
} catch (error: any) {
  console.error('Error detallado:', error);
  res.status(500).json({ 
    message: "Error general", 
    details: error.message 
  });
}
```

### 2. **Organization Scoping**

```typescript
// Filtrar por organización del usuario autenticado
const data = await storage.getData(req.user?.organizationId);

// Validar pertenencia a organización
if (resource.organizationId !== req.user?.organizationId) {
  return res.status(404).json({ message: "Recurso no encontrado" });
}
```

### 3. **Pagination Pattern**

```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = parseInt(req.query.limit as string) || 50;
const offset = (page - 1) * limit;

const results = await storage.listData(limit, offset);
res.json({
  data: results,
  pagination: {
    page,
    limit,
    total: await storage.countData()
  }
});
```

### 4. **Async Background Processing**

```typescript
// Crear recurso inmediatamente
const resource = await storage.createResource(data);
res.status(201).json(resource);

// Procesar en background sin bloquear response
processInBackground(resource).catch(error => {
  console.error('Background processing error:', error);
});
```

## Configuración de Schedulers

### Tareas Automáticas

```typescript
// Actualización de threat feeds cada hora
cron.schedule('0 * * * *', async () => {
  try {
    log('Iniciando actualización automática de threat feeds...');
    await importAllFeeds();
    log('Threat feeds actualizados correctamente');
  } catch (error) {
    log(`Error actualizando threat feeds: ${error}`);
  }
});

// Actualización de alertas cada 30 minutos
cron.schedule('*/30 * * * *', async () => {
  try {
    log('Iniciando importación automática de alertas...');
    await importAllAlerts();
    log('Alertas importadas correctamente');
  } catch (error) {
    log(`Error importando alertas: ${error}`);
  }
});

// Métricas del sistema cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  try {
    await updateSystemMetrics();
  } catch (error) {
    console.error('Error updating system metrics:', error);
  }
});
```

## Consideraciones de Seguridad

### 1. **Authentication Required**
- Todas las rutas (excepto agentes y health) requieren autenticación
- Uso de middleware `isAuthenticated` consistente

### 2. **Organization Isolation**
- Los usuarios solo ven datos de su organización
- Validación estricta de pertenencia a organización

### 3. **Role-Based Access**
- Funciones administrativas requieren rol Administrator
- Validación de permisos por tipo de operación

### 4. **Input Validation**
- Validación de parámetros requeridos
- Sanitización de inputs para prevenir inyección

### 5. **Error Information Disclosure**
- Mensajes de error estructurados pero sin información sensible
- Logging detallado en servidor, mensajes genéricos al cliente

## Performance y Escalabilidad

### 1. **Pagination**
- Todas las listas implementan paginación
- Límites máximos para prevenir sobrecarga

### 2. **Async Processing**
- Operaciones pesadas en background
- Responses inmediatas para mejor UX

### 3. **Database Optimization**
- Queries optimizadas con filtros por organización
- Índices en campos frecuentemente consultados

### 4. **Caching Strategy**
- Cache de configuraciones frecuentes
- Invalidación inteligente de cache

## Troubleshooting

### Problemas Comunes

#### Error 401 - No autenticado
- Verificar que las cookies de sesión se envían
- Comprobar configuración CORS con `credentials: true`

#### Error 404 - Recurso no encontrado
- Verificar que el recurso pertenece a la organización del usuario
- Comprobar que el ID del recurso es válido

#### Error 500 - Error interno
- Revisar logs del servidor para detalles
- Verificar conectividad con base de datos

#### Problemas de Performance
- Implementar paginación en queries grandes
- Usar filtros de fecha para limitar datasets
- Monitorear queries lentas en la base de datos