# Documentación del Sistema de Autenticación

Este archivo documenta el sistema completo de autenticación del servidor SOC implementado en `server/auth.ts`.

## Propósito General

El sistema de autenticación maneja:
- **Registro de usuarios** con creación automática de organizaciones
- **Login/Logout** con sesiones persistentes
- **Gestión de contraseñas** con hashing seguro
- **Middleware de autenticación** para proteger rutas
- **Gestión de planes** y organizaciones

## Dependencias y Configuración

### Importaciones Principales

```typescript
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { InsertOrganization, User as DbUser } from "@shared/schema";
```

#### Explicación de dependencias:

- **passport**: Middleware de autenticación para Express
- **passport-local**: Estrategia para autenticación username/password
- **express-session**: Manejo de sesiones HTTP
- **crypto**: Módulos nativos para operaciones criptográficas
- **storage**: Capa de abstracción para operaciones de base de datos

### Extensión de Tipos TypeScript

```typescript
declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}
```

**Propósito**: Extiende el tipo `Express.User` para incluir todas las propiedades del usuario de la base de datos, proporcionando tipado completo en `req.user`.

## Sistema de Hash de Contraseñas

### Función de Hash

```typescript
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
```

#### Características de seguridad:

1. **Algoritmo scrypt**: Resistente a ataques GPU y ASIC
2. **Salt aleatorio**: 16 bytes únicos por contraseña
3. **Key derivation**: 64 bytes de longitud de clave
4. **Formato**: `hash.salt` para almacenamiento eficiente

#### Ejemplo de uso:
```typescript
const plainPassword = "password123";
const hashedPassword = await hashPassword(plainPassword);
// Resultado: "a1b2c3d4...e5f6.1234567890abcdef"
```

### Función de Verificación

```typescript
async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
```

#### Características de seguridad:

1. **Separación hash/salt**: Extrae ambos componentes del formato almacenado
2. **Re-hash**: Aplica el mismo proceso con el salt original
3. **Comparación timing-safe**: Previene ataques de timing

#### Ejemplo de verificación:
```typescript
const isValid = await comparePasswords("password123", hashedPassword);
// true si la contraseña es correcta
```

## Configuración de Sesiones

### Configuración Detallada

```typescript
const sessionSettings: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || "soc-intelligence-session-secret",
  resave: true,
  saveUninitialized: true,
  store: storage.sessionStore,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    secure: false, // false para desarrollo sin HTTPS
    sameSite: 'lax',
    httpOnly: true,
    path: '/'
  },
  name: 'soc.sid'
};
```

#### Parámetros explicados:

- **secret**: Clave para firmar cookies de sesión (usar variable de entorno en producción)
- **resave**: `true` - Guarda sesión aunque no haya cambios
- **saveUninitialized**: `true` - Guarda sesiones nuevas aunque estén vacías
- **store**: Almacén personalizado (base de datos PostgreSQL)
- **maxAge**: 30 días de duración de sesión
- **secure**: `false` para desarrollo, `true` para HTTPS en producción
- **sameSite**: `'lax'` - Protección CSRF moderada
- **httpOnly**: `true` - Previene acceso desde JavaScript
- **name**: Nombre personalizado para la cookie

### Configuración del Proxy

```typescript
app.set("trust proxy", 1);
```

**Propósito**: Confía en el primer proxy para headers como `X-Forwarded-For`, necesario para aplicaciones detrás de reverse proxies.

## Estrategia de Autenticación Passport

### Configuración LocalStrategy

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

#### Flujo de autenticación:

1. **Búsqueda de usuario**: Por username en la base de datos
2. **Verificación de contraseña**: Usando comparación timing-safe
3. **Resultado**: Usuario válido o `false` para credenciales incorrectas

### Serialización de Usuarios

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

#### Propósito:

- **serializeUser**: Almacena solo el ID del usuario en la sesión
- **deserializeUser**: Recupera el usuario completo por ID en cada request

## Rutas de Autenticación

### Ruta de Registro

```typescript
app.post("/api/register", async (req, res, next) => {
  // 1. Verificar usuario existente
  const existingUser = await storage.getUserByUsername(req.body.username);
  if (existingUser) {
    return res.status(400).send("Username already exists");
  }

  // 2. Gestión de planes
  const selectedPlan = req.body.selectedPlan || 'free';
  let plan = plans.find(p => p.name.toLowerCase() === selectedPlan.toLowerCase());
  
  // 3. Crear organización
  const organizationData: InsertOrganization = {
    name: req.body.organizationName || `${req.body.name}'s Organization`,
    planId: plan.id,
    subscriptionStatus: selectedPlan.toLowerCase() === 'free' ? 'active' : 'trial',
    // ... otros campos
  };
  
  // 4. Crear usuario
  const userPayload = {
    ...req.body,
    password: await hashPassword(req.body.password),
    organizationId: newOrganization.id,
    role: req.body.role || 'Security Analyst'
  };
  
  // 5. Login automático
  req.login(user, (err) => {
    if (err) return next(err);
    res.status(201).json({ user, organization: newOrganization });
  });
});
```

#### Características del registro:

1. **Verificación de duplicados**: Evita usernames duplicados
2. **Gestión automática de planes**: Asigna plan seleccionado o Free por defecto
3. **Creación de organización**: Cada usuario tiene su propia organización
4. **Login automático**: Usuario queda autenticado inmediatamente
5. **Configuración por defecto**: Tema, idioma y notificaciones

#### Ejemplo de payload de registro:
```json
{
  "name": "Juan Pérez",
  "username": "juan.perez",
  "email": "juan@empresa.com",
  "password": "password123",
  "organizationName": "Empresa SOC",
  "selectedPlan": "premium",
  "role": "Security Analyst"
}
```

### Ruta de Login

```typescript
app.post("/api/login", passport.authenticate("local"), async (req, res) => {
  // Guardar usuario en sesión explícitamente
  (req.session as any).user = req.user;
  
  req.session.save(async (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error de sesión' });
    }
    
    // Obtener organización del usuario
    const organization = await storage.getOrganization(req.user.organizationId);
    
    return res.status(200).json({
      user: req.user,
      organization,
      sessionID: req.sessionID
    });
  });
});
```

#### Características del login:

1. **Autenticación Passport**: Usa la LocalStrategy configurada
2. **Persistencia de sesión**: Fuerza el guardado de la sesión
3. **Datos de organización**: Incluye información completa de la organización
4. **Session ID**: Para debugging y troubleshooting

#### Ejemplo de respuesta exitosa:
```json
{
  "user": {
    "id": 1,
    "username": "juan.perez",
    "name": "Juan Pérez",
    "email": "juan@empresa.com",
    "role": "Security Analyst",
    "organizationId": 1
  },
  "organization": {
    "id": 1,
    "name": "Empresa SOC",
    "planId": 2,
    "subscriptionStatus": "active"
  },
  "sessionID": "s:abc123def456..."
}
```

### Ruta de Logout

```typescript
app.post("/api/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.sendStatus(200);
  });
});
```

#### Funcionalidad:
- **Limpia la sesión**: Elimina datos de usuario de la sesión
- **Mantiene la cookie**: La cookie de sesión permanece para posible reutilización
- **Response mínima**: Solo código de estado 200

### Ruta de Verificación de Usuario

```typescript
app.get("/api/user", async (req, res) => {
  // Verificación detallada con logging
  console.log(`Sesión: ${req.sessionID}, autenticado: ${req.isAuthenticated()}`);
  
  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'No autenticado',
      details: 'La sesión no está activa o ha expirado'
    });
  }
  
  // Obtener organización asociada
  const organization = await storage.getOrganization(req.user.organizationId);
  
  res.json({
    user: req.user,
    organization: organization || null
  });
});
```

#### Características:

1. **Logging detallado**: Para debugging de problemas de sesión
2. **Verificación robusta**: Múltiples checks de autenticación
3. **Datos completos**: Usuario + organización
4. **Graceful degradation**: Funciona aunque falle la carga de organización

## Middleware de Autenticación

### Middleware checkAuth

```typescript
export const checkAuth: import("express").RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};
```

#### Uso del middleware:

```typescript
// Proteger una ruta específica
app.get("/api/protected", checkAuth, (req, res) => {
  res.json({ data: "Datos protegidos", user: req.user });
});

// Proteger múltiples rutas
app.use("/api/admin", checkAuth);
app.get("/api/admin/users", (req, res) => {
  // Esta ruta requiere autenticación
});
```

## Consideraciones de Seguridad

### Contraseñas
1. **Algoritmo robusto**: scrypt es resistente a ataques modernos
2. **Salt único**: Previene ataques de rainbow table
3. **Timing-safe comparison**: Evita ataques de timing
4. **Longitud mínima**: Considerar validación de complejidad

### Sesiones
1. **Secret fuerte**: Usar variable de entorno en producción
2. **HTTPS en producción**: `secure: true` para cookies
3. **Rotación de secretos**: Cambiar SESSION_SECRET periódicamente
4. **Expiración**: 30 días puede ser demasiado para datos sensibles

### Headers de Seguridad
```typescript
// Recomendado agregar en producción
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

## Troubleshooting

### Problemas Comunes

#### Sesión no persiste
```typescript
// Verificar configuración de cookies
app.set("trust proxy", 1); // Si está detrás de proxy
cookie: { secure: false } // En desarrollo sin HTTPS
```

#### Usuario no encontrado después del login
```typescript
// Verificar deserializeUser
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(new Error('User not found'));
    }
    done(null, user);
  } catch (err) {
    done(err);
  }
});
```

#### Error de CORS en login
```typescript
// Verificar configuración CORS
app.use(cors({ 
  origin: process.env.CLIENT_URL,
  credentials: true // Importante para cookies
}));
```

### Logs de Debugging

El sistema incluye logging detallado:

```typescript
console.log(`Sesión creada: ${req.sessionID} para usuario ${req.user.username}`);
console.log(`Cookie de sesión presente: ${Boolean(req.headers.cookie)}`);
```

## Ejemplos de Uso

### Cliente Frontend (JavaScript)

```javascript
// Login
const response = await fetch('/api/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Importante para cookies
  body: JSON.stringify({
    username: 'juan.perez',
    password: 'password123'
  })
});

// Verificar usuario actual
const userResponse = await fetch('/api/user', {
  credentials: 'include'
});

// Logout
await fetch('/api/logout', {
  method: 'POST',
  credentials: 'include'
});
```

### Uso del Middleware

```typescript
import { checkAuth } from './auth';

// Rutas protegidas
app.get("/api/alerts", checkAuth, async (req, res) => {
  // req.user está disponible y autenticado
  const alerts = await storage.getAlertsByOrganization(req.user.organizationId);
  res.json(alerts);
});
```

## Mejores Prácticas

1. **Variables de entorno**: Usar `SESSION_SECRET` fuerte en producción
2. **HTTPS**: Obligatorio en producción con `secure: true`
3. **Validación**: Implementar validación robusta de inputs
4. **Rate limiting**: Agregar límites a las rutas de login
5. **Audit logs**: Registrar intentos de login y cambios de contraseña
6. **Expiración de sesiones**: Considerar timeouts más cortos para datos sensibles