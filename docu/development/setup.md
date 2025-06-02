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

### 4. Variables de Entorno

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

### 5. Inicialización de la Base de Datos

```bash
# Ejecutar migraciones
npm run db:push

# Opcional: Poblar con datos de prueba
npm run db:seed  # (si existe script)
```

## Scripts de Desarrollo

### Comandos Principales

```bash
# Desarrollo con hot reload
npm run dev

# Verificar tipos TypeScript
npm run check

# Construir proyecto
npm run build

# Ejecutar tests
npm run test

# Linting
npm run lint  # (si existe)
```

### Scripts Específicos

```bash
# Solo backend
npm run dev:server

# Solo frontend  
npm run dev:client

# Signature Hub (si necesario)
npm run sig-hub

# Agentes (desarrollo)
cd agents && npm run dev
```

## Estructura de Desarrollo

### Flujo de Trabajo Típico

1. **Feature Branch**: Crear rama desde `main`
2. **Desarrollo**: Implementar funcionalidad
3. **Testing**: Ejecutar tests localmente
4. **Build**: Verificar que construye correctamente
5. **PR**: Crear Pull Request

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