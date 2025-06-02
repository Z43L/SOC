# Documentación del Servidor Backend - db-init.ts

## Propósito

El archivo `db-init.ts` implementa el **script de inicialización y configuración inicial** de la base de datos del SOC, proporcionando:

- Inicialización automática de datos esenciales del sistema
- Creación de organización y usuario de prueba por defecto
- Configuración de planes de suscripción básicos
- Bootstrap del sistema para desarrollo y testing
- Validación de integridad de datos existentes
- Hash seguro de contraseñas para usuarios iniciales

## Estructura del Archivo

### 1. Imports y Dependencias

#### Funciones Criptográficas
```typescript
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
```

**Criptografía necesaria**:
- **scrypt**: Función de derivación de claves segura (misma que auth.ts)
- **randomBytes**: Generación de salt criptográficamente seguro
- **promisify**: Conversión de callbacks a Promises

#### Conexión y Esquemas
```typescript
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

**Componentes del sistema**:
- **db**: Conexión directa Drizzle (para operaciones específicas)
- **storage**: Capa de abstracción completa
- **Schema types**: Tipos para todas las entidades del sistema

### 2. Hash de Contraseñas Reutilizado

```typescript
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
```

**Nota importante**: Esta función es **idéntica** a la de `auth.ts`. En una refactorización futura, debería extraerse a un módulo compartido `utils/crypto.ts`.

**Consistencia de seguridad**:
- Mismo algoritmo que el sistema de autenticación
- Mismos parámetros de seguridad (16 bytes salt, 64 bytes key)
- Formato compatible: `hash.salt`

### 3. Función Principal de Inicialización

```typescript
async function initializeDatabase() {
  console.log("Initializing database with sample data...");
  
  try {
    // 1. Crear plan por defecto
    // 2. Crear organización de prueba
    // 3. Crear usuario administrador
    // 4. Validar datos existentes
    // 5. Configuración completa
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
```

### 4. Inicialización de Planes de Suscripción

```typescript
// Ensure there is a plan for the test organization
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

#### Características del Plan Gratuito

**Configuración del plan Free**:
- **name**: "Free" (identificador principal)
- **pricing**: $0 mensual y anual
- **features**: Array vacío (funcionalidades básicas)
- **limits**: 10 usuarios, 5 agentes, 100 alertas
- **isActive**: Habilitado por defecto

**Lógica de verificación**:
1. **Buscar existente**: Verifica si ya existe un plan "Free"
2. **Case insensitive**: Búsqueda con `.toLowerCase()`
3. **Crear si necesario**: Solo crea si no existe
4. **Idempotencia**: Múltiples ejecuciones no duplican datos

### 5. Creación de Organización de Prueba

```typescript
// Create a test organization
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

#### Configuración de la Organización de Prueba

**Datos de la organización**:
- **name**: "Test Organization" (nombre fijo para identificación)
- **planId**: Vinculado al plan gratuito creado anteriormente
- **subscriptionStatus**: 'active' (suscripción activa)
- **contact info**: Emails de prueba para testing
- **settings**: Configuración básica con tema claro

**Vinculación con Plan**:
- Usa `defaultPlan.id` para vincular correctamente
- Establece relación FK entre organizaciones y planes
- Status 'active' permite uso completo de funcionalidades

### 6. Creación de Usuario Administrador

```typescript
// Crear un usuario de prueba
const testUser: InsertUser = {
  name: "Z43L",
  username: "Z43L", 
  password: await hashPassword("password123"),
  email: "z43l@example.com",
  role: "Administrator",
  organizationId: testOrg.id
};

// Comprobar si el usuario ya existe
const existingUser = await storage.getUserByUsername(testUser.username);
if (!existingUser) {
  await storage.createUser(testUser);
  console.log("Sample user created");
} else {
  console.log("Sample user already exists");
}
```

#### Características del Usuario Administrador

**Configuración del admin**:
- **username/name**: "Z43L" (referencia al proyecto)
- **password**: "password123" (hasheada con scrypt)
- **role**: "Administrator" (máximos privilegios)
- **organizationId**: Vinculado a la organización de prueba

**Credenciales por defecto**:
```
Username: Z43L
Password: password123
Role: Administrator
```

**Seguridad**:
- Contraseña hasheada con mismo algoritmo que sistema principal
- Verificación de duplicados antes de crear
- Logging claro del estado de creación

### 7. Gestión de Datos de Muestra (Comentados)

```typescript
// NO Crear métricas de ejemplo
// const sampleMetrics: InsertMetric[] = [
//   { name: 'Active Alerts', value: 18, trend: 'up', changePercentage: 15 },
//   { name: 'Open Incidents', value: 5, trend: 'stable', changePercentage: 0 },
//   // ... más métricas
// ];

// Comprobar si ya hay métricas
const existingMetrics = await storage.listMetrics();
if (existingMetrics.length === 0) {
  console.log("No sample metrics created, will rely on real data.");
} else {
  console.log("Metrics already exist, skipping creation of samples.");
}
```

#### Estrategia de Datos de Muestra

**Datos comentados**:
- **Métricas**: 8 métricas de muestra con valores realistas
- **Alertas**: 2 alertas de ejemplo (ransomware, brute force)
- **AI Insights**: 1 insight de ejemplo sobre exfiltración
- **Threat Intel**: 1 intel sobre campaña APT

**Razón para comentar**:
- **Producción**: Evita datos falsos en entornos reales
- **Testing**: Permite usar datos reales para pruebas
- **Flexibilidad**: Fácil habilitar/deshabilitar según necesidad

**Verificación de existencia**:
```typescript
const existingAlerts = await storage.listAlerts();
if (existingAlerts.length === 0) {
  console.log("No sample alerts created, will rely on real data.");
} else {
  console.log("Alerts already exist, skipping creation of samples.");
}
```

### 8. Ejecución del Script

```typescript
// Ejecutar el script de inicialización
initializeDatabase().then(() => {
  console.log("Database setup finished");
  // No cerramos la conexión porque es compartida con la aplicación
});

export { initializeDatabase };
```

#### Características de la Ejecución

**Ejecución automática**:
- Se ejecuta al importar el módulo
- Promise-based con logging claro
- No cierra conexiones (compartidas con app principal)

**Export de función**:
- Permite ejecución manual desde otros módulos
- Útil para testing y scripts de mantenimiento
- Reutilizable en diferentes contextos

## Casos de Uso del Script

### 1. Desarrollo Local
```bash
# Primera vez configurando el proyecto
npm run dev
# El script se ejecuta automáticamente al iniciar
```

### 2. Testing
```typescript
// En tests de integración
import { initializeDatabase } from './db-init';

beforeAll(async () => {
  await initializeDatabase();
});
```

### 3. Deployment
```bash
# En scripts de deployment
npm run build
node -e "require('./dist/db-init.js')"
```

### 4. Reset de Desarrollo
```typescript
// Script manual para reset
import { initializeDatabase } from './server/db-init';

// Limpiar base de datos (opcional)
// await resetDatabase();

// Reinicializar
await initializeDatabase();
```

## Seguridad y Consideraciones

### 1. Contraseñas por Defecto
```typescript
// ⚠️ ADVERTENCIA: Cambiar en producción
password: await hashPassword("password123"),
```

**Para producción**:
- Usar contraseñas generadas aleatoriamente
- Requerir cambio de contraseña en primer login
- Considerar autenticación multi-factor

### 2. Datos de Prueba
```typescript
// ✅ Buena práctica: Datos comentados por defecto
// Evita datos de muestra en producción
```

### 3. Idempotencia
```typescript
// ✅ Verificación antes de crear
const existingUser = await storage.getUserByUsername(testUser.username);
if (!existingUser) {
  await storage.createUser(testUser);
}
```

## Mejoras Futuras Sugeridas

### 1. Extracción de Hash Function
```typescript
// utils/crypto.ts
export async function hashPassword(password: string) {
  // Función compartida entre auth.ts y db-init.ts
}
```

### 2. Configuración via Environment
```typescript
// Usar variables de entorno para datos iniciales
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Z43L';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const ORG_NAME = process.env.DEFAULT_ORG_NAME || 'Test Organization';
```

### 3. Datos de Muestra Opcionales
```typescript
// Flag para habilitar datos de muestra
const CREATE_SAMPLE_DATA = process.env.CREATE_SAMPLE_DATA === 'true';

if (CREATE_SAMPLE_DATA) {
  // Crear alertas, métricas, etc.
}
```

### 4. Validación de Integridad
```typescript
// Verificar integridad referencial
async function validateDataIntegrity() {
  // Verificar que todas las FK sean válidas
  // Verificar constraints de negocio
  // Reportar problemas encontrados
}
```

## Logging y Monitoring

### Estados de Inicialización
```typescript
console.log("Initializing database with sample data...");      // Inicio
console.log("Sample user created");                             // Usuario creado
console.log("Sample user already exists");                      // Usuario existe
console.log("No sample metrics created, will rely on real data."); // Sin datos de muestra
console.log("Database initialization completed successfully");   // Éxito
console.error("Error initializing database:", error);          // Error
```

### Monitoring en Producción
- **Success/failure metrics**: Tasa de éxito de inicialización
- **Execution time**: Tiempo de ejecución del script
- **Error tracking**: Logging detallado de errores
- **Data validation**: Verificación post-inicialización

---

Este script de inicialización es **fundamental para el bootstrap** del sistema SOC, proporcionando una base de datos funcional con los datos mínimos necesarios para el correcto funcionamiento de la aplicación.