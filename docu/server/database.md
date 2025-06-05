# Documentación del Sistema de Base de Datos

Esta documentación cubre los archivos relacionados con la base de datos del servidor SOC:
- `server/db.ts` - Configuración de conexión a la base de datos
- `server/db-init.ts` - Inicialización y datos de prueba

## server/db.ts - Configuración de Base de Datos

### Propósito
Establece la conexión principal con la base de datos PostgreSQL utilizando Drizzle ORM y proporciona un pool de conexiones para el almacén de sesiones.

### Estructura del Archivo

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Create database connection
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
// Pool for session store
export const pool = new Pool({ connectionString });
```

### Dependencias

#### Drizzle ORM
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
```
- **Propósito**: ORM moderno para TypeScript
- **Características**: Type-safe, SQL-like queries, migraciones automáticas
- **Ventajas**: Mejor rendimiento que ORMs tradicionales, sintaxis familiar

#### PostgreSQL Driver
```typescript
import postgres from "postgres";
```
- **Propósito**: Driver de alto rendimiento para PostgreSQL
- **Características**: Connection pooling, prepared statements, SSL support
- **Optimizaciones**: Reducción de latencia, mejor manejo de concurrencia

#### pg Library
```typescript
import pkg from 'pg';
const { Pool } = pkg;
```
- **Propósito**: Driver tradicional de PostgreSQL para Node.js
- **Uso específico**: Pool de conexiones para el session store
- **Razón**: Compatibilidad con middleware de sesiones existente

### Configuración de Conexión

#### Variable de Entorno
```typescript
const connectionString = process.env.DATABASE_URL!;
```

**Formato esperado**:
```
postgresql://username:password@hostname:port/database?sslmode=require
```

**Ejemplo de desarrollo**:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/soc_dev"
```

**Ejemplo de producción**:
```
DATABASE_URL="postgresql://user:pass@aws-rds-instance:5432/soc_prod?sslmode=require"
```

#### Instancia Principal de Drizzle
```typescript
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**Características**:
- **client**: Conexión directa a PostgreSQL con pooling automático
- **schema**: Importa todas las definiciones de tablas desde `@shared/schema`
- **Type Safety**: Queries completamente tipadas en TypeScript

**Ejemplo de uso**:
```typescript
import { db } from './db';
import { users } from '@shared/schema';

// Query tipada
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));
```

#### Pool de Conexiones para Sesiones
```typescript
export const pool = new Pool({ connectionString });
```

**Propósito**: 
- Usado específicamente para el session store (express-session)
- Separado de la conexión principal por motivos de compatibilidad

**Configuración automática**:
- **max**: Número máximo de conexiones (default: 10)
- **idleTimeoutMillis**: Tiempo antes de cerrar conexiones inactivas
- **connectionTimeoutMillis**: Tiempo máximo para establecer conexión

### Consideraciones de Performance

#### Connection Pooling
- **Drizzle**: Pooling automático a través del driver `postgres`
- **pg Pool**: Pool dedicado para sesiones
- **Ventaja**: Reutilización eficiente de conexiones

#### Preparación de Statements
```typescript
// Drizzle prepara automáticamente statements repetidos
const getUserById = db.select().from(users).where(eq(users.id, $id)).prepare();
```

#### SSL en Producción
```typescript
// Configuración SSL automática basada en la connection string
// Para forzar SSL:
const client = postgres(connectionString, { ssl: 'require' });
```

### Manejo de Errores

```typescript
try {
  const result = await db.select().from(users);
} catch (error) {
  if (error.code === '23505') {
    // Violation de constraint unique
    console.error('Usuario duplicado');
  } else if (error.code === 'ECONNREFUSED') {
    // No se puede conectar a la base de datos
    console.error('Base de datos no disponible');
  }
}
```

### Ejemplo de Integración

```typescript
// En otro archivo del servidor
import { db, pool } from './db';
import { users, alerts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Query compleja con joins
const userWithAlerts = await db
  .select({
    user: users,
    alertCount: count(alerts.id)
  })
  .from(users)
  .leftJoin(alerts, eq(alerts.assignedTo, users.id))
  .where(eq(users.organizationId, orgId))
  .groupBy(users.id);
```

---

## server/db-init.ts - Inicialización de Base de Datos

### Propósito
Inicializa la base de datos con datos de prueba necesarios para el funcionamiento del sistema, incluyendo organizaciones, usuarios, planes y configuraciones básicas.

### Estructura del Archivo

```typescript
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { 
  users, type InsertUser,
  alerts, type InsertAlert,
  incidents, type InsertIncident,
  threatIntel, type InsertThreatIntel,
  aiInsights, type InsertAiInsight, 
  metrics, type InsertMetric
} from "@shared/schema";
import { storage } from "./storage";
```

### Funciones de Utilidad

#### Hash de Contraseñas
```typescript
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
```

**Características de Seguridad**:
- **Algoritmo scrypt**: Resistente a ataques de fuerza bruta
- **Salt aleatorio**: 16 bytes generados aleatoriamente
- **Key Length**: 64 bytes para máxima seguridad
- **Formato**: `hash.salt` para facilitar verificación

**Ejemplo de verificación**:
```typescript
async function verifyPassword(password: string, hashedPassword: string) {
  const [hash, salt] = hashedPassword.split('.');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return buf.toString('hex') === hash;
}
```

### Función Principal de Inicialización

#### 1. Creación de Plan por Defecto

```typescript
let plansList = await storage.listPlans();
let defaultPlan = plansList.find(p => p.name.toLowerCase() === 'free');
if (!defaultPlan) {
  defaultPlan = await storage.createPlan({
    name: "Free",
    description: "Default free plan",
    priceMonthly: 0,
    priceYearly: 0,
    features: JSON.stringify([]),
    maxUsers: 10,
    maxAgents: 5,
    maxAlerts: 100,
    isActive: true
  });
}
```

**Plan Free por Defecto**:
- **Usuarios**: Máximo 10
- **Agentes**: Máximo 5  
- **Alertas**: Máximo 100
- **Precio**: Gratuito
- **Estado**: Activo

#### 2. Creación de Organización de Prueba

```typescript
const orgName = 'Test Organization';
let testOrg = (await storage.listOrganizations()).find(o => o.name === orgName);
if (!testOrg) {
  testOrg = await storage.createOrganization({
    name: orgName,
    planId: defaultPlan.id,
    subscriptionStatus: 'active',
    email: 'test-org@example.com',
    contactName: 'Test Org',
    contactEmail: 'test-org@example.com',
    settings: JSON.stringify({ theme: 'light' })
  });
}
```

**Organización de Test**:
- **Plan**: Asociada al plan gratuito
- **Estado**: Suscripción activa
- **Configuración**: Tema claro por defecto
- **Verificación**: Solo se crea si no existe

#### 3. Creación de Usuario Administrador

```typescript
const testUser: InsertUser = {
  name: "Z43L",
  username: "Z43L", 
  password: await hashPassword("password123"),
  email: "z43l@example.com",
  role: "Administrator",
  organizationId: testOrg.id
};

const existingUser = await storage.getUserByUsername(testUser.username);
if (!existingUser) {
  await storage.createUser(testUser);
  console.log("Sample user created");
} else {
  console.log("Sample user already exists");
}
```

**Usuario Administrador**:
- **Credentials**: Z43L / password123
- **Rol**: Administrator (permisos completos)
- **Organización**: Asociado a la organización de test
- **Email**: z43l@example.com

### Datos de Muestra (Comentados)

El archivo incluye secciones comentadas para crear datos de ejemplo:

#### Métricas de Ejemplo
```typescript
// const sampleMetrics: InsertMetric[] = [
//   { name: 'Active Alerts', value: 18, trend: 'up', changePercentage: 15 },
//   { name: 'Open Incidents', value: 5, trend: 'stable', changePercentage: 0 },
//   { name: 'Global Risk Score', value: 68, trend: 'down', changePercentage: 12 }
// ];
```

#### Alertas de Ejemplo
```typescript
// const sampleAlerts: InsertAlert[] = [
//   {
//     title: 'Suspicious Login Activity',
//     description: 'Multiple failed login attempts to admin console',
//     severity: 'high',
//     source: 'SIEM',
//     sourceIp: '203.0.113.45',
//     status: 'in_progress',
//     assignedTo: 1,
//     metadata: { attempts: 58, lastAttempt: new Date().toISOString() }
//   }
// ];
```

#### AI Insights de Ejemplo
```typescript
// const sampleInsights: InsertAiInsight[] = [
//   {
//     title: 'Potential Data Exfiltration',
//     description: 'Unusual outbound traffic patterns detected',
//     type: 'detection',
//     severity: 'high',
//     confidence: 85,
//     status: 'new',
//     relatedEntities: { 
//       hosts: ['192.168.2.45'], 
//       ports: [443, 8080], 
//       destinations: ['203.0.113.12'] 
//     }
//   }
// ];
```

### Lógica de Verificación

```typescript
// Comprobar si ya hay alertas
const existingAlerts = await storage.listAlerts();
if (existingAlerts.length === 0) {
  console.log("No sample alerts created, will rely on real data.");
} else {
  console.log("Alerts already exist, skipping creation of samples.");
}
```

**Características**:
- **Idempotencia**: No duplica datos existentes
- **Logs informativos**: Indica qué acciones se realizaron
- **Datos reales**: Prioriza datos reales sobre datos de ejemplo

### Uso y Ejecución

#### Desde el código principal
```typescript
import { initializeDatabase } from "./db-init";

// En server/index.ts (comentado por defecto)
// await initializeDatabase();
```

#### Ejecución manual
```bash
# Desde el directorio del proyecto
npm run tsx server/db-init.ts
```

#### En scripts de deployment
```typescript
// En scripts de CI/CD
if (process.env.NODE_ENV === 'development') {
  await initializeDatabase();
}
```

### Consideraciones de Seguridad

#### Contraseñas
- **Nunca en texto plano**: Siempre hasheadas con scrypt
- **Salt único**: Cada contraseña tiene su propio salt
- **Contraseña de test**: Solo para desarrollo, cambiar en producción

#### Datos sensibles
- **No en producción**: Los datos de test no deben usarse en producción
- **Configuración por entorno**: Diferentes datos según el entorno

### Troubleshooting

#### Error: Usuario ya existe
```typescript
if (existingUser) {
  console.log("Sample user already exists");
  // No es un error, es comportamiento esperado
}
```

#### Error: Plan no encontrado
```typescript
if (!defaultPlan) {
  // Se crea automáticamente el plan Free
  defaultPlan = await storage.createPlan(/* ... */);
}
```

#### Error de conexión a base de datos
```typescript
try {
  await initializeDatabase();
} catch (error) {
  console.error('Database initialization failed:', error);
  // Verificar DATABASE_URL y conexión
}
```

---

## Mejores Prácticas

### Para db.ts
1. **Variables de entorno**: Usar siempre variables de entorno para la conexión
2. **SSL en producción**: Configurar SSL para conexiones seguras
3. **Connection pooling**: Aprovechar el pooling automático
4. **Error handling**: Implementar manejo robusto de errores

### Para db-init.ts
1. **Idempotencia**: Verificar existencia antes de crear
2. **Seguridad**: Hash seguro de contraseñas
3. **Logging**: Logs claros sobre acciones realizadas
4. **Separación de entornos**: Diferentes datos por entorno