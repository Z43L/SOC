# Documentación Completa del Servidor SOC

Esta documentación proporciona una guía completa y detallada de todos los componentes del servidor del Sistema de Operaciones de Ciberseguridad (SOC), incluyendo explicaciones detalladas, ejemplos de código, y mejores prácticas.

## Índice de Documentación

### 📋 Archivos Principales del Servidor

| Archivo | Descripción | Documentación |
|---------|-------------|---------------|
| **index.ts** | Punto de entrada principal del servidor | [📖 Ver documentación](./index.md) |
| **database** | Sistema de base de datos y inicialización | [📖 Ver documentación](./database.md) |
| **authentication** | Sistema de autenticación y sesiones | [📖 Ver documentación](./authentication.md) |
| **routing** | Sistema de rutas y API endpoints | [📖 Ver documentación](./routing.md) |
| **websockets** | Comunicación en tiempo real | [📖 Ver documentación](./websockets.md) |
| **storage** | Capa de abstracción de datos | [📖 Ver documentación](./storage.md) |
| **vite-config** | Configuración de desarrollo y build | [📖 Ver documentación](./vite-config.md) |
| **ai-services** | Servicios de inteligencia artificial | [📖 Ver documentación](./ai-services.md) |

### 🔧 Integraciones y Servicios

| Componente | Descripción | Documentación |
|------------|-------------|---------------|
| **integrations** | Servicios de integración externos | [📖 Ver documentación](./integrations/overview.md) |

## Arquitectura General del Servidor

### Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vite + React)                  │
├─────────────────────────────────────────────────────────────┤
│                     Express.js Server                       │
├─────────────────────────────────────────────────────────────┤
│  Authentication  │  Routes  │  WebSocket  │  AI Services   │
├─────────────────────────────────────────────────────────────┤
│                     Storage Layer                           │
├─────────────────────────────────────────────────────────────┤
│                  PostgreSQL Database                        │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de Datos Principal

```
1. Cliente → Authentication → Routes → Storage → Database
2. External Sources → Connectors → Enrichment → Storage
3. Alerts → AI Analysis → Insights → Notification
4. Events → WebSocket → Real-time Updates → Cliente
```

## Guía de Inicio Rápido

### 1. Configuración del Entorno

```bash
# Clonar repositorio
git clone <repository-url>
cd SOC

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
```

### 2. Variables de Entorno Esenciales

```bash
# Base de datos
DATABASE_URL="postgresql://user:password@localhost:5432/soc_db"

# Autenticación
SESSION_SECRET="your-session-secret-here"

# URLs
CLIENT_URL="http://localhost:5173"

# Servicios externos (opcional)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
STRIPE_SECRET_KEY="sk_..."
```

### 3. Inicialización

```bash
# Ejecutar migraciones de base de datos
npm run db:push

# Inicializar datos de prueba (desarrollo)
npm run dev:init

# Iniciar servidor de desarrollo
npm run dev
```

## Componentes Clave del Sistema

### 🎯 Punto de Entrada ([index.ts](./index.md))

**Responsabilidades:**
- Inicialización del servidor Express
- Configuración de middleware (CORS, sessions, logging)
- Configuración de WebSockets
- Inicialización de servicios SOAR
- Gestión de workers y schedulers

**Características principales:**
- Graceful degradation de servicios
- Hot Module Replacement en desarrollo
- Error handling global
- Logging personalizado

### 🗄️ Sistema de Base de Datos ([database.md](./database.md))

**Componentes:**
- **db.ts**: Configuración de Drizzle ORM y PostgreSQL
- **db-init.ts**: Inicialización con datos de prueba

**Características:**
- Type-safe queries con Drizzle ORM
- Connection pooling automático
- Hashing seguro de contraseñas con scrypt
- Datos de prueba para desarrollo

### 🔐 Sistema de Autenticación ([authentication.md](./authentication.md))

**Características:**
- Passport.js con estrategia local
- Sesiones persistentes en PostgreSQL
- Registro automático con organizaciones
- Middleware de autenticación robusto
- Multi-tenancy por organización

### 🛣️ Sistema de Rutas ([routing.md](./routing.md))

**Endpoints principales:**
- `/api/agents/*` - Gestión de agentes (sin auth)
- `/api/alerts/*` - Gestión de alertas
- `/api/incidents/*` - Gestión de incidentes
- `/api/ai/*` - Servicios de IA
- `/api/connectors/*` - Gestión de conectores
- `/api/metrics/*` - Métricas y analytics

**Patrones implementados:**
- Organization scoping
- Paginación consistente
- Error handling estructurado
- Rate limiting

### 🔄 Comunicación en Tiempo Real ([websockets.md](./websockets.md))

**Tecnologías:**
- Socket.IO para comunicación general
- WebSocket nativo para conectores
- Rate limiting por IP
- Endpoints especializados

**Funcionalidades:**
- Actualizaciones de dashboard en tiempo real
- Notificaciones push de alertas
- Ingesta de datos de conectores
- Monitoreo de agentes

### 🗃️ Capa de Almacenamiento ([storage.md](./storage.md))

**Patrón Repository:**
- Interfaz IStorage para abstracción
- Implementación con Drizzle ORM
- Multi-tenancy por organización
- Operaciones CRUD tipadas

**Optimizaciones:**
- Paginación eficiente
- Caching estratégico
- Bulk operations
- Indexación optimizada

### ⚙️ Configuración de Desarrollo ([vite-config.md](./vite-config.md))

**Entornos:**
- **Desarrollo**: Vite dev server con HMR
- **Producción**: Archivos estáticos optimizados

**Características:**
- Hot Module Replacement
- Cache busting automático
- SPA fallback routing
- Asset optimization

### 🤖 Servicios de IA ([ai-services.md](./ai-services.md))

**Proveedores soportados:**
- OpenAI (GPT-4, GPT-4-turbo)
- Anthropic (Claude 3)
- Selección automática de modelo

**Capacidades:**
- Análisis automático de alertas
- Correlación inteligente de incidentes
- Análisis de threat intelligence
- Detección de anomalías
- Análisis de logs y tráfico de red

### 🔗 Integraciones ([integrations/overview.md](./integrations/overview.md))

**Categorías de integración:**
- **AI Services**: Parseo, correlación, análisis
- **Conectores**: SIEM, Cloud, Network, Endpoint
- **Enriquecimiento**: Threat feeds, geolocation
- **Automatización**: Playbooks SOAR, scheduling
- **Servicios externos**: Stripe, LLM providers
- **Gestión**: Logging, agentes, artefactos

## Patrones de Diseño Implementados

### 1. **Multi-Tenancy**
Aislamiento completo de datos por organización en todas las capas del sistema.

### 2. **Repository Pattern**
Abstracción de la capa de datos para facilitar testing y intercambio de implementaciones.

### 3. **Plugin Architecture**
Integraciones modulares que se pueden cargar dinámicamente.

### 4. **Event-Driven Architecture**
Comunicación asíncrona entre servicios mediante eventos.

### 5. **Circuit Breaker**
Protección contra fallos de servicios externos con degradación elegante.

### 6. **Observer Pattern**
WebSockets y system events para actualizaciones en tiempo real.

## Consideraciones de Seguridad

### 🛡️ Autenticación y Autorización
- Hashing seguro de contraseñas (scrypt)
- Sesiones seguras con expiración
- CORS configurado correctamente
- Rate limiting en endpoints sensibles

### 🔒 Aislamiento de Datos
- Multi-tenancy estricto por organización
- Validación de permisos en todas las operaciones
- Sanitización de inputs
- Logging de auditoría

### 🌐 Comunicación Segura
- HTTPS obligatorio en producción
- Validación de certificados
- Headers de seguridad
- Protección CSRF

## Performance y Escalabilidad

### 📊 Optimizaciones Implementadas
- Connection pooling para base de datos
- Caching estratégico de queries frecuentes
- Paginación en todas las listas
- Índices optimizados en base de datos
- Procesamiento asíncrono de tareas pesadas

### 📈 Métricas y Monitoreo
- Logging estructurado para análisis
- Métricas de performance de endpoints
- Monitoreo de recursos del sistema
- Alertas automáticas por umbrales

## Troubleshooting

### 🔍 Problemas Comunes

#### Error de Conexión a Base de Datos
```bash
# Verificar configuración
echo $DATABASE_URL

# Probar conexión
npm run db:check
```

#### Problemas de Autenticación
```bash
# Verificar configuración de sesiones
echo $SESSION_SECRET

# Limpiar sesiones
npm run sessions:clear
```

#### WebSocket No Conecta
- Verificar configuración CORS
- Comprobar que el servidor HTTP está iniciado
- Validar que no hay proxies bloqueando WebSockets

### 📋 Logs Útiles

```bash
# Logs del servidor
tail -f logs/server.log

# Logs de base de datos
tail -f logs/database.log

# Logs de integraciones
tail -f logs/integrations.log
```

## Desarrollo y Contribución

### 🚀 Entorno de Desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev

# Compilación TypeScript
npm run tsc

# Linting
npm run lint

# Testing
npm run test
```

### 📝 Convenciones de Código

- **TypeScript strict mode** habilitado
- **ESLint** para calidad de código
- **Prettier** para formato consistente
- **Conventional Commits** para mensajes de commit

### 🧪 Testing

```bash
# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Coverage
npm run test:coverage
```

## Roadmap y Mejoras Futuras

### 🎯 Próximas Características
- [ ] Soporte para más proveedores de IA
- [ ] Integración con más SIEM platforms
- [ ] Dashboard personalizable
- [ ] Reportes automatizados
- [ ] API GraphQL
- [ ] Microservicios architecture

### 🔧 Optimizaciones Planeadas
- [ ] Caching distribuido con Redis
- [ ] Queue system con Bull/BullMQ
- [ ] Horizontal scaling
- [ ] Performance monitoring mejorado

## Recursos Adicionales

### 📚 Documentación Externa
- [Express.js Documentation](https://expressjs.com/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Passport.js Documentation](http://www.passportjs.org/)

### 🛠️ Herramientas de Desarrollo
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [PostgreSQL](https://www.postgresql.org/)
- [Node.js](https://nodejs.org/)

---

Esta documentación está en constante evolución. Para contribuir o reportar errores, por favor crear un issue en el repositorio del proyecto.