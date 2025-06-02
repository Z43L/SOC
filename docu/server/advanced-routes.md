# Documentación del Servidor Backend - advanced-routes.ts

## Propósito

El archivo `advanced-routes.ts` implementa **endpoints especializados y funcionalidades avanzadas** del SOC que van más allá de las operaciones CRUD básicas, proporcionando:

- Parsing avanzado de datos estructurados con IA
- Correlación avanzada de alertas con algoritmos ML
- Generación automática de incidentes basada en patrones
- Integración con protocolo TAXII para threat intelligence
- Endpoints especializados para análisis complejos
- Validación robusta con esquemas Zod específicos

## Arquitectura de Rutas Avanzadas

### Diferencias con routes.ts Básico

| Característica | routes.ts (Básico) | advanced-routes.ts (Avanzado) |
|---|---|---|
| **Operaciones** | CRUD estándar | Análisis complejos y automación |
| **Datos** | Simples (alertas, usuarios) | Estructurados complejos (STIX, logs) |
| **IA** | Análisis básicos | Parsing inteligente y correlación ML |
| **Protocolos** | HTTP REST | TAXII, STIX, formatos especializados |
| **Automatización** | Manual | Generación automática de incidentes |

## Estructura del Archivo

### 1. Imports y Dependencias Especializadas

#### Integraciones Avanzadas
```typescript
import { advancedCorrelation } from "./integrations/advanced-correlation-algorithms";
import { structuredDataParser, DataFormat } from "./integrations/structured-data-parser";
import { TaxiiConnector, createTaxiiConnector } from "./integrations/taxii-connector";
```

**Módulos especializados**:
- **advancedCorrelation**: Algoritmos ML para correlación de alertas
- **structuredDataParser**: Parser IA para datos estructurados (JSON, XML, STIX)
- **TaxiiConnector**: Protocolo TAXII para threat intelligence estándar

#### Middleware de Autenticación Local
```typescript
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};
```

**Nota**: Middleware local en lugar de importar desde `./middleware/auth` para evitar dependencias circulares.

### 2. Parser de Datos Estructurados

```typescript
advancedRouter.post("/parse-structured-data", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      data: z.string().min(10, "Data must be at least 10 characters"),
      format: z.string().optional(),
      useAI: z.boolean().optional()
    });
    
    const { data, format, useAI = false } = schema.parse(req.body);
    
    // Parsear usando el analizador estructurado
    const formatType = format ? 
      (DataFormat[format.toUpperCase() as keyof typeof DataFormat] || DataFormat.UNKNOWN) : 
      undefined;
    
    const result = await structuredDataParser.parse(data, {
      format: formatType,
      useAI
    });
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    // Error handling...
  }
});
```

#### Características del Parser

**Formatos Soportados** (DataFormat enum):
- **JSON**: Objetos JSON complejos
- **XML**: Documentos XML con namespaces
- **STIX**: STIX 2.0/2.1 threat intelligence
- **YAML**: Configuraciones y datos YAML
- **CSV**: Datos tabulares
- **UNKNOWN**: Detección automática

**Opciones de Parsing**:
- **format**: Especifica formato si es conocido
- **useAI**: Usa IA para parsing complejo e interpretación semántica

**Casos de uso**:
```typescript
// Parsing de feed STIX con IA
const request = {
  data: stixDocument,
  format: "stix",
  useAI: true
};

// Parsing automático de logs JSON
const request = {
  data: jsonLogs,
  useAI: false // Parsing estructural básico
};
```

### 3. Correlación Avanzada de Alertas

```typescript
advancedRouter.post("/correlate-alerts", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      alertIds: z.array(z.number()).optional(),
      timeWindowHours: z.number().optional(),
      enableAIAnalysis: z.boolean().optional(),
      generateIncidents: z.boolean().optional(),
      maxIncidents: z.number().optional()
    });
    
    const { 
      alertIds, 
      timeWindowHours = 24, 
      enableAIAnalysis = true,
      generateIncidents = false,
      maxIncidents = 3
    } = schema.parse(req.body);
    
    const options = {
      timeWindowHours,
      enableAIAnalysis,
      onlySpecifiedAlerts: Boolean(alertIds),
      generateIncidents,
      maxIncidents
    };
    
    // Ejecutar correlación avanzada
    const result = await advancedCorrelation.analyzeAlerts(alertIds, options);
```

#### Algoritmos de Correlación Implementados

**Parámetros de análisis**:
- **alertIds**: Alertas específicas a correlacionar (opcional)
- **timeWindowHours**: Ventana temporal para correlación (default: 24h)
- **enableAIAnalysis**: Usar IA para correlación semántica
- **generateIncidents**: Crear incidentes automáticamente
- **maxIncidents**: Límite de incidentes a generar

**Tipos de correlación**:
1. **Temporal**: Alertas en ventanas de tiempo relacionadas
2. **Geoespacial**: Alertas por proximidad geográfica  
3. **IoC-based**: Indicadores de compromiso compartidos
4. **Behavioral**: Patrones de comportamiento similares
5. **AI Semantic**: Correlación semántica usando LLMs

#### Generación Automática de Incidentes

```typescript
const incidents = [];
if (options.generateIncidents) {
  const maxIncidents = options.maxIncidents || 3;
  const incidentSuggestions = result.incidentSuggestions
    .sort((a, b) => (b.aiAnalysis?.confidence || 0) - (a.aiAnalysis?.confidence || 0))
    .slice(0, maxIncidents);
  
  for (const suggestion of incidentSuggestions) {
    try {
      const incident = await storage.createIncident(suggestion as any);
      if (incident) {
        incidents.push(incident);
      }
    } catch (error) {
      log(`Error creando incidente desde sugerencia: ${error instanceof Error ? error.message : String(error)}`, "advanced-correlation");
    }
  }
}
```

**Proceso de generación**:
1. **Ranking**: Ordena sugerencias por confidence score
2. **Limiting**: Aplica límite máximo de incidentes
3. **Creation**: Crea incidentes en la base de datos
4. **Error Handling**: Manejo graceful de errores

**Response Structure**:
```typescript
{
  success: true,
  patterns: [
    {
      type: "temporal_cluster",
      alerts: [1, 2, 3],
      confidence: 0.85,
      description: "Temporal clustering detected"
    }
  ],
  incidentSuggestions: [
    {
      title: "Coordinated Attack Pattern",
      severity: "high",
      confidence: 0.92,
      relatedAlerts: [1, 2, 3, 4]
    }
  ],
  generatedIncidents: [/* created incidents */],
  analysisTimestamp: "2024-01-15T10:30:00Z"
}
```

### 4. Endpoints de Generación de Incidentes

```typescript
advancedRouter.post("/generate-incidents", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      timeWindowHours: z.number().optional(),
      maxIncidents: z.number().optional()
    });
    
    const { timeWindowHours = 24, maxIncidents = 5 } = schema.parse(req.body);
    
    // Ejecutar análisis y generación de incidentes
    const incidents = await advancedCorrelation.analyzeAndSuggestIncidents(timeWindowHours);
    
    // Limitar a la cantidad solicitada
    const limitedIncidents = incidents.slice(0, maxIncidents);
    
    res.json({
      success: true,
      message: `Generated ${limitedIncidents.length} incidents from correlation analysis`,
      incidents: limitedIncidents,
      analysisTimeWindowHours: timeWindowHours
    });
  } catch (error) {
    // Error handling...
  }
});
```

**Funcionalidad**:
- **Análisis automático**: Analiza todas las alertas recientes
- **Generación inteligente**: Crea incidentes basados en patrones detectados
- **Configuración flexible**: Ventana de tiempo y límites configurables

### 5. Integración TAXII (Trusted Automated eXchange of Intelligence Information)

#### Sub-router TAXII
```typescript
const taxiiRouter = Router();
advancedRouter.use("/taxii", taxiiRouter);
```

**Organización modular**: Sub-router dedicado para endpoints TAXII.

#### Test de Conexión TAXII
```typescript
taxiiRouter.post("/test-connection", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      apiRoot: z.string().url("API Root must be a valid URL"),
      collectionId: z.string(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      version: z.enum(['2.0', '2.1'])
    });
    
    const taxiiConfig = schema.parse(req.body);
    
    // Crear conector TAXII temporal para probar
    const taxiiConnector = createTaxiiConnector(taxiiConfig);
    
    // Intentar obtener información del servidor
    const serverInfo = await taxiiConnector.getServerInformation();
    
    // Intentar obtener colecciones
    const collections = await taxiiConnector.getCollections();
    
    // Comprobar si la colección especificada existe
    const collectionExists = collections.some(c => c.id === taxiiConfig.collectionId);
    
    res.json({
      success: true,
      message: "TAXII connection successful",
      serverInfo,
      availableCollections: collections.map(c => ({ id: c.id, title: c.title })),
      collectionExists,
      testedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `TAXII connection failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});
```

#### Características del Test TAXII

**Validaciones**:
- **apiRoot**: URL válida del servidor TAXII
- **collectionId**: ID de la colección a consultar
- **Autenticación**: Username/password o API key
- **version**: TAXII 2.0 o 2.1

**Operaciones de test**:
1. **Server Info**: Obtiene información del servidor TAXII
2. **Collections**: Lista colecciones disponibles
3. **Collection Validation**: Verifica que la colección existe
4. **Authentication**: Valida credenciales proporcionadas

**Response de éxito**:
```typescript
{
  success: true,
  message: "TAXII connection successful",
  serverInfo: {
    title: "MISP TAXII Server",
    description: "Threat Intelligence Server",
    contact: "admin@example.com"
  },
  availableCollections: [
    { id: "malware-collection", title: "Malware Intelligence" },
    { id: "apt-collection", title: "APT Indicators" }
  ],
  collectionExists: true,
  testedAt: "2024-01-15T10:30:00Z"
}
```

#### Configuración de Feed TAXII
```typescript
taxiiRouter.post("/configure-feed", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      apiRoot: z.string().url(),
      collectionId: z.string(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      version: z.enum(['2.0', '2.1']),
      updateInterval: z.number().min(300).max(86400), // 5 minutes to 24 hours
      isActive: z.boolean().optional()
    });
    
    const feedConfig = schema.parse(req.body);
    
    // Crear el feed en la base de datos
    const threatFeed = await storage.createThreatFeed({
      name: feedConfig.name,
      url: feedConfig.apiRoot,
      feedType: 'taxii',
      format: 'stix',
      updateInterval: feedConfig.updateInterval,
      isActive: feedConfig.isActive ?? true,
      metadata: JSON.stringify({
        taxiiVersion: feedConfig.version,
        collectionId: feedConfig.collectionId,
        authentication: {
          type: feedConfig.apiKey ? 'api_key' : 'basic',
          username: feedConfig.username,
          // Password se almacena de forma segura
        }
      }),
      // organizationId se obtiene del usuario autenticado
      organizationId: (req.user as any)?.organizationId
    });
    
    res.json({
      success: true,
      message: "TAXII feed configured successfully",
      feed: threatFeed
    });
  } catch (error) {
    // Error handling...
  }
});
```

#### Sincronización de Datos TAXII
```typescript
taxiiRouter.post("/sync/:feedId", isAuthenticated, async (req, res) => {
  try {
    const feedId = parseInt(req.params.feedId);
    const feed = await storage.getThreatFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        message: "TAXII feed not found"
      });
    }
    
    // Obtener configuración del feed
    const metadata = JSON.parse(feed.metadata || '{}');
    
    // Crear conector TAXII
    const taxiiConnector = createTaxiiConnector({
      apiRoot: feed.url,
      collectionId: metadata.collectionId,
      username: metadata.authentication?.username,
      // Password se obtiene de forma segura
      version: metadata.taxiiVersion
    });
    
    // Sincronizar objetos STIX
    const stixObjects = await taxiiConnector.getObjects({
      addedAfter: feed.lastUpdate
    });
    
    // Procesar e importar objetos
    const importResults = await Promise.all(
      stixObjects.map(async (stixObject) => {
        try {
          // Convertir objeto STIX a threat intel
          const threatIntel = await convertStixToThreatIntel(stixObject);
          return await storage.createThreatIntel(threatIntel);
        } catch (error) {
          console.error('Error importing STIX object:', error);
          return null;
        }
      })
    );
    
    const successfulImports = importResults.filter(result => result !== null);
    
    // Actualizar timestamp del feed
    await storage.updateThreatFeed(feedId, {
      lastUpdate: new Date(),
      status: 'active'
    });
    
    res.json({
      success: true,
      message: `Synchronized ${successfulImports.length} threat intelligence objects`,
      imported: successfulImports.length,
      total: stixObjects.length,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    // Error handling...
  }
});
```

## Patrones de Diseño Avanzados

### 1. Sub-routing Modular
```typescript
const taxiiRouter = Router();
advancedRouter.use("/taxii", taxiiRouter);
```

**Beneficios**:
- **Organización**: Endpoints relacionados agrupados
- **Mantenibilidad**: Código modular y separado
- **Escalabilidad**: Fácil agregar nuevos sub-módulos

### 2. Validación Específica por Endpoint
```typescript
const schema = z.object({
  apiRoot: z.string().url("API Root must be a valid URL"),
  collectionId: z.string(),
  version: z.enum(['2.0', '2.1'])
});
```

**Características**:
- **Schemas específicos**: Validación adaptada a cada endpoint
- **Mensajes descriptivos**: Errores claros para debugging
- **Type safety**: Garantías de tipo en runtime

### 3. Error Handling Estratificado
```typescript
try {
  // Primary operation
} catch (error) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ 
      success: false,
      message: "Invalid parameters",
      errors: error.format()
    });
  }
  
  res.status(500).json({ 
    success: false,
    message: `Specific error context: ${error instanceof Error ? error.message : String(error)}`
  });
}
```

**Niveles de error**:
1. **Validation errors**: 400 con detalles específicos
2. **Business logic errors**: 500 con contexto
3. **System errors**: 500 con logging detallado

### 4. Response Consistency
```typescript
// Estructura consistente para todas las respuestas
{
  success: boolean,
  message?: string,
  data?: any,
  errors?: any,
  timestamp?: string
}
```

## Configuración y Variables de Entorno

### TAXII Configuration
```bash
# TAXII Server Settings
TAXII_DEFAULT_VERSION=2.1
TAXII_TIMEOUT=30000
TAXII_MAX_OBJECTS_PER_REQUEST=1000

# Authentication
TAXII_DEFAULT_AUTH_TYPE=basic
TAXII_ENCRYPTION_KEY=your-encryption-key-for-passwords
```

### Advanced Correlation Settings
```bash
# Correlation Algorithm Settings
CORRELATION_DEFAULT_TIME_WINDOW=24
CORRELATION_MAX_INCIDENTS_PER_RUN=5
CORRELATION_AI_ENABLED=true
CORRELATION_MIN_CONFIDENCE=0.7
```

## Uso desde el Frontend

### Parsing de Datos Estructurados
```typescript
// Envío desde frontend
const response = await fetch('/api/advanced/parse-structured-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: stixDocument,
    format: 'stix',
    useAI: true
  })
});

const result = await response.json();
```

### Correlación de Alertas
```typescript
// Correlación automática
const response = await fetch('/api/advanced/correlate-alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    timeWindowHours: 48,
    enableAIAnalysis: true,
    generateIncidents: true,
    maxIncidents: 3
  })
});
```

### Test de Conexión TAXII
```typescript
// Test de configuración TAXII
const response = await fetch('/api/advanced/taxii/test-connection', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiRoot: 'https://taxii.example.com/api/v2/',
    collectionId: 'malware-intelligence',
    username: 'user',
    password: 'pass',
    version: '2.1'
  })
});
```

---

Estas rutas avanzadas proporcionan **capacidades de análisis de siguiente nivel** para el SOC, integrando estándares de la industria como TAXII/STIX con algoritmos ML avanzados para correlación y automatización inteligente.