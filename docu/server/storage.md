# Documentación del Sistema de Almacenamiento

Este archivo documenta el sistema completo de almacenamiento de datos implementado mediante la interfaz `IStorage` en `server/istorage.ts` y su implementación en `server/storage.ts`.

## Propósito General

El sistema de almacenamiento proporciona:
- **Abstracción de datos**: Interfaz uniforme para operaciones CRUD
- **Multi-tenancy**: Isolación de datos por organización
- **Session management**: Almacenamiento de sesiones en PostgreSQL
- **Type safety**: Operaciones completamente tipadas con TypeScript
- **Performance**: Optimizaciones con Drizzle ORM

## Arquitectura del Sistema

### Patrón Repository

```typescript
export interface IStorage {
  // Session store
  sessionStore: Store;
  
  // Resource methods por entidad
  getUser(id: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // ... más métodos por entidad
}
```

#### Ventajas del patrón:
- **Separación de responsabilidades**: Lógica de datos separada del negocio
- **Testabilidad**: Fácil mockeo para testing
- **Flexibilidad**: Implementaciones intercambiables (PostgreSQL, MongoDB, etc.)
- **Consistency**: API uniforme para todas las entidades

### Implementación con Drizzle ORM

```typescript
import { db, pool } from './db';
import * as schema from '@shared/schema';
import { eq, desc, asc, sql, and, or, gte, lte, ilike } from 'drizzle-orm';

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PgStore({
      pool: pool,
      createTableIfMissing: true,
    });
  }
}
```

**Características**:
- **Drizzle ORM**: Type-safe SQL query builder
- **PostgreSQL Pool**: Connection pooling para performance
- **Session Store**: Almacenamiento de sesiones Express en PostgreSQL
- **Auto-creation**: Tablas de sesiones se crean automáticamente

## Entidades y Operaciones

### 1. Gestión de Usuarios

#### Operaciones Básicas

```typescript
// Obtener usuario por ID
async getUser(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user as User | undefined;
}

// Obtener usuario por username (para autenticación)
async getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  return user as User | undefined;
}

// Crear nuevo usuario
async createUser(user: InsertUser): Promise<User> {
  const [newUser] = await db.insert(schema.users).values(user).returning();
  return newUser as User;
}

// Listar usuarios de una organización
async listUsers(organizationId?: number): Promise<User[]> {
  let query = db.select().from(schema.users);
  if (organizationId) {
    query = query.where(eq(schema.users.organizationId, organizationId));
  }
  return await query;
}
```

#### Características de usuarios:

- **Username único**: Constraint a nivel de base de datos
- **Password hasheado**: Almacenamiento seguro con scrypt
- **Organization scoping**: Usuarios pertenecen a una organización
- **Role-based**: Diferentes roles (Administrator, Analyst, etc.)

#### Ejemplo de uso:
```typescript
import { storage } from './storage';

// Crear usuario en registro
const newUser = await storage.createUser({
  name: "Juan Pérez",
  username: "juan.perez",
  email: "juan@empresa.com",
  password: hashedPassword,
  role: "Security Analyst",
  organizationId: 1
});

// Autenticar usuario
const user = await storage.getUserByUsername("juan.perez");
if (user && await verifyPassword(password, user.password)) {
  // Usuario autenticado
}
```

### 2. Gestión de Alertas

#### Operaciones de Alertas

```typescript
// Obtener alerta específica
async getAlert(id: number, organizationId?: number): Promise<Alert | undefined> {
  let query = db.select().from(schema.alerts).where(eq(schema.alerts.id, id));
  if (organizationId) {
    query = query.where(and(
      eq(schema.alerts.id, id),
      eq(schema.alerts.organizationId, organizationId)
    ));
  }
  const [alert] = await query;
  return alert;
}

// Crear nueva alerta
async createAlert(alert: InsertAlert): Promise<Alert> {
  const alertToInsert = {
    ...alert,
    timestamp: alert.timestamp || new Date(),
    status: alert.status || 'new'
  };
  const [newAlert] = await db.insert(schema.alerts).values(alertToInsert).returning();
  return newAlert;
}

// Listar alertas con paginación
async listAlerts(limit: number = 50, organizationId?: number): Promise<Alert[]> {
  let query = db.select().from(schema.alerts);
  if (organizationId) {
    query = query.where(eq(schema.alerts.organizationId, organizationId));
  }
  return await query
    .orderBy(desc(schema.alerts.timestamp))
    .limit(limit);
}

// Actualizar alerta
async updateAlert(id: number, alert: Partial<InsertAlert>, organizationId?: number): Promise<Alert | undefined> {
  const alertToUpdate = {
    ...alert,
    updatedAt: new Date()
  };
  
  let updateQuery = db.update(schema.alerts).set(alertToUpdate);
  if (organizationId) {
    updateQuery = updateQuery.where(and(
      eq(schema.alerts.id, id),
      eq(schema.alerts.organizationId, organizationId)
    ));
  } else {
    updateQuery = updateQuery.where(eq(schema.alerts.id, id));
  }
  
  const [updatedAlert] = await updateQuery.returning();
  return updatedAlert;
}
```

#### Métricas de Alertas

```typescript
// Contar alertas por día (para gráficos)
async getAlertsCountByDay(organizationId: number, numberOfDays: number): Promise<{ date: string; count: number }[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - numberOfDays);

  const results = await db
    .select({
      date: sql<string>`DATE(${schema.alerts.timestamp})`,
      count: sql<number>`COUNT(*)`
    })
    .from(schema.alerts)
    .where(and(
      eq(schema.alerts.organizationId, organizationId),
      gte(schema.alerts.timestamp, startDate),
      lte(schema.alerts.timestamp, endDate)
    ))
    .groupBy(sql`DATE(${schema.alerts.timestamp})`)
    .orderBy(sql`DATE(${schema.alerts.timestamp})`);

  return results;
}
```

#### Ejemplo de uso de alertas:
```typescript
// Crear alerta desde conector
const alert = await storage.createAlert({
  title: "Suspicious Login Attempt",
  description: "Multiple failed login attempts detected",
  severity: "high",
  source: "AuthSystem",
  sourceIp: "192.168.1.100",
  status: "new",
  organizationId: req.user.organizationId,
  metadata: {
    attempts: 5,
    timeWindow: "5 minutes",
    lastAttempt: new Date().toISOString()
  }
});

// Actualizar estado de alerta
await storage.updateAlert(alert.id, {
  status: "investigating",
  assignedTo: req.user.id
}, req.user.organizationId);
```

### 3. Gestión de Incidentes

#### Operaciones de Incidentes

```typescript
// Crear incidente
async createIncident(incident: InsertIncident): Promise<Incident> {
  const incidentToInsert = {
    ...incident,
    status: incident.status || 'open',
    createdAt: new Date()
  };
  const [newIncident] = await db.insert(schema.incidents).values(incidentToInsert).returning();
  return newIncident;
}

// Obtener distribución de tácticas MITRE
async getMitreTacticsDistribution(organizationId: number): Promise<{ tactic: string; count: number }[]> {
  const incidents = await this.listIncidents(1000, organizationId);
  const tacticCounts: Record<string, number> = {};
  
  incidents.forEach(incident => {
    if (Array.isArray(incident.mitreTactics)) {
      incident.mitreTactics.forEach((tactic: string) => {
        tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
      });
    }
  });
  
  return Object.entries(tacticCounts)
    .map(([tactic, count]) => ({ tactic, count }))
    .sort((a, b) => b.count - a.count);
}
```

#### Correlación de Incidentes
```typescript
// Crear incidente desde múltiples alertas
const correlatedIncident = await storage.createIncident({
  title: "Security Incident - Multiple Attack Vectors",
  description: "Incident created from correlated alerts",
  severity: "critical",
  status: "open",
  assignedTo: analystId,
  organizationId: orgId,
  relatedAlerts: [alert1.id, alert2.id, alert3.id],
  mitreTactics: ["Initial Access", "Persistence", "Privilege Escalation"],
  timeline: [
    {
      timestamp: new Date().toISOString(),
      action: "Incident created from alert correlation",
      userId: analystId
    }
  ]
});
```

### 4. Conectores de Datos

#### Gestión de Conectores

```typescript
// Crear conector
async createConnector(connector: InsertConnector): Promise<Connector> {
  const connectorToInsert = {
    ...connector,
    status: connector.status || 'inactive',
    isActive: connector.isActive ?? false,
    createdAt: new Date()
  };
  const [newConnector] = await db.insert(schema.connectors).values(connectorToInsert).returning();
  return newConnector;
}

// Toggle estado del conector
async toggleConnectorStatus(id: number, isActive: boolean, organizationId?: number): Promise<Connector | undefined> {
  let query = db.update(schema.connectors).set({ 
    isActive, 
    status: isActive ? 'active' : 'inactive',
    updatedAt: new Date() 
  });
  
  if (organizationId) {
    query = query.where(and(
      eq(schema.connectors.id, id),
      eq(schema.connectors.organizationId, organizationId)
    ));
  } else {
    query = query.where(eq(schema.connectors.id, id));
  }
  
  const [updatedConnector] = await query.returning();
  return updatedConnector;
}
```

#### Tipos de Conectores Soportados:
- **SIEM**: Splunk, QRadar, ArcSight
- **Cloud**: AWS CloudTrail, Azure Security Center
- **Network**: Firewall logs, IDS/IPS
- **Email**: Office 365, Gmail Security
- **Endpoint**: CrowdStrike, SentinelOne

### 5. Threat Intelligence

#### Operaciones de Threat Intel

```typescript
// Crear entrada de threat intelligence
async createThreatIntel(intel: InsertThreatIntel): Promise<ThreatIntel> {
  const intelToInsert = {
    ...intel,
    createdAt: new Date(),
    isActive: intel.isActive ?? true
  };
  const [newIntel] = await db.insert(schema.threatIntel).values(intelToInsert).returning();
  return newIntel;
}

// Buscar threat intel por IoC
async searchThreatIntelByIoC(ioc: string, organizationId?: number): Promise<ThreatIntel[]> {
  let query = db.select().from(schema.threatIntel);
  const conditions = [
    ilike(schema.threatIntel.indicator, `%${ioc}%`),
    eq(schema.threatIntel.isActive, true)
  ];
  
  if (organizationId) {
    conditions.push(eq(schema.threatIntel.organizationId, organizationId));
  }
  
  return await query.where(and(...conditions));
}
```

#### Ejemplo de enriquecimiento:
```typescript
// Enriquecer alerta con threat intelligence
const enrichAlert = async (alert: Alert) => {
  if (alert.sourceIp) {
    const threatData = await storage.searchThreatIntelByIoC(alert.sourceIp);
    if (threatData.length > 0) {
      await storage.updateAlert(alert.id, {
        enrichment: {
          threatIntel: threatData,
          riskScore: calculateRiskScore(threatData),
          categories: threatData.map(t => t.category)
        }
      });
    }
  }
};
```

### 6. Agentes Distribuidos

#### Gestión de Agentes

```typescript
// Registrar nuevo agente
async createAgent(agent: InsertAgent): Promise<Agent> {
  const agentToInsert = {
    ...agent,
    status: agent.status || 'pending',
    registeredAt: new Date(),
    lastHeartbeat: new Date()
  };
  const [newAgent] = await db.insert(schema.agents).values(agentToInsert).returning();
  return newAgent;
}

// Actualizar heartbeat del agente
async updateAgentHeartbeat(id: number, organizationId?: number): Promise<void> {
  let query = db.update(schema.agents).set({ 
    lastHeartbeat: new Date(),
    status: 'active'
  });
  
  if (organizationId) {
    query = query.where(and(
      eq(schema.agents.id, id),
      eq(schema.agents.organizationId, organizationId)
    ));
  } else {
    query = query.where(eq(schema.agents.id, id));
  }
  
  await query;
}

// Obtener agente por identificador único
async getAgentByIdentifier(agentIdentifier: string, organizationId?: number): Promise<Agent | undefined> {
  let query = db.select().from(schema.agents).where(eq(schema.agents.agentIdentifier, agentIdentifier));
  if (organizationId) {
    query = query.where(and(
      eq(schema.agents.agentIdentifier, agentIdentifier),
      eq(schema.agents.organizationId, organizationId)
    ));
  }
  const [agent] = await query;
  return agent;
}
```

#### Monitoreo de Agentes:
```typescript
// Detectar agentes inactivos
const findInactiveAgents = async (organizationId: number, timeoutMinutes: number = 10) => {
  const timeoutDate = new Date();
  timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);
  
  return await db.select()
    .from(schema.agents)
    .where(and(
      eq(schema.agents.organizationId, organizationId),
      lte(schema.agents.lastHeartbeat, timeoutDate),
      eq(schema.agents.status, 'active')
    ));
};
```

### 7. Playbooks y Automatización SOAR

#### Gestión de Playbooks

```typescript
// Crear playbook
async createPlaybook(playbook: InsertPlaybook): Promise<Playbook> {
  const playbookToInsert = {
    ...playbook,
    status: playbook.status || 'draft',
    isActive: playbook.isActive ?? false,
    executionCount: 0,
    createdAt: new Date()
  };
  const [newPlaybook] = await db.insert(schema.playbooks).values(playbookToInsert).returning();
  return newPlaybook;
}

// Ejecutar playbook
async executePlaybook(id: number, organizationId: number, triggeredBy?: number, triggerEntityId?: number): Promise<PlaybookExecution> {
  const execution: InsertPlaybookExecution = {
    playbookId: id,
    organizationId,
    status: 'running',
    triggeredBy,
    triggerEntityId,
    startTime: new Date(),
    logs: []
  };
  
  const [newExecution] = await db.insert(schema.playbookExecutions).values(execution).returning();
  
  // Incrementar contador de ejecuciones
  await this.incrementPlaybookExecutionCount(id);
  
  return newExecution;
}

// Actualizar ejecución de playbook
async updatePlaybookExecution(id: number, data: Partial<PlaybookExecution>, organizationId?: number): Promise<PlaybookExecution | undefined> {
  const updateData = {
    ...data,
    updatedAt: new Date()
  };
  
  let query = db.update(schema.playbookExecutions).set(updateData);
  if (organizationId) {
    query = query.where(and(
      eq(schema.playbookExecutions.id, id),
      eq(schema.playbookExecutions.organizationId, organizationId)
    ));
  } else {
    query = query.where(eq(schema.playbookExecutions.id, id));
  }
  
  const [updatedExecution] = await query.returning();
  return updatedExecution;
}
```

#### Ejemplo de ejecución automática:
```typescript
// Trigger automático de playbook por alerta
const triggerPlaybookForAlert = async (alert: Alert) => {
  if (alert.severity === 'critical') {
    const playbooks = await storage.listPlaybooks(alert.organizationId);
    const criticalAlertPlaybook = playbooks.find(p => 
      p.trigger === 'alert_created' && 
      p.triggerConditions?.severity === 'critical'
    );
    
    if (criticalAlertPlaybook) {
      await storage.executePlaybook(
        criticalAlertPlaybook.id,
        alert.organizationId,
        undefined, // automated trigger
        alert.id
      );
    }
  }
};
```

## Optimizaciones y Performance

### 1. **Indexación de Base de Datos**

```sql
-- Índices recomendados para performance
CREATE INDEX idx_alerts_org_timestamp ON alerts(organization_id, timestamp DESC);
CREATE INDEX idx_incidents_org_status ON incidents(organization_id, status);
CREATE INDEX idx_users_org_role ON users(organization_id, role);
CREATE INDEX idx_agents_org_heartbeat ON agents(organization_id, last_heartbeat);
CREATE INDEX idx_threat_intel_org_ioc ON threat_intel(organization_id, indicator);
```

### 2. **Paginación Eficiente**

```typescript
// Implementación con offset/limit optimizado
async listAlertsOptimized(
  limit: number = 50, 
  offset: number = 0, 
  organizationId?: number
): Promise<{ data: Alert[], total: number }> {
  const baseQuery = db.select().from(schema.alerts);
  const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(schema.alerts);
  
  let dataQuery = baseQuery;
  let totalQuery = countQuery;
  
  if (organizationId) {
    const condition = eq(schema.alerts.organizationId, organizationId);
    dataQuery = dataQuery.where(condition);
    totalQuery = totalQuery.where(condition);
  }
  
  const [data, totalResult] = await Promise.all([
    dataQuery.orderBy(desc(schema.alerts.timestamp)).limit(limit).offset(offset),
    totalQuery
  ]);
  
  return {
    data,
    total: totalResult[0].count
  };
}
```

### 3. **Caching Strategy**

```typescript
import NodeCache from 'node-cache';

class CachedStorage extends DatabaseStorage {
  private cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache
  
  async getOrganization(id: number): Promise<Organization | undefined> {
    const cacheKey = `org_${id}`;
    let org = this.cache.get<Organization>(cacheKey);
    
    if (!org) {
      org = await super.getOrganization(id);
      if (org) {
        this.cache.set(cacheKey, org);
      }
    }
    
    return org;
  }
  
  async updateOrganization(id: number, updateData: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const result = await super.updateOrganization(id, updateData);
    if (result) {
      // Invalidate cache
      this.cache.del(`org_${id}`);
    }
    return result;
  }
}
```

### 4. **Bulk Operations**

```typescript
// Inserción masiva de alertas
async createAlertsBulk(alerts: InsertAlert[]): Promise<Alert[]> {
  const alertsToInsert = alerts.map(alert => ({
    ...alert,
    timestamp: alert.timestamp || new Date(),
    status: alert.status || 'new'
  }));
  
  const insertedAlerts = await db.insert(schema.alerts).values(alertsToInsert).returning();
  return insertedAlerts;
}

// Actualización masiva de estados
async updateAlertsStatusBulk(alertIds: number[], status: string, organizationId: number): Promise<number> {
  const result = await db.update(schema.alerts)
    .set({ status, updatedAt: new Date() })
    .where(and(
      inArray(schema.alerts.id, alertIds),
      eq(schema.alerts.organizationId, organizationId)
    ));
  
  return result.changes || 0;
}
```

## Consideraciones de Seguridad

### 1. **Organization Isolation**

Todas las operaciones incluyen filtrado por `organizationId`:

```typescript
// Siempre verificar pertenencia a organización
async getAlert(id: number, organizationId?: number): Promise<Alert | undefined> {
  if (organizationId) {
    // Solo alertas de la organización del usuario
    const condition = and(
      eq(schema.alerts.id, id),
      eq(schema.alerts.organizationId, organizationId)
    );
    const [alert] = await db.select().from(schema.alerts).where(condition);
    return alert;
  }
  // Sin filtro de organización (solo para admin)
  const [alert] = await db.select().from(schema.alerts).where(eq(schema.alerts.id, id));
  return alert;
}
```

### 2. **Input Sanitization**

```typescript
// Sanitización de inputs para búsqueda
async searchAlerts(query: string, organizationId: number): Promise<Alert[]> {
  // Escapar caracteres especiales para LIKE
  const sanitizedQuery = query.replace(/[%_]/g, '\\$&');
  
  return await db.select()
    .from(schema.alerts)
    .where(and(
      eq(schema.alerts.organizationId, organizationId),
      or(
        ilike(schema.alerts.title, `%${sanitizedQuery}%`),
        ilike(schema.alerts.description, `%${sanitizedQuery}%`)
      )
    ));
}
```

### 3. **Audit Logging**

```typescript
// Log de operaciones sensibles
const auditLog = async (action: string, entityType: string, entityId: number, userId: number) => {
  await db.insert(schema.auditLogs).values({
    action,
    entityType,
    entityId,
    userId,
    timestamp: new Date(),
    details: { ip: req.ip, userAgent: req.get('User-Agent') }
  });
};

// Wrapper para operaciones de update/delete
async updateAlertWithAudit(id: number, data: Partial<InsertAlert>, userId: number): Promise<Alert | undefined> {
  const result = await this.updateAlert(id, data);
  if (result) {
    await auditLog('update', 'alert', id, userId);
  }
  return result;
}
```

## Session Management

### Configuración del Session Store

```typescript
const PgStore = connectPgSimple(session);

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PgStore({
      pool: pool,
      createTableIfMissing: true,
      tableName: 'session',
      schemaName: 'public'
    });
  }
}
```

**Características**:
- **PostgreSQL backend**: Sesiones almacenadas en base de datos
- **Auto-creation**: Tabla de sesiones se crea automáticamente
- **Connection pooling**: Usa el mismo pool que el resto de la aplicación
- **TTL support**: Expiración automática de sesiones

## Error Handling y Logging

### Patrón de Error Handling

```typescript
async createAlert(alert: InsertAlert): Promise<Alert> {
  try {
    const alertToInsert = {
      ...alert,
      timestamp: alert.timestamp || new Date(),
      status: alert.status || 'new'
    };
    
    const [newAlert] = await db.insert(schema.alerts).values(alertToInsert).returning();
    
    // Log successful operation
    console.log(`Alert created: ${newAlert.id} for org: ${newAlert.organizationId}`);
    
    return newAlert;
  } catch (error) {
    // Log error with context
    console.error('Error creating alert:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      alertData: { ...alert, password: undefined }, // Don't log sensitive data
      timestamp: new Date().toISOString()
    });
    
    // Re-throw for handling upstream
    throw error;
  }
}
```

## Testing y Mocking

### Mock Implementation para Testing

```typescript
export class MockStorage implements IStorage {
  private users: User[] = [];
  private alerts: Alert[] = [];
  private incidents: Incident[] = [];
  
  sessionStore = {} as Store;
  
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const newUser = { ...user, id: this.users.length + 1, createdAt: new Date() } as User;
    this.users.push(newUser);
    return newUser;
  }
  
  // ... implementar resto de métodos para testing
}
```

### Uso en Tests

```typescript
import { MockStorage } from './test/mock-storage';

describe('Alert Service', () => {
  let storage: MockStorage;
  
  beforeEach(() => {
    storage = new MockStorage();
  });
  
  it('should create alert', async () => {
    const alert = await storage.createAlert({
      title: 'Test Alert',
      severity: 'high',
      organizationId: 1
    });
    
    expect(alert.id).toBeDefined();
    expect(alert.title).toBe('Test Alert');
  });
});
```

## Mejores Prácticas

### 1. **Always Use Organization Scoping**
```typescript
// ✅ Bueno - Filtrar por organización
const alerts = await storage.listAlerts(50, req.user.organizationId);

// ❌ Malo - Sin filtro de organización (solo para super admin)
const alerts = await storage.listAlerts(50);
```

### 2. **Implement Proper Pagination**
```typescript
// ✅ Bueno - Con límites y offset
const alerts = await storage.listAlerts(50, offset, organizationId);

// ❌ Malo - Sin límites (puede causar OOM)
const alerts = await storage.listAlerts(undefined, organizationId);
```

### 3. **Use Transactions for Related Operations**
```typescript
// ✅ Bueno - Transacción para operaciones relacionadas
await db.transaction(async (tx) => {
  const incident = await tx.insert(schema.incidents).values(incidentData).returning();
  await tx.update(schema.alerts).set({ incidentId: incident[0].id }).where(inArray(schema.alerts.id, alertIds));
});
```

### 4. **Implement Proper Error Handling**
```typescript
// ✅ Bueno - Error handling con contexto
try {
  return await storage.getAlert(id, organizationId);
} catch (error) {
  console.error('Failed to get alert:', { id, organizationId, error });
  throw new Error('Failed to retrieve alert');
}
```