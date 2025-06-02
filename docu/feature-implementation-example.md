# Ejemplo Práctico: Implementar Nueva Funcionalidad

Esta guía muestra cómo implementar una nueva funcionalidad completa en el sistema SOC, desde la base de datos hasta la interfaz de usuario. Usaremos como ejemplo la creación de un **sistema de etiquetas para alertas**.

## ¿Qué vamos a construir?

**Funcionalidad**: Sistema de etiquetas (tags) para categorizar alertas
**Objetivo**: Permitir a los analistas añadir etiquetas como "malware", "phishing", "false-positive" a las alertas

## Paso 1: Diseño de la Base de Datos

### Análisis de Requisitos

Antes de escribir código, definamos qué necesitamos:
- Cada alerta puede tener múltiples etiquetas
- Las etiquetas pueden ser reutilizadas en múltiples alertas  
- Queremos poder filtrar alertas por etiquetas
- Los usuarios pueden crear nuevas etiquetas dinámicamente

### Diseño de Esquema

**Relación Many-to-Many**: Una alerta puede tener muchas etiquetas, y una etiqueta puede estar en muchas alertas.

```sql
-- Nueva tabla para las etiquetas
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  color VARCHAR(7) DEFAULT '#gray',  -- Color en formato hex
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Tabla de relación entre alertas y etiquetas
CREATE TABLE alert_tags (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by INTEGER REFERENCES users(id),
  UNIQUE(alert_id, tag_id)  -- Evitar duplicados
);
```

### Implementación en Drizzle ORM

```typescript
// shared/schema.ts
import { pgTable, serial, varchar, text, timestamp, integer, unique } from 'drizzle-orm/pg-core';

// Tabla de etiquetas
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  color: varchar('color', { length: 7 }).default('#6B7280'), // Tailwind gray-500
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id)
});

// Tabla de relación
export const alertTags = pgTable('alert_tags', {
  id: serial('id').primaryKey(),
  alertId: integer('alert_id').references(() => alerts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').references(() => tags.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').defaultNow(),
  addedBy: integer('added_by').references(() => users.id)
}, (table) => ({
  // Constraint para evitar duplicados
  uniq: unique().on(table.alertId, table.tagId)
}));

// Tipos TypeScript generados automáticamente
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;
export type AlertTag = typeof alertTags.$inferSelect;
export type InsertAlertTag = typeof alertTags.$inferInsert;
```

### Migración de Base de Datos

```bash
# Ejecutar la migración
npm run db:push

# Verificar que las tablas se crearon
psql -h localhost -U soc_user -d soc_dev -c "\dt"
```

## Paso 2: Implementar APIs en el Backend

### Rutas de la API

```typescript
// server/routes/tags.ts
import { Express } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { tags, alertTags, alerts } from '@shared/schema';
import { authenticateToken } from '../middleware/auth';

export function registerTagRoutes(app: Express) {
  
  // GET /api/tags - Obtener todas las etiquetas
  app.get('/api/tags', authenticateToken, async (req, res) => {
    try {
      const allTags = await db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          description: tags.description,
          usageCount: sql<number>`COUNT(${alertTags.id})`.as('usage_count')
        })
        .from(tags)
        .leftJoin(alertTags, eq(tags.id, alertTags.tagId))
        .groupBy(tags.id)
        .orderBy(tags.name);

      res.json(allTags);
    } catch (error) {
      console.error('Error fetching tags:', error);
      res.status(500).json({ error: 'Failed to fetch tags' });
    }
  });

  // POST /api/tags - Crear nueva etiqueta
  app.post('/api/tags', authenticateToken, async (req, res) => {
    try {
      const { name, color, description } = req.body;
      const userId = req.user?.id;

      // Validar datos de entrada
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Tag name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Tag name must be 50 characters or less' });
      }

      // Verificar que la etiqueta no exista ya
      const existingTag = await db
        .select()
        .from(tags)
        .where(eq(tags.name, name.trim().toLowerCase()));

      if (existingTag.length > 0) {
        return res.status(409).json({ error: 'Tag already exists' });
      }

      // Crear la etiqueta
      const newTag = await db
        .insert(tags)
        .values({
          name: name.trim().toLowerCase(),
          color: color || '#6B7280',
          description: description?.trim(),
          createdBy: userId
        })
        .returning();

      res.status(201).json(newTag[0]);
    } catch (error) {
      console.error('Error creating tag:', error);
      res.status(500).json({ error: 'Failed to create tag' });
    }
  });

  // POST /api/alerts/:alertId/tags - Añadir etiqueta a alerta
  app.post('/api/alerts/:alertId/tags', authenticateToken, async (req, res) => {
    try {
      const alertId = parseInt(req.params.alertId);
      const { tagId } = req.body;
      const userId = req.user?.id;

      // Validar que la alerta existe
      const alert = await db
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId));

      if (alert.length === 0) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      // Validar que la etiqueta existe
      const tag = await db
        .select()
        .from(tags)
        .where(eq(tags.id, tagId));

      if (tag.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      // Verificar que la relación no existe ya
      const existing = await db
        .select()
        .from(alertTags)
        .where(and(
          eq(alertTags.alertId, alertId),
          eq(alertTags.tagId, tagId)
        ));

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Tag already added to this alert' });
      }

      // Crear la relación
      const alertTag = await db
        .insert(alertTags)
        .values({
          alertId,
          tagId,
          addedBy: userId
        })
        .returning();

      res.status(201).json(alertTag[0]);
    } catch (error) {
      console.error('Error adding tag to alert:', error);
      res.status(500).json({ error: 'Failed to add tag to alert' });
    }
  });

  // DELETE /api/alerts/:alertId/tags/:tagId - Remover etiqueta de alerta
  app.delete('/api/alerts/:alertId/tags/:tagId', authenticateToken, async (req, res) => {
    try {
      const alertId = parseInt(req.params.alertId);
      const tagId = parseInt(req.params.tagId);

      const deleted = await db
        .delete(alertTags)
        .where(and(
          eq(alertTags.alertId, alertId),
          eq(alertTags.tagId, tagId)
        ))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Tag not found on this alert' });
      }

      res.json({ message: 'Tag removed successfully' });
    } catch (error) {
      console.error('Error removing tag from alert:', error);
      res.status(500).json({ error: 'Failed to remove tag from alert' });
    }
  });

  // GET /api/alerts/:alertId/tags - Obtener etiquetas de una alerta
  app.get('/api/alerts/:alertId/tags', authenticateToken, async (req, res) => {
    try {
      const alertId = parseInt(req.params.alertId);

      const alertTagsList = await db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          description: tags.description,
          addedAt: alertTags.addedAt,
          addedBy: alertTags.addedBy
        })
        .from(alertTags)
        .innerJoin(tags, eq(alertTags.tagId, tags.id))
        .where(eq(alertTags.alertId, alertId))
        .orderBy(alertTags.addedAt);

      res.json(alertTagsList);
    } catch (error) {
      console.error('Error fetching alert tags:', error);
      res.status(500).json({ error: 'Failed to fetch alert tags' });
    }
  });
}
```

### Registro de Rutas

```typescript
// server/routes/index.ts
import { registerTagRoutes } from './tags';

export function registerRoutes(app: Express) {
  // ... otras rutas existentes
  registerTagRoutes(app);
}
```

## Paso 3: Implementar Componentes en el Frontend

### Hook Personalizado para Etiquetas

```typescript
// client/src/hooks/use-tags.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Tag, InsertTag } from '@shared/schema';

// Hook para obtener todas las etiquetas
export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['/api/tags'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/tags');
      return response.json();
    }
  });
}

// Hook para crear nueva etiqueta
export function useCreateTag() {
  const queryClient = useQueryClient();
  
  return useMutation<Tag, Error, Omit<InsertTag, 'id' | 'createdAt' | 'createdBy'>>({
    mutationFn: async (tagData) => {
      const response = await apiRequest('POST', '/api/tags', tagData);
      return response.json();
    },
    onSuccess: () => {
      // Invalidar caché para refrescar la lista
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
    }
  });
}

// Hook para etiquetas de una alerta específica
export function useAlertTags(alertId: number) {
  return useQuery<Tag[]>({
    queryKey: ['/api/alerts', alertId, 'tags'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/alerts/${alertId}/tags`);
      return response.json();
    }
  });
}

// Hook para añadir etiqueta a alerta
export function useAddTagToAlert() {
  const queryClient = useQueryClient();
  
  return useMutation<any, Error, { alertId: number; tagId: number }>({
    mutationFn: async ({ alertId, tagId }) => {
      const response = await apiRequest('POST', `/api/alerts/${alertId}/tags`, { tagId });
      return response.json();
    },
    onSuccess: (_, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts', alertId, 'tags'] });
    }
  });
}

// Hook para remover etiqueta de alerta
export function useRemoveTagFromAlert() {
  const queryClient = useQueryClient();
  
  return useMutation<any, Error, { alertId: number; tagId: number }>({
    mutationFn: async ({ alertId, tagId }) => {
      const response = await apiRequest('DELETE', `/api/alerts/${alertId}/tags/${tagId}`);
      return response.json();
    },
    onSuccess: (_, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts', alertId, 'tags'] });
    }
  });
}
```

### Componente de Etiqueta Individual

```tsx
// client/src/components/ui/tag.tsx
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline';
  onRemove?: () => void;
  className?: string;
}

export function Tag({ 
  name, 
  color = '#6B7280', 
  size = 'md', 
  variant = 'default',
  onRemove,
  className 
}: TagProps) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const baseClasses = cn(
    'inline-flex items-center rounded-full font-medium',
    sizeClasses[size],
    className
  );

  const tagStyle = variant === 'default' 
    ? { backgroundColor: color, color: getContrastColor(color) }
    : { borderColor: color, color: color };

  return (
    <span 
      className={cn(
        baseClasses,
        variant === 'outline' && 'border bg-transparent'
      )}
      style={tagStyle}
    >
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:bg-black/20 rounded-full p-0.5"
          aria-label={`Remove ${name} tag`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

// Función helper para calcular color de texto contrastante
function getContrastColor(hexColor: string): string {
  // Convertir hex a RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calcular luminancia
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
```

### Componente Selector de Etiquetas

```tsx
// client/src/components/alerts/tag-selector.tsx
import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { 
  useTags, 
  useCreateTag, 
  useAddTagToAlert, 
  useRemoveTagFromAlert 
} from '@/hooks/use-tags';
import { Tag } from '@/components/ui/tag';

interface TagSelectorProps {
  alertId: number;
  selectedTags: Tag[];
}

export function TagSelector({ alertId, selectedTags }: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  
  const { toast } = useToast();
  const { data: allTags = [], isLoading: tagsLoading } = useTags();
  const createTagMutation = useCreateTag();
  const addTagMutation = useAddTagToAlert();
  const removeTagMutation = useRemoveTagFromAlert();

  // Etiquetas disponibles (no seleccionadas)
  const availableTags = allTags.filter(tag => 
    !selectedTags.some(selected => selected.id === tag.id)
  );

  const handleAddTag = async (tagId: number) => {
    try {
      await addTagMutation.mutateAsync({ alertId, tagId });
      toast({
        title: "Tag Added",
        description: "Tag has been added to the alert.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add tag to alert.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await removeTagMutation.mutateAsync({ alertId, tagId });
      toast({
        title: "Tag Removed",
        description: "Tag has been removed from the alert.",
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to remove tag from alert.",
        variant: "destructive",
      });
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const newTag = await createTagMutation.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor
      });
      
      // Añadir automáticamente a la alerta
      await handleAddTag(newTag.id);
      
      setNewTagName('');
      setNewTagColor('#3B82F6');
      toast({
        title: "Tag Created",
        description: `Tag "${newTag.name}" has been created and added.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create tag.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      {/* Etiquetas actuales */}
      <div className="flex flex-wrap gap-2">
        {selectedTags.map(tag => (
          <Tag
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={() => handleRemoveTag(tag.id)}
          />
        ))}
      </div>

      {/* Selector de etiquetas */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus size={16} className="mr-1" />
            Add Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-4">
            <h4 className="font-medium">Add Tags to Alert</h4>
            
            {/* Crear nueva etiqueta */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="New tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-10 h-10 rounded border"
                />
              </div>
              <Button 
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || createTagMutation.isPending}
                size="sm"
                className="w-full"
              >
                {createTagMutation.isPending && (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                )}
                Create & Add Tag
              </Button>
            </div>

            {/* Etiquetas existentes */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Existing Tags:</p>
              {tagsLoading ? (
                <p className="text-sm">Loading tags...</p>
              ) : availableTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No available tags</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {availableTags.map(tag => (
                    <div 
                      key={tag.id}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded"
                    >
                      <Tag name={tag.name} color={tag.color} size="sm" />
                      <Button
                        onClick={() => handleAddTag(tag.id)}
                        disabled={addTagMutation.isPending}
                        size="sm"
                        variant="ghost"
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

### Integración en la Página de Alertas

```tsx
// client/src/pages/alerts.tsx
import { TagSelector } from '@/components/alerts/tag-selector';
import { useAlertTags } from '@/hooks/use-tags';

// Dentro del componente de alerta individual
function AlertCard({ alert }: { alert: Alert }) {
  const { data: alertTags = [] } = useAlertTags(alert.id);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{alert.title}</CardTitle>
            <CardDescription>{alert.description}</CardDescription>
          </div>
          <Badge variant={getSeverityVariant(alert.severity)}>
            {alert.severity}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Información de la alerta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Source</p>
              <p className="text-sm text-muted-foreground">{alert.source}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Created</p>
              <p className="text-sm text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Sistema de etiquetas */}
          <div>
            <p className="text-sm font-medium mb-2">Tags</p>
            <TagSelector alertId={alert.id} selectedTags={alertTags} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Paso 4: Testing

### Tests de Backend

```typescript
// server/tests/tags.test.ts
import request from 'supertest';
import { app } from '../index';
import { db } from '../db';
import { tags, alerts, alertTags } from '@shared/schema';

describe('Tags API', () => {
  let authToken: string;
  let testAlertId: number;

  beforeAll(async () => {
    // Setup de testing
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpass' });
    authToken = response.body.token;

    // Crear alerta de prueba
    const alertResponse = await request(app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Test Alert',
        severity: 'medium',
        description: 'Test alert for tags'
      });
    testAlertId = alertResponse.body.id;
  });

  describe('POST /api/tags', () => {
    it('should create a new tag', async () => {
      const response = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'malware',
          color: '#FF0000',
          description: 'Malware related alerts'
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('malware');
      expect(response.body.color).toBe('#FF0000');
    });

    it('should reject duplicate tag names', async () => {
      // Crear tag inicial
      await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'phishing' });

      // Intentar crear duplicado
      const response = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'phishing' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/alerts/:alertId/tags', () => {
    it('should add tag to alert', async () => {
      // Crear tag
      const tagResponse = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'test-tag' });

      // Añadir tag a alerta
      const response = await request(app)
        .post(`/api/alerts/${testAlertId}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tagId: tagResponse.body.id });

      expect(response.status).toBe(201);
      expect(response.body.alertId).toBe(testAlertId);
      expect(response.body.tagId).toBe(tagResponse.body.id);
    });
  });
});
```

### Tests de Frontend

```typescript
// client/src/components/alerts/__tests__/tag-selector.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagSelector } from '../tag-selector';

// Mock de hooks
jest.mock('@/hooks/use-tags', () => ({
  useTags: () => ({
    data: [
      { id: 1, name: 'malware', color: '#FF0000' },
      { id: 2, name: 'phishing', color: '#FFA500' }
    ],
    isLoading: false
  }),
  useAddTagToAlert: () => ({
    mutateAsync: jest.fn(),
    isPending: false
  })
}));

describe('TagSelector', () => {
  const queryClient = new QueryClient();
  
  const renderWithProvider = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  it('should render selected tags', () => {
    const selectedTags = [
      { id: 1, name: 'malware', color: '#FF0000' }
    ];

    renderWithProvider(
      <TagSelector alertId={1} selectedTags={selectedTags} />
    );

    expect(screen.getByText('malware')).toBeInTheDocument();
  });

  it('should open tag selector when Add Tag is clicked', async () => {
    renderWithProvider(
      <TagSelector alertId={1} selectedTags={[]} />
    );

    fireEvent.click(screen.getByText('Add Tag'));

    await waitFor(() => {
      expect(screen.getByText('Add Tags to Alert')).toBeInTheDocument();
    });
  });
});
```

## Paso 5: Documentación

### Actualizar API Documentation

```markdown
# Tags API

## Overview
The Tags API allows you to manage tags and associate them with alerts for better categorization and filtering.

## Endpoints

### GET /api/tags
Get all available tags with usage statistics.

**Response:**
```json
[
  {
    "id": 1,
    "name": "malware",
    "color": "#FF0000",
    "description": "Malware related alerts",
    "usage_count": 15
  }
]
```

### POST /api/tags
Create a new tag.

**Request Body:**
```json
{
  "name": "phishing",
  "color": "#FFA500",
  "description": "Phishing attempts"
}
```

### POST /api/alerts/:alertId/tags
Add a tag to an alert.

**Request Body:**
```json
{
  "tagId": 1
}
```

### DELETE /api/alerts/:alertId/tags/:tagId
Remove a tag from an alert.

### GET /api/alerts/:alertId/tags
Get all tags associated with an alert.
```

## Resumen de lo Implementado

### ✅ Base de Datos
- Esquema de etiquetas con relación many-to-many
- Índices para performance
- Constraints para integridad de datos

### ✅ Backend
- APIs RESTful completas
- Validación de datos
- Manejo de errores
- Autenticación requerida

### ✅ Frontend
- Hooks personalizados con React Query
- Componentes reutilizables
- UI/UX intuitiva
- Estados de carga y error

### ✅ Testing
- Tests unitarios para APIs
- Tests de componentes React
- Casos edge cubiertos

### ✅ Documentación
- API documentation
- Ejemplos de uso
- Guías de implementación

## Próximos Pasos

### Mejoras Posibles
1. **Filtrado avanzado**: Filtrar alertas por múltiples etiquetas
2. **Etiquetas automáticas**: IA que sugiere etiquetas basadas en contenido
3. **Jerarquía de etiquetas**: Etiquetas padre e hijo
4. **Análisis de etiquetas**: Métricas sobre uso de etiquetas
5. **Importar/Exportar**: Bulk operations para etiquetas

### Lecciones Aprendidas
- Planificar el esquema de base de datos antes de escribir código
- Usar TypeScript para mejor experiencia de desarrollo
- React Query simplifica enormemente el estado del servidor
- Testing es crucial para funcionalidades complejas
- Documentar durante el desarrollo, no después

Este ejemplo muestra el flujo completo de desarrollo en el stack SOC: desde la base de datos hasta la interfaz de usuario, pasando por APIs, testing y documentación.