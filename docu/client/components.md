# Documentación de Componentes - Frontend

Esta documentación detalla la estructura y uso de los componentes reutilizables del frontend, organizados por categorías funcionales.

## Índice de Componentes

- [Layout Components](#layout-components) - Componentes de estructura y navegación
- [UI Components](#ui-components) - Componentes base de interfaz
- [Dashboard Components](#dashboard-components) - Componentes específicos del dashboard
- [Alert Components](#alert-components) - Componentes para gestión de alertas
- [Form Components](#form-components) - Componentes de formularios
- [Data Display Components](#data-display-components) - Componentes para mostrar datos

---

## Layout Components

### Sidebar

**Archivo:** `client/src/components/layout/Sidebar.tsx`

#### Propósito
Componente de navegación lateral que proporciona acceso a todas las páginas principales del sistema SOC.

#### Props Interface
```typescript
interface SidebarProps {
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

#### Estructura del Componente
```typescript
import { FC, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const Sidebar: FC<SidebarProps> = ({ user, organization }) => {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { path: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
    { path: "/alerts", label: "Alerts", icon: "bell" },
    { path: "/incidents", label: "Incidents", icon: "alert-circle" },
    { path: "/threat-intelligence", label: "Threat Intel", icon: "shield" },
    { path: "/analytics", label: "Analytics", icon: "bar-chart" },
    { path: "/reports", label: "Reports", icon: "file-text" },
    { path: "/users", label: "Users", icon: "users" },
    { path: "/configuration", label: "Configuration", icon: "settings" },
  ];

  return (
    <div className={`bg-card border-r transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Sidebar content */}
    </div>
  );
};
```

#### Características
- **Navegación responsive**: Se colapsa en pantallas pequeñas
- **Estado activo**: Resalta la página actual
- **Avatar de usuario**: Muestra información del usuario
- **Badges**: Indicadores de notificaciones
- **Iconos**: Iconografía consistente con Lucide React

### MainContent

**Archivo:** `client/src/components/layout/MainContent.tsx`

#### Propósito
Contenedor principal para el contenido de las páginas, maneja el layout y espaciado.

#### Estructura
```typescript
interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export const MainContent: FC<MainContentProps> = ({ children, className = "" }) => {
  return (
    <main className={`ml-64 flex-1 overflow-auto bg-background ${className}`}>
      <div className="container mx-auto p-6">
        {children}
      </div>
    </main>
  );
};
```

---

## UI Components

Los componentes UI están basados en **Shadcn/UI** y **Radix UI**, proporcionando una base sólida y accesible.

### Button

**Archivo:** `client/src/components/ui/button.tsx`

#### Variantes
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

#### Ejemplos de Uso
```typescript
<Button variant="default">Guardar</Button>
<Button variant="destructive">Eliminar</Button>
<Button variant="outline">Cancelar</Button>
<Button size="sm">Pequeño</Button>
<Button size="icon"><Plus className="h-4 w-4" /></Button>
```

### DataTable

**Archivo:** `client/src/components/ui/data-table/data-table.tsx`

#### Propósito
Componente de tabla avanzada con funcionalidades de ordenamiento, filtrado, paginación y selección.

#### Props Interface
```typescript
interface DataTableProps<TData> {
  columns: Column<TData>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  enableRowSelection?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
}
```

#### Ejemplo de Configuración de Columnas
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
    cell: ({ row }) => {
      const severity = row.getValue("severity") as string;
      return (
        <Badge variant={severity === "critical" ? "destructive" : "secondary"}>
          {severity}
        </Badge>
      );
    },
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate">
        {row.getValue("title")}
      </div>
    ),
  },
];
```

### Dialog

**Archivo:** `client/src/components/ui/dialog.tsx`

#### Componentes Relacionados
- **Dialog**: Contenedor principal
- **DialogTrigger**: Elemento que abre el diálogo
- **DialogContent**: Contenido del diálogo
- **DialogHeader**: Cabecera del diálogo
- **DialogTitle**: Título del diálogo
- **DialogDescription**: Descripción del diálogo
- **DialogFooter**: Pie del diálogo

#### Ejemplo de Uso
```typescript
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild>
    <Button>Abrir Diálogo</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Editar Usuario</DialogTitle>
      <DialogDescription>
        Modifica la información del usuario aquí.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      {/* Contenido del formulario */}
    </div>
    <DialogFooter>
      <Button type="submit">Guardar cambios</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Dashboard Components

### MetricCard

**Archivo:** `client/src/components/dashboard/MetricCard.tsx`

#### Propósito
Componente para mostrar métricas clave con tendencias, progreso y severidad.

#### Props Interface
```typescript
interface MetricCardProps {
  label: string;
  value: number;
  subvalue?: string;
  trend?: 'up' | 'down' | 'stable';
  changePercentage?: number;
  progressPercent: number;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description?: string;
  lastUpdated?: Date;
  onClick?: () => void;
}
```

#### Estructura del Componente
```typescript
const MetricCard: FC<MetricCardProps> = ({ 
  label, 
  value, 
  subvalue, 
  trend = 'stable', 
  changePercentage = 0, 
  progressPercent,
  severity = 'info',
  description,
  lastUpdated,
  onClick
}) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-red-700 text-red-500';
      case 'medium': return 'bg-orange-700 text-orange-500';
      case 'low': return 'bg-green-900 text-green-500';
      case 'info': return 'bg-blue-900 text-blue-500';
      default: return 'bg-blue-900 text-blue-500';
    }
  };

  return (
    <Card className={`cursor-pointer transition-all hover:shadow-lg ${
      onClick ? 'hover:bg-accent' : ''
    }`} onClick={onClick}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <div className={`rounded-full p-2 ${getSeverityColor(severity)}`}>
            {/* Icono según severidad */}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
          {subvalue && (
            <p className="text-xs text-muted-foreground">{subvalue}</p>
          )}
          <div className="flex items-center space-x-2">
            {/* Indicador de tendencia */}
            <Progress value={progressPercent} className="flex-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

### ThreatDetectionChart

**Archivo:** `client/src/components/dashboard/ThreatDetectionChart.tsx`

#### Propósito
Gráfico para visualizar la detección de amenazas a lo largo del tiempo.

#### Características
- **Gráfico de líneas temporal**
- **Múltiples series de datos**
- **Interactividad con tooltips**
- **Responsive design**

### AIInsights

**Archivo:** `client/src/components/dashboard/AIInsights.tsx`

#### Propósito
Componente que muestra insights generados por IA sobre el estado de seguridad.

#### Estructura de Datos
```typescript
interface AIInsight {
  id: string;
  type: 'recommendation' | 'prediction' | 'anomaly' | 'trend';
  title: string;
  description: string;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}
```

### RecentAlerts

**Archivo:** `client/src/components/dashboard/RecentAlerts.tsx`

#### Propósito
Lista de alertas recientes con enlace directo a la gestión completa de alertas.

#### Características
- **Lista filtrada por tiempo**
- **Badges de severidad**
- **Navegación directa**
- **Actualización en tiempo real**

---

## Alert Components

### AlertDetail

**Archivo:** `client/src/components/alerts/AlertDetail.tsx`

#### Propósito
Panel lateral o modal que muestra información detallada de una alerta seleccionada.

#### Props Interface
```typescript
interface AlertDetailProps {
  alert: Alert | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (alertId: number, updates: Partial<Alert>) => void;
}
```

#### Secciones del Componente
1. **Información básica**: Título, descripción, severidad
2. **Timeline**: Historial de cambios y acciones
3. **Enrichment data**: Datos enriquecidos por IA
4. **Related alerts**: Alertas relacionadas
5. **Actions**: Botones de acción (asignar, cerrar, escalar)

### GroupAlertsDialog

**Archivo:** `client/src/components/alerts/GroupAlertsDialog.tsx`

#### Propósito
Modal para agrupar múltiples alertas relacionadas en un incidente.

#### Funcionalidades
- **Selección múltiple**
- **Detección automática de correlaciones**
- **Creación de incidente**
- **Asignación de responsable**

---

## Form Components

### Forms con React Hook Form

Los formularios utilizan **React Hook Form** con validación **Zod** para máxima type safety.

#### Ejemplo Base de Formulario
```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const formSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres"),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

type FormData = z.infer<typeof formSchema>;

const ExampleForm: FC = () => {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      severity: "medium",
    },
  });

  const onSubmit = (data: FormData) => {
    // Lógica de envío
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input placeholder="Ingresa el título" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Más campos */}
        <Button type="submit">Guardar</Button>
      </form>
    </Form>
  );
};
```

### Input Components

#### Input
```typescript
<Input 
  type="text" 
  placeholder="Buscar..." 
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
/>
```

#### Textarea
```typescript
<Textarea 
  placeholder="Descripción detallada..."
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={4}
/>
```

#### Select
```typescript
<Select value={severity} onValueChange={setSeverity}>
  <SelectTrigger>
    <SelectValue placeholder="Selecciona severidad" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="low">Baja</SelectItem>
    <SelectItem value="medium">Media</SelectItem>
    <SelectItem value="high">Alta</SelectItem>
    <SelectItem value="critical">Crítica</SelectItem>
  </SelectContent>
</Select>
```

---

## Data Display Components

### Badge

**Archivo:** `client/src/components/ui/badge.tsx`

#### Variantes
```typescript
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

#### Uso para Severidades
```typescript
export const getSeverityBadge = (severity: string) => {
  const severityConfig = {
    critical: { variant: "destructive", text: "Crítica" },
    high: { variant: "destructive", text: "Alta" },
    medium: { variant: "default", text: "Media" },
    low: { variant: "secondary", text: "Baja" },
  };

  const config = severityConfig[severity] || severityConfig.low;
  
  return (
    <Badge variant={config.variant}>
      {config.text}
    </Badge>
  );
};
```

### Progress

**Archivo:** `client/src/components/ui/progress.tsx`

#### Uso
```typescript
<Progress value={75} className="w-full" />
```

### Tooltip

**Archivo:** `client/src/components/ui/tooltip.tsx`

#### Ejemplo de Uso
```typescript
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="outline">Hover me</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Información adicional aquí</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Patrones de Composición

### Compound Components

#### Card Composition
```typescript
<Card>
  <CardHeader>
    <CardTitle>Título de la Tarjeta</CardTitle>
    <CardDescription>Descripción opcional</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Contenido principal */}
  </CardContent>
  <CardFooter>
    {/* Acciones o información adicional */}
  </CardFooter>
</Card>
```

#### Sheet/Modal Composition
```typescript
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>Panel Lateral</SheetTitle>
      <SheetDescription>
        Información detallada del elemento seleccionado
      </SheetDescription>
    </SheetHeader>
    <div className="mt-6">
      {/* Contenido del sheet */}
    </div>
  </SheetContent>
</Sheet>
```

---

## Estilización Consistente

### Clases Tailwind Comunes

#### Spacing y Layout
```css
/* Contenedores */
.container mx-auto p-6
.grid gap-4
.flex items-center justify-between

/* Spacing */
space-y-4  /* Espaciado vertical entre hijos */
space-x-2  /* Espaciado horizontal entre hijos */
gap-4      /* Gap en grid/flex */

/* Padding y Margin */
p-6        /* Padding */
px-4 py-2  /* Padding horizontal y vertical */
mt-4       /* Margin top */
```

#### Colores y Estados
```css
/* Backgrounds */
bg-background
bg-card
bg-primary
bg-destructive

/* Text */
text-foreground
text-muted-foreground
text-primary
text-destructive

/* Borders */
border border-input
border-r /* Border right */

/* Estados hover */
hover:bg-accent
hover:text-accent-foreground
```

#### Responsive Design
```css
/* Breakpoints */
sm:w-[540px]    /* >= 640px */
md:grid-cols-2  /* >= 768px */
lg:grid-cols-3  /* >= 1024px */
xl:grid-cols-4  /* >= 1280px */
```

### Animaciones y Transiciones
```css
/* Transiciones */
transition-all duration-300
transition-colors

/* Animaciones */
animate-spin
animate-pulse
animate-bounce

/* Transform */
hover:scale-105
hover:shadow-lg
```

---

## Accessibility (A11y)

### Principios Implementados

1. **Keyboard Navigation**: Todos los componentes son navegables por teclado
2. **Screen Reader Support**: Etiquetas ARIA apropiadas
3. **Focus Management**: Indicadores de foco visibles
4. **Color Contrast**: Cumple con WCAG 2.1 AA
5. **Semantic HTML**: Uso correcto de elementos semánticos

### Ejemplos de Implementación

#### Focus Management
```typescript
<Button 
  ref={focusRef}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Acción
</Button>
```

#### ARIA Labels
```typescript
<button
  aria-label="Cerrar alerta"
  aria-describedby="alert-description"
  onClick={onClose}
>
  <X className="h-4 w-4" />
</button>
```

#### Screen Reader Text
```typescript
<span className="sr-only">
  Alerta crítica: {alertTitle}
</span>
```