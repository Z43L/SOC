# Documentación de Páginas - Frontend

Esta documentación detalla todas las páginas principales de la aplicación SOC, incluyendo su propósito, estructura, componentes utilizados y ejemplos de código.

## Índice de Páginas

- [Dashboard](#dashboard) - Panel principal de control
- [Alerts](#alerts) - Gestión de alertas de seguridad
- [Incidents](#incidents) - Gestión de incidentes
- [Threat Intelligence](#threat-intelligence) - Inteligencia de amenazas
- [Analytics](#analytics) - Análisis y métricas
- [Reports](#reports) - Generación de reportes
- [Users](#users) - Gestión de usuarios
- [Configuration](#configuration) - Configuración del sistema
- [Settings](#settings) - Configuración personal

## Dashboard

**Archivo:** `client/src/pages/dashboard.tsx`

### Propósito
El Dashboard es la página principal del SOC que proporciona una vista consolidada de las métricas de seguridad, alertas recientes, información de amenazas y el estado general del sistema.

### Props Interface
```typescript
interface DashboardProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}
```

### Estructura del Componente

#### Imports Principales
```typescript
import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import MetricCard from "@/components/dashboard/MetricCard";
import ThreatDetectionChart from "@/components/dashboard/ThreatDetectionChart";
import AIInsights from "@/components/dashboard/AIInsights";
import RecentAlerts from "@/components/dashboard/RecentAlerts";
```

#### Estado Local
```typescript
const [timeRange, setTimeRange] = useState<string>('24h');
const [isRefreshing, setIsRefreshing] = useState(false);
```

**Variables de estado:**
- `timeRange`: Período de tiempo para filtrar datos ('24h', '7d', '30d')
- `isRefreshing`: Indicador de actualización manual en progreso

#### Gestión de Datos
```typescript
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['/api/dashboard', timeRange],
  queryFn: getQueryFn({ on401: 'returnNull' }),
  retry: 3,
  retryDelay: 1000,
  refetchInterval: 30000, // Auto-refresh every 30 seconds
});
```

**Características:**
- **Auto-refresh**: Actualización automática cada 30 segundos
- **Retry logic**: 3 intentos con delay de 1 segundo
- **Error handling**: Manejo de errores 401 y generales

#### Componentes del Dashboard

1. **MetricCard** - Tarjetas de métricas principales
2. **ThreatDetectionChart** - Gráfico de detección de amenazas
3. **AIInsights** - Insights generados por IA
4. **RecentAlerts** - Alertas recientes
5. **ThreatIntelligence** - Información de inteligencia de amenazas
6. **MitreTacticsSummary** - Resumen de tácticas MITRE ATT&CK
7. **ComplianceSummary** - Resumen de cumplimiento
8. **SeverityDistribution** - Distribución por severidad
9. **AgentMetrics** - Métricas de agentes
10. **ThreatMap** - Mapa de amenazas

### Ejemplo de Uso
```typescript
<Dashboard 
  user={{
    name: "Admin User",
    initials: "AU",
    role: "admin"
  }}
  organization={{
    name: "My Organization"
  }}
/>
```

---

## Alerts

**Archivo:** `client/src/pages/alerts.tsx`

### Propósito
La página de Alerts permite a los usuarios visualizar, filtrar, gestionar y responder a las alertas de seguridad generadas por el sistema SOC.

### Props Interface
```typescript
interface AlertsProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}
```

### Estructura del Componente

#### Imports Principales
```typescript
import { FC, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { Alert, SeverityTypes } from "@shared/schema";
import { DataTable, Column } from "@/components/ui/data-table/data-table";
import { AlertDetail } from "@/components/alerts/AlertDetail";
import { GroupAlertsDialog } from "@/components/alerts/GroupAlertsDialog";
```

#### Estado Local
```typescript
const [selectedAlerts, setSelectedAlerts] = useState<number[]>([]);
const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
const [searchTerm, setSearchTerm] = useState("");
const [severityFilter, setSeverityFilter] = useState<string>("all");
const [statusFilter, setStatusFilter] = useState<string>("all");
const [dateRange, setDateRange] = useState<DateRange | undefined>();
```

**Variables de estado principales:**
- `selectedAlerts`: Array de IDs de alertas seleccionadas
- `selectedAlert`: Alerta seleccionada para mostrar detalles
- `searchTerm`: Término de búsqueda para filtrar alertas
- `severityFilter`: Filtro por nivel de severidad
- `statusFilter`: Filtro por estado (abierta, cerrada, etc.)
- `dateRange`: Rango de fechas para filtrar

#### Configuración de Columnas de Tabla
```typescript
const columns: Column<Alert>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => getSeverityBadge(row.getValue("severity")),
  },
  {
    accessorKey: "title",
    header: "Alert",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate">
        {row.getValue("title")}
      </div>
    ),
  },
  // ... más columnas
];
```

#### Funcionalidades Principales

1. **Búsqueda y Filtrado**
```typescript
const filteredAlerts = alerts?.filter(alert => {
  const matchesSearch = alert.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       alert.description?.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesSeverity = severityFilter === "all" || alert.severity === severityFilter;
  const matchesStatus = statusFilter === "all" || alert.status === statusFilter;
  
  return matchesSearch && matchesSeverity && matchesStatus;
}) || [];
```

2. **Acciones en Lote**
```typescript
const bulkUpdateMutation = useMutation({
  mutationFn: async ({ alertIds, updates }: { alertIds: number[]; updates: Partial<Alert> }) => {
    return apiRequest(`/api/alerts/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ alertIds, updates }),
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
    setSelectedAlerts([]);
    toast({ title: "Alerts updated successfully" });
  },
});
```

3. **Integración WebSocket**
```typescript
const { lastMessage } = useWebSocket('/ws/alerts', {
  onMessage: (message) => {
    const data = JSON.parse(message.data);
    if (data.type === 'new_alert') {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: "Nueva alerta",
        description: `${data.alert.title} - ${data.alert.severity}`,
      });
    }
  }
});
```

### Componentes Utilizados

- **DataTable**: Tabla principal de alertas con paginación y ordenamiento
- **AlertDetail**: Panel lateral para mostrar detalles de alerta seleccionada
- **GroupAlertsDialog**: Modal para agrupar alertas relacionadas
- **DateRangePicker**: Selector de rango de fechas
- **Filtros y búsqueda**: Controles de filtrado múltiple

---

## Incidents

**Archivo:** `client/src/pages/incidents.tsx`

### Propósito
La página de Incidents gestiona los incidentes de seguridad, permitiendo crear, editar, asignar y realizar seguimiento del estado de resolución de incidentes.

### Estructura del Componente

#### Estado Local Específico
```typescript
const [incidentStatus, setIncidentStatus] = useState<string>("open");
const [assignedFilter, setAssignedFilter] = useState<string>("all");
const [priorityFilter, setPriorityFilter] = useState<string>("all");
const [isCreateIncidentOpen, setIsCreateIncidentOpen] = useState(false);
```

#### Flujo de Trabajo de Incidentes
```typescript
const incidentWorkflow = {
  'open': { next: ['investigating', 'closed'], color: 'red' },
  'investigating': { next: ['containment', 'closed'], color: 'orange' },
  'containment': { next: ['eradication', 'closed'], color: 'yellow' },
  'eradication': { next: ['recovery', 'closed'], color: 'blue' },
  'recovery': { next: ['closed'], color: 'green' },
  'closed': { next: [], color: 'gray' }
};
```

#### Métricas de Incidentes
```typescript
const incidentMetrics = useMemo(() => {
  if (!incidents) return null;
  
  return {
    total: incidents.length,
    open: incidents.filter(i => i.status === 'open').length,
    investigating: incidents.filter(i => i.status === 'investigating').length,
    avgResolutionTime: calculateAvgResolutionTime(incidents),
    criticalOpen: incidents.filter(i => i.severity === 'critical' && i.status !== 'closed').length
  };
}, [incidents]);
```

---

## Threat Intelligence

**Archivo:** `client/src/pages/threat-intelligence.tsx`

### Propósito
Proporciona una vista consolidada de la inteligencia de amenazas, incluyendo feeds de threat intelligence, indicadores de compromiso (IoCs), y análisis de amenazas.

### Características Principales

1. **Feeds de Threat Intelligence**
2. **Indicadores de Compromiso (IoCs)**
3. **Análisis de Amenazas por IA**
4. **Integración MITRE ATT&CK**
5. **Mapeo de Tácticas y Técnicas**

### Estructura de Datos
```typescript
interface ThreatIntelData {
  feeds: ThreatFeed[];
  iocs: IOC[];
  mitreTactics: MitreTactic[];
  threatActors: ThreatActor[];
  campaigns: Campaign[];
}
```

---

## Analytics

**Archivo:** `client/src/pages/analytics.tsx`

### Propósito
Página de análisis avanzado que proporciona métricas detalladas, reportes visuales y análisis de tendencias de seguridad.

### Tipos de Análisis

1. **Análisis Temporal**
2. **Análisis de Tendencias**
3. **Análisis de Correlación**
4. **Métricas de Performance**
5. **Análisis Predictivo**

---

## Reports

**Archivo:** `client/src/pages/reports.tsx`

### Propósito
Generación y gestión de reportes automatizados y personalizados para stakeholders y cumplimiento normativo.

### Tipos de Reportes

1. **Reportes Ejecutivos**
2. **Reportes de Cumplimiento**
3. **Reportes Técnicos**
4. **Reportes de Incidentes**
5. **Reportes Personalizados**

---

## Users

**Archivo:** `client/src/pages/users.tsx`

### Propósito
Gestión completa de usuarios del sistema, incluyendo creación, edición, asignación de roles y permisos.

> **Nota:** Esta página está documentada en detalle en `docu/client/overview.md` como ejemplo práctico.

---

## Configuration

**Archivo:** `client/src/pages/configuration.tsx`

### Propósito
Configuración global del sistema SOC, incluyendo conectores, integraciones, políticas de seguridad y configuraciones avanzadas.

---

## Settings

**Archivo:** `client/src/pages/settings.tsx`

### Propósito
Configuraciones personales del usuario, preferencias de interfaz, notificaciones y configuraciones de cuenta.

---

## Navegación Entre Páginas

### Router Configuration
```typescript
// En App.tsx
<ProtectedRoute path="/dashboard" component={() => <Dashboard user={userInfo} organization={organization} />} />
<ProtectedRoute path="/alerts" component={() => <Alerts user={userInfo} organization={organization} />} />
<ProtectedRoute path="/incidents" component={() => <Incidents user={userInfo} organization={organization} />} />
<ProtectedRoute path="/threat-intelligence" component={() => <ThreatIntelligence user={userInfo} organization={organization} />} />
<ProtectedRoute path="/analytics" component={() => <Analytics user={userInfo} organization={organization} />} />
<ProtectedRoute path="/reports" component={() => <Reports user={userInfo} organization={organization} />} />
<ProtectedRoute path="/users" component={() => <Users user={userInfo} organization={organization} />} />
<ProtectedRoute path="/configuration" component={() => <Configuration user={userInfo} organization={organization} />} />
<ProtectedRoute path="/settings" component={() => <Settings user={userInfo} organization={organization} />} />
```

## Patrones Comunes en Páginas

### 1. Layout Estándar
```typescript
return (
  <div className="min-h-screen bg-background">
    <Sidebar user={user} organization={organization} />
    <MainContent>
      {/* Contenido específico de la página */}
    </MainContent>
  </div>
);
```

### 2. Gestión de Estado con React Query
```typescript
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['/api/endpoint'],
  queryFn: getQueryFn({ on401: 'returnNull' }),
  retry: 3,
  refetchInterval: 30000,
});
```

### 3. Manejo de Errores
```typescript
if (error) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">Error loading data</h3>
        <p className="mt-1 text-sm text-gray-500">Please try again later.</p>
        <Button onClick={() => refetch()} className="mt-4">
          Retry
        </Button>
      </div>
    </div>
  );
}
```

### 4. Estados de Carga
```typescript
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
```