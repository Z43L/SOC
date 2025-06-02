# Documentación del Servidor Backend - storage.ts

## Propósito

El archivo `storage.ts` implementa la **capa de abstracción de datos principal** del SOC, proporcionando una interfaz unificada para todas las operaciones de base de datos. Esta clase `DatabaseStorage` encapsula:

- Operaciones CRUD completas para todas las entidades del sistema
- Gestión de sesiones con PostgreSQL
- Integración con el sistema de eventos (SOAR)
- Búsquedas avanzadas con filtros y paginación
- Lookups automáticos de inteligencia de amenazas
- Multi-tenancy a nivel de organización

## Estructura del Archivo

### 1. Imports y Dependencias

#### Session Store y ORM
```typescript
import session, { Store } from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { db, pool } from './db';
import * as schema from '@shared/schema';
```

**Componentes principales**:
- **express-session**: Gestión de sesiones HTTP
- **connect-pg-simple**: Almacén de sesiones en PostgreSQL
- **db, pool**: Conexiones a base de datos
- **schema**: Definiciones de tablas y tipos

#### Tipos de Entidades Importadas
```typescript
import {
  Alert, InsertAlert,
  AiInsight, InsertAiInsight,
  Playbook, InsertPlaybook, PlaybookExecution, InsertPlaybookExecution,
  User, InsertUser,
  Incident,
  ThreatIntel, InsertThreatIntel,
  Metric, InsertMetric,
  Connector, InsertConnector,
  ThreatFeed, InsertThreatFeed,
  Agent, InsertAgent,
  Plan, InsertPlan,
  Organization, InsertOrganization,
  ReportTemplate, InsertReportTemplate,
  ReportGenerated, InsertReportGenerated,
  ReportArtifact, InsertReportArtifact,
  // ... más tipos
} from '@shared/schema';
```

**Tipos de datos**:
- **Entity Types**: Tipos para consultas (ej: `Alert`, `User`)
- **Insert Types**: Tipos para creación (ej: `InsertAlert`, `InsertUser`)
- **Status Enums**: Estados para diferentes entidades

#### Utilidades de Query
```typescript
import { eq, desc, asc, sql, and, or, gte, lte, ilike, SQL, AnyColumn } from 'drizzle-orm';
```

**Operadores de consulta**:
- **eq**: Igualdad (=)
- **desc/asc**: Ordenamiento descendente/ascendente
- **and/or**: Operadores lógicos
- **gte/lte**: Mayor/menor que o igual
- **ilike**: LIKE case-insensitive
- **sql**: SQL raw queries

### 2. Clase DatabaseStorage Principal

```typescript
const PgStore = connectPgSimple(session);

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PgStore({
      pool: pool,
      createTableIfMissing: true,
    });
  }
```

**Configuración del constructor**:
- **sessionStore**: Almacén de sesiones en PostgreSQL
- **pool**: Pool de conexiones específico para sesiones
- **createTableIfMissing**: Crea tabla de sesiones automáticamente

## Operaciones por Entidad

### 1. Gestión de Planes (Plans)

#### Obtener Plan
```typescript
async getPlan(id: number): Promise<Plan | undefined> {
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
  return plan;
}
```

#### Listar Planes Activos
```typescript
async getPlans(): Promise<Plan[]> {
  return await db.select()
    .from(schema.plans)
    .where(eq(schema.plans.isActive, true))
    .orderBy(asc(schema.plans.priceMonthly));
}
```

**Características**:
- Solo retorna planes activos
- Ordenados por precio (ascendente)
- Útil para páginas de pricing

#### Crear Plan
```typescript
async createPlan(insertPlan: InsertPlan): Promise<Plan> {
  const [plan] = await db.insert(schema.plans).values(insertPlan).returning();
  return plan;
}
```

#### Actualizar Plan
```typescript
async updatePlan(id: number, updateData: Partial<InsertPlan>): Promise<Plan | undefined> {
  const planToUpdate: Partial<schema.Plan> = {
    ...updateData,
    updatedAt: new Date()  // Auto-update timestamp
  };
  const [plan] = await db.update(schema.plans).set(planToUpdate).where(eq(schema.plans.id, id)).returning();
  return plan;
}
```

**Patrón de actualización**:
- Spread operator para datos existentes
- Timestamp automático con `updatedAt`
- Retorna la entidad actualizada

### 2. Gestión de Organizaciones (Organizations)

#### Crear Organización
```typescript
async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
  const [organization] = await db.insert(schema.organizations).values(insertOrganization).returning();
  return organization;
}
```

#### Actualizar Organización
```typescript
async updateOrganization(id: number, updateData: Partial<InsertOrganization>): Promise<Organization | undefined> {
  const orgToUpdate: Partial<schema.Organization> = {
    ...updateData,
    updatedAt: new Date()
  };
  const [updatedOrganization] = await db.update(schema.organizations).set(orgToUpdate).where(eq(schema.organizations.id, id)).returning();
  return updatedOrganization;
}
```

### 3. Gestión de Usuarios (Users)

#### Obtener Usuario por Username
```typescript
async getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  return user as User | undefined;
}
```

#### Crear Usuario con Validación
```typescript
async createUser(insertUser: InsertUser): Promise<User> {
  if (!insertUser.organizationId) {
    throw new Error("organizationId is required to create a user.");
  }
  const [user] = await db.insert(schema.users).values(insertUser).returning();
  return user;
}
```

**Validaciones**:
- `organizationId` es obligatorio
- Throw error descriptivo si falta

#### Listar Usuarios con Filtrado
```typescript
async listUsers(organizationId?: number, limit: number = 10, offset: number = 0): Promise<User[]> {
  let query = db.select().from(schema.users) as any;
  if (organizationId !== undefined) {
    query = query.where(eq(schema.users.organizationId, organizationId));
  }
  return await query.limit(limit).offset(offset);
}
```

**Características**:
- Multi-tenancy opcional con `organizationId`
- Paginación con `limit` y `offset`
- Query building dinámico

### 4. Gestión de Alertas (Alerts) - Sistema Complejo

#### Obtener Alerta con Multi-tenancy
```typescript
async getAlert(id: number, organizationId?: number): Promise<Alert | undefined> {
  const conditions: SQL[] = [eq(schema.alerts.id, id)];
  if (organizationId !== undefined) conditions.push(eq(schema.alerts.organizationId, organizationId));
  const [alert] = await db.select().from(schema.alerts).where(and(...conditions));
  return alert;
}
```

**Patrón de condiciones dinámicas**:
- Array de condiciones `SQL[]`
- Construcción dinámica según parámetros
- Combinación con `and(...conditions)`

#### Crear Alerta con Eventos y Automation
```typescript
async createAlert(insertAlert: InsertAlert): Promise<Alert> {
  if (!insertAlert.organizationId) {
    throw new Error("organizationId is required to create an alert.");
  }
  const [alert] = await db.insert(schema.alerts).values(insertAlert).returning();
  
  // Publish SOAR event for alert creation
  try {
    const { eventBus } = await import('./src/services/eventBus');
    eventBus.publish({
      type: 'alert.created',
      entityId: alert.id,
      entityType: 'alert',
      organizationId: alert.organizationId!,
      timestamp: new Date(),
      data: {
        alertId: alert.id,
        severity: alert.severity || 'medium',
        category: (alert.metadata as any)?.category,
        sourceIp: alert.sourceIp,
        hostId: (alert.metadata as any)?.hostId,
        hostname: (alert.metadata as any)?.hostname,
      }
    });
  } catch (error) {
    console.error('[Storage] Error publishing alert.created event:', error);
  }
  
  // Enqueue threat intel lookups for IoCs
  const iocs = [insertAlert.fileHash, insertAlert.url, insertAlert.sourceIp, insertAlert.destinationIp, insertAlert.cveId]
    .filter((ioc): ioc is string => typeof ioc === 'string');
  for (const ioc of iocs) {
    ThreatIntel.lookup(ioc).catch(console.error);
  }
  return alert;
}
```

**Funcionalidades automáticas**:

1. **SOAR Event Publishing**:
   - Publica evento `alert.created` al event bus
   - Incluye metadatos relevantes para automatización
   - Error handling graceful

2. **Threat Intelligence Automation**:
   - Extrae IoCs (Indicators of Compromise)
   - Inicia lookups automáticos en background
   - Filtrado de valores válidos

3. **Error Resilience**:
   - Try-catch para servicios opcionales
   - No bloquea la creación de alerta si fallan servicios secundarios

#### Búsqueda Avanzada de Alertas
```typescript
async listAlerts(
  limit: number = 10,
  offset: number = 0,
  organizationId?: number,
  filters?: { status?: string; severity?: string; dateFrom?: Date; dateTo?: Date; query?: string }
): Promise<Alert[]> {
  const conditions: SQL[] = [];
  if (organizationId !== undefined) {
    conditions.push(eq(schema.alerts.organizationId, organizationId));
  }

  if (filters?.status) conditions.push(eq(schema.alerts.status, filters.status));
  if (filters?.severity) conditions.push(eq(schema.alerts.severity, filters.severity));
  if (filters?.dateFrom) conditions.push(gte(schema.alerts.timestamp, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(schema.alerts.timestamp, filters.dateTo));
  if (filters?.query) {
    conditions.push(or(
      ilike(schema.alerts.title, `%${filters.query}%`),
      ilike(schema.alerts.description, `%${filters.query}%`)
    )!);
  }
  
  let queryChain = db.select().from(schema.alerts) as any;
  if (conditions.length > 0) {
    queryChain = queryChain.where(and(...conditions));
  }
  return await queryChain.orderBy(desc(schema.alerts.timestamp)).limit(limit).offset(offset);
}
```

**Sistema de filtros avanzado**:
- **Status Filter**: Por estado de alerta
- **Severity Filter**: Por nivel de severidad
- **Date Range**: Filtrado por rango de fechas
- **Text Search**: Búsqueda en título y descripción
- **Organization Scoping**: Multi-tenancy
- **Paginación**: Con limit/offset
- **Ordenamiento**: Por timestamp descendente

### 5. Gestión de IA Insights

#### Crear AI Insight
```typescript
async createAiInsight(insertAiInsight: InsertAiInsight): Promise<AiInsight> {
  if (!insertAiInsight.organizationId) {
    throw new Error("organizationId is required to create an AI insight.");
  }
  const [insight] = await db.insert(schema.aiInsights).values(insertAiInsight).returning();
  return insight;
}
```

#### Búsqueda de Insights por Alerta
```typescript
async getAiInsightsByAlert(alertId: number, organizationId?: number): Promise<AiInsight[]> {
  const conditions: SQL[] = [eq(schema.aiInsights.alertId, alertId)];
  if (organizationId !== undefined) {
    conditions.push(eq(schema.aiInsights.organizationId, organizationId));
  }
  return await db.select().from(schema.aiInsights).where(and(...conditions)).orderBy(desc(schema.aiInsights.createdAt));
}
```

### 6. Sistema de Conectores

#### Listar Conectores Activos
```typescript
async listConnectors(limit: number = 50, offset: number = 0): Promise<Connector[]> {
  return await db.select().from(schema.connectors).limit(limit).offset(offset).orderBy(asc(schema.connectors.name));
}
```

#### Actualizar Estado de Conector
```typescript
async updateConnectorStatus(id: number, status: ConnectorStatusTypes): Promise<Connector | undefined> {
  const [connector] = await db.update(schema.connectors)
    .set({ 
      status,
      lastSeen: new Date(),
      updatedAt: new Date()
    })
    .where(eq(schema.connectors.id, id))
    .returning();
  return connector;
}
```

**Actualización automática**:
- Actualiza status
- Marca `lastSeen` con timestamp actual
- Actualiza `updatedAt`

### 7. Gestión de Agentes

#### Crear Agente
```typescript
async createAgent(insertAgent: InsertAgent): Promise<Agent> {
  if (!insertAgent.organizationId) {
    throw new Error("organizationId is required to create an agent.");
  }
  const [agent] = await db.insert(schema.agents).values(insertAgent).returning();
  return agent;
}
```

#### Actualizar Heartbeat de Agente
```typescript
async updateAgentHeartbeat(id: number, data: { 
  lastSeen?: Date; 
  status?: AgentStatusTypes; 
  metadata?: Record<string, any> 
}): Promise<Agent | undefined> {
  const updateData: Partial<schema.Agent> = {
    lastSeen: data.lastSeen || new Date(),
    status: data.status,
    metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    updatedAt: new Date()
  };
  
  const [agent] = await db.update(schema.agents)
    .set(updateData)
    .where(eq(schema.agents.id, id))
    .returning();
  return agent;
}
```

## Patrones de Diseño Implementados

### 1. Multi-tenancy Pattern
```typescript
// Ejemplo consistente en todas las entidades
async getEntity(id: number, organizationId?: number): Promise<Entity | undefined> {
  const conditions: SQL[] = [eq(schema.entities.id, id)];
  if (organizationId !== undefined) conditions.push(eq(schema.entities.organizationId, organizationId));
  const [entity] = await db.select().from(schema.entities).where(and(...conditions));
  return entity;
}
```

### 2. Validation Pattern
```typescript
// Validación consistente de organizationId
async createEntity(insertEntity: InsertEntity): Promise<Entity> {
  if (!insertEntity.organizationId) {
    throw new Error("organizationId is required to create an entity.");
  }
  // ... resto del código
}
```

### 3. Event Publishing Pattern
```typescript
// Publicación de eventos para SOAR
try {
  const { eventBus } = await import('./src/services/eventBus');
  eventBus.publish({
    type: 'entity.action',
    entityId: entity.id,
    entityType: 'entity',
    organizationId: entity.organizationId!,
    timestamp: new Date(),
    data: { /* datos relevantes */ }
  });
} catch (error) {
  console.error('[Storage] Error publishing event:', error);
}
```

### 4. Dynamic Query Building
```typescript
// Construcción dinámica de queries
const conditions: SQL[] = [];
if (filter1) conditions.push(eq(schema.table.field1, filter1));
if (filter2) conditions.push(gte(schema.table.field2, filter2));

let query = db.select().from(schema.table);
if (conditions.length > 0) {
  query = query.where(and(...conditions));
}
```

## Características Avanzadas

### 1. Automatic Timestamp Management
```typescript
// Pattern automático para actualizaciones
const entityToUpdate: Partial<schema.Entity> = {
  ...updateData,
  updatedAt: new Date()  // Siempre actualiza timestamp
};
```

### 2. Graceful Error Handling
```typescript
// Servicios opcionales no fallan la operación principal
try {
  await optionalService.doSomething();
} catch (error) {
  console.error('[Storage] Optional service failed:', error);
  // Continúa con la operación principal
}
```

### 3. Type Safety con Drizzle
```typescript
// Todos los métodos son tipo-safe
const alert: Alert = await storage.getAlert(1); // Tipo inferido automáticamente
const newAlert: Alert = await storage.createAlert(alertData); // Validación en compile-time
```

## Consideraciones de Performance

### 1. Pagination Consistent
```typescript
// Paginación en todas las listas
async listEntities(limit: number = 10, offset: number = 0): Promise<Entity[]> {
  return await db.select().from(schema.entities).limit(limit).offset(offset);
}
```

### 2. Index-friendly Queries
```typescript
// Queries optimizadas para índices
.where(eq(schema.table.indexedField, value))  // Usa índice
.orderBy(desc(schema.table.timestampField))   // Índice en timestamp
```

### 3. Minimal Data Transfer
```typescript
// Returning solo los campos necesarios
const [entity] = await db.insert(schema.entities).values(data).returning();
```

## Integración con Otros Sistemas

### Event Bus (SOAR)
- Publicación automática de eventos
- Triggers para playbooks
- Datos estructurados para automatización

### Threat Intelligence
- Lookup automático de IoCs
- Enriquecimiento en background
- No bloquea operaciones principales

### Session Management
- Store en PostgreSQL
- Limpieza automática
- Configuración optimizada

---

Esta clase `DatabaseStorage` es el **corazón del sistema de persistencia**, proporcionando una interfaz consistente, tipo-safe y rica en funcionalidades para todas las operaciones de datos del SOC.