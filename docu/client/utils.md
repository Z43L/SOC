# Documentación de Utilidades y Configuración - Frontend

Esta documentación detalla las utilidades, configuraciones y archivos de soporte que hacen funcionar el frontend del SOC.

## Índice

- [Archivos de Configuración](#archivos-de-configuración)
- [Utilidades](#utilidades)
- [Schemas y Validación](#schemas-y-validación)
- [Queries y API](#queries-y-api)
- [Tipos TypeScript](#tipos-typescript)
- [Constants](#constants)

---

## Archivos de Configuración

### vite.config.ts

**Archivo:** `vite.config.ts`

#### Propósito
Configuración principal de Vite para el build del frontend.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    themePlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "client", "src"),
      "@lib": path.resolve(projectRoot, "client", "src", "lib"),
      "@shared": path.resolve(projectRoot, "shared"),
      "@assets": path.resolve(projectRoot, "attached_assets"),
    },
  },
  root: path.resolve(projectRoot, "client"),
  build: {
    outDir: path.resolve(projectRoot, "dist", "public"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

#### Características Clave
- **Aliases**: Shortcuts para imports (`@`, `@lib`, `@shared`)
- **Proxy**: Proxy para API calls durante desarrollo
- **Plugins**: React, Theme plugin para Shadcn
- **Build**: Configuración de output

### tailwind.config.ts

**Archivo:** `tailwind.config.ts`

#### Configuración de Tailwind
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./client/src/**/*.{js,ts,jsx,tsx}",
    "./client/index.html",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

### tsconfig.json

**Configuración TypeScript**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./client/src/*"],
      "@lib/*": ["./client/src/lib/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["client/src", "shared"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## Utilidades

### lib/utils.ts

**Archivo:** `client/src/lib/utils.ts`

#### Propósito
Utilidades generales para la aplicación.

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Función para combinar clases de Tailwind de forma inteligente
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatear números con separadores de miles
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-ES').format(num);
}

// Formatear bytes a unidades legibles
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Generar un ID único simple
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Debounce para funciones
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout;
  
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

// Capitalizar primera letra
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Truncar texto
export function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}
```

### lib/utils/dateUtils.ts

**Utilidades de fechas**
```typescript
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatDate(date: Date | string, formatStr = 'dd/MM/yyyy HH:mm'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr, { locale: es });
}

export function formatTimeAgo(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true, locale: es });
}

export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) return 'hace un momento';
  if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} h`;
  if (diffInSeconds < 2592000) return `hace ${Math.floor(diffInSeconds / 86400)} d`;
  
  return formatDate(dateObj, 'dd/MM/yyyy');
}

export function isToday(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const today = new Date();
  
  return dateObj.toDateString() === today.toDateString();
}

export function isYesterday(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return dateObj.toDateString() === yesterday.toDateString();
}
```

### lib/utils/severityUtils.ts

**Utilidades para severidad**
```typescript
import { Badge } from "@/components/ui/badge";

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const severityConfig = {
  critical: {
    label: 'Crítica',
    color: 'destructive',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    textColor: 'text-red-800 dark:text-red-200',
    priority: 5,
  },
  high: {
    label: 'Alta',
    color: 'destructive',
    bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    textColor: 'text-orange-800 dark:text-orange-200',
    priority: 4,
  },
  medium: {
    label: 'Media',
    color: 'default',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    priority: 3,
  },
  low: {
    label: 'Baja',
    color: 'secondary',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
    textColor: 'text-green-800 dark:text-green-200',
    priority: 2,
  },
  info: {
    label: 'Info',
    color: 'secondary',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-800 dark:text-blue-200',
    priority: 1,
  },
} as const;

export function getSeverityBadge(severity: SeverityLevel) {
  const config = severityConfig[severity] || severityConfig.info;
  
  return (
    <Badge variant={config.color}>
      {config.label}
    </Badge>
  );
}

export function getSeverityColor(severity: SeverityLevel): string {
  return severityConfig[severity]?.bgColor || severityConfig.info.bgColor;
}

export function getSeverityPriority(severity: SeverityLevel): number {
  return severityConfig[severity]?.priority || 1;
}

export function compareSeverity(a: SeverityLevel, b: SeverityLevel): number {
  return getSeverityPriority(b) - getSeverityPriority(a);
}
```

### lib/utils/statusUtils.ts

**Utilidades para estados**
```typescript
import { Badge } from "@/components/ui/badge";

export type StatusType = 'open' | 'investigating' | 'containment' | 'eradication' | 'recovery' | 'closed';

export const statusConfig = {
  open: {
    label: 'Abierto',
    color: 'destructive',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    textColor: 'text-red-800 dark:text-red-200',
  },
  investigating: {
    label: 'Investigando',
    color: 'default',
    bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    textColor: 'text-orange-800 dark:text-orange-200',
  },
  containment: {
    label: 'Contención',
    color: 'default',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    textColor: 'text-yellow-800 dark:text-yellow-200',
  },
  eradication: {
    label: 'Erradicación',
    color: 'default',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-800 dark:text-blue-200',
  },
  recovery: {
    label: 'Recuperación',
    color: 'default',
    bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    textColor: 'text-purple-800 dark:text-purple-200',
  },
  closed: {
    label: 'Cerrado',
    color: 'secondary',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
    textColor: 'text-green-800 dark:text-green-200',
  },
} as const;

export function getStatusBadge(status: StatusType) {
  const config = statusConfig[status] || statusConfig.open;
  
  return (
    <Badge variant={config.color}>
      {config.label}
    </Badge>
  );
}

export function getStatusColor(status: StatusType): string {
  return statusConfig[status]?.bgColor || statusConfig.open.bgColor;
}
```

---

## Schemas y Validación

### lib/schemas/alertSchemas.ts

**Schemas de validación para alertas**
```typescript
import { z } from 'zod';

export const alertSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1, 'El título es requerido').max(255, 'Título muy largo'),
  description: z.string().min(10, 'La descripción debe tener al menos 10 caracteres'),
  severity: z.enum(['critical', 'high', 'medium', 'low'], {
    errorMap: () => ({ message: 'Severidad inválida' }),
  }),
  status: z.enum(['open', 'investigating', 'closed'], {
    errorMap: () => ({ message: 'Estado inválido' }),
  }),
  source: z.string().optional(),
  assignedTo: z.number().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createAlertSchema = alertSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const updateAlertSchema = alertSchema.partial().omit({ 
  id: true, 
  createdAt: true 
});

export type Alert = z.infer<typeof alertSchema>;
export type CreateAlert = z.infer<typeof createAlertSchema>;
export type UpdateAlert = z.infer<typeof updateAlertSchema>;
```

### lib/schemas/userSchemas.ts

**Schemas para usuarios**
```typescript
import { z } from 'zod';

export const userSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'El nombre es requerido').max(100, 'Nombre muy largo'),
  username: z.string()
    .min(3, 'Usuario debe tener al menos 3 caracteres')
    .max(50, 'Usuario muy largo')
    .regex(/^[a-zA-Z0-9_]+$/, 'Usuario solo puede contener letras, números y guiones bajos'),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'manager', 'analyst', 'viewer'], {
    errorMap: () => ({ message: 'Rol inválido' }),
  }),
  organizationId: z.number(),
  isActive: z.boolean().default(true),
  lastLogin: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createUserSchema = userSchema.omit({ 
  id: true, 
  lastLogin: true,
  createdAt: true, 
  updatedAt: true 
}).extend({
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export const updateUserSchema = userSchema.partial().omit({ 
  id: true, 
  createdAt: true 
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Usuario es requerido'),
  password: z.string().min(1, 'Contraseña es requerida'),
  rememberMe: z.boolean().optional(),
});

export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
```

---

## Queries y API

### lib/queryClient.ts

**Configuración de React Query**
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      cacheTime: 10 * 60 * 1000, // 10 minutos
      retry: (failureCount, error: any) => {
        // No reintentar en errores 4xx
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

// Función helper para requests API
export async function apiRequest(
  endpoint: string, 
  options: RequestInit = {}
): Promise<any> {
  const token = localStorage.getItem('authToken');
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(endpoint, config);

  if (!response.ok) {
    // Manejar errores de autenticación
    if (response.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/auth';
      throw new Error('Sesión expirada');
    }

    // Intentar extraer mensaje de error del servidor
    let errorMessage = `Error ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (e) {
      // Si no se puede parsear JSON, usar mensaje genérico
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

// Query function factory
export function getQueryFn(options: { on401?: 'throw' | 'returnNull' } = {}) {
  return async ({ queryKey }: { queryKey: string[] }) => {
    try {
      return await apiRequest(queryKey[0]);
    } catch (error: any) {
      if (error.message === 'Sesión expirada' && options.on401 === 'returnNull') {
        return null;
      }
      throw error;
    }
  };
}
```

### lib/api/alerts.ts

**API específica para alertas**
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../queryClient';
import type { Alert, CreateAlert, UpdateAlert } from '../schemas/alertSchemas';

// Queries
export function useAlerts(filters?: {
  severity?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const queryParams = new URLSearchParams();
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, value.toString());
      }
    });
  }

  const endpoint = `/api/alerts${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  return useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => apiRequest(endpoint),
    select: (data) => ({
      alerts: data.alerts as Alert[],
      total: data.total as number,
      page: data.page as number,
      totalPages: data.totalPages as number,
    }),
  });
}

export function useAlert(id: number) {
  return useQuery({
    queryKey: ['alert', id],
    queryFn: () => apiRequest(`/api/alerts/${id}`),
    enabled: !!id,
  });
}

// Mutations
export function useCreateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alert: CreateAlert) =>
      apiRequest('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(alert),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, alert }: { id: number; alert: UpdateAlert }) =>
      apiRequest(`/api/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(alert),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert', id] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/alerts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useBulkUpdateAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertIds, updates }: { alertIds: number[]; updates: Partial<Alert> }) =>
      apiRequest('/api/alerts/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ alertIds, updates }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
```

---

## Tipos TypeScript

### types/index.ts

**Tipos globales de la aplicación**
```typescript
// Tipos de usuario
export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'manager' | 'analyst' | 'viewer';
  organizationId: number;
  isActive: boolean;
  lastLogin?: Date;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Tipos de organización
export interface Organization {
  id: number;
  name: string;
  domain: string;
  settings: {
    timezone: string;
    dateFormat: string;
    language: string;
  };
  features: string[];
  limits: {
    maxUsers: number;
    maxAlerts: number;
    storageLimit: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Tipos de alerta
export interface Alert {
  id: number;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'closed';
  source: string;
  assignedTo?: number;
  organizationId: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  enrichment?: {
    mitreTactics?: string[];
    threatActors?: string[];
    iocs?: string[];
    riskScore?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Tipos de incidente
export interface Incident {
  id: number;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'containment' | 'eradication' | 'recovery' | 'closed';
  assignedTo?: number;
  organizationId: number;
  relatedAlerts: number[];
  timeline: IncidentTimelineEntry[];
  mitreTactics: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentTimelineEntry {
  id: number;
  incidentId: number;
  description: string;
  userId: number;
  timestamp: Date;
  type: 'created' | 'updated' | 'assigned' | 'comment' | 'status_changed';
}

// Tipos de API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Tipos de filtros
export interface AlertFilters {
  severity?: string;
  status?: string;
  search?: string;
  assignedTo?: number;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
}

// Tipos de props comunes
export interface PageProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

// Tipos de WebSocket
export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface AlertWebSocketMessage extends WebSocketMessage {
  type: 'new_alert' | 'alert_updated' | 'alert_assigned';
  data: {
    alert: Alert;
    user?: User;
  };
}

// Tipos de tema
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
}

// Tipos de configuración
export interface AppConfig {
  apiUrl: string;
  wsUrl: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  features: {
    analytics: boolean;
    billing: boolean;
    multiTenant: boolean;
  };
}
```

---

## Constants

### constants/index.ts

**Constantes de la aplicación**
```typescript
// Roles de usuario
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
} as const;

// Permisos por rol
export const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: ['*'],
  [USER_ROLES.MANAGER]: [
    'read_alerts',
    'write_alerts',
    'read_incidents',
    'write_incidents',
    'read_users',
    'write_users',
    'read_reports',
    'write_reports',
  ],
  [USER_ROLES.ANALYST]: [
    'read_alerts',
    'write_alerts',
    'read_incidents',
    'write_incidents',
    'read_reports',
  ],
  [USER_ROLES.VIEWER]: [
    'read_alerts',
    'read_incidents',
    'read_reports',
  ],
} as const;

// Estados de alerta
export const ALERT_STATUSES = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  CLOSED: 'closed',
} as const;

// Severidades
export const SEVERITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

// Estados de incidente
export const INCIDENT_STATUSES = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  CONTAINMENT: 'containment',
  ERADICATION: 'eradication',
  RECOVERY: 'recovery',
  CLOSED: 'closed',
} as const;

// Intervalos de auto-refresh
export const REFRESH_INTERVALS = {
  DASHBOARD: 30000, // 30 segundos
  ALERTS: 15000, // 15 segundos
  INCIDENTS: 30000, // 30 segundos
  ANALYTICS: 60000, // 1 minuto
} as const;

// Límites de paginación
export const PAGINATION_LIMITS = {
  SMALL: 10,
  MEDIUM: 25,
  LARGE: 50,
  EXTRA_LARGE: 100,
} as const;

// Configuración de WebSocket
export const WS_CONFIG = {
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 5,
  HEARTBEAT_INTERVAL: 30000,
} as const;

// Configuración de React Query
export const QUERY_CONFIG = {
  STALE_TIME: 5 * 60 * 1000, // 5 minutos
  CACHE_TIME: 10 * 60 * 1000, // 10 minutos
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
} as const;

// Rutas de la aplicación
export const ROUTES = {
  HOME: '/',
  AUTH: '/auth',
  DASHBOARD: '/dashboard',
  ALERTS: '/alerts',
  INCIDENTS: '/incidents',
  THREAT_INTELLIGENCE: '/threat-intelligence',
  ANALYTICS: '/analytics',
  REPORTS: '/reports',
  USERS: '/users',
  CONFIGURATION: '/configuration',
  SETTINGS: '/settings',
  BILLING: '/billing',
} as const;

// Configuración de tema
export const THEME_CONFIG = {
  DEFAULT_THEME: 'system',
  STORAGE_KEY: 'theme-preference',
  THEMES: ['light', 'dark', 'system'] as const,
} as const;

// Configuración de internacionalización
export const I18N_CONFIG = {
  DEFAULT_LANGUAGE: 'es',
  SUPPORTED_LANGUAGES: ['es', 'en'] as const,
  STORAGE_KEY: 'language-preference',
} as const;

// Tipos de notificación
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

// Configuración de validación
export const VALIDATION_CONFIG = {
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MIN_LENGTH: 10,
  TITLE_MAX_LENGTH: 255,
} as const;
```

### constants/mitre.ts

**Constantes relacionadas con MITRE ATT&CK**
```typescript
export const MITRE_TACTICS = {
  INITIAL_ACCESS: 'Initial Access',
  EXECUTION: 'Execution',
  PERSISTENCE: 'Persistence',
  PRIVILEGE_ESCALATION: 'Privilege Escalation',
  DEFENSE_EVASION: 'Defense Evasion',
  CREDENTIAL_ACCESS: 'Credential Access',
  DISCOVERY: 'Discovery',
  LATERAL_MOVEMENT: 'Lateral Movement',
  COLLECTION: 'Collection',
  COMMAND_AND_CONTROL: 'Command and Control',
  EXFILTRATION: 'Exfiltration',
  IMPACT: 'Impact',
} as const;

export const MITRE_TACTIC_IDS = {
  [MITRE_TACTICS.INITIAL_ACCESS]: 'TA0001',
  [MITRE_TACTICS.EXECUTION]: 'TA0002',
  [MITRE_TACTICS.PERSISTENCE]: 'TA0003',
  [MITRE_TACTICS.PRIVILEGE_ESCALATION]: 'TA0004',
  [MITRE_TACTICS.DEFENSE_EVASION]: 'TA0005',
  [MITRE_TACTICS.CREDENTIAL_ACCESS]: 'TA0006',
  [MITRE_TACTICS.DISCOVERY]: 'TA0007',
  [MITRE_TACTICS.LATERAL_MOVEMENT]: 'TA0008',
  [MITRE_TACTICS.COLLECTION]: 'TA0009',
  [MITRE_TACTICS.COMMAND_AND_CONTROL]: 'TA0011',
  [MITRE_TACTICS.EXFILTRATION]: 'TA0010',
  [MITRE_TACTICS.IMPACT]: 'TA0040',
} as const;

export type MitreTactic = keyof typeof MITRE_TACTICS;
export type MitreTacticId = typeof MITRE_TACTIC_IDS[MitreTactic];
```

---

## Archivos de Configuración Adicionales

### .env.example

```bash
# API Configuration
VITE_API_URL=http://localhost:5001/api
VITE_WS_URL=ws://localhost:5001

# Environment
VITE_APP_ENV=development
VITE_APP_VERSION=1.0.0

# Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_BILLING=true
VITE_ENABLE_MULTI_TENANT=true

# External Services
VITE_SENTRY_DSN=
VITE_GOOGLE_ANALYTICS_ID=
```

### .gitignore

```
# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Temporary folders
.tmp/
.cache/
```

Esta documentación cubre todas las utilidades, configuraciones y archivos de soporte que hacen funcionar el frontend del SOC. Cada archivo tiene un propósito específico y está documentado con ejemplos de uso práctico.