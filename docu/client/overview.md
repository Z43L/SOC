# Documentación del Cliente (Frontend)

## Propósito General

El cliente frontend del SOC Inteligente SaaS es una **Single Page Application (SPA)** desarrollada en React con TypeScript. Proporciona la interfaz de usuario para administradores del SOC, permitiendo gestionar alertas, incidentes, agentes, configuraciones y análisis de seguridad.

## Arquitectura del Frontend

### Stack Tecnológico

- **Framework**: React 18 con TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (alternativa ligera a React Router)
- **Styling**: Tailwind CSS + Shadcn/UI
- **Estado del Servidor**: TanStack React Query
- **Autenticación**: Context API con JWT
- **UI Components**: Shadcn/UI + Radix UI

### Estructura del Proyecto

```
client/src/
├── components/          # Componentes UI reutilizables
│   ├── ui/             # Componentes base de Shadcn/UI
│   └── custom/         # Componentes personalizados
├── pages/              # Páginas principales de la aplicación
├── hooks/              # Hooks personalizados de React
├── contexts/           # Contextos de React para estado global
├── lib/                # Utilidades y configuraciones
├── App.tsx             # Componente principal de la aplicación
├── main.tsx            # Punto de entrada
└── index.css           # Estilos globales
```

## Documentación de Archivos Principales

### 1. main.tsx - Punto de Entrada

```typescript
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

**Propósito**: 
- **Punto de entrada** de la aplicación React
- **Renderiza** el componente App en el DOM
- **Imports globales** de estilos CSS

**Funciones**:
- `createRoot()`: API moderna de React 18 para renderizado
- `document.getElementById("root")!`: Monta la app en el elemento con id "root"

### 2. App.tsx - Componente Principal

#### Imports y Dependencias

```typescript
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
// ... importación de todas las páginas
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "./lib/protected-route";
```

**Dependencias Clave**:
- **Wouter**: Router ligero para SPA
- **React Query**: Gestión de estado del servidor
- **Toaster**: Sistema de notificaciones
- **AuthProvider**: Proveedor de autenticación
- **TenantProvider**: Contexto multi-tenant
- **ProtectedRoute**: Wrapper para rutas autenticadas

#### Componente Router

```typescript
function Router() {
  const { user } = useAuth();
  
  const organization = useMemo(() => ({
    name: user?.organizationId ? `Organization ${user.organizationId}` : "Organization",
  }), [user?.organizationId]);

  // Extract user information for the sidebar
  const userInfo = user ? {
    name: user.name,
    initials: user.name.split(' ').map(name => name[0]).join('').toUpperCase(),
    role: user.role,
  } : {
    name: '',
    initials: '',
    role: '',
  };
```

**Variables de Estado**:
- **user**: Usuario autenticado obtenido del contexto
- **organization**: Información de la organización (memoizada)
- **userInfo**: Información del usuario procesada para la UI

**Lógica de Estado**:
- **organization**: Se calcula dinámicamente basado en `organizationId`
- **userInfo**: Extrae información necesaria para la UI (nombre, iniciales, rol)
- **useMemo**: Optimización para evitar recálculos innecesarios

#### Definición de Rutas

```typescript
return (
  <Switch>
    <Route path="/" component={HomePage} />
    <ProtectedRoute path="/dashboard" component={() => <Dashboard user={userInfo} organization={organization} />} />
    <ProtectedRoute path="/alerts" component={() => <Alerts user={userInfo} organization={organization} />} />
    <ProtectedRoute path="/incident/new" component={() => <IncidentNew id="new" user={userInfo} organization={organization} />} />
    <ProtectedRoute path="/incident/:id" component={({ id }) => <Incident id={id} user={userInfo} organization={organization} />} />
    // ... más rutas
    <Route path="/billing" component={BillingPage} />
    <Route path="/auth" component={AuthPage} />
    <Route component={NotFound} />
  </Switch>
);
```

**Tipos de Rutas**:

1. **Rutas Públicas**:
   - `/`: HomePage (landing page)
   - `/auth`: Página de autenticación
   - `/billing`: Página de facturación (autenticación interna)

2. **Rutas Protegidas** (requieren autenticación):
   - `/dashboard`: Panel principal de control
   - `/alerts`: Gestión de alertas de seguridad
   - `/incidents`: Gestión de incidentes
   - `/threat-intelligence`: Inteligencia de amenazas
   - `/soar`: Security Orchestration, Automation and Response
   - `/playbooks`: Gestión de playbooks
   - `/analytics`: Análisis y métricas
   - `/reports`: Generación de reportes
   - `/users`: Gestión de usuarios
   - `/connectors`: Configuración de conectores
   - `/agents`: Gestión de agentes
   - `/settings`: Configuración del sistema

3. **Rutas Dinámicas**:
   - `/incident/:id`: Detalle de incidente específico

**Patrón de Props**:
Todas las rutas protegidas reciben:
- `user`: Información del usuario autenticado
- `organization`: Información de la organización

#### Componente App Principal

```typescript
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider 
          initialOrganizationId={null}
          initialUserRole={null}
          initialLanguage="es"
        >
          <Router />
          <Toaster />
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Jerarquía de Providers**:

1. **QueryClientProvider**: 
   - Proporciona cliente de React Query a toda la app
   - Gestiona caché y estado del servidor
   - `queryClient`: Instancia configurada en `./lib/queryClient`

2. **AuthProvider**:
   - Gestiona estado de autenticación global
   - Proporciona funciones de login/logout
   - Maneja persistencia de sesión

3. **TenantProvider**:
   - Gestiona contexto multi-tenant
   - **initialOrganizationId**: null (se establece tras autenticación)
   - **initialUserRole**: null (se establece tras autenticación)
   - **initialLanguage**: "es" (español por defecto)

4. **Router**: Componente de enrutamiento

5. **Toaster**: Sistema de notificaciones global

## Patrones de Arquitectura Implementados

### 1. **Context Pattern**
- **AuthProvider**: Estado de autenticación global
- **TenantProvider**: Contexto multi-tenant
- **Evita prop drilling**: Acceso directo desde cualquier componente

### 2. **Protected Routes Pattern**
```typescript
<ProtectedRoute 
  path="/dashboard" 
  component={() => <Dashboard user={userInfo} organization={organization} />} 
/>
```
- **Autenticación obligatoria**: Verifica sesión antes de renderizar
- **Redirección automática**: Redirige a `/auth` si no autenticado

### 3. **Compound Component Pattern**
- **Componentes Shadcn/UI**: Separación de lógica y presentación
- **Reutilización**: Componentes base reutilizables
- **Composición**: Construcción de UI compleja mediante composición

### 4. **Custom Hooks Pattern**
- **useAuth()**: Hook para acceso a contexto de autenticación
- **Encapsulación**: Lógica reutilizable encapsulada
- **Separación de responsabilidades**: Lógica separada de componentes

## Gestión de Estado

### 1. **Estado del Servidor** (React Query)
- **Caché automático**: Caché inteligente de respuestas API
- **Sincronización**: Sincronización automática con servidor
- **Background updates**: Actualizaciones en background
- **Error handling**: Manejo consistente de errores

### 2. **Estado Global** (Context API)
- **Autenticación**: Estado de usuario autenticado
- **Multi-tenancy**: Contexto de organización
- **Configuración**: Preferencias de usuario

### 3. **Estado Local** (useState/useReducer)
- **Form state**: Estado de formularios
- **UI state**: Estado de componentes UI
- **Component state**: Estado específico de componente

## Seguridad Frontend

### 1. **Autenticación**
- **JWT Tokens**: Almacenados en memoria (no localStorage)
- **Refresh tokens**: Renovación automática de sesión
- **Protected routes**: Verificación en cada ruta protegida

### 2. **Validación**
- **Client-side validation**: Validación inmediata en formularios
- **Server validation**: Validación final en servidor
- **Type safety**: TypeScript para prevenir errores

### 3. **XSS Protection**
- **Sanitización**: Sanitización de inputs
- **CSP Headers**: Content Security Policy
- **React defaults**: Protección built-in de React contra XSS

## Performance

### 1. **Code Splitting**
- **Lazy loading**: Carga lazy de páginas
- **Dynamic imports**: Imports dinámicos para reducir bundle
- **Route-based splitting**: Splitting basado en rutas

### 2. **Optimizaciones React**
- **useMemo**: Memoización de cálculos costosos
- **useCallback**: Memoización de funciones
- **React.memo**: Componentes memoizados

### 3. **Build Optimizations**
- **Vite**: Build tool moderno y rápido
- **Tree shaking**: Eliminación de código no usado
- **Bundle optimization**: Optimización de bundles

## Tecnologías de UI

### 1. **Tailwind CSS**
- **Utility-first**: Clases utilitarias para estilos
- **Responsive design**: Diseño responsive built-in
- **Dark mode**: Soporte para modo oscuro

### 2. **Shadcn/UI**
- **Componentes pre-construidos**: Componentes listos para usar
- **Accesibilidad**: Componentes accesibles por defecto
- **Personalización**: Altamente personalizable

### 3. **Radix UI**
- **Primitivos**: Componentes primitivos de bajo nivel
- **Accesibilidad**: WAI-ARIA compliant
- **Headless**: Sin estilos, solo funcionalidad

---

Esta arquitectura frontend está diseñada para ser escalable, mantenible y proporcionar una excelente experiencia de usuario para la gestión de operaciones de seguridad.