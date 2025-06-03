# Documentación del Cliente (Frontend)

## Navegación de la Documentación

Esta documentación está organizada en múltiples archivos para facilitar la navegación:

- **[overview.md](./overview.md)** - Arquitectura general y patrones (este archivo)
- **[pages.md](./pages.md)** - Documentación detallada de todas las páginas
- **[components.md](./components.md)** - Documentación de componentes reutilizables
- **[hooks.md](./hooks.md)** - Hooks personalizados y contexts
- **[utils.md](./utils.md)** - Utilidades, configuración y schemas

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

### 1. main.tsx - Punto de Entrada (Explicación Detallada)

```typescript
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

**Explicación línea por línea**:

#### Import de createRoot
```typescript
import { createRoot } from "react-dom/client";
```
**¿Qué es createRoot?**: Nueva API de React 18 para renderizar aplicaciones
**¿Por qué es importante?**: 
- Reemplaza la antigua API `ReactDOM.render()`
- Habilita las nuevas funciones de React 18 (Concurrent Features)
- Mejora el rendimiento y permite interrupciones en el renderizado

**Comparación con versiones anteriores**:
```typescript
// ❌ Método antiguo (React 17 y anteriores)
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// ✅ Método nuevo (React 18+)
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

#### Import del Componente App
```typescript
import App from "./App";
```
**¿Qué es App?**: El componente raíz que contiene toda la aplicación
**Estructura jerárquica**:
```
App
├── Providers (Auth, Query, Tenant)
├── Router
│   ├── HomePage
│   ├── Dashboard
│   ├── Alerts
│   └── ... otras páginas
└── Toaster (notificaciones)
```

#### Import de Estilos Globales
```typescript
import "./index.css";
```
**¿Qué contiene index.css?**:
- Estilos base de Tailwind CSS
- Variables de CSS personalizadas
- Estilos globales de la aplicación
- Configuración de fuentes

**Ejemplo del contenido**:
```css
/* index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
}

body {
  font-family: 'Inter', sans-serif;
}
```

#### Renderizado de la Aplicación
```typescript
createRoot(document.getElementById("root")!).render(<App />);
```

**Explicación paso a paso**:

1. **`document.getElementById("root")`**: Busca el elemento HTML con id "root"
   ```html
   <!-- En index.html -->
   <div id="root"></div>
   ```

2. **`!` (Non-null assertion)**: Le dice a TypeScript que confiamos en que el elemento existe
   - **Sin `!`**: TypeScript piensa que puede ser `null`
   - **Con `!`**: Le decimos que estamos seguros de que existe

3. **`createRoot(...)`**: Crea una "raíz" de React en ese elemento

4. **`.render(<App />)`**: Renderiza el componente App dentro de esa raíz

**Flujo completo de inicialización**:
```
Browser carga index.html → Ejecuta main.tsx → Busca #root → Crea React root → Renderiza <App />
```

**¿Qué pasa si falla?**:
```typescript
// Versión más robusta con manejo de errores
const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Root element not found");
}
const root = createRoot(rootElement);
root.render(<App />);
```

**Resultado visible**: Toda la aplicación SOC aparece en el navegador, comenzando desde el componente App.

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

## Ejemplo Práctico: Componente de Gestión de Usuarios

Para entender mejor cómo funciona el frontend, analicemos un componente real del proyecto: la página de gestión de usuarios.

### Estructura del Componente

```tsx
// client/src/pages/users.tsx
import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
```

**Explicación de imports para principiantes**:

#### React Hooks
```tsx
import { FC, useState } from "react";
```
- **FC**: Tipo TypeScript para "Functional Component"
- **useState**: Hook para manejar estado local del componente

**Ejemplo de useState**:
```tsx
const [isDialogOpen, setIsDialogOpen] = useState(false);
// isDialogOpen = valor actual (false inicialmente)
// setIsDialogOpen = función para cambiar el valor
```

#### React Query (Gestión de Estado del Servidor)
```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
```
- **useQuery**: Para obtener datos del servidor (GET)
- **useMutation**: Para modificar datos en el servidor (POST, PUT, DELETE)
- **useQueryClient**: Para invalidar caché y sincronizar datos

#### Formularios
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
```
- **useForm**: Hook para gestionar formularios
- **zodResolver**: Validador de formularios usando esquemas Zod

### Lógica del Componente

#### 1. Estado Local
```tsx
const Users: FC<UsersProps> = ({ user, organization }) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
```

**¿Qué hace cada estado?**:
- **selectedUser**: Usuario seleccionado para editar (null = ninguno seleccionado)
- **isAddUserDialogOpen**: Controla si el modal de "Añadir Usuario" está abierto
- **isEditUserDialogOpen**: Controla si el modal de "Editar Usuario" está abierto

**Ejemplo de flujo**:
```
Usuario click "Añadir Usuario" → setIsAddUserDialogOpen(true) → Modal se abre
Usuario click "Cancelar" → setIsAddUserDialogOpen(false) → Modal se cierra
```

#### 2. Obtención de Datos (useQuery)
```tsx
const usersQueryKey = [`/api/organizations/${organization.id}/users`, organization.id];

const { data: orgUsers = [], isLoading } = useQuery<User[] | null>({
  queryKey: usersQueryKey,
  queryFn: getQueryFn<User[] | null>({ on401: "throw" }),
});
```

**Explicación detallada**:

**usersQueryKey**: Clave única para identificar esta consulta
- Incluye la URL de la API
- Incluye el ID de la organización
- React Query usa esta clave para el caché

**¿Por qué es importante el caché?**:
```
Primera visita → API call → Datos guardados en caché
Segunda visita → Datos del caché (instantáneo) → API call en background para actualizar
```

**Estados de la consulta**:
- **isLoading**: true mientras carga por primera vez
- **data**: Los datos obtenidos (array de usuarios)
- **error**: Si hubo un error en la consulta

#### 3. Modificación de Datos (useMutation)
```tsx
const addUserMutation = useMutation<Response, Error, Omit<InsertUser, 'organizationId'>>({
  mutationFn: async (userData) => {
    return apiRequest('POST', `/api/organizations/${organization.id}/users`, userData);
  },
  onSuccess: async (response) => {
    const newUser = await response.json() as User;
    toast({
      title: "User Added",
      description: `User ${newUser.name} has been added successfully.`,
    });
    setIsAddUserDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: usersQueryKey });
    addUserForm.reset();
  },
  onError: (error) => {
    toast({
      title: "Error Adding User",
      description: error.message || "Could not add user.",
      variant: "destructive",
    });
  }
});
```

**Flujo completo de añadir usuario**:

1. **Usuario llena formulario** y hace click en "Guardar"
2. **Validación**: React Hook Form valida los datos
3. **Mutación**: Se ejecuta `addUserMutation.mutate(userData)`
4. **API Call**: POST a `/api/organizations/{id}/users`
5. **Si exitoso** (`onSuccess`):
   - Muestra notificación de éxito
   - Cierra el modal
   - Invalida el caché para recargar la lista
   - Limpia el formulario
6. **Si falla** (`onError`):
   - Muestra notificación de error

#### 4. Gestión de Formularios
```tsx
const addUserForm = useForm<Omit<InsertUser, 'organizationId'>>({
  resolver: zodResolver(insertUserSchema.omit({ organizationId: true })),
  defaultValues: {
    name: "",
    username: "",
    email: "",
    password: "",
    role: "Security Analyst",
  },
});
```

**¿Qué hace zodResolver?**:
```typescript
// Esquema de validación (en shared/schema.ts)
const insertUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["Administrator", "Security Analyst", "Viewer"]),
  organizationId: z.number()
});
```

**Validación en tiempo real**:
```tsx
<FormField
  control={addUserForm.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input
          type="email"
          placeholder="user@company.com"
          {...field}
        />
      </FormControl>
      <FormMessage /> {/* Muestra errores automáticamente */}
    </FormItem>
  )}
/>
```

**Cuando el usuario escribe un email inválido**:
```
Usuario escribe: "email-invalido" → Validación falla → Muestra: "Invalid email format"
Usuario escribe: "user@company.com" → Validación pasa → Error desaparece
```

### Renderizado del UI

#### 1. Estado de Carga
```tsx
{isLoading ? (
  <div className="flex items-center justify-center h-64">
    <i className="fas fa-spinner fa-spin mr-2"></i>
    <span>Loading users...</span>
  </div>
) : !orgUsers || orgUsers.length === 0 ? (
  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
    <i className="fas fa-users text-3xl mb-3"></i>
    <p>No users found for {organization.name}.</p>
    <p className="text-sm">Click "Add User" to create the first user for this organization.</p>
  </div>
) : (
  // Renderizar tabla de usuarios
)}
```

**Estados posibles del UI**:
1. **Cargando**: Spinner + texto "Loading users..."
2. **Sin datos**: Icono + mensaje "No users found"
3. **Con datos**: Tabla con lista de usuarios

#### 2. Tabla de Usuarios
```tsx
<table className="min-w-full">
  <thead>
    <tr className="text-left bg-background-lighter">
      <th className="px-4 py-3 font-semibold">Name</th>
      <th className="px-4 py-3 font-semibold">Username</th>
      <th className="px-4 py-3 font-semibold">Email</th>
      <th className="px-4 py-3 font-semibold">Role</th>
      <th className="px-4 py-3 font-semibold">Actions</th>
    </tr>
  </thead>
  <tbody>
    {orgUsers.map((user) => (
      <tr key={user.id} className="border-b hover:bg-muted/50">
        <td className="px-4 py-3 font-medium">{user.name}</td>
        <td className="px-4 py-3 text-muted-foreground">{user.username}</td>
        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
        <td className="px-4 py-3">
          <Badge variant="outline">{user.role}</Badge>
        </td>
        <td className="px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedUser(user);
              setIsEditUserDialogOpen(true);
            }}
          >
            <i className="fas fa-edit mr-1"></i>
            Edit
          </Button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Cómo funciona el mapeo**:
```tsx
{orgUsers.map((user) => ( ... ))}
```

Si tenemos estos datos:
```javascript
orgUsers = [
  { id: 1, name: "Juan Pérez", username: "juan", email: "juan@empresa.com", role: "Administrator" },
  { id: 2, name: "Ana García", username: "ana", email: "ana@empresa.com", role: "Security Analyst" }
];
```

Se renderiza como:
```
| Name      | Username | Email             | Role             | Actions |
|-----------|----------|-------------------|------------------|---------|
| Juan Pérez| juan     | juan@empresa.com  | Administrator    | [Edit]  |
| Ana García| ana      | ana@empresa.com   | Security Analyst | [Edit]  |
```

### Interacción Usuario-Sistema

**Flujo completo de añadir un usuario**:

1. **Usuario hace click en "Add User"**:
   ```tsx
   <Button onClick={() => { 
     addUserForm.reset(); 
     setIsAddUserDialogOpen(true); 
   }}>
     Add User
   </Button>
   ```

2. **Modal se abre** (controlado por `isAddUserDialogOpen`)

3. **Usuario llena formulario** (validación en tiempo real)

4. **Usuario hace click en "Submit"**:
   ```tsx
   <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)}>
   ```

5. **Función `onAddUserSubmit` se ejecuta**:
   ```tsx
   const onAddUserSubmit = (data: Omit<InsertUser, 'organizationId'>) => {
     addUserMutation.mutate(data);
   };
   ```

6. **API call automático** + **UI actualizado** según el resultado

Este patrón se repite en toda la aplicación: **Estado local** + **API calls** + **UI reactivo**.