# Documentación del Servidor Backend - db.ts

## Propósito

El archivo `db.ts` es el **módulo de conexión fundamental** que establece y configura las conexiones a la base de datos PostgreSQL del SOC. Este módulo proporciona:

- Conexión principal optimizada usando Drizzle ORM
- Pool de conexiones para el almacén de sesiones
- Configuración de esquemas compartidos
- Optimizaciones para performance y concurrencia

## Estructura del Archivo

### 1. Imports y Dependencias

#### ORM y Drivers de Base de Datos
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pkg from 'pg';
const { Pool } = pkg;
```

**Dependencias explicadas**:
- **drizzle-orm/postgres-js**: ORM moderno con tipado estricto para PostgreSQL
- **postgres**: Driver PostgreSQL rápido y moderno (mejor performance que pg)
- **pg**: Driver PostgreSQL tradicional usado para el pool de sesiones
- **Pool**: Clase para gestión de pool de conexiones

#### Esquemas Compartidos
```typescript
import * as schema from "@shared/schema";
```

**Esquemas incluidos**:
- Definiciones de tablas (users, alerts, incidents, etc.)
- Tipos TypeScript para tipado estricto
- Validaciones Zod para runtime validation
- Enums para valores constantes

### 2. Configuración de Conexión Principal

```typescript
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

#### Análisis línea por línea:

**Variable de Entorno**:
```typescript
const connectionString = process.env.DATABASE_URL!;
```
- **Fuente**: Variable de entorno `DATABASE_URL`
- **Formato esperado**: `postgresql://user:password@host:port/database`
- **Assertion (`!`)**: TypeScript asume que la variable existe (falla si es undefined)

**Cliente PostgreSQL**:
```typescript
const client = postgres(connectionString);
```
- **Driver**: Usa `postgres` para mejor performance
- **Auto-configuración**: Parsing automático de la connection string
- **Optimizaciones**: 
  - Connection pooling interno
  - Prepared statements automáticos
  - Pipelining de queries

**Instancia Drizzle**:
```typescript
export const db = drizzle(client, { schema });
```
- **ORM**: Instancia principal de Drizzle ORM
- **Schema Integration**: Tipado automático basado en esquemas
- **Type Safety**: IntelliSense completo para queries

### 3. Pool de Conexiones para Sesiones

```typescript
export const pool = new Pool({ connectionString });
```

#### Propósito Específico:

**¿Por qué dos conexiones diferentes?**

1. **Performance**: 
   - `postgres` es más rápido para queries de aplicación
   - `pg.Pool` es más compatible con middleware de sesiones

2. **Stability**:
   - `connect-pg-simple` requiere específicamente `pg.Pool`
   - Separación de concerns entre aplicación y sesiones

3. **Concurrencia**:
   - Pool separado evita contención de recursos
   - Sessions no bloquean queries de aplicación

## Configuración de Database URL

### Formato de Connection String

```bash
# Desarrollo local
DATABASE_URL=postgresql://username:password@localhost:5432/soc_db

# Producción con SSL
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Con parámetros adicionales
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require&pool_min=5&pool_max=20
```

### Parámetros Importantes

#### SSL Configuration
```bash
# SSL requerido (producción)
?sslmode=require

# SSL preferido pero opcional
?sslmode=prefer

# Sin SSL (solo desarrollo)
?sslmode=disable
```

#### Pool Configuration
```bash
# Configuración de pool
?pool_min=5          # Mínimo de conexiones
?pool_max=20         # Máximo de conexiones
?pool_idle=60000     # Timeout de conexiones idle (ms)
```

#### Performance Tuning
```bash
# Configuraciones de performance
?application_name=soc_app    # Identificación en logs
?connect_timeout=30          # Timeout de conexión
?statement_timeout=60000     # Timeout de statements
```

## Integración con Drizzle ORM

### Ventajas de Drizzle

#### 1. Type Safety Completa
```typescript
// Auto-completado y validación de tipos
const users = await db.select().from(schema.users).where(eq(schema.users.id, 1));
// users tiene tipo: User[]
```

#### 2. Schema-First Approach
```typescript
// El schema define la estructura
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 256 }).unique(),
  email: varchar('email', { length: 256 }).unique(),
  // ... más campos
});
```

#### 3. Query Builder Intuitivo
```typescript
// Queries complejas con tipado
const alertsWithUsers = await db
  .select({
    alert: schema.alerts,
    user: schema.users,
  })
  .from(schema.alerts)
  .leftJoin(schema.users, eq(schema.alerts.assignedTo, schema.users.id))
  .where(eq(schema.alerts.severity, 'critical'));
```

### Performance Features

#### Prepared Statements Automáticos
```typescript
// Drizzle automaticamente prepara statements repetidos
const getUserById = async (id: number) => {
  return await db.select().from(schema.users).where(eq(schema.users.id, id));
  // Primera llamada: prepara statement
  // Llamadas subsecuentes: usa statement preparado
};
```

#### Connection Pooling Inteligente
```typescript
// El driver postgres maneja el pooling automáticamente
const client = postgres(connectionString, {
  max: 20,                    // Máximo de conexiones
  idle_timeout: 30,          // Timeout de conexiones idle
  connect_timeout: 60,       // Timeout de conexión
});
```

## Uso en Otros Módulos

### En Storage (storage.ts)
```typescript
import { db, pool } from './db';

export class DatabaseStorage implements IStorage {
  // Usa db para queries de aplicación
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }
  
  // Usa pool para sesiones
  constructor() {
    this.sessionStore = new PgStore({
      pool: pool,
      createTableIfMissing: true,
    });
  }
}
```

### En Routes (routes.ts)
```typescript
import { storage } from './storage';

// storage usa internamente db para todas las operaciones
app.get('/api/users', async (req, res) => {
  const users = await storage.listUsers();
  res.json(users);
});
```

## Configuración para Diferentes Entornos

### Desarrollo Local
```typescript
// .env.development
DATABASE_URL=postgresql://postgres:password@localhost:5432/soc_dev
```

### Testing
```typescript
// .env.test
DATABASE_URL=postgresql://postgres:password@localhost:5432/soc_test
```

### Staging
```typescript
// .env.staging
DATABASE_URL=postgresql://user:pass@staging-db:5432/soc_staging?sslmode=require
```

### Producción
```typescript
// .env.production
DATABASE_URL=postgresql://user:pass@prod-db:5432/soc_prod?sslmode=require&pool_max=50
```

## Consideraciones de Seguridad

### 1. Connection String Security
```typescript
// ✅ Correcto: usar variables de entorno
const connectionString = process.env.DATABASE_URL!;

// ❌ Incorrecto: hardcodear credenciales
const connectionString = "postgresql://user:pass@host/db";
```

### 2. SSL Configuration
```typescript
// Producción: SSL obligatorio
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

// Desarrollo: SSL opcional
DATABASE_URL=postgresql://user:pass@localhost:5432/db?sslmode=prefer
```

### 3. Pool Limits
```typescript
// Prevenir agotamiento de conexiones
const client = postgres(connectionString, {
  max: 20,                  // Límite razonable
  idle_timeout: 30,        // Limpieza de conexiones idle
  max_lifetime: 3600,      // Rotación de conexiones
});
```

## Monitoring y Debugging

### 1. Connection Monitoring
```typescript
// Logging de conexiones
const client = postgres(connectionString, {
  onnotice: (notice) => console.log('PG Notice:', notice),
  debug: process.env.NODE_ENV === 'development',
});
```

### 2. Query Logging
```typescript
// En desarrollo: log de queries
const db = drizzle(client, { 
  schema,
  logger: process.env.NODE_ENV === 'development' 
});
```

### 3. Health Checks
```typescript
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await db.select().from(schema.users).limit(1);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};
```

## Migration Support

### Drizzle Kit Integration
```typescript
// drizzle.config.ts
export default {
  schema: "./shared/schema.ts",
  out: "./migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
};
```

### Migration Commands
```bash
# Generar migraciones
npm run db:generate

# Aplicar migraciones
npm run db:push

# Validar schema
npm run db:check
```

## Troubleshooting Común

### 1. Connection Issues
```typescript
// Error: Connection refused
// Solución: Verificar que PostgreSQL esté ejecutándose
// Verificar: docker ps | grep postgres

// Error: Authentication failed
// Solución: Verificar credenciales en DATABASE_URL
```

### 2. Pool Exhaustion
```typescript
// Error: remaining connection slots are reserved
// Solución: Aumentar max_connections en PostgreSQL
// O reducir pool size en la aplicación
```

### 3. SSL Errors
```typescript
// Error: SSL required
// Solución: Agregar ?sslmode=require a DATABASE_URL
// O configurar certificados SSL
```

---

Este módulo es la **base fundamental** del sistema de persistencia del SOC, proporcionando conexiones eficientes, seguras y tipo-safe para todas las operaciones de base de datos.