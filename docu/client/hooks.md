# Documentación de Hooks y Contexts - Frontend

Esta documentación detalla los hooks personalizados y contexts utilizados en la aplicación para gestionar estado, efectos y lógica reutilizable.

## Índice

- [Custom Hooks](#custom-hooks)
  - [useAuth](#useauth)
  - [useWebSocket](#usewebsocket)
  - [useMobile](#usemobile)
  - [useToast](#usetoast)
  - [useAnalytics](#useanalytics)
  - [useBilling](#usebilling)
- [React Contexts](#react-contexts)
  - [TenantContext](#tenantcontext)
- [Patrones de Uso](#patrones-de-uso)

---

## Custom Hooks

### useAuth

**Archivo:** `client/src/hooks/use-auth.tsx`

#### Propósito
Hook principal para gestionar la autenticación del usuario, incluyendo login, logout, verificación de tokens y estado de autenticación.

#### Interface
```typescript
interface AuthUser {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  organizationId: number;
  permissions: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  updateProfile: (updates: Partial<AuthUser>) => Promise<void>;
}
```

#### Implementación
```typescript
export const useAuth = (): AuthContextType => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verificar token al cargar
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      verifyToken(token);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      setIsLoading(true);
      const response = await apiRequest('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setUser(response.user);
      setOrganization(response.organization);
      setError(null);
    } catch (err) {
      console.error('Token verification failed:', err);
      localStorage.removeItem('authToken');
      setError('Sesión expirada');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      localStorage.setItem('authToken', response.token);
      setUser(response.user);
      setOrganization(response.organization);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    setOrganization(null);
    setError(null);
    
    // Limpiar cache de React Query
    queryClient.clear();
    
    // Redireccionar a página de login
    window.location.href = '/auth';
  };

  const refreshAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      await verifyToken(token);
    }
  };

  const updateProfile = async (updates: Partial<AuthUser>) => {
    try {
      const response = await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      
      setUser(prev => prev ? { ...prev, ...response.user } : null);
    } catch (err) {
      setError('Error al actualizar perfil');
      throw err;
    }
  };

  return {
    user,
    organization,
    isLoading,
    error,
    login,
    logout,
    refreshAuth,
    updateProfile,
  };
};
```

#### Ejemplo de Uso
```typescript
const LoginComponent = () => {
  const { login, isLoading, error } = useAuth();
  
  const handleSubmit = async (credentials) => {
    try {
      await login(credentials);
      // Redireccionar después del login exitoso
    } catch (err) {
      // Error manejado por el hook
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="text-red-500">{error}</div>}
      {/* Campos del formulario */}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
      </Button>
    </form>
  );
};
```

---

### useWebSocket

**Archivo:** `client/src/hooks/use-websocket.ts`

#### Propósito
Hook para gestionar conexiones WebSocket, incluyendo reconexión automática, manejo de errores y estado de conexión.

#### Interface
```typescript
interface WebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  protocols?: string[];
}

interface WebSocketReturn {
  socket: WebSocket | null;
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastMessage: MessageEvent | null;
  send: (data: string | object) => void;
  disconnect: () => void;
  reconnect: () => void;
}
```

#### Implementación
```typescript
export const useWebSocket = (
  url: string, 
  options: WebSocketOptions = {}
): WebSocketReturn => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
    protocols
  } = options;

  const connect = useCallback(() => {
    try {
      setConnectionState('connecting');
      
      const wsUrl = url.startsWith('ws') ? url : `ws://${window.location.host}${url}`;
      const ws = new WebSocket(wsUrl, protocols);

      ws.onopen = (event) => {
        setSocket(ws);
        setIsConnected(true);
        setConnectionState('connected');
        setReconnectAttempts(0);
        onOpen?.(event);
      };

      ws.onmessage = (event) => {
        setLastMessage(event);
        onMessage?.(event);
      };

      ws.onclose = (event) => {
        setSocket(null);
        setIsConnected(false);
        setConnectionState('disconnected');
        onClose?.(event);

        // Reconexión automática
        if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (event) => {
        setConnectionState('error');
        onError?.(event);
      };

    } catch (error) {
      setConnectionState('error');
      console.error('WebSocket connection error:', error);
    }
  }, [url, onMessage, onError, onOpen, onClose, reconnectAttempts, maxReconnectAttempts, reconnectInterval, protocols]);

  const send = useCallback((data: string | object) => {
    if (socket && isConnected) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      socket.send(message);
    } else {
      console.warn('WebSocket is not connected');
    }
  }, [socket, isConnected]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.close(1000, 'Manual disconnect');
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    disconnect();
    setReconnectAttempts(0);
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    socket,
    isConnected,
    connectionState,
    lastMessage,
    send,
    disconnect,
    reconnect,
  };
};
```

#### Ejemplo de Uso
```typescript
const AlertsPage = () => {
  const { lastMessage, isConnected, send } = useWebSocket('/ws/alerts', {
    onMessage: (message) => {
      const data = JSON.parse(message.data);
      if (data.type === 'new_alert') {
        // Actualizar lista de alertas
        queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
        
        // Mostrar notificación
        toast({
          title: "Nueva alerta",
          description: `${data.alert.title} - ${data.alert.severity}`,
        });
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Error de conexión",
        description: "Se perdió la conexión en tiempo real",
        variant: "destructive",
      });
    }
  });

  const handleAlertAction = (alertId: number, action: string) => {
    send({
      type: 'alert_action',
      alertId,
      action,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-sm text-muted-foreground">
          {isConnected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      {/* Contenido de alertas */}
    </div>
  );
};
```

---

### useMobile

**Archivo:** `client/src/hooks/use-mobile.tsx`

#### Propósito
Hook para detectar si la aplicación se está ejecutando en un dispositivo móvil y adaptar la UI responsivamente.

#### Implementación
```typescript
export const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth < 768;
      
      setIsMobile(isMobileDevice || isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};
```

#### Ejemplo de Uso
```typescript
const Sidebar = () => {
  const isMobile = useMobile();
  const [isOpen, setIsOpen] = useState(!isMobile);

  return (
    <>
      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            {/* Contenido del sidebar móvil */}
          </SheetContent>
        </Sheet>
      ) : (
        <aside className="w-64 bg-card border-r">
          {/* Contenido del sidebar desktop */}
        </aside>
      )}
    </>
  );
};
```

---

### useToast

**Archivo:** `client/src/hooks/use-toast.ts`

#### Propósito
Hook para gestionar notificaciones tipo toast en la aplicación.

#### Interface
```typescript
interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (toastId: string) => void;
  dismissAll: () => void;
}
```

#### Implementación
```typescript
export const useToast = (): ToastContextType => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toastData, id };
    
    setToasts(prev => [...prev, newToast]);

    // Auto dismiss después de duration
    const duration = toastData.duration || 5000;
    setTimeout(() => {
      dismiss(id);
    }, duration);
  }, []);

  const dismiss = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return { toasts, toast, dismiss, dismissAll };
};
```

#### Ejemplo de Uso
```typescript
const AlertActions = () => {
  const { toast } = useToast();

  const handleUpdateAlert = async () => {
    try {
      await updateAlert(alertId, updates);
      toast({
        title: "Éxito",
        description: "Alerta actualizada correctamente",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar la alerta",
        variant: "destructive",
        action: {
          label: "Reintentar",
          onClick: () => handleUpdateAlert(),
        },
      });
    }
  };

  return (
    <Button onClick={handleUpdateAlert}>
      Actualizar Alerta
    </Button>
  );
};
```

---

### useAnalytics

**Archivo:** `client/src/hooks/useAnalytics.ts`

#### Propósito
Hook para recopilar y enviar analytics de uso de la aplicación.

#### Interface
```typescript
interface AnalyticsEvent {
  event: string;
  category: string;
  properties?: Record<string, any>;
  userId?: string;
  timestamp?: Date;
}

interface AnalyticsHook {
  track: (event: AnalyticsEvent) => void;
  page: (pageName: string, properties?: Record<string, any>) => void;
  identify: (userId: string, traits?: Record<string, any>) => void;
}
```

#### Implementación
```typescript
export const useAnalytics = (): AnalyticsHook => {
  const { user } = useAuth();

  const track = useCallback((event: AnalyticsEvent) => {
    const eventData = {
      ...event,
      userId: user?.id || 'anonymous',
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Enviar a servicio de analytics
    apiRequest('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify(eventData),
    }).catch(error => {
      console.error('Analytics tracking error:', error);
    });
  }, [user]);

  const page = useCallback((pageName: string, properties?: Record<string, any>) => {
    track({
      event: 'page_view',
      category: 'navigation',
      properties: {
        page: pageName,
        ...properties,
      },
    });
  }, [track]);

  const identify = useCallback((userId: string, traits?: Record<string, any>) => {
    track({
      event: 'user_identify',
      category: 'user',
      properties: {
        userId,
        ...traits,
      },
    });
  }, [track]);

  return { track, page, identify };
};
```

#### Ejemplo de Uso
```typescript
const AlertsPage = () => {
  const { track, page } = useAnalytics();

  useEffect(() => {
    page('alerts');
  }, [page]);

  const handleFilterChange = (filter: string) => {
    track({
      event: 'alerts_filter_changed',
      category: 'alerts',
      properties: { filter },
    });
    
    setFilter(filter);
  };

  const handleAlertClick = (alertId: number) => {
    track({
      event: 'alert_clicked',
      category: 'alerts',
      properties: { alertId },
    });
  };

  return (
    <div>
      {/* Contenido de la página */}
    </div>
  );
};
```

---

### useBilling

**Archivo:** `client/src/hooks/useBilling.ts`

#### Propósito
Hook para gestionar información de facturación, suscripciones y pagos.

#### Interface
```typescript
interface Subscription {
  id: string;
  plan: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

interface BillingHook {
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  createCheckoutSession: (priceId: string) => Promise<string>;
  createPortalSession: () => Promise<string>;
  cancelSubscription: () => Promise<void>;
  resumeSubscription: () => Promise<void>;
}
```

#### Implementación
```typescript
export const useBilling = (): BillingHook => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest('/api/billing/subscription');
      setSubscription(response.subscription);
    } catch (err) {
      setError('Error al cargar información de facturación');
    } finally {
      setIsLoading(false);
    }
  };

  const createCheckoutSession = async (priceId: string): Promise<string> => {
    try {
      const response = await apiRequest('/api/billing/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ priceId }),
      });
      return response.url;
    } catch (err) {
      throw new Error('Error al crear sesión de checkout');
    }
  };

  const createPortalSession = async (): Promise<string> => {
    try {
      const response = await apiRequest('/api/billing/create-portal-session', {
        method: 'POST',
      });
      return response.url;
    } catch (err) {
      throw new Error('Error al crear sesión del portal');
    }
  };

  const cancelSubscription = async () => {
    try {
      await apiRequest('/api/billing/cancel-subscription', {
        method: 'POST',
      });
      await fetchSubscription();
    } catch (err) {
      throw new Error('Error al cancelar suscripción');
    }
  };

  const resumeSubscription = async () => {
    try {
      await apiRequest('/api/billing/resume-subscription', {
        method: 'POST',
      });
      await fetchSubscription();
    } catch (err) {
      throw new Error('Error al reanudar suscripción');
    }
  };

  return {
    subscription,
    isLoading,
    error,
    createCheckoutSession,
    createPortalSession,
    cancelSubscription,
    resumeSubscription,
  };
};
```

---

## React Contexts

### TenantContext

**Archivo:** `client/src/contexts/TenantContext.tsx`

#### Propósito
Context para gestionar información multi-tenant, incluyendo organización actual, configuraciones específicas y permisos.

#### Interface
```typescript
interface Organization {
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
}

interface TenantContextType {
  organization: Organization | null;
  userRole: string | null;
  language: string;
  timezone: string;
  hasFeature: (feature: string) => boolean;
  hasPermission: (permission: string) => boolean;
  switchOrganization: (orgId: number) => Promise<void>;
  updateSettings: (settings: Partial<Organization['settings']>) => Promise<void>;
}
```

#### Implementación
```typescript
const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: React.ReactNode;
  initialOrganizationId?: number | null;
  initialUserRole?: string | null;
  initialLanguage?: string;
}

export const TenantProvider: FC<TenantProviderProps> = ({
  children,
  initialOrganizationId,
  initialUserRole,
  initialLanguage = 'es',
}) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string | null>(initialUserRole);
  const [language, setLanguage] = useState(initialLanguage);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.organizationId) {
      fetchOrganization(user.organizationId);
      setUserRole(user.role);
    }
  }, [user]);

  const fetchOrganization = async (orgId: number) => {
    try {
      const response = await apiRequest(`/api/organizations/${orgId}`);
      setOrganization(response.organization);
      setLanguage(response.organization.settings.language || 'es');
    } catch (error) {
      console.error('Error fetching organization:', error);
    }
  };

  const hasFeature = useCallback((feature: string): boolean => {
    return organization?.features.includes(feature) || false;
  }, [organization]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!userRole) return false;

    const rolePermissions = {
      admin: ['*'],
      manager: ['read_alerts', 'write_alerts', 'read_incidents', 'write_incidents'],
      analyst: ['read_alerts', 'read_incidents'],
      viewer: ['read_alerts'],
    };

    const permissions = rolePermissions[userRole] || [];
    return permissions.includes('*') || permissions.includes(permission);
  }, [userRole]);

  const switchOrganization = async (orgId: number) => {
    try {
      await apiRequest('/api/auth/switch-organization', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
      });
      
      await fetchOrganization(orgId);
    } catch (error) {
      throw new Error('Error al cambiar organización');
    }
  };

  const updateSettings = async (settings: Partial<Organization['settings']>) => {
    if (!organization) return;

    try {
      const response = await apiRequest(`/api/organizations/${organization.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });

      setOrganization(prev => prev ? {
        ...prev,
        settings: { ...prev.settings, ...response.settings }
      } : null);

      if (settings.language) {
        setLanguage(settings.language);
      }
    } catch (error) {
      throw new Error('Error al actualizar configuración');
    }
  };

  const timezone = organization?.settings.timezone || 'UTC';

  const value: TenantContextType = {
    organization,
    userRole,
    language,
    timezone,
    hasFeature,
    hasPermission,
    switchOrganization,
    updateSettings,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
```

#### Ejemplo de Uso
```typescript
const AlertsPage = () => {
  const { hasPermission, hasFeature, timezone } = useTenant();

  const canCreateAlert = hasPermission('write_alerts');
  const hasAdvancedAnalytics = hasFeature('advanced_analytics');

  return (
    <div>
      {canCreateAlert && (
        <Button onClick={() => setCreateDialogOpen(true)}>
          Nueva Alerta
        </Button>
      )}
      
      {hasAdvancedAnalytics && (
        <AdvancedAnalyticsPanel />
      )}
      
      <AlertsTable timezone={timezone} />
    </div>
  );
};
```

---

## Patrones de Uso

### Composición de Hooks

#### Hook Compuesto para Páginas
```typescript
const usePageState = (pageKey: string) => {
  const { page } = useAnalytics();
  const { user } = useAuth();
  const { hasPermission } = useTenant();
  const { toast } = useToast();

  useEffect(() => {
    page(pageKey);
  }, [page, pageKey]);

  const showError = (message: string) => {
    toast({
      title: "Error",
      description: message,
      variant: "destructive",
    });
  };

  const showSuccess = (message: string) => {
    toast({
      title: "Éxito",
      description: message,
      variant: "success",
    });
  };

  return {
    user,
    hasPermission,
    showError,
    showSuccess,
  };
};
```

#### Hook para Formularios
```typescript
const useFormState = <T>(schema: ZodSchema<T>, defaultValues: T) => {
  const { toast } = useToast();
  
  const form = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleSubmit = (onSubmit: (data: T) => Promise<void>) => {
    return form.handleSubmit(async (data) => {
      try {
        await onSubmit(data);
        toast({
          title: "Éxito",
          description: "Datos guardados correctamente",
          variant: "success",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error.message || "Error al guardar",
          variant: "destructive",
        });
      }
    });
  };

  return {
    form,
    handleSubmit,
    isSubmitting: form.formState.isSubmitting,
    errors: form.formState.errors,
  };
};
```

### Error Boundaries con Hooks

```typescript
const useErrorBoundary = () => {
  const [error, setError] = useState<Error | null>(null);

  const resetError = () => setError(null);

  const captureError = (error: Error) => {
    setError(error);
    console.error('Error captured:', error);
  };

  if (error) {
    throw error;
  }

  return { captureError, resetError };
};
```

### Optimización de Performance

#### Debounced Hook
```typescript
const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Uso en búsqueda
const SearchComponent = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { data: results } = useQuery({
    queryKey: ['search', debouncedSearchTerm],
    queryFn: () => searchAPI(debouncedSearchTerm),
    enabled: debouncedSearchTerm.length > 2,
  });

  return (
    <Input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Buscar..."
    />
  );
};
```

### Testing de Hooks

```typescript
// Ejemplo de test para useAuth
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './use-auth';

describe('useAuth', () => {
  it('should login successfully', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        username: 'test@example.com',
        password: 'password123',
      });
    });

    expect(result.current.user).toBeDefined();
    expect(result.current.error).toBeNull();
  });

  it('should handle login error', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.login({
          username: 'invalid@example.com',
          password: 'wrongpassword',
        });
      } catch (error) {
        // Error esperado
      }
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeDefined();
  });
});
```