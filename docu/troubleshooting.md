# Guía de Solución de Problemas - SOC Inteligente SaaS

Esta guía te ayudará a resolver los problemas más comunes que puedes encontrar durante el desarrollo y despliegue del sistema SOC.

## Problemas de Configuración del Entorno

### Error: "Cannot find type definition file for 'node'"

**Síntoma**:
```bash
error TS2688: Cannot find type definition file for 'node'.
  The file is in the program because:
    Entry point of type library 'node' specified in compilerOptions
```

**Causa**: Los tipos de Node.js no están instalados correctamente.

**Solución**:
```bash
# Instalar tipos de Node.js
npm install --save-dev @types/node

# Si persiste el problema, reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

**Explicación**: TypeScript necesita definiciones de tipos para entender las APIs de Node.js. Sin estos tipos, no puede validar código que usa funciones como `process.env` o `fs.readFile`.

### Error: "Port 3000 is already in use"

**Síntoma**:
```bash
Error: listen EADDRINUSE: address already in use :::3000
```

**Causa**: Otro proceso está usando el puerto 3000.

**Soluciones**:

**Opción 1 - Encontrar y terminar el proceso**:
```bash
# En Linux/macOS
lsof -ti:3000 | xargs kill -9

# En Windows
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

**Opción 2 - Usar un puerto diferente**:
```bash
# Cambiar en .env
PORT=3001

# O usar variable de entorno
PORT=3001 npm run dev
```

**Opción 3 - Configurar puerto dinámico**:
```typescript
// En server/index.ts
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Error: "Database connection failed"

**Síntoma**:
```bash
Error: Connection terminated unexpectedly
    at Connection.<anonymous> (node_modules/pg/lib/client.js:132:73)
```

**Causas comunes y soluciones**:

**1. PostgreSQL no está corriendo**:
```bash
# Verificar estado
sudo systemctl status postgresql  # Linux
brew services list | grep postgres  # macOS
sc query postgresql-x64-14  # Windows

# Iniciar servicio
sudo systemctl start postgresql  # Linux
brew services start postgresql  # macOS
net start postgresql-x64-14  # Windows
```

**2. Credenciales incorrectas en .env**:
```bash
# Verificar DATABASE_URL en .env
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/nombre_db"

# Probar conexión manualmente
psql -h localhost -U usuario -d nombre_db
```

**3. Base de datos no existe**:
```bash
# Crear base de datos
sudo -u postgres createdb soc_dev
# O desde psql
CREATE DATABASE soc_dev;
```

**4. Permisos insuficientes**:
```sql
-- Conectar como superusuario
sudo -u postgres psql

-- Crear usuario y asignar permisos
CREATE USER soc_user WITH PASSWORD 'soc_password';
GRANT ALL PRIVILEGES ON DATABASE soc_dev TO soc_user;
ALTER USER soc_user CREATEDB;  -- Si necesita crear tablas
```

## Problemas de Build y Compilación

### Error: "Module not found" en imports

**Síntoma**:
```bash
Error: Cannot resolve module '@/components/ui/button'
```

**Causa**: Configuración incorrecta de path mapping en TypeScript.

**Solución**:
```json
// Verificar tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./client/src/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
```

**Si usas Vite, también verificar vite.config.ts**:
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared')
    }
  }
});
```

### Error: "npm run build" falla

**Síntomas comunes**:
```bash
# Error de memoria
FATAL ERROR: Ineffective mark-compacts near heap limit
# Error de tipos
Type 'string' is not assignable to type 'number'
# Error de dependencias
Module 'xyz' not found
```

**Soluciones paso a paso**:

**1. Verificar errores de TypeScript primero**:
```bash
npm run check
# Corregir todos los errores de tipos antes de hacer build
```

**2. Aumentar memoria para Node.js**:
```bash
# En package.json
"scripts": {
  "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build"
}
```

**3. Limpiar caché y reinstalar**:
```bash
rm -rf node_modules package-lock.json dist
npm install
npm run build
```

**4. Build incremental para encontrar el problema**:
```bash
# Solo backend
npm run tsc

# Solo frontend
npm run build:client

# Solo tipos
npm run check
```

## Problemas de React y Frontend

### Error: "Hydration failed"

**Síntoma**:
```bash
Warning: Text content did not match. Server: "..." Client: "..."
Error: Hydration failed because the initial UI does not match what was rendered on the server.
```

**Causa**: Diferencias entre servidor y cliente en renderizado inicial.

**Soluciones comunes**:

**1. Verificar fechas y datos dinámicos**:
```tsx
// ❌ Problemático - fecha cambia entre servidor y cliente
function Component() {
  return <div>{new Date().toLocaleString()}</div>;
}

// ✅ Correcto - usar useEffect para datos dinámicos
function Component() {
  const [currentTime, setCurrentTime] = useState('');
  
  useEffect(() => {
    setCurrentTime(new Date().toLocaleString());
  }, []);
  
  return <div>{currentTime}</div>;
}
```

**2. Verificar localStorage o sessionStorage**:
```tsx
// ❌ Problemático - no existe en el servidor
function Component() {
  const theme = localStorage.getItem('theme');
  return <div className={theme}>Content</div>;
}

// ✅ Correcto - verificar si estamos en el cliente
function Component() {
  const [theme, setTheme] = useState('light');
  
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setTheme(savedTheme);
  }, []);
  
  return <div className={theme}>Content</div>;
}
```

### Error: "Cannot read properties of undefined"

**Síntoma**:
```bash
TypeError: Cannot read properties of undefined (reading 'name')
```

**Causa**: Intentar acceder a propiedades de datos que aún no han cargado.

**Soluciones**:

**1. Usar optional chaining**:
```tsx
// ❌ Error si user es undefined
function UserProfile({ user }) {
  return <div>{user.name}</div>;
}

// ✅ Seguro con optional chaining
function UserProfile({ user }) {
  return <div>{user?.name || 'Loading...'}</div>;
}
```

**2. Usar loading states**:
```tsx
function UserProfile() {
  const { data: user, isLoading } = useQuery('/api/user');
  
  if (isLoading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;
  
  return <div>{user.name}</div>;
}
```

**3. Proporcionar valores por defecto**:
```tsx
function UserList({ users = [] }) {
  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

## Problemas de API y Backend

### Error: "CORS policy blocked"

**Síntoma**:
```bash
Access to fetch at 'http://localhost:3000/api/users' from origin 'http://localhost:5173' 
has been blocked by CORS policy
```

**Causa**: Configuración CORS incorrecta en el servidor.

**Solución**:
```typescript
// En server/index.ts
app.use(cors({
  origin: [
    'http://localhost:5173',  // Desarrollo
    'http://localhost:3000',  // Desarrollo alternativo
    'https://tudominio.com'   // Producción
  ],
  credentials: true
}));
```

**Para desarrollo dinámico**:
```typescript
const allowedOrigins = process.env.NODE_ENV === 'development' 
  ? ['http://localhost:5173', 'http://localhost:3000']
  : ['https://tudominio.com'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
```

### Error: "JWT malformed" o "Token expired"

**Síntomas**:
```bash
JsonWebTokenError: jwt malformed
TokenExpiredError: jwt expired
```

**Soluciones**:

**1. Verificar formato del token**:
```typescript
// Verificar que el token se envía correctamente
const token = localStorage.getItem('authToken');
console.log('Token:', token); // Debe ser: "eyJ..."

fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${token}` // No olvidar "Bearer "
  }
});
```

**2. Manejar expiración del token**:
```typescript
// Interceptor para tokens expirados
async function apiRequest(url, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (response.status === 401) {
    // Token expirado, redirigir a login
    localStorage.removeItem('authToken');
    window.location.href = '/auth';
    return;
  }
  
  return response;
}
```

**3. Verificar configuración JWT en servidor**:
```typescript
// Verificar JWT_SECRET en .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

// Verificar que el secreto es el mismo para firmar y verificar
const token = jwt.sign({ userId: 123 }, JWT_SECRET);
const decoded = jwt.verify(token, JWT_SECRET);
```

### Error: "Cannot set headers after they are sent"

**Síntoma**:
```bash
Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
```

**Causa**: Intentar enviar múltiples respuestas HTTP.

**Ejemplo problemático**:
```typescript
// ❌ Error - doble respuesta
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
  res.json({ error: 'Something went wrong' }); // ❌ Segunda respuesta
});
```

**Solución**:
```typescript
// ✅ Correcto - una sola respuesta
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsersFromDB();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
  // No más código después de res.json()
});
```

**Patrón de early return**:
```typescript
app.get('/api/users', async (req, res) => {
  // Validaciones con early return
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (!req.user.permissions.includes('read_users')) {
    return res.status(403).json({ error: 'No permission' });
  }
  
  // Lógica principal
  const users = await getUsersFromDB();
  res.json({ users });
});
```

## Problemas de Base de Datos

### Error: "relation does not exist"

**Síntoma**:
```bash
error: relation "users" does not exist
```

**Causa**: La tabla no existe en la base de datos.

**Soluciones**:

**1. Ejecutar migraciones**:
```bash
npm run db:push
# O si usas Drizzle específicamente
npx drizzle-kit push
```

**2. Verificar esquema de base de datos**:
```sql
-- Conectar a la base de datos
psql -h localhost -U soc_user -d soc_dev

-- Listar todas las tablas
\dt

-- Ver estructura de una tabla específica
\d users
```

**3. Recrear base de datos si es necesario**:
```bash
# CUIDADO: Esto borra todos los datos
dropdb soc_dev
createdb soc_dev
npm run db:push
```

### Error: "too many connections"

**Síntoma**:
```bash
error: sorry, too many clients already
```

**Causa**: La aplicación está creando demasiadas conexiones a PostgreSQL.

**Soluciones**:

**1. Usar connection pooling**:
```typescript
// En lugar de crear nuevas conexiones
const client = new Client({ connectionString: DATABASE_URL });
await client.connect(); // ❌ Muchas conexiones

// Usar pool de conexiones
const pool = new Pool({ 
  connectionString: DATABASE_URL,
  max: 10 // máximo 10 conexiones
});
const client = await pool.connect();
// ... usar client
client.release(); // ✅ Liberar conexión
```

**2. Configurar límites en PostgreSQL**:
```sql
-- Verificar límite actual
SHOW max_connections;

-- Aumentar límite (requiere reinicio)
ALTER SYSTEM SET max_connections = 200;
SELECT pg_reload_conf();
```

**3. Verificar conexiones activas**:
```sql
-- Ver conexiones actuales
SELECT count(*) FROM pg_stat_activity;

-- Ver conexiones por base de datos
SELECT datname, count(*) 
FROM pg_stat_activity 
GROUP BY datname;
```

## Herramientas de Debugging

### Logs Útiles para Debugging

**1. Logs de servidor**:
```typescript
// Añadir logging detallado
console.log('🔍 Request received:', {
  method: req.method,
  url: req.url,
  headers: req.headers,
  body: req.body
});
```

**2. Logs de base de datos**:
```typescript
// Log de consultas SQL
const result = await pool.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);
console.log('📊 Query executed:', {
  query: 'SELECT * FROM users WHERE id = $1',
  params: [userId],
  rowCount: result.rowCount
});
```

**3. Logs de React Query**:
```typescript
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onError: (error) => {
        console.error('❌ Query failed:', error);
      },
      onSuccess: (data) => {
        console.log('✅ Query succeeded:', data);
      }
    }
  }
});
```

### Herramientas de Desarrollo

**1. React Developer Tools**: 
- Instalar extensión de navegador
- Inspeccionar componentes y su estado
- Analizar performance de renders

**2. Network Tab**: 
- Ver todas las peticiones HTTP
- Verificar headers y payloads
- Analizar tiempos de respuesta

**3. Console debugging**:
```typescript
// Breakpoints programáticos
debugger; // Pausa ejecución aquí

// Logging condicional
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info:', someVariable);
}
```

## Checklist de Resolución de Problemas

Cuando encuentres un problema, sigue este checklist:

### ✅ Pasos Básicos
- [ ] ¿El error se reproduce consistentemente?
- [ ] ¿Has reiniciado el servidor/aplicación?
- [ ] ¿Has limpiado el caché del navegador?
- [ ] ¿Las dependencias están actualizadas? (`npm install`)

### ✅ Verificaciones de Entorno
- [ ] ¿El archivo `.env` existe y tiene las variables correctas?
- [ ] ¿PostgreSQL está corriendo?
- [ ] ¿Redis está corriendo? (si se usa)
- [ ] ¿Los puertos están disponibles?

### ✅ Verificaciones de Código
- [ ] ¿`npm run check` pasa sin errores?
- [ ] ¿`npm run build` funciona?
- [ ] ¿Los imports están correctos?
- [ ] ¿Las rutas de API existen en el servidor?

### ✅ Verificaciones de Base de Datos
- [ ] ¿La base de datos existe?
- [ ] ¿Las migraciones se han ejecutado?
- [ ] ¿Los permisos de usuario son correctos?
- [ ] ¿La cadena de conexión es válida?

Si después de seguir este checklist el problema persiste, documenta:
1. Pasos exactos para reproducir el error
2. Mensaje de error completo
3. Versión de Node.js, npm, y sistema operativo
4. Variables de entorno relevantes (sin secretos)

Esto facilitará la búsqueda de ayuda en foros o con otros desarrolladores.