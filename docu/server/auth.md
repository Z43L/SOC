# Documentación del Servidor Backend - auth.ts

## Propósito

El archivo `auth.ts` implementa el **sistema completo de autenticación y autorización** del SOC, incluyendo:

- Gestión de sesiones seguras con cookies
- Hash y validación de contraseñas usando algoritmos criptográficos modernos
- Integración con Passport.js para estrategias de autenticación
- Registro de usuarios con organizaciones automáticas
- Login/logout con manejo de sesiones
- Middleware de protección para rutas autenticadas

## Estructura del Archivo

### 1. Imports y Dependencias

#### Dependencias de Autenticación
```typescript
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
```

**Explicación**:
- **passport**: Middleware de autenticación más popular para Node.js
- **LocalStrategy**: Estrategia para autenticación con usuario/contraseña
- **express-session**: Gestión de sesiones HTTP con cookies

#### Dependencias Criptográficas
```typescript
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
```

**Funciones criptográficas**:
- **scrypt**: Función de derivación de claves segura y lenta (PBKDF)
- **randomBytes**: Generación criptográficamente segura de bytes aleatorios
- **timingSafeEqual**: Comparación de buffers resistente a ataques de timing
- **promisify**: Convierte funciones callback en Promise para async/await

#### Tipos y Storage
```typescript
import { Express } from "express";
import { storage } from "./storage";
import type { InsertOrganization, User as DbUser } from "@shared/schema";
```

**Integración con el sistema**:
- **Express**: Tipado para la aplicación Express
- **storage**: Interfaz de base de datos
- **InsertOrganization, User**: Schemas TypeScript compartidos

### 2. Extensión de Tipos TypeScript

```typescript
declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}
```

**Propósito**: Extiende el tipo `User` de Express con nuestro tipo `DbUser` personalizado, proporcionando tipado estricto en toda la aplicación.

**Beneficios**:
- IntelliSense completo para `req.user`
- Detección de errores en tiempo de compilación
- Consistencia de tipos entre frontend y backend

### 3. Sistema de Hash de Contraseñas

#### Generación de Hash
```typescript
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
```

**Proceso paso a paso**:
1. **Salt Generation**: `randomBytes(16)` genera 16 bytes aleatorios
2. **Hex Conversion**: `.toString("hex")` convierte a hexadecimal (32 caracteres)
3. **Key Derivation**: `scryptAsync(password, salt, 64)` deriva una clave de 64 bytes
4. **Format**: Retorna `hash.salt` para almacenamiento

**Parámetros de Seguridad**:
- **Salt Length**: 16 bytes (128 bits) previene rainbow tables
- **Key Length**: 64 bytes (512 bits) para máxima seguridad
- **Algorithm**: scrypt es resistente a ataques con hardware especializado

#### Verificación de Contraseñas
```typescript
async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
```

**Proceso de verificación**:
1. **Split**: Separa el hash almacenado en `hash` y `salt`
2. **Convert**: Convierte el hash almacenado de hex a Buffer
3. **Derive**: Deriva nueva clave con la contraseña suministrada y el salt original
4. **Compare**: `timingSafeEqual` previene ataques de timing

**Seguridad**:
- **Timing Attack Resistance**: `timingSafeEqual` toma tiempo constante
- **Salt Reuse**: Usa el mismo salt para verificación
- **No Memory Leaks**: Buffers se limpian automáticamente

### 4. Configuración de Sesiones

```typescript
const sessionSettings: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || "soc-intelligence-session-secret",
  resave: true,
  saveUninitialized: true,
  store: storage.sessionStore,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    secure: false, // false para desarrollo local sin HTTPS
    sameSite: 'lax',
    httpOnly: true,
    path: '/'
  },
  name: 'soc.sid'
};
```

**Configuración detallada**:

#### Configuración Principal
- **secret**: Clave para firmar cookies (debería ser única por instalación)
- **resave**: `true` fuerza el guardado de sesión aunque no se modifique
- **saveUninitialized**: `true` guarda sesiones nuevas aunque no tengan datos
- **store**: Usa el store personalizado del sistema de storage (PostgreSQL/Redis)
- **name**: Nombre personalizado de la cookie (`soc.sid`)

#### Configuración de Cookies
- **maxAge**: 30 días de duración (2,592,000,000 ms)
- **secure**: `false` para desarrollo, debería ser `true` en producción con HTTPS
- **sameSite**: `'lax'` permite cookies en navegación normal pero no en requests CORS
- **httpOnly**: `true` previene acceso desde JavaScript (protección XSS)
- **path**: `'/'` hace la cookie válida para toda la aplicación

### 5. Configuración de Passport.js

#### Estrategia Local
```typescript
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    } catch (err) {
      return done(err);
    }
  }),
);
```

**Flujo de autenticación**:
1. **User Lookup**: Busca usuario por username en la base de datos
2. **Password Check**: Verifica la contraseña usando hash seguro
3. **Return Result**: 
   - `done(null, user)`: Login exitoso
   - `done(null, false)`: Credenciales incorrectas
   - `done(err)`: Error del sistema

#### Serialización de Usuario
```typescript
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});
```

**Propósito**:
- **serializeUser**: Guarda solo el ID del usuario en la sesión (eficiencia)
- **deserializeUser**: Reconstruye el objeto usuario completo desde la base de datos

**Beneficios**:
- **Eficiencia**: Solo el ID se almacena en la sesión
- **Consistencia**: Los datos del usuario siempre están actualizados
- **Seguridad**: Cambios de permisos se reflejan inmediatamente

### 6. Rutas de Autenticación

#### Registro de Usuario (/api/register)

```typescript
app.post("/api/register", async (req, res, next) => {
  try {
    // 1. Verificar usuario existente
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    // 2. Configurar plan de suscripción
    const selectedPlan = req.body.selectedPlan || 'free';
    const plans = await storage.listPlans();
    let plan = plans.find(p => p.name.toLowerCase() === selectedPlan.toLowerCase());
    
    // Crear plan gratuito si no existe
    if (!plan) {
      plan = await storage.createPlan({
        name: "Free",
        description: "Plan gratuito con funcionalidades básicas",
        priceMonthly: 0,
        priceYearly: 0,
        features: JSON.stringify(["Alertas básicas", "1 Conector", "Dashboard básico"]),
        maxUsers: 2,
        maxAgents: 1,
        maxAlerts: 100,
        isActive: true
      });
    }
```

**Proceso de registro paso a paso**:

1. **Validación de Usuario**: Verifica que el username no exista
2. **Plan Management**: 
   - Selecciona plan del request o usa 'free' por defecto
   - Busca el plan en la base de datos
   - Crea plan gratuito automáticamente si no existe

3. **Creación de Organización**:
```typescript
const organizationData: InsertOrganization = {
  name: req.body.organizationName || `${req.body.name}'s Organization`,
  planId: plan.id,
  subscriptionStatus: selectedPlan.toLowerCase() === 'free' ? 'active' : 'trial',
  email: req.body.email,
  contactName: req.body.name,
  contactEmail: req.body.email,
  settings: JSON.stringify({
    theme: "light",
    notifications: true,
    language: "es"
  })
};
```

4. **Creación de Usuario**:
```typescript
const userPayload = {
  ...req.body,
  password: await hashPassword(req.body.password),
  organizationId: newOrganization.id,
  role: req.body.role || 'Security Analyst'
};
const user = await storage.createUser(userPayload);
```

5. **Auto-login**: Inicia sesión automáticamente después del registro

#### Login (/api/login)

```typescript
app.post("/api/login", passport.authenticate("local"), async (req, res) => {
  try {
    // Asignar explícitamente el usuario a la sesión
    (req.session as any).user = req.user;
    
    // Forzar el guardado de la sesión antes de responder
    req.session.save(async (err) => {
      if (err) {
        console.error("Error guardando la sesión:", err);
        return res.status(500).json({ error: 'Error de sesión', details: err.message });
      }
      
      // Obtener la organización del usuario
      const organization = await storage.getOrganization(req.user.organizationId);
      
      return res.status(200).json({
        user: req.user,
        organization,
        sessionID: req.sessionID
      });
    });
  } catch (error) {
    console.error("Error general en login:", error);
    return res.status(500).json({ error: 'Error de servidor en login' });
  }
});
```

**Características avanzadas**:
- **Session Forcing**: Fuerza el guardado de sesión antes de responder
- **Organization Loading**: Carga automáticamente la organización del usuario
- **Error Handling**: Manejo robusto de errores con logging detallado
- **Debug Info**: Incluye sessionID para debugging

#### Logout (/api/logout)

```typescript
app.post("/api/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.sendStatus(200);
  });
});
```

**Proceso simple pero efectivo**:
- Usa el método `logout()` de Passport
- Limpia la sesión automáticamente
- Manejo de errores con middleware

#### Verificación de Usuario (/api/user)

```typescript
app.get("/api/user", async (req, res) => {
  // Verificación detallada de autenticación con diagnóstico
  console.log(`Sesión en /api/user: ${req.sessionID}, autenticado: ${req.isAuthenticated()}`);
  console.log(`Cookie de sesión presente: ${Boolean(req.headers.cookie)}`);
  
  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'No autenticado',
      details: 'La sesión no está activa o ha expirado'
    });
  }
  
  // Cargar organización y retornar datos completos
  const organization = await storage.getOrganization(req.user.organizationId);
  
  return res.json({
    user: req.user,
    organization
  });
});
```

**Funcionalidades**:
- **Debug Logging**: Información detallada para troubleshooting
- **Session Validation**: Verificación robusta de autenticación
- **Data Loading**: Carga automática de datos relacionados
- **Error Details**: Mensajes de error descriptivos

### 7. Middleware de Autenticación

```typescript
export const checkAuth: import("express").RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};
```

**Uso en rutas protegidas**:
```typescript
// En routes.ts
import { checkAuth } from './auth';

app.get('/api/protected-route', checkAuth, (req, res) => {
  // Solo usuarios autenticados pueden acceder
  res.json({ data: 'protected data' });
});
```

## Consideraciones de Seguridad

### 1. Protección contra Ataques Comunes

#### Password Hashing
- **Algorithm**: scrypt (recomendado por OWASP)
- **Salt Length**: 128 bits (previene rainbow tables)
- **Timing Attacks**: `timingSafeEqual` para comparaciones seguras

#### Session Security
- **HttpOnly Cookies**: Previene XSS
- **SameSite Policy**: Previene CSRF
- **Secure Flag**: Debería activarse en producción (HTTPS)

#### Input Validation
- **Username Uniqueness**: Verificación antes de crear usuario
- **Type Safety**: TypeScript previene errores de tipos

### 2. Mejores Prácticas Implementadas

#### Session Management
- **Session Store**: Usa store persistente (no memoria)
- **Session Rotation**: Passport maneja automáticamente
- **Expiration**: 30 días con limpieza automática

#### Error Handling
- **No Information Leakage**: Errores genéricos para usuarios
- **Detailed Logging**: Información detallada para developers
- **Graceful Degradation**: Manejo robusto de errores de DB

## Integración con Otros Módulos

### Storage Module
- **User Operations**: CRUD completo de usuarios
- **Organization Management**: Vinculación automática
- **Session Store**: Almacenamiento persistente de sesiones

### Schema Validation
- **Shared Types**: Consistencia entre frontend/backend
- **Runtime Validation**: Validación en tiempo de ejecución
- **Database Constraints**: Validación a nivel de base de datos

### Middleware System
- **Authentication Checks**: Middleware reutilizable
- **Role-based Access**: Extensible para diferentes roles
- **Request Enrichment**: Datos de usuario disponibles en req.user

## Configuración de Producción

### Variables de Entorno Requeridas
```bash
SESSION_SECRET=your-unique-session-secret-256-bits-minimum
DATABASE_URL=your-postgresql-connection-string
REDIS_URL=your-redis-connection-string-for-sessions
```

### Configuraciones de Seguridad para Producción
```typescript
// Configuración recomendada para producción
const productionSessionSettings = {
  ...sessionSettings,
  cookie: {
    ...sessionSettings.cookie,
    secure: true,      // Requiere HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 horas en producción
  },
  name: 'soc.sid',
};
```

### Configuración de Proxy
```typescript
app.set("trust proxy", 1); // Para funcionamiento correcto detrás de reverse proxy
```

---

Este sistema de autenticación proporciona una base **segura, escalable y mantenible** para el SOC, implementando las mejores prácticas de seguridad y proporcionando una experiencia de usuario fluida.