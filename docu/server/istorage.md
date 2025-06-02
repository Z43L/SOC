# Documentación del Servidor Backend - istorage.ts

## Propósito

El archivo `istorage.ts` define la **interfaz completa de la capa de almacenamiento** del SOC, proporcionando:

- Contrato abstracto para todas las operaciones de persistencia
- Definición de métodos para cada entidad del sistema
- Especificación de parámetros y tipos de retorno
- Documentación implícita de la API de storage
- Base para implementaciones alternativas (SQL, NoSQL, memoria)
- Type safety para toda la aplicación

## Arquitectura de la Interfaz

### Patrón Repository/Storage Interface

```typescript
export interface IStorage {
  // Session store
  sessionStore: Store;
  
  // Entity methods...
}
```

**Beneficios del patrón**:
- **Abstracción**: Oculta detalles de implementación
- **Testabilidad**: Permite mocks e implementaciones de test
- **Flexibilidad**: Intercambio de implementaciones sin cambio de código
- **Type Safety**: Contratos claros para toda la aplicación

## Estructura de la Interfaz

### 1. Imports y Tipos Base

#### Store de Sesiones
```typescript
import { Store } from 'express-session';
```

**Express Session Store**: Interfaz estándar para almacenamiento de sesiones HTTP.

#### Tipos de Entidades
```typescript
import {
  User, InsertUser,
  Alert, InsertAlert,
  Incident, InsertIncident,
  ThreatIntel, InsertThreatIntel,
  AiInsight, InsertAiInsight,
  Metric, InsertMetric,
  Connector, InsertConnector,
  ThreatFeed, InsertThreatFeed,
  Playbook, InsertPlaybook,
  PlaybookExecution,
  Agent, InsertAgent,
  Plan, InsertPlan,
  Organization, InsertOrganization,
  ComplianceAssessment, InsertComplianceAssessment
} from '../shared/schema';
```

**Convención de tipos**:
- **Entity**: Tipo completo con ID y timestamps
- **InsertEntity**: Tipo para creación (sin ID, campos opcionales)

### 2. Propiedad del Session Store

```typescript
export interface IStorage {
  // Session store
  sessionStore: Store;
```

**Integración con autenticación**:
- Store persistente para sesiones de usuarios
- Implementado en `DatabaseStorage` con PostgreSQL
- Compatible con `express-session` middleware

### 3. Métodos de Usuario (User Methods)

```typescript
// User methods
getUser(id: number): Promise<User | undefined>;
getUserByUsername(username: string): Promise<User | undefined>;
createUser(user: InsertUser): Promise<User>;
listUsers(organizationId?: number): Promise<User[]>;
```

#### Análisis de Métodos de Usuario

**getUser(id: number)**:
- **Propósito**: Obtener usuario por ID único
- **Return**: `User | undefined` (null-safe)
- **Use case**: Autenticación, deserialización de sesiones

**getUserByUsername(username: string)**:
- **Propósito**: Búsqueda por username (login)
- **Return**: `User | undefined` 
- **Use case**: Login, validación de duplicados

**createUser(user: InsertUser)**:
- **Propósito**: Crear nuevo usuario
- **Input**: `InsertUser` (sin ID)
- **Return**: `User` (con ID asignado)
- **Use case**: Registro, creación por admin

**listUsers(organizationId?: number)**:
- **Propósito**: Listar usuarios con filtrado opcional
- **Multi-tenancy**: Parámetro organizationId opcional
- **Return**: Array de usuarios
- **Use case**: Gestión de usuarios, dashboard admin

### 4. Métodos de Alerta (Alert Methods)

```typescript
// Alert methods
getAlert(id: number, organizationId?: number): Promise<Alert | undefined>;
createAlert(alert: InsertAlert): Promise<Alert>;
updateAlert(id: number, alert: Partial<InsertAlert>, organizationId?: number): Promise<Alert | undefined>;
listAlerts(limit?: number, organizationId?: number): Promise<Alert[]>;
getAlertsCountByDay(organizationId: number, numberOfDays: number): Promise<{ date: string; count: number }[]>;
```

#### Características Avanzadas de Alertas

**Multi-tenancy consistente**:
- Parámetro `organizationId` opcional en todos los métodos
- Isolación de datos por organización
- Seguridad a nivel de dato

**Partial updates**:
```typescript
updateAlert(id: number, alert: Partial<InsertAlert>, organizationId?: number)
```
- **Partial<InsertAlert>**: Solo campos que se quieren actualizar
- **Type safety**: TypeScript valida campos existentes
- **Eficiencia**: Solo actualiza campos modificados

**Métodos especializados**:
```typescript
getAlertsCountByDay(organizationId: number, numberOfDays: number): Promise<{ date: string; count: number }[]>
```
- **Analytics**: Datos agregados para gráficos
- **Time series**: Conteos por día
- **Dashboard metrics**: Alimenta dashboards de métricas

### 5. Métodos de Incidente (Incident Methods)

```typescript
// Incident methods
getIncident(id: number, organizationId?: number): Promise<Incident | undefined>;
createIncident(incident: InsertIncident): Promise<Incident>;
updateIncident(id: number, incident: Partial<InsertIncident>, organizationId?: number): Promise<Incident | undefined>;
listIncidents(limit?: number, organizationId?: number): Promise<Incident[]>;
getMitreTacticsDistribution(organizationId: number): Promise<{ tactic: string; count: number }[]>;
```

#### Análisis Específico de MITRE

```typescript
getMitreTacticsDistribution(organizationId: number): Promise<{ tactic: string; count: number }[]>
```

**MITRE ATT&CK Integration**:
- **tactic**: Tácticas del framework MITRE ATT&CK
- **count**: Número de incidentes por táctica
- **Use case**: Análisis de threat landscape, reporting de compliance

**Ejemplo de respuesta**:
```typescript
[
  { tactic: "Initial Access", count: 15 },
  { tactic: "Execution", count: 8 },
  { tactic: "Persistence", count: 12 },
  { tactic: "Defense Evasion", count: 6 }
]
```

### 6. Métodos de Threat Intelligence

```typescript
// Threat Intel methods
getThreatIntel(id: number, organizationId?: number): Promise<ThreatIntel | undefined>;
createThreatIntel(intel: InsertThreatIntel): Promise<ThreatIntel>;
listThreatIntel(limit?: number, organizationId?: number): Promise<ThreatIntel[]>;
```

**Simplicidad en threat intel**:
- No se requiere `updateThreatIntel` (threat intel es típicamente inmutable)
- No hay `deleteThreatIntel` (preservación histórica)
- Focus en ingesta y consulta

### 7. Métodos de AI Insights

```typescript
// AI Insight methods
getAiInsight(id: number, organizationId?: number): Promise<AiInsight | undefined>;
createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
listAiInsights(limit?: number, organizationId?: number): Promise<AiInsight[]>;
```

**IA Insights characteristics**:
- **Inmutables**: Solo creación y consulta
- **Limitados**: Parameter limit para paginación
- **Organizacionales**: Multi-tenancy obligatorio

### 8. Métodos de Métricas (Metrics Methods)

```typescript
// Metrics methods
getMetric(id: number, organizationId?: number): Promise<Metric | undefined>;
createMetric(metric: InsertMetric): Promise<Metric>;
getMetricByName(name: string, organizationId?: number): Promise<Metric | undefined>;
getMetricByNameAndOrg(name: string, organizationId?: number): Promise<Metric | undefined>;
listMetrics(organizationId?: number): Promise<Metric[]>;
```

#### Búsquedas Especializadas de Métricas

**getMetricByName vs getMetricByNameAndOrg**:
```typescript
getMetricByName(name: string, organizationId?: number): Promise<Metric | undefined>;
getMetricByNameAndOrg(name: string, organizationId?: number): Promise<Metric | undefined>;
```

**Posible redundancia**: Estos métodos parecen duplicados. Potencial refactorización:
- Unificar en un solo método
- Clarificar diferencias semánticas
- Optimizar queries

### 9. Métodos de Conectores (Connector Methods)

```typescript
// Connector methods
getConnector(id: number, organizationId?: number): Promise<Connector | undefined>;
createConnector(connector: InsertConnector): Promise<Connector>;
updateConnector(id: number, connector: Partial<InsertConnector>, organizationId?: number): Promise<Connector | undefined>;
deleteConnector(id: number, organizationId?: number): Promise<boolean>;
listConnectors(organizationId?: number): Promise<Connector[]>;
toggleConnectorStatus(id: number, isActive: boolean, organizationId?: number): Promise<Connector | undefined>;
```

#### Operaciones Especializadas de Conectores

**toggleConnectorStatus**:
```typescript
toggleConnectorStatus(id: number, isActive: boolean, organizationId?: number): Promise<Connector | undefined>
```

**Propósito específico**:
- **Estado activo/inactivo**: Control de conectores sin eliminar configuración
- **Atomic operation**: Cambio atómico de estado
- **Return updated entity**: Devuelve conector actualizado

**deleteConnector return boolean**:
- **Success indicator**: Boolean indica éxito/fallo
- **Diferentes de otros deletes**: Otros retornan entity | undefined
- **Operación destructiva**: Delete permanente vs toggle

### 10. Métodos de Threat Feeds

```typescript
// Threat Feed methods
getThreatFeed(id: number, organizationId?: number): Promise<ThreatFeed | undefined>;
createThreatFeed(feed: InsertThreatFeed): Promise<ThreatFeed>;
updateThreatFeed(id: number, feed: Partial<InsertThreatFeed>, organizationId?: number): Promise<ThreatFeed | undefined>;
deleteThreatFeed(id: number, organizationId?: number): Promise<boolean>;
listThreatFeeds(organizationId?: number): Promise<ThreatFeed[]>;
toggleThreatFeedStatus(id: number, isActive: boolean, organizationId?: number): Promise<ThreatFeed | undefined>;
```

**Patrón similar a conectores**:
- CRUD completo
- Toggle de estado
- Delete definitivo con boolean return

### 11. Métodos de Playbooks (SOAR)

```typescript
// Playbook methods
getPlaybook(id: number, organizationId?: number): Promise<Playbook | undefined>;
createPlaybook(playbook: InsertPlaybook): Promise<Playbook>;
updatePlaybook(id: number, playbook: Partial<InsertPlaybook>, organizationId?: number): Promise<Playbook | undefined>;
deletePlaybook(id: number, organizationId?: number): Promise<boolean>;
listPlaybooks(organizationId?: number): Promise<Playbook[]>;
togglePlaybookStatus(id: number, isActive: boolean, organizationId?: number): Promise<Playbook | undefined>;
executePlaybook(id: number, organizationId: number, triggeredBy?: number, triggerEntityId?: number): Promise<PlaybookExecution>;
incrementPlaybookExecutionCount(id: number, executionTimeMs?: number): Promise<void>;
```

#### Operaciones Avanzadas de Playbooks

**executePlaybook**:
```typescript
executePlaybook(id: number, organizationId: number, triggeredBy?: number, triggerEntityId?: number): Promise<PlaybookExecution>
```

**Parámetros de ejecución**:
- **id**: ID del playbook a ejecutar
- **organizationId**: Organización (requerido)
- **triggeredBy**: Usuario que triggerea (opcional)
- **triggerEntityId**: Entidad que triggerea (alerta, incidente, etc.)
- **Return**: PlaybookExecution (registro de ejecución)

**incrementPlaybookExecutionCount**:
```typescript
incrementPlaybookExecutionCount(id: number, executionTimeMs?: number): Promise<void>
```

**Métricas de ejecución**:
- **Contador**: Incrementa número de ejecuciones
- **Timing**: Tiempo de ejecución opcional
- **Void return**: Operación puramente de métricas

### 12. Métodos de Ejecución de Playbooks

```typescript
// Playbook Execution methods
getPlaybookExecution(id: number, organizationId?: number): Promise<PlaybookExecution | undefined>;
listPlaybookExecutions(playbookId?: number, limit?: number, organizationId?: number): Promise<PlaybookExecution[]>;
updatePlaybookExecution(id: number, data: Partial<PlaybookExecution>, organizationId?: number): Promise<PlaybookExecution | undefined>;
```

**Filtrado por playbook**:
- **playbookId opcional**: Permite filtrar ejecuciones de un playbook específico
- **Histórico completo**: Si no se especifica playbookId, devuelve todas
- **Paginación**: Parámetro limit

### 13. Métodos de Agentes

```typescript
// Agent methods
getAgent(id: number, organizationId?: number): Promise<Agent | undefined>;
getAgentByIdentifier(agentIdentifier: string, organizationId?: number): Promise<Agent | undefined>;
createAgent(agent: InsertAgent): Promise<Agent>;
updateAgent(id: number, agent: Partial<InsertAgent>, organizationId?: number): Promise<Agent | undefined>;
deleteAgent(id: number, organizationId?: number): Promise<boolean>;
listAgents(userId?: number, organizationId?: number): Promise<Agent[]>;
updateAgentHeartbeat(id: number, organizationId?: number): Promise<void>;
updateAgentStatus(id: number, status: string, organizationId?: number): Promise<Agent | undefined>;
```

#### Operaciones Especializadas de Agentes

**getAgentByIdentifier**:
```typescript
getAgentByIdentifier(agentIdentifier: string, organizationId?: number): Promise<Agent | undefined>
```

**Identificación alternativa**:
- **agentIdentifier**: String único del agente (no su ID de DB)
- **Use case**: Lookup cuando agente se conecta con su identifier

**updateAgentHeartbeat**:
```typescript
updateAgentHeartbeat(id: number, organizationId?: number): Promise<void>
```

**Señal de vida**:
- **Timestamp update**: Actualiza último momento visto
- **Health monitoring**: Para detectar agentes offline
- **Void return**: Operación simple de timestamp

**listAgents filtrado por usuario**:
```typescript
listAgents(userId?: number, organizationId?: number): Promise<Agent[]>
```

**Multi-filtrado**:
- **Por usuario**: Agentes asignados a usuario específico
- **Por organización**: Multi-tenancy
- **Ambos opcionales**: Máxima flexibilidad

### 14. Métodos de Planes y Organizaciones

```typescript
// Plan methods
getPlan(id: number): Promise<Plan | undefined>;
createPlan(plan: InsertPlan): Promise<Plan>;
updatePlan(id: number, plan: Partial<InsertPlan>): Promise<Plan | undefined>;
listPlans(): Promise<Plan[]>;

// Organization methods
getOrganization(id: number): Promise<Organization | undefined>;
createOrganization(organization: InsertOrganization): Promise<Organization>;
updateOrganization(id: number, organization: Partial<InsertOrganization>): Promise<Organization | undefined>;
listOrganizations(): Promise<Organization[]>;
```

**Sin organizationId**:
- **Planes**: Globales del sistema, no por organización
- **Organizaciones**: Entidades de nivel superior

### 15. Métodos de Compliance Assessment

```typescript
// Compliance Assessment methods
getComplianceAssessment(id: number, organizationId?: number): Promise<ComplianceAssessment | undefined>;
createComplianceAssessment(data: InsertComplianceAssessment): Promise<ComplianceAssessment>;
updateComplianceAssessment(id: number, data: Partial<InsertComplianceAssessment>, organizationId?: number): Promise<ComplianceAssessment | undefined>;
listComplianceAssessments(organizationId?: number, filters?: { framework?: string; status?: string }): Promise<ComplianceAssessment[]>;
deleteComplianceAssessment(id: number, organizationId?: number): Promise<boolean>;
```

#### Filtros Avanzados de Compliance

**listComplianceAssessments con filtros**:
```typescript
listComplianceAssessments(
  organizationId?: number, 
  filters?: { framework?: string; status?: string }
): Promise<ComplianceAssessment[]>
```

**Filtros especializados**:
- **framework**: ISO 27001, NIST, SOX, GDPR, etc.
- **status**: Draft, active, completed, expired
- **Combinable**: Múltiples filtros aplicables

## Patrones de Diseño en la Interfaz

### 1. Consistencia de Parámetros
```typescript
// Patrón consistente para gets
getEntity(id: number, organizationId?: number): Promise<Entity | undefined>

// Patrón consistente para updates
updateEntity(id: number, data: Partial<InsertEntity>, organizationId?: number): Promise<Entity | undefined>
```

### 2. Multi-tenancy Opcional
```typescript
// organizationId opcional permite:
// - Uso global (admins del sistema)
// - Uso filtrado por organización (usuarios normales)
organizationId?: number
```

### 3. Type Safety con Generics
```typescript
// Partial<T> para updates permite actualizaciones parciales
updateAlert(id: number, alert: Partial<InsertAlert>, organizationId?: number)
```

### 4. Return Types Consistentes
```typescript
// Entidades: Entity | undefined
// Listas: Entity[]
// Operaciones: boolean (deletes) | void (updates simples)
```

## Implementaciones de la Interfaz

### Implementación Principal: DatabaseStorage
```typescript
// En storage.ts
export class DatabaseStorage implements IStorage {
  // Implementación completa con PostgreSQL/Drizzle
}
```

### Implementaciones de Test (Potenciales)
```typescript
// Para testing
export class MemoryStorage implements IStorage {
  // Implementación en memoria para tests rápidos
}

export class MockStorage implements IStorage {
  // Mock para unit tests
}
```

### Implementaciones Alternativas (Futuras)
```typescript
// Para escalabilidad
export class MongoStorage implements IStorage {
  // Implementación con MongoDB
}

export class RedisStorage implements IStorage {
  // Implementación con Redis (cache/session only)
}
```

## Beneficios de la Interfaz

### 1. **Type Safety Completa**
- IntelliSense en toda la aplicación
- Errores de compilación si se usa incorrectamente
- Refactoring seguro

### 2. **Testabilidad**
- Mocks fáciles para unit tests
- Implementaciones in-memory para integration tests
- Test doubles para casos específicos

### 3. **Flexibilidad de Implementación**
- Cambio de base de datos sin cambio de código
- Implementaciones híbridas (SQL + NoSQL)
- Optimizaciones específicas por entidad

### 4. **Documentación Implícita**
- La interfaz documenta la API completa
- Contratos claros entre capas
- Onboarding más fácil para desarrolladores

---

Esta interfaz define el **contrato completo del sistema de persistencia**, garantizando consistencia, type safety y flexibilidad en todas las operaciones de datos del SOC.