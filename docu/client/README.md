# Documentación Completa del Frontend - SOC Inteligente

Esta documentación proporciona una guía completa del frontend de la aplicación SOC Inteligente SaaS, detallando cada página, componente, hook y patrón de desarrollo utilizado.

## 📋 Índice de Documentación

### 📁 Documentos Principales

| Documento | Descripción | Contenido |
|-----------|-------------|-----------|
| **[overview.md](./overview.md)** | Arquitectura general y fundamentos | Propósito, stack tecnológico, patrones de arquitectura, gestión de estado |
| **[pages.md](./pages.md)** | Documentación de páginas | Todas las páginas principales con ejemplos de código |
| **[components.md](./components.md)** | Documentación de componentes | Componentes reutilizables organizados por categorías |
| **[hooks.md](./hooks.md)** | Hooks y contexts | Hooks personalizados y contexts de React |
| **[utils.md](./utils.md)** | Utilidades y configuración | Archivos de configuración, utilidades, schemas y constantes |

## 🏗️ Arquitectura del Frontend

### Stack Tecnológico
- **Framework**: React 18 con TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **Styling**: Tailwind CSS + Shadcn/UI
- **Estado del Servidor**: TanStack React Query
- **Autenticación**: Context API con JWT
- **UI Components**: Shadcn/UI + Radix UI

### Estructura del Proyecto
```
client/src/
├── components/          # Componentes UI reutilizables
│   ├── ui/             # Componentes base de Shadcn/UI
│   ├── layout/         # Componentes de layout
│   ├── dashboard/      # Componentes específicos del dashboard
│   ├── alerts/         # Componentes de alertas
│   └── ...            # Otros componentes por funcionalidad
├── pages/              # Páginas principales de la aplicación
├── hooks/              # Hooks personalizados de React
├── contexts/           # Contextos de React para estado global
├── lib/                # Utilidades y configuraciones
├── App.tsx             # Componente principal de la aplicación
├── main.tsx            # Punto de entrada
└── index.css           # Estilos globales
```

## 📄 Páginas Documentadas

La aplicación SOC incluye las siguientes páginas principales:

| Página | Archivo | Propósito |
|--------|---------|-----------|
| **Dashboard** | `pages/dashboard.tsx` | Panel principal de control con métricas y resúmenes |
| **Alerts** | `pages/alerts.tsx` | Gestión de alertas de seguridad |
| **Incidents** | `pages/incidents.tsx` | Gestión de incidentes de seguridad |
| **Threat Intelligence** | `pages/threat-intelligence.tsx` | Inteligencia de amenazas y feeds |
| **Analytics** | `pages/analytics.tsx` | Análisis y métricas avanzadas |
| **Reports** | `pages/reports.tsx` | Generación de reportes |
| **Users** | `pages/users.tsx` | Gestión de usuarios |
| **Configuration** | `pages/configuration.tsx` | Configuración del sistema |
| **Settings** | `pages/settings.tsx` | Configuración personal |

> 📖 **Detalles completos en [pages.md](./pages.md)**

## 🧩 Componentes Documentados

### Categorías de Componentes

#### Layout Components
- **Sidebar**: Navegación lateral principal
- **MainContent**: Contenedor de páginas

#### UI Components (Shadcn/UI)
- **Button**: Botones con múltiples variantes
- **Dialog**: Modales y diálogos
- **DataTable**: Tablas avanzadas con filtrado y ordenamiento
- **Form**: Componentes de formulario con validación

#### Dashboard Components
- **MetricCard**: Tarjetas de métricas con tendencias
- **ThreatDetectionChart**: Gráficos de detección
- **AIInsights**: Insights generados por IA
- **RecentAlerts**: Lista de alertas recientes

#### Specialized Components
- **AlertDetail**: Detalles de alertas
- **GroupAlertsDialog**: Agrupación de alertas
- **ThreatMap**: Mapas de amenazas

> 📖 **Detalles completos en [components.md](./components.md)**

## 🎣 Hooks y Contexts Documentados

### Custom Hooks
- **useAuth**: Gestión de autenticación
- **useWebSocket**: Conexiones WebSocket con reconexión
- **useMobile**: Detección de dispositivos móviles
- **useToast**: Sistema de notificaciones
- **useAnalytics**: Tracking de analytics
- **useBilling**: Gestión de facturación

### React Contexts
- **TenantContext**: Multi-tenancy y permisos

> 📖 **Detalles completos en [hooks.md](./hooks.md)**

## 🎨 Patrones de Diseño

### 1. **Protected Routes**
```typescript
<ProtectedRoute 
  path="/dashboard" 
  component={() => <Dashboard user={userInfo} organization={organization} />} 
/>
```

### 2. **Context Pattern**
```typescript
<AuthProvider>
  <TenantProvider>
    <App />
  </TenantProvider>
</AuthProvider>
```

### 3. **Compound Components**
```typescript
<Card>
  <CardHeader>
    <CardTitle>Título</CardTitle>
  </CardHeader>
  <CardContent>
    Contenido
  </CardContent>
</Card>
```

### 4. **Custom Hooks**
```typescript
const { user, login, logout } = useAuth();
const { toast } = useToast();
const { isConnected, send } = useWebSocket('/ws/alerts');
```

## 🔧 Gestión de Estado

### Estado del Servidor (React Query)
- **Caché automático**: Caché inteligente de respuestas API
- **Sincronización**: Sincronización automática con servidor
- **Background updates**: Actualizaciones en background
- **Error handling**: Manejo consistente de errores

### Estado Global (Context API)
- **Autenticación**: Estado de usuario autenticado
- **Multi-tenancy**: Contexto de organización
- **Configuración**: Preferencias de usuario

### Estado Local (useState/useReducer)
- **Form state**: Estado de formularios
- **UI state**: Estado de componentes UI
- **Component state**: Estado específico de componente

## 🛡️ Seguridad Frontend

### Autenticación
- **JWT Tokens**: Tokens seguros con expiración
- **Protected Routes**: Rutas protegidas por autenticación
- **Auto-refresh**: Renovación automática de tokens

### Validación
- **Zod Schemas**: Validación de tipos en runtime
- **Form Validation**: Validación de formularios client-side
- **API Validation**: Validación de respuestas API

### XSS Protection
- **Sanitización**: Sanitización automática de inputs
- **CSP Headers**: Content Security Policy
- **Safe Rendering**: Renderizado seguro de contenido dinámico

## ⚡ Performance

### Code Splitting
- **Lazy Loading**: Carga perezosa de componentes
- **Route Splitting**: División por rutas
- **Component Splitting**: División de componentes grandes

### Optimizaciones React
- **useMemo**: Memoización de cálculos costosos
- **useCallback**: Memoización de funciones
- **React.memo**: Memoización de componentes

### Build Optimizations
- **Tree Shaking**: Eliminación de código no utilizado
- **Bundle Splitting**: División de bundles
- **Asset Optimization**: Optimización de recursos

## 🎯 Tecnologías de UI

### Tailwind CSS
- **Utility-first**: Clases utilitarias para estilos
- **Responsive design**: Diseño responsive built-in
- **Dark mode**: Soporte para modo oscuro

### Shadcn/UI
- **Componentes pre-construidos**: Componentes listos para usar
- **Accesibilidad**: Componentes accesibles por defecto
- **Personalización**: Altamente personalizable

### Radix UI
- **Primitivos**: Componentes primitivos de bajo nivel
- **Accesibilidad**: WAI-ARIA compliant
- **Headless**: Sin estilos, solo funcionalidad

## 🔗 Enlaces Relacionados

- **[Documentación de Servidor](../server/)** - Documentación del backend
- **[Documentación de API](../api/)** - Endpoints REST disponibles
- **[Documentación de Base de Datos](../database/)** - Esquema y modelos
- **[Guía de Desarrollo](../development/)** - Setup y desarrollo local

## 📝 Ejemplos Prácticos

### Crear una Nueva Página
1. Crear el archivo en `client/src/pages/`
2. Definir las props interface
3. Implementar el componente con layout estándar
4. Añadir la ruta en `App.tsx`
5. Documentar en `pages.md`

### Crear un Nuevo Componente
1. Crear el archivo en la carpeta apropiada de `client/src/components/`
2. Definir las props interface con TypeScript
3. Implementar el componente con Tailwind CSS
4. Añadir export en el índice si es necesario
5. Documentar en `components.md`

### Crear un Hook Personalizado
1. Crear el archivo en `client/src/hooks/`
2. Definir el interface de retorno
3. Implementar la lógica del hook
4. Añadir tests si es necesario
5. Documentar en `hooks.md`

## 🤝 Contribución

Para contribuir a esta documentación:

1. **Seguir la estructura existente** en cada archivo
2. **Incluir ejemplos de código** para cada nueva funcionalidad
3. **Mantener consistencia** en el formato y estilo
4. **Actualizar los índices** cuando se añadan nuevas secciones
5. **Verificar enlaces** entre documentos

## 📚 Recursos Adicionales

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Shadcn/UI Docs](https://ui.shadcn.com/)
- [Radix UI Docs](https://www.radix-ui.com/)
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Wouter Docs](https://github.com/molefrog/wouter)

---

*Esta documentación está en constante evolución y se actualiza con cada nueva funcionalidad del frontend.*