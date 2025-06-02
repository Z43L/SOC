# Guía de Configuración para Desarrolladores

## Requisitos Previos

### Software Necesario
- **Node.js**: v18+ (recomendado v20+)
- **npm**: v9+ (incluido con Node.js)
- **PostgreSQL**: v14+ para base de datos
- **Redis**: v6+ para cola de trabajos
- **Git**: Para control de versiones
- **Docker** (opcional): Para contenedores

### Sistemas Operativos Soportados
- **Windows**: 10/11 con WSL2 recomendado
- **macOS**: 11+ (Intel/Apple Silicon)
- **Linux**: Ubuntu 20.04+, CentOS 8+, etc.

## Configuración del Entorno Local

### 1. Clonación del Repositorio

```bash
git clone https://github.com/Z43L/SOC.git
cd SOC
```

### 2. Instalación de Dependencias

```bash
# Instalar dependencias del proyecto principal
npm install

# Instalar dependencias de agentes
cd agents && npm install && cd ..
```

### 3. Configuración de la Base de Datos

#### Opción A: PostgreSQL Local

```bash
# Instalar PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Crear base de datos
sudo -u postgres createdb soc_dev
sudo -u postgres createuser soc_user
sudo -u postgres psql -c "ALTER USER soc_user PASSWORD 'soc_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE soc_dev TO soc_user;"
```

#### Opción B: Docker

```bash
# Levantar servicios con Docker Compose
docker-compose up -d postgres redis
```

### 4. Variables de Entorno - Explicación Detallada

Las variables de entorno son configuraciones que le dicen a tu aplicación cómo comportarse. Son como ajustes que puedes cambiar sin modificar el código.

Crear archivo `.env` en la raíz del proyecto:

```bash
# Base de datos
DATABASE_URL="postgresql://soc_user:soc_password@localhost:5432/soc_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="tu-clave-secreta-super-segura-aqui"

# OpenAI (opcional para funciones IA)
OPENAI_API_KEY="sk-..."

# Anthropic (opcional para funciones IA)
ANTHROPIC_API_KEY="sk-ant-..."

# Stripe (para funciones de facturación)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Email (SendGrid)
SENDGRID_API_KEY="SG..."

# Entorno
NODE_ENV="development"
PORT="3000"
```

**Explicación de cada variable**:

#### Variables de Base de Datos
```bash
DATABASE_URL="postgresql://soc_user:soc_password@localhost:5432/soc_dev"
```
**Estructura de la URL**:
- `postgresql://` - Tipo de base de datos
- `soc_user` - Usuario de la base de datos
- `soc_password` - Contraseña del usuario
- `localhost` - Dirección del servidor (local en desarrollo)
- `5432` - Puerto donde corre PostgreSQL
- `soc_dev` - Nombre de la base de datos

**¿Por qué usar variables de entorno?**:
- En desarrollo: `localhost:5432`
- En producción: `mi-servidor-produccion.com:5432`
- Solo cambias la variable, no el código

#### Variables de Cache
```bash
REDIS_URL="redis://localhost:6379"
```
**¿Qué es Redis?**: Base de datos en memoria muy rápida para:
- Cache de datos frecuentemente accedidos
- Sesiones de usuario
- Colas de trabajos en segundo plano

#### Variables de Seguridad
```bash
JWT_SECRET="tu-clave-secreta-super-segura-aqui"
```
**¿Qué es JWT?**: JSON Web Token - sistema para autenticar usuarios
**JWT_SECRET**: Clave secreta para firmar tokens de autenticación
**⚠️ IMPORTANTE**: Esta clave debe ser:
- Completamente secreta
- Diferente en cada entorno
- Al menos 32 caracteres aleatorios

**Ejemplo de generación segura**:
```bash
# En Linux/Mac
openssl rand -base64 32

# Resultado ejemplo:
# K8n2vX9mR7qP4wY6tZ3sA5bN8cL9dF2gH1jK3mQ7rT8u
```

#### Variables de Inteligencia Artificial
```bash
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
```
**¿Para qué se usan?**:
- Análisis automático de alertas de seguridad
- Generación de reportes inteligentes
- Detección de anomalías con IA
- Respuestas automatizadas a incidentes

**¿Cómo obtener las claves?**:
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/

#### Variables de Pagos
```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
```
**¿Para qué se usan?**: Sistema de suscripciones y facturación
- `sk_test_`: Clave secreta para desarrollo (servidor)
- `pk_test_`: Clave pública para desarrollo (frontend)
- En producción usan `sk_live_` y `pk_live_`

#### Variables de Email
```bash
SENDGRID_API_KEY="SG..."
```
**¿Para qué se usa?**: Envío de emails automáticos:
- Notificaciones de alertas críticas
- Reportes por email
- Invitaciones de usuarios
- Confirmaciones de registro

### 5. Inicialización de la Base de Datos - Paso a Paso

```bash
# Ejecutar migraciones
npm run db:push
```

**¿Qué son las migraciones?**: Scripts que crean o modifican la estructura de la base de datos

**Ejemplo de lo que hace internamente**:
```sql
-- Crear tabla de usuarios
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de alertas
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**¿Por qué usar migraciones?**:
- Todos los desarrolladores tienen la misma estructura de base de datos
- Cambios se aplican de forma controlada
- Historial de cambios en la base de datos
- Se pueden deshacer si hay problemas

```bash
# Opcional: Poblar con datos de prueba
npm run db:seed  # (si existe script)
```

**¿Qué hace el seed?**: Añade datos de ejemplo para desarrollo
**Ejemplo de datos de prueba**:
```javascript
// Usuarios de prueba
const testUsers = [
  { name: 'Admin', email: 'admin@soc.com', role: 'Administrator' },
  { name: 'Analista', email: 'analista@soc.com', role: 'Security Analyst' }
];

// Alertas de prueba
const testAlerts = [
  { title: 'Intento de login sospechoso', severity: 'high' },
  { title: 'Actualización de software', severity: 'low' }
];
```

## Scripts de Desarrollo - Guía Completa para Principiantes

### Comandos Principales Explicados

#### Desarrollo con Hot Reload
```bash
npm run dev
```
**¿Qué hace?**: Inicia el servidor en modo desarrollo
**Hot Reload**: Cuando cambias código, automáticamente:
1. Detecta el cambio
2. Recompila el código
3. Recarga la aplicación
4. No pierdes el estado de la aplicación

**Ejemplo práctico**:
```javascript
// Cambias esto en tu código:
const mensaje = "Hola Mundo";

// Lo guardas y automáticamente ves:
const mensaje = "Hola Mundo Actualizado";
// Sin tener que parar y reiniciar el servidor
```

**Lo que verás en la consola**:
```
> rest-express@1.0.0 dev
> tsx server/index.ts

[Server] Starting on port 3000...
[Database] Connected successfully
[WebSocket] Initialized
Ready on http://localhost:3000
```

#### Verificación de Tipos
```bash
npm run check
```
**¿Qué hace?**: Verifica que tu código TypeScript esté correcto
**Antes de hacer commit**: Siempre ejecuta esto para evitar errores

**Ejemplo de errores que detecta**:
```typescript
// ❌ Error - tipo incorrecto
const edad: number = "25"; // String en lugar de number

// ❌ Error - propiedad no existe
const usuario = { nombre: "Juan" };
console.log(usuario.email); // 'email' no existe

// ✅ Correcto
const edad: number = 25;
const usuario = { nombre: "Juan", email: "juan@email.com" };
console.log(usuario.email);
```

#### Construcción del Proyecto
```bash
npm run build
```
**¿Qué hace?**: Prepara tu código para producción
**Proceso interno**:
1. **Compilación**: TypeScript → JavaScript
2. **Optimización**: Minimiza archivos, elimina código no usado
3. **Bundling**: Combina múltiples archivos en uno
4. **Creación**: Carpeta `dist/` con archivos optimizados

**Antes y después**:
```javascript
// Tu código (development):
import { validarEmail } from './utils/validacion';
import { conectarBaseDatos } from './database/conexion';

// Después del build (production):
// Archivo minificado, optimizado y comprimido
function validarEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}
// ... todo en archivos compactos
```

#### Testing
```bash
npm run test
```
**¿Qué hace?**: Ejecuta pruebas automatizadas
**¿Por qué son importantes las pruebas?**:
- Detectan errores antes de llegar a producción
- Aseguran que cambios no rompan funcionalidad existente
- Documentan cómo debe comportarse el código

**Ejemplo de prueba**:
```javascript
// Archivo: test/usuarios.test.js
describe('Validación de usuarios', () => {
  test('debe validar email correcto', () => {
    expect(validarEmail('juan@email.com')).toBe(true);
  });
  
  test('debe rechazar email incorrecto', () => {
    expect(validarEmail('email-inválido')).toBe(false);
  });
});
```

### Scripts Específicos por Componente

#### Solo Backend
```bash
npm run dev:server
```
**Cuándo usarlo**: Cuando trabajas solo en la lógica del servidor
**Ventajas**:
- Arranque más rápido
- Menos consumo de memoria
- Foco en APIs sin interfaz

#### Solo Frontend
```bash
npm run dev:client
```
**Cuándo usarlo**: Cuando trabajas solo en la interfaz de usuario
**Requisito**: El backend debe estar corriendo en otra terminal

**Configuración típica**:
```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend  
npm run dev:client
```

#### Signature Hub
```bash
npm run sig-hub
```
**¿Qué es?**: Servicio especializado para análisis de firmas de malware
**Cuándo usarlo**: Desarrollo de funciones de detección de amenazas

#### Desarrollo de Agentes
```bash
cd agents && npm run dev
```
**¿Qué son los agentes?**: Programas que se instalan en computadoras para recopilar datos de seguridad
**Estructura del desarrollo**:
```bash
# Terminal 1 - Servidor principal
npm run dev

# Terminal 2 - Agentes
cd agents
npm run dev

# Terminal 3 - Pruebas de agente
cd agents
npm run test:windows  # o test:linux, test:macos
```

## Estructura de Desarrollo - Flujo Completo

### Flujo de Trabajo Típico para Principiantes

#### 1. Crear Feature Branch
```bash
# Actualizar rama principal
git checkout main
git pull origin main

# Crear nueva rama para tu funcionalidad
git checkout -b feature/mi-nueva-funcionalidad
```
**¿Por qué usar ramas?**: Permite trabajar en nuevas funciones sin afectar el código principal

#### 2. Desarrollo Local
```bash
# Iniciar desarrollo
npm run dev

# En otra terminal - verificar tipos constantemente
npm run check

# Hacer cambios en el código...
# Guardar archivos...
# Ver cambios automáticamente en el navegador
```

#### 3. Testing Continuo
```bash
# Ejecutar tests después de cada cambio importante
npm run test

# Si hay errores, corregir y repetir
npm run test -- --watch  # modo observación
```

#### 4. Verificación Final
```bash
# Verificar que todo compila
npm run build

# Verificar tipos
npm run check

# Ejecutar todos los tests
npm run test

# Si todo está verde ✅, continuar
```

#### 5. Commit y Push
```bash
# Añadir cambios
git add .

# Commit con mensaje descriptivo
git commit -m "feat: añadir validación de email en formulario usuarios"

# Subir cambios
git push origin feature/mi-nueva-funcionalidad
```

#### 6. Pull Request
1. Ir a GitHub
2. Crear Pull Request desde tu rama hacia `main`
3. Describir qué cambios hiciste
4. Esperar revisión de código
5. Corregir comentarios si los hay
6. Merge cuando esté aprobado

### Debugging

#### Backend (Node.js)
```bash
# Con VSCode debugger
npm run dev:debug

# Con Node inspector
node --inspect server/index.ts
```

#### Frontend (React)
- Usar React Developer Tools
- Chrome DevTools para network/performance
- Console logs durante desarrollo

#### Base de Datos
```bash
# Conectar a PostgreSQL
psql -h localhost -U soc_user -d soc_dev

# Ver logs de consultas (en development)
tail -f /var/log/postgresql/postgresql-*.log
```

## Testing

### Tipos de Tests

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

### Configuración de Tests

- **Framework**: Jest + Supertest
- **Database**: Test database separada
- **Mocks**: Para servicios externos (OpenAI, Stripe, etc.)

### Ejemplo de Test

```typescript
// Ejemplo: test de endpoint
describe('GET /api/alerts', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  it('should return alerts for authenticated user', async () => {
    const token = await createAuthToken();
    const response = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(response.body).toHaveProperty('alerts');
  });
});
```

## Herramientas de Desarrollo

### VSCode Extensions Recomendadas

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-docker",
    "ms-postgresql.postgresql"
  ]
}
```

### Configuración VSCode

#### `.vscode/settings.json`
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### `.vscode/launch.json`
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"]
    }
  ]
}
```

## Troubleshooting Común

### Problemas de Instalación

```bash
# Limpiar node_modules y reinstalar
rm -rf node_modules package-lock.json
npm install

# Problemas con PKG (agentes)
npm install -g pkg

# Problemas de permisos (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
```

### Problemas de Base de Datos

```bash
# Resetear migraciones
npm run db:reset

# Ver estado de migraciones
npm run db:status

# Problema de conexión
ping localhost  # verificar conectividad
netstat -an | grep 5432  # verificar puerto PostgreSQL
```

### Problemas de Redis

```bash
# Verificar Redis
redis-cli ping

# Limpiar cache Redis
redis-cli flushall
```

### Problemas de TypeScript

```bash
# Regenerar tipos
npm run types:generate

# Verificar configuración TypeScript
npx tsc --showConfig
```

## Performance en Desarrollo

### Optimizaciones

```bash
# Usar SWC en lugar de tsc (más rápido)
npm install -D @swc/core @swc/cli

# Usar esbuild para builds rápidos
npm install -D esbuild

# Cache de TypeScript
npm install -D typescript-cached-transpile
```

### Profiling

```bash
# Profiling de Node.js
node --prof server/index.ts

# Análisis de bundle size
npm install -D webpack-bundle-analyzer
npm run analyze
```

## Contribución

### Code Style

- **Prettier**: Formateo automático
- **ESLint**: Linting de código
- **Husky**: Git hooks para calidad
- **Conventional Commits**: Formato de commits

### Pull Request Process

1. Fork del repositorio
2. Crear feature branch
3. Implementar cambios con tests
4. Pasar todos los checks de CI
5. Solicitar review de código

---

Esta guía proporciona todo lo necesario para comenzar a desarrollar en el proyecto SOC Inteligente SaaS. Para dudas específicas, consultar la documentación de cada componente en sus respectivas carpetas.