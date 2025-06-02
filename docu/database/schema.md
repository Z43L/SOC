# Documentación del Esquema de Base de Datos

## Propósito General

El esquema de base de datos del SOC Inteligente SaaS está diseñado para soportar un **sistema multi-tenant** de operaciones de seguridad. Utiliza **PostgreSQL** como base de datos principal con **Drizzle ORM** para la gestión de esquemas y migraciones.

## Tecnologías Utilizadas

- **Base de Datos**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validación**: Zod para schemas de validación
- **Tipos**: TypeScript con inferencia automática de tipos

## Estructura General del Esquema

### Hierarchy Multi-Tenant

```
Plans (Planes de Suscripción)
    ↓
Organizations (Organizaciones/Clientes)
    ↓
Users (Usuarios por Organización)
    ↓
[Datos específicos por organización: Alerts, Incidents, etc.]
```

## Documentación de Tablas

### 1. Tabla: `plans` - Planes de Suscripción

```typescript
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  priceMonthly: integer("price_monthly").notNull(),
  priceYearly: integer("price_yearly").notNull(),
  features: jsonb("features").notNull(),
  maxUsers: integer("max_users").notNull(),
  maxAgents: integer("max_agents").notNull(),
  maxAlerts: integer("max_alerts").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  stripePriceIdMonthly: text("stripe_price_id_monthly").unique(),
  stripePriceIdYearly: text("stripe_price_id_yearly").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**Propósito**: Define los planes de suscripción disponibles para organizaciones.

**Campos Principales**:
- **name**: Nombre del plan (ej: "Free", "Pro", "Enterprise")
- **description**: Descripción detallada del plan
- **priceMonthly/priceYearly**: Precios en centavos (unidad menor de moneda)
- **features**: JSON con características incluidas en el plan
- **maxUsers/maxAgents/maxAlerts**: Límites del plan
- **isActive**: Si el plan está disponible para nuevas suscripciones
- **stripePriceId**: IDs de Stripe para integración de pagos

**Relaciones**:
- **1:N** con `organizations` (un plan puede tener múltiples organizaciones)

### 2. Tabla: `organizations` - Organizaciones (Multi-tenancy)

```typescript
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  planId: integer("plan_id").references(() => plans.id),
  subscriptionStatus: text("subscription_status").default('inactive'),
  stripeCustomerId: text("stripe_customer_id").unique(),
  maxUsers: integer("max_users"),
  maxStorage: integer("max_storage"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  domain: text("domain"),
  logo: text("logo"),
  apiKey: text("api_key"),
  billingCycle: text("billing_cycle"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  email: text("email"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  settings: jsonb("settings"),
});
```

**Propósito**: Representa cada cliente/organización del SaaS (tenant).

**Campos de Suscripción**:
- **planId**: Referencia al plan contratado
- **subscriptionStatus**: Estado de suscripción ('active', 'inactive', 'past_due', 'trial')
- **stripeCustomerId/stripeSubscriptionId**: IDs de Stripe para facturación

**Campos de Configuración**:
- **domain**: Dominio de la organización para SSO
- **apiKey**: Clave API única para integraciones
- **settings**: Configuración personalizada en JSON

**Relaciones**:
- **N:1** con `plans` (pertenece a un plan)
- **1:N** con `users` (tiene múltiples usuarios)
- **1:N** con todas las entidades de datos (alerts, incidents, etc.)

### 3. Tabla: `users` - Usuarios

```typescript
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login"),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
});
```

**Propósito**: Usuarios del sistema por organización.

**Campos de Autenticación**:
- **username**: Username único global
- **password**: Hash de password (bcrypt)
- **email**: Email del usuario

**Campos de Autorización**:
- **role**: Rol del usuario en la organización
- **organizationId**: Organización a la que pertenece (multi-tenancy)

**Relaciones**:
- **N:1** con `organizations` (pertenece a una organización)
- **1:N** con `alerts` (puede ser asignado a alertas)
- **1:N** con `incidents` (puede ser asignado a incidentes)

### 4. Tabla: `alerts` - Alertas de Seguridad

```typescript
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull(),
  sourceIp: text("source_ip"),
  destinationIp: text("destination_ip"),
  fileHash: text("file_hash"),
  url: text("url"),
  cveId: text("cve_id"),
  packageName: text("package_name"),
  packageVersion: text("package_version"),
  malwareFamily: text("malware_family"),
  timestamp: timestamp("timestamp").defaultNow(),
  status: text("status").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  assignedTo: integer("assigned_to").references(() => users.id),
  metadata: jsonb("metadata"),
  organizationId: integer("organization_id").references(() => organizations.id),
});
```

**Propósito**: Alertas individuales de seguridad generadas por el sistema.

**Campos de Identificación**:
- **title/description**: Información descriptiva de la alerta
- **severity**: Severidad ('critical', 'high', 'medium', 'low')
- **source**: Fuente que generó la alerta

**Campos de Contexto**:
- **sourceIp/destinationIp**: IPs involucradas
- **fileHash**: Hash de archivo malicioso
- **url**: URL sospechosa
- **cveId**: ID de vulnerabilidad CVE
- **packageName/packageVersion**: Paquete afectado
- **malwareFamily**: Familia de malware detectado

**Campos de Gestión**:
- **status**: Estado de la alerta ('new', 'in_progress', 'resolved', 'acknowledged')
- **retryCount**: Intentos de procesamiento automático
- **assignedTo**: Usuario asignado para investigar
- **metadata**: Datos adicionales en JSON

### 5. Tabla: `incidents` - Incidentes de Seguridad

```typescript
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  relatedAlerts: jsonb("related_alerts"),
  timeline: jsonb("timeline"),
  aiAnalysis: jsonb("ai_analysis"),
  mitreTactics: jsonb("mitre_tactics"),
  evidence: jsonb("evidence"),
  playbooks: jsonb("playbooks"),
  organizationId: integer("organization_id").references(() => organizations.id),
});
```

**Propósito**: Incidentes de seguridad que agrupan múltiples alertas relacionadas.

**Campos de Correlación**:
- **relatedAlerts**: Array de IDs de alertas relacionadas
- **timeline**: Timeline de eventos del incidente
- **aiAnalysis**: Análisis generado por IA
- **mitreTactics**: Tácticas MITRE ATT&CK identificadas
- **evidence**: Evidencia recolectada
- **playbooks**: Playbooks ejecutados en respuesta

**Estados del Ciclo de Vida**:
- **status**: 'new', 'in_progress', 'resolved', 'closed'
- **createdAt/updatedAt/closedAt**: Timestamps del ciclo de vida

### 6. Tabla: `threatIntel` - Inteligencia de Amenazas

```typescript
export const threatIntel = pgTable("threat_intel", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  severity: text("severity").notNull(),
  confidence: integer("confidence"),
  iocs: jsonb("iocs"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  relevance: text("relevance"),
  organizationId: integer("organization_id").references(() => organizations.id),
});
```

**Propósito**: Feeds de inteligencia de amenazas para enriquecimiento.

**Campos de Clasificación**:
- **type**: Tipo de amenaza ('ioc', 'vulnerability', 'apt', 'ransomware')
- **confidence**: Nivel de confianza (0-100)
- **relevance**: Relevancia para la organización
- **iocs**: Indicadores de Compromiso en JSON

**Campos de Validez**:
- **expiresAt**: Fecha de expiración de la información
- **source**: Fuente de la información de amenaza

### 7. Tabla: `aiInsights` - Insights de IA

```typescript
export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  confidence: integer("confidence").notNull(),
  relatedEntities: jsonb("related_entities"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
});
```

**Propósito**: Insights generados por sistemas de IA.

**Campos de IA**:
- **type**: Tipo de insight ('detection', 'recommendation', 'prediction')
- **confidence**: Nivel de confianza del análisis IA (0-100)
- **relatedEntities**: Entidades relacionadas (alertas, assets, etc.)

### 8. Tabla: `metrics` - Métricas del Dashboard

```typescript
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  trend: text("trend"),
  changePercentage: integer("change_percentage"),
  timestamp: timestamp("timestamp").defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
});
```

**Propósito**: Métricas para dashboards y reportes.

**Campos de Análisis**:
- **trend**: Tendencia ('up', 'down', 'stable')
- **changePercentage**: Porcentaje de cambio respecto periodo anterior

### 9. Tabla: `enrichments` - Enriquecimientos de Alertas

```typescript
export const enrichments = pgTable("enrichments", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").references(() => alerts.id).notNull(),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
  severity: integer("severity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Propósito**: Datos de enriquecimiento obtenidos de servicios externos.

**Campos de Enriquecimiento**:
- **provider**: Proveedor del enriquecimiento (VirusTotal, etc.)
- **data**: Datos del enriquecimiento en JSON
- **severity**: Severidad determinada por el proveedor

## Tipos de Datos y Validación

### Tipos Zod Definidos

```typescript
// Tipos de severidad
export const SeverityTypes = z.enum(['critical', 'high', 'medium', 'low']);
export type SeverityType = z.infer<typeof SeverityTypes>;

// Tipos de estado de alertas
export const AlertStatusTypes = z.enum(['new', 'in_progress', 'resolved', 'acknowledged']);
export type AlertStatusType = z.infer<typeof AlertStatusTypes>;
```

### Schemas de Inserción

Cada tabla tiene un schema de inserción que:
- **Omite campos auto-generados** (id, timestamps)
- **Valida tipos de datos** con Zod
- **Proporciona type safety** en TypeScript

```typescript
export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  timestamp: true,
});

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;
```

## Patrones de Diseño Implementados

### 1. **Multi-tenancy**
- **Organization ID**: Cada tabla de datos incluye `organizationId`
- **Aislamiento**: Datos completamente aislados por organización
- **Escalabilidad**: Facilita scaling horizontal por tenant

### 2. **Soft Deletes**
- **Estado-based**: Uso de campos de estado en lugar de eliminación
- **Auditabilidad**: Preserva histórico para auditorías
- **Recuperación**: Permite recuperación de datos

### 3. **Flexible Schema**
- **JSONB Fields**: Campos JSON para datos dinámicos
- **Extensibilidad**: Fácil extensión sin cambios de schema
- **Performance**: Índices en campos JSONB para consultas rápidas

### 4. **Audit Trail**
- **Timestamps**: Created/Updated en todas las tablas
- **User Tracking**: Campos assignedTo para trazabilidad
- **Timeline**: Timeline de eventos en incidentes

## Consideraciones de Performance

### 1. **Índices**
- **Primary Keys**: Índices automáticos en claves primarias
- **Foreign Keys**: Índices en claves foráneas
- **Queries frecuentes**: Índices en campos consultados frecuentemente

### 2. **Particionado**
- **Por organización**: Particionado lógico por organizationId
- **Por tiempo**: Particionado temporal para datos históricos
- **Archivado**: Archivado automático de datos antiguos

### 3. **Optimizaciones**
- **Query planning**: Optimización de consultas complejas
- **Connection pooling**: Pool de conexiones para concurrencia
- **Read replicas**: Réplicas de lectura para reportes

---

Este esquema está diseñado para soportar un SaaS escalable, multi-tenant y rico en funcionalidades de seguridad.