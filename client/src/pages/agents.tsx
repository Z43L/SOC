import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAgentWebSocket } from "@/hooks/use-agent-websocket";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/layout/Layout";
import { apiRequest } from "@/lib/queryClient";
import { 
  AlertTriangle, 
  Check, 
  Download, 
  Laptop, 
  Monitor, 
  RefreshCw, 
  Server, 
  Shield, 
  XCircle,
  Wifi,
  WifiOff,
  ScrollText,
  Activity
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Definición de tipos para agentes
interface Agent {
  id: number;
  name: string;
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
  version: string;
  status: 'active' | 'inactive' | 'warning' | 'error';
  lastHeartbeat: string;
  installedAt: string;
  userId: number;
  capabilities: string[];
  configuration: any;
  systemInfo: any;
  lastMetrics: any;
  agentIdentifier: string;
}

// Esquema de validación para el formulario de creación de agentes
const agentFormSchema = z.object({
  os: z.enum(["windows", "linux", "macos"], {
    required_error: "Por favor seleccione un sistema operativo",
  }),
  customName: z.string().optional(),
  capabilities: z.object({
    fileSystemMonitoring: z.boolean().default(true),
    processMonitoring: z.boolean().default(true),
    networkMonitoring: z.boolean().default(true),
    registryMonitoring: z.boolean().default(false),
    securityLogsMonitoring: z.boolean().default(true),
    malwareScanning: z.boolean().default(false),
    vulnerabilityScanning: z.boolean().default(false),
  }),
});

type AgentFormValues = z.infer<typeof agentFormSchema>;

function AgentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-green-500">
          <Check size={14} className="mr-1" /> Activo
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="outline" className="bg-amber-500 text-black">
          <AlertTriangle size={14} className="mr-1" /> Advertencia
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <XCircle size={14} className="mr-1" /> Error
        </Badge>
      );
    case 'inactive':
    default:
      return (
        <Badge variant="outline">
          <RefreshCw size={14} className="mr-1" /> Inactivo
        </Badge>
      );
  }
}

function AgentIcon({ os }: { os: string }) {
  const osLower = os.toLowerCase();
  
  if (osLower.includes('windows')) {
    return <Monitor className="h-5 w-5 text-blue-500" />;
  } else if (osLower.includes('linux')) {
    return <Server className="h-5 w-5 text-orange-500" />;
  } else if (osLower.includes('macos') || osLower.includes('mac')) {
    return <Laptop className="h-5 w-5 text-gray-500" />;
  } else {
    return <Shield className="h-5 w-5 text-purple-500" />;
  }
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleString();
}

export default function Agents({ user, organization }: any) {
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [registrationKey, setRegistrationKey] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  // WebSocket integration for real-time agent monitoring
  const {
    connectionStatus,
    toggleConnection,
    isManuallyDisabled,
    agentStatuses,
    agentLogs,
    connectedAgents,
    clearLogs,
    getAgentStatus,
    isAgentConnected
  } = useAgentWebSocket();

  const { data: agents, isLoading, error } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    // El queryFn está predefinido en el queryClient
  });
  
  // Obtener el plan actual de la organización
  const { data: currentPlan, isLoading: isLoadingPlan } = useQuery({
    queryKey: ['/api/plans', organization?.planId],
    queryFn: async () => {
      if (!organization?.planId) return null;
      const res = await apiRequest('GET', `/api/plans/${organization.planId}`);
      return await res.json();
    },
    enabled: !!organization?.planId
  });

  const buildAgentMutation = useMutation({
    mutationFn: async (values: AgentFormValues) => {
      const response = await apiRequest("POST", "/api/agents/build", values);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setDownloadUrl(data.downloadUrl);
        setRegistrationKey(data.registrationKey);
        
        // Invalidar caché para refrescar lista de agentes
        queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
        
        toast({
          title: "Agente creado correctamente",
          description: "El paquete de instalación está listo para descargar. Iniciando descarga...",
        });

        // Iniciar descarga automáticamente
        if (data.downloadUrl) {
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.setAttribute('download', ''); // Esto sugiere al navegador que descargue el archivo
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

      } else {
        toast({
          title: "Error al crear agente",
          description: data.message || "Hubo un problema al crear el agente",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `No se pudo crear el agente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      os: "linux",
      customName: "",
      capabilities: {
        fileSystemMonitoring: true,
        processMonitoring: true,
        networkMonitoring: true,
        registryMonitoring: false,
        securityLogsMonitoring: true,
        malwareScanning: false,
        vulnerabilityScanning: false,
      },
    },
  });

  function onSubmit(values: AgentFormValues) {
    buildAgentMutation.mutate(values);
  }

  function resetForm() {
    form.reset();
    setDownloadUrl(null);
    setRegistrationKey(null);
  }

  // Verificar si se ha alcanzado el límite de agentes
  const activeAgents = agents?.filter(a => a.status === 'active') || [];
  const isAgentLimitReached = currentPlan?.maxAgents === 1 && activeAgents.length >= 1;
  
  return (
    <Layout user={user} organization={organization} selectedItem="agents">
      <div className="container mx-auto py-4">
        {currentPlan && currentPlan.maxAgents === 1 && (
          <div className="mb-4 p-4 border rounded bg-amber-50 border-amber-200">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800">Límite de agentes en plan {currentPlan.name}</h3>
                <p className="text-sm text-amber-700">
                  Su plan actual permite {currentPlan.maxAgents} agente activo. 
                  {isAgentLimitReached ? ' Ha alcanzado el límite máximo de agentes.' : ' Puede crear un agente más.'}
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Para agregar más agentes, <a href="/billing" className="underline font-medium">actualice a un plan superior</a>.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold">Agentes</h1>
            
            {/* WebSocket Status */}
            <div className="flex items-center space-x-2">
              <Badge 
                variant={connectionStatus === 'connected' ? 'default' : 'outline'}
                className={connectionStatus === 'connected' ? 'bg-green-500' : ''}
              >
                {connectionStatus === 'connected' ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
                WebSocket {connectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </Badge>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={toggleConnection}
                disabled={connectionStatus === 'connecting'}
              >
                {connectionStatus === 'connecting' ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : connectionStatus === 'connected' ? (
                  <WifiOff className="mr-2 h-4 w-4" />
                ) : (
                  <Wifi className="mr-2 h-4 w-4" />
                )}
                {connectionStatus === 'connected' ? 'Desconectar' : 'Conectar'}
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Live Logs Button */}
            <Button 
              variant="outline"
              onClick={() => setShowLogs(!showLogs)}
              className={showLogs ? 'bg-blue-50' : ''}
            >
              <ScrollText className="mr-2 h-4 w-4" />
              Logs en Vivo {agentLogs.length > 0 && `(${agentLogs.length})`}
            </Button>
            
            <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={isAgentLimitReached || isLoadingPlan}>
                  <Server className="mr-2 h-4 w-4" />
                  Crear Agente
                  {isAgentLimitReached && " (Límite alcanzado)"}
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Configurar Nuevo Agente</DialogTitle>
                <DialogDescription>
                  Configure un nuevo agente para su implementación. Los agentes recolectan datos de seguridad de los sistemas donde son instalados.
                  {currentPlan?.maxAgents === 1 && (
                    <p className="mt-2 text-amber-600 text-sm">
                      <AlertTriangle className="h-4 w-4 inline-flex mr-1 mb-1" />
                      Su plan actual ({currentPlan.name}) permite {currentPlan.maxAgents} agente activo.
                    </p>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              {downloadUrl ? (
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="mb-6 text-center">
                    <h3 className="mb-2 font-semibold">El agente está listo para descargar</h3>
                    <p className="text-sm text-gray-500 mb-4">Descargue el agente e instálelo en el sistema objetivo.</p>
                    <div className="p-3 bg-gray-100 rounded text-xs font-mono mb-4 break-all">
                      <p>Clave de registro (válida por 24h):</p>
                      <p className="mt-1 font-bold">{registrationKey}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button asChild>
                      <a href={downloadUrl} download>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar Agente
                      </a>
                    </Button>
                    <Button variant="outline" onClick={() => {
                      resetForm();
                    }}>
                      Configurar Otro
                    </Button>
                  </div>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="os"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sistema Operativo</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione un sistema operativo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="windows">Windows</SelectItem>
                              <SelectItem value="linux">Linux</SelectItem>
                              <SelectItem value="macos">macOS</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            El sistema operativo donde se instalará el agente.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="customName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre Personalizado (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Servidor de Producción" {...field} />
                          </FormControl>
                          <FormDescription>
                            Un nombre descriptivo para identificar este agente.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div>
                      <h3 className="text-sm font-medium mb-2">Capacidades</h3>
                      <div className="bg-gray-50 p-3 rounded space-y-2">
                        <FormField
                          control={form.control}
                          name="capabilities.fileSystemMonitoring"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Monitoreo de Sistema de Archivos</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="capabilities.processMonitoring"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Monitoreo de Procesos</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="capabilities.networkMonitoring"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Monitoreo de Red</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        {form.watch("os") === "windows" && (
                          <FormField
                            control={form.control}
                            name="capabilities.registryMonitoring"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Monitoreo de Registro de Windows</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        )}
                        
                        <FormField
                          control={form.control}
                          name="capabilities.securityLogsMonitoring"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Monitoreo de Logs de Seguridad</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="capabilities.malwareScanning"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Escaneo de Malware</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="capabilities.vulnerabilityScanning"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Escaneo de Vulnerabilidades</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button type="submit" disabled={buildAgentMutation.isPending}>
                        {buildAgentMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          "Generar Agente"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Live Logs Panel */}
        {showLogs && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Logs en Tiempo Real
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{agentLogs.length} eventos</Badge>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {agentLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay logs disponibles</p>
                ) : (
                  agentLogs.map((log, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <Badge 
                        variant={log.level === 'error' ? 'destructive' : log.level === 'warning' ? 'outline' : 'default'}
                        className="mt-1"
                      >
                        {log.level}
                      </Badge>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <span className="font-medium">{log.agentId}</span>
                          <span>•</span>
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                          {log.eventType && (
                            <>
                              <span>•</span>
                              <span className="italic">{log.eventType}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-1 text-gray-900">{log.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="active">Activos</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
          
          <TabsContent value="active">
            <AgentTable 
              isLoading={isLoading} 
              agents={agents?.filter(a => a.status === 'active') || []} 
              error={error}
              getAgentStatus={getAgentStatus}
              isAgentConnected={isAgentConnected}
            />
          </TabsContent>
          
          <TabsContent value="all">
            <AgentTable 
              isLoading={isLoading} 
              agents={agents || []} 
              error={error}
              getAgentStatus={getAgentStatus}
              isAgentConnected={isAgentConnected}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

interface AgentTableProps {
  isLoading: boolean;
  agents: Agent[];
  error: Error | null;
  getAgentStatus: (agentId: string) => any;
  isAgentConnected: (agentId: string) => boolean;
}

function AgentTable({ isLoading, agents, error, getAgentStatus, isAgentConnected }: AgentTableProps) {
  if (isLoading) {
    return <AgentTableSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-500">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>No se pudieron cargar los agentes: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay agentes disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <p>No se encontraron agentes. Cree un nuevo agente usando el botón "Crear Agente".</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>Estado DB</TableHead>
              <TableHead>WebSocket</TableHead>
              <TableHead>Último Heartbeat</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const wsStatus = getAgentStatus(agent.agentIdentifier || agent.id.toString());
              const isConnected = isAgentConnected(agent.agentIdentifier || agent.id.toString());
              
              return (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium flex items-center">
                    <AgentIcon os={agent.operatingSystem} />
                    <span className="ml-2">{agent.name}</span>
                  </TableCell>
                  <TableCell>{agent.ipAddress || "Desconocida"}</TableCell>
                  <TableCell>
                    {agent.operatingSystem} {agent.version || ""}
                  </TableCell>
                  <TableCell>
                    <AgentStatusBadge status={agent.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={isConnected ? 'default' : 'outline'}
                        className={isConnected ? 'bg-green-500' : ''}
                      >
                        {isConnected ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
                        {isConnected ? 'Online' : 'Offline'}
                      </Badge>
                      {wsStatus?.metrics && (
                        <div className="text-xs text-gray-500">
                          CPU: {wsStatus.metrics.cpu}%
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {wsStatus?.lastHeartbeat ? 
                      formatDate(wsStatus.lastHeartbeat) : 
                      formatDate(agent.lastHeartbeat)
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <Monitor className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <Shield className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AgentTableSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}