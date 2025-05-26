import { FC, useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Connector as ConnectorType } from "@shared/schema";

interface ConnectorsProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

// Datos simulados para el gráfico de métricas
const metricsData = [
  { name: '00:00', volume: 240, errors: 2 },
  { name: '04:00', volume: 300, errors: 0 },
  { name: '08:00', volume: 620, errors: 1 },
  { name: '12:00', volume: 530, errors: 0 },
  { name: '16:00', volume: 750, errors: 3 },
  { name: '20:00', volume: 490, errors: 1 },
  { name: 'Now', volume: 380, errors: 0 },
];

const Connectors: FC<ConnectorsProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [isAddConnectorOpen, setIsAddConnectorOpen] = useState(false);
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [isTestConnectorOpen, setIsTestConnectorOpen] = useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorType | null>(null);
  const [testingStatus, setTestingStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [newConnector, setNewConnector] = useState({
    name: '',
    type: 'SIEM Integration',
    vendor: 'Palo Alto Networks',
    connectionMethod: 'API',
    status: 'configuring',
    isActive: true,
    icon: 'shield-alt',
    dataVolume: '0 MB/day',
    lastData: 'Never'
  });
  
  // Obtener la lista de conectores
  const { data: connectors = [], isLoading, error } = useQuery<ConnectorType[]>({
    queryKey: ['/api/connectors'],
    staleTime: 30000, // 30 segundos
  });
  
  // Mutación para crear un nuevo conector
  const createConnectorMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/connectors', data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connectors'] });
      setIsAddConnectorOpen(false);
      toast({
        title: "Connector Added",
        description: "The new connector has been added successfully. Please configure its settings.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Adding Connector",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Mutación para actualizar un conector existente
  const updateConnectorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      const response = await apiRequest('PUT', `/api/connectors/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connectors'] });
      setIsConfigureOpen(false);
      toast({
        title: "Configuration Saved",
        description: `The configuration for ${selectedConnector?.name} has been updated successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Updating Connector",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Mutación para eliminar un conector
  const deleteConnectorMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/connectors/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connectors'] });
      setIsDeleteConfirmOpen(false);
      toast({
        title: "Connector Deleted",
        description: `${selectedConnector?.name} has been removed successfully.`,
        variant: "destructive"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Deleting Connector",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Mutación para activar/desactivar un conector
  const toggleConnectorMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number, isActive: boolean }) => {
      const response = await apiRequest('POST', `/api/connectors/${id}/toggle`, { isActive });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/connectors'] });
      toast({
        title: data.isActive ? "Connector Activated" : "Connector Deactivated",
        description: `${data.name} has been ${data.isActive ? "activated" : "deactivated"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Toggling Connector",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Añadir hook para campos dinámicos y ayuda contextual
  const connectorTypeFields: Record<string, { label: string; type: string; placeholder?: string; help?: string }[]> = {
    'API': [
      { label: 'API URL', type: 'text', placeholder: 'https://api.example.com/v1', help: 'URL base de la API a consultar.' },
      { label: 'API Key', type: 'password', placeholder: '••••••••••', help: 'Clave de autenticación para la API.' },
      { label: 'Polling Interval (segundos)', type: 'number', placeholder: '300', help: 'Frecuencia de consulta a la API.' },
    ],
    'Syslog': [
      { label: 'IP/Hostname', type: 'text', placeholder: '192.168.1.10', help: 'Dirección donde se recibirá el Syslog.' },
      { label: 'Puerto', type: 'number', placeholder: '514', help: 'Puerto UDP/TCP para Syslog.' },
      { label: 'Protocolo', type: 'text', placeholder: 'udp/tcp/tls', help: 'Protocolo de transporte.' },
    ],
    'Agent': [
      { label: 'Clave de Registro', type: 'text', placeholder: 'clave-secreta', help: 'Clave que deben usar los agentes para registrarse.' },
      { label: 'Intervalo de Heartbeat (segundos)', type: 'number', placeholder: '300', help: 'Frecuencia con la que los agentes reportan estado.' },
    ],
  };

  // Agregar nuevo conector
  const handleAddConnector = () => {
    // Validación básica antes de crear
    if (!newConnector.name || !newConnector.type || !newConnector.vendor) {
      toast({ title: 'Faltan campos obligatorios', description: 'Completa todos los campos requeridos.', variant: 'destructive' });
      return;
    }
    
    createConnectorMutation.mutate({
      name: newConnector.name || 'New Connector',
      type: newConnector.type,
      vendor: newConnector.vendor,
      status: 'configuring',
      isActive: true,
      icon: newConnector.type.includes('Firewall') ? 'fire-alt' : 
            newConnector.type.includes('Cloud') ? 'cloud' : 
            newConnector.type.includes('Endpoint') ? 'shield-alt' : 
            newConnector.type.includes('Network') ? 'network-wired' : 'database',
      dataVolume: '0 MB/day',
      lastData: 'Never',
      configuration: {
        connectionMethod: newConnector.connectionMethod
      }
    });
  };

  // Configurar conector existente
  const handleConfigureConnector = (connector: ConnectorType) => {
    setSelectedConnector(connector);
    setIsConfigureOpen(true);
  };

  // Guardar configuración
  const handleSaveConfiguration = () => {
    if (selectedConnector) {
      updateConnectorMutation.mutate({
        id: selectedConnector.id,
        data: {
          ...selectedConnector,
          status: 'active',
        }
      });
    }
  };

  // Probar conector
  const handleTestConnector = (connector: ConnectorType) => {
    setSelectedConnector(connector);
    setTestingStatus('idle');
    setIsTestConnectorOpen(true);
  };

  // Ejecutar prueba de conector
  // Mutación para ejecutar un conector manualmente
  const executeConnectorMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/connectors/${id}/execute`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/connectors'] });
      setTestingStatus('success');
      toast({
        title: "Connector Executed Successfully",
        description: `${data.message}. Processed: ${data.data.alerts} alerts, ${data.data.threatIntel} threat intel items.`,
      });
    },
    onError: (error: Error) => {
      setTestingStatus('error');
      toast({
        title: "Error Executing Connector",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const runConnectorTest = () => {
    if (!selectedConnector) return;
    
    setTestingStatus('testing');
    executeConnectorMutation.mutate(selectedConnector.id);
  };

  // Ver métricas del conector
  const handleViewMetrics = (connector: ConnectorType) => {
    setSelectedConnector(connector);
    setIsMetricsOpen(true);
  };

  // Activar/desactivar conector
  const handleToggleConnector = (connector: ConnectorType, newState: boolean) => {
    toggleConnectorMutation.mutate({
      id: connector.id, 
      isActive: newState
    });
  };

  // Eliminar conector
  const handleDeleteConnector = (connector: ConnectorType) => {
    setSelectedConnector(connector);
    setIsDeleteConfirmOpen(true);
  };

  // Confirmar eliminación
  const confirmDeleteConnector = () => {
    if (selectedConnector) {
      deleteConnectorMutation.mutate(selectedConnector.id);
    }
  };
  
  // Obtener badge de estado
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-red-700 bg-opacity-20 text-red-500">Inactive</Badge>;
      case 'warning':
        return <Badge className="bg-orange-700 bg-opacity-20 text-orange-500">Warning</Badge>;
      case 'configuring':
        return <Badge className="bg-blue-900 bg-opacity-20 text-blue-500">Configuring</Badge>;
      case 'error':
        return <Badge className="bg-red-700 bg-opacity-20 text-red-500">Error</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="connectors" />
      
      <MainContent pageTitle="Data Connectors" organization={organization}>
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoint Security</TabsTrigger>
            <TabsTrigger value="network">Network Security</TabsTrigger>
            <TabsTrigger value="cloud">Cloud Security</TabsTrigger>
            <TabsTrigger value="threat">Threat Intelligence</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Total Data Sources</p>
                    <h3 className="text-3xl font-bold mt-1">{connectors.length}</h3>
                    <p className="text-green-500 text-xs mt-1">
                      <i className="fas fa-arrow-up mr-1"></i> 3 new this month
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Active Connectors</p>
                    <h3 className="text-3xl font-bold mt-1">
                      {connectors.filter(c => c.isActive).length}
                    </h3>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-green-500 h-1.5 rounded-full" 
                        style={{ 
                          width: `${(connectors.filter(c => c.isActive).length / connectors.length) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <p className="text-xs mt-1">
                      {Math.round((connectors.filter(c => c.isActive).length / connectors.length) * 100)}% of total
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Data Volume</p>
                    <h3 className="text-3xl font-bold mt-1">3.2 TB</h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      Daily average
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Integration Health</p>
                    <h3 className="text-3xl font-bold mt-1 text-green-500">Good</h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      {connectors.filter(c => c.status === 'warning').length} warnings to review
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>All Data Connectors</CardTitle>
                  <CardDescription>Manage your security data sources</CardDescription>
                </div>
                <Dialog open={isAddConnectorOpen} onOpenChange={setIsAddConnectorOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <i className="fas fa-plus mr-2"></i> Add Connector
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New Data Connector</DialogTitle>
                      <DialogDescription>
                        Configure a new data source to ingest security data from your environment.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Connector Type</label>
                        <select 
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                          value={newConnector.type}
                          onChange={(e) => setNewConnector({...newConnector, type: e.target.value})}
                        >
                          <option>SIEM Integration</option>
                          <option>Endpoint Protection</option>
                          <option>Network IDS/IPS</option>
                          <option>Firewall</option>
                          <option>Cloud Security</option>
                          <option>Vulnerability Scanner</option>
                          <option>Threat Intelligence Feed</option>
                          <option>Custom Log Source</option>
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Display Name</label>
                        <input 
                          type="text" 
                          placeholder="Production Firewall"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                          value={newConnector.name}
                          onChange={(e) => setNewConnector({...newConnector, name: e.target.value})}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Vendor</label>
                        <select 
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                          value={newConnector.vendor}
                          onChange={(e) => setNewConnector({...newConnector, vendor: e.target.value})}
                        >
                          <option>Palo Alto Networks</option>
                          <option>Cisco</option>
                          <option>Fortinet</option>
                          <option>Check Point</option>
                          <option>CrowdStrike</option>
                          <option>Microsoft</option>
                          <option>Splunk</option>
                          <option>Other</option>
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Connection Method</label>
                        <select 
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                          value={newConnector.connectionMethod}
                          onChange={(e) => setNewConnector({...newConnector, connectionMethod: e.target.value})}
                        >
                          <option>API</option>
                          <option>Log Collection</option>
                          <option>Syslog</option>
                          <option>Agent</option>
                          <option>SFTP</option>
                        </select>
                      </div>
                      
                      {/* Campos dinámicos según el tipo de conector */}
                      {connectorTypeFields[newConnector.connectionMethod] && (
                        <div className="space-y-2 border-t border-gray-800 pt-4 mt-2">
                          <label className="text-xs font-semibold text-muted-foreground">Configuración específica</label>
                          {connectorTypeFields[newConnector.connectionMethod].map((field, idx) => (
                            <div key={field.label} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">{field.label}</label>
                                {field.help && <span className="text-xs text-muted-foreground ml-2" title={field.help}>?</span>}
                              </div>
                              <input
                                type={field.type}
                                placeholder={field.placeholder}
                                className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                                value={newConnector[field.label.replace(/\s.*/,'').toLowerCase()] || ''}
                                onChange={e => setNewConnector({
                                  ...newConnector,
                                  [field.label.replace(/\s.*/,'').toLowerCase()]: e.target.value
                                })}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddConnectorOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddConnector}>Create & Configure</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left bg-background-lighter">
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Name</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Type</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Data Volume</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Last Data</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Active</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {connectors.map((connector) => (
                        <tr key={connector.id} className="hover:bg-background-lighter">
                          <td className="p-3">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded flex items-center justify-center bg-blue-900 bg-opacity-20 mr-3">
                                <i className={`fas fa-${connector.icon} text-blue-500`}></i>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-text-primary">{connector.name}</p>
                                <p className="text-xs text-muted-foreground">{connector.vendor}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{connector.type}</td>
                          <td className="p-3 text-sm text-muted-foreground">{connector.dataVolume}</td>
                          <td className="p-3">
                            {getStatusBadge(connector.status)}
                            {connector.status === 'error' && <span className="ml-2 text-xs text-red-500">¡Error!</span>}
                            {connector.status === 'inactive' && <span className="ml-2 text-xs text-yellow-500">Inactivo</span>}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{connector.lastData}</td>
                          <td className="p-3">
                            <Switch
                              checked={connector.isActive}
                              onCheckedChange={(checked) => handleToggleConnector(connector, checked)}
                            />
                          </td>
                          <td className="p-3 text-sm">
                            <div className="flex space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleConfigureConnector(connector)}
                                title="Configure"
                              >
                                <i className="fas fa-cog"></i>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleViewMetrics(connector)}
                                title="View Metrics"
                              >
                                <i className="fas fa-chart-line"></i>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleTestConnector(connector)}
                                title="Test Connection"
                              >
                                <i className="fas fa-vial"></i>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteConnector(connector)}
                                title="Delete"
                                className="hover:text-red-500"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Otras pestañas */}
          <TabsContent value="endpoints">
            <Card>
              <CardHeader>
                <CardTitle>Endpoint Security Connectors</CardTitle>
                <CardDescription>Manage endpoint detection and response integrations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configure endpoint connectors from this view.</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="network">
            <Card>
              <CardHeader>
                <CardTitle>Network Security Connectors</CardTitle>
                <CardDescription>Manage network security monitoring integrations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configure network security connectors from this view.</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="cloud">
            <Card>
              <CardHeader>
                <CardTitle>Cloud Security Connectors</CardTitle>
                <CardDescription>Manage cloud security integrations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configure cloud security connectors from this view.</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="threat">
            <Card>
              <CardHeader>
                <CardTitle>Threat Intelligence Connectors</CardTitle>
                <CardDescription>Manage threat intel feed integrations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configure threat intelligence connectors from this view.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </MainContent>
      
      {/* Dialog de Configuración de Conector */}
      <Dialog open={isConfigureOpen} onOpenChange={setIsConfigureOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configure {selectedConnector?.name}</DialogTitle>
            <DialogDescription>
              Adjust settings for {selectedConnector?.vendor} {selectedConnector?.type} integration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <input 
                  type="text" 
                  value={selectedConnector?.name}
                  className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Collection Frequency</label>
                <select className="w-full bg-background border border-gray-700 rounded px-3 py-2">
                  <option>Real-time</option>
                  <option>Every 5 minutes</option>
                  <option>Every 15 minutes</option>
                  <option>Every hour</option>
                  <option>Every day</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">API URL or Endpoint</label>
              <input 
                type="text" 
                placeholder="https://api.example.com/v1"
                className="w-full bg-background border border-gray-700 rounded px-3 py-2"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Authentication Method</label>
              <select className="w-full bg-background border border-gray-700 rounded px-3 py-2">
                <option>API Key</option>
                <option>OAuth</option>
                <option>Basic Authentication</option>
                <option>Bearer Token</option>
                <option>Certificate</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key / Secret</label>
              <input 
                type="password" 
                placeholder="••••••••••••••••••••••"
                className="w-full bg-background border border-gray-700 rounded px-3 py-2"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Retention</label>
              <select className="w-full bg-background border border-gray-700 rounded px-3 py-2">
                <option>30 days</option>
                <option>60 days</option>
                <option>90 days</option>
                <option>180 days</option>
                <option>1 year</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input 
                id="parse-logs"
                type="checkbox" 
                checked={true}
                className="rounded border-gray-700"
              />
              <label htmlFor="parse-logs" className="text-sm">Parse logs using AI assistance</label>
            </div>
            
            {/* En el Dialog de Configuración de Conector, reemplazar los campos estáticos por campos dinámicos según el tipo de conector */}
            {selectedConnector && connectorTypeFields[selectedConnector.connectionMethod] && (
              <div className="space-y-2 border-t border-gray-800 pt-4 mt-2">
                <label className="text-xs font-semibold text-muted-foreground">Configuración específica</label>
                {connectorTypeFields[selectedConnector.connectionMethod].map((field, idx) => (
                  <div key={field.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">{field.label}</label>
                      {field.help && <span className="text-xs text-muted-foreground ml-2" title={field.help}>?</span>}
                    </div>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                      value={selectedConnector[field.label.replace(/\s.*/,'').toLowerCase()] || ''}
                      onChange={e => setSelectedConnector({
                        ...selectedConnector,
                        [field.label.replace(/\s.*/,'').toLowerCase()]: e.target.value
                      })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigureOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfiguration}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog de Prueba de Conector */}
      <Dialog open={isTestConnectorOpen} onOpenChange={setIsTestConnectorOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Execute Connector: {selectedConnector?.name}</DialogTitle>
            <DialogDescription>
              Execute connector and collect data from {selectedConnector?.vendor} {selectedConnector?.type}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            {testingStatus === 'idle' && (
              <div className="flex flex-col items-center justify-center p-4">
                <p className="text-center mb-3">
                  This will execute the connector and collect data from {selectedConnector?.name}.
                </p>
                <Alert className="mb-4 bg-blue-900 bg-opacity-10 border-blue-800 text-sm">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <AlertTitle className="text-blue-500">Manual Execution</AlertTitle>
                  <AlertDescription className="text-xs">
                    This will trigger an immediate execution regardless of the connector's schedule.
                  </AlertDescription>
                </Alert>
                <Button onClick={runConnectorTest}>Execute Now</Button>
              </div>
            )}
            
            {testingStatus === 'testing' && (
              <div className="flex flex-col items-center justify-center p-4">
                <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
                <p className="text-center">Executing connector {selectedConnector?.name}...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This might take a few moments as data is collected and processed
                </p>
                <div className="w-full mt-4">
                  <Progress value={45} className="w-full" />
                </div>
              </div>
            )}
            
            {testingStatus === 'success' && (
              <div className="space-y-4">
                <Alert className="border-green-500 bg-green-500 bg-opacity-10">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertTitle className="text-green-500">Execution Successful</AlertTitle>
                  <AlertDescription>
                    Successfully connected to {selectedConnector?.name} and collected data. Last execution time: {new Date().toLocaleString()}
                  </AlertDescription>
                </Alert>
                
                <div className="bg-gray-800 p-3 rounded">
                  <p className="text-sm font-semibold">Execution Results:</p>
                  {executeConnectorMutation.data && (
                    <ul className="text-xs mt-2 space-y-1 text-muted-foreground">
                      <li>• Alerts processed: {executeConnectorMutation.data.data?.alerts || 0}</li>
                      <li>• Threat intel items: {executeConnectorMutation.data.data?.threatIntel || 0}</li>
                      {executeConnectorMutation.data.data?.metrics && Object.entries(executeConnectorMutation.data.data.metrics).map(([key, value]) => (
                        <li key={key}>• {key}: {value}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            
            {testingStatus === 'error' && (
              <Alert className="border-red-500 bg-red-500 bg-opacity-10">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-500">Execution Failed</AlertTitle>
                <AlertDescription>
                  {executeConnectorMutation.error ? executeConnectorMutation.error.message : 
                  "Failed to execute connector. Please verify your credentials and configuration."}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            {(testingStatus === 'success' || testingStatus === 'error') && (
              <Button variant="outline" onClick={() => setTestingStatus('idle')}>Execute Again</Button>
            )}
            <Button onClick={() => setIsTestConnectorOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog de Métricas */}
      <Dialog open={isMetricsOpen} onOpenChange={setIsMetricsOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Metrics: {selectedConnector?.name}</DialogTitle>
            <DialogDescription>
              Data ingestion and performance metrics
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Daily Volume</p>
                    <h3 className="text-3xl font-bold mt-1">{selectedConnector?.dataVolume}</h3>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Ingest Latency</p>
                    <h3 className="text-3xl font-bold mt-1">1.2s</h3>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Health Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${selectedConnector?.status === 'active' ? 'bg-green-900 text-green-400' : selectedConnector?.status === 'warning' ? 'bg-orange-900 text-orange-400' : 'bg-red-900 text-red-400'}`}>{selectedConnector?.status?.toUpperCase()}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Errors (24h)</p>
                    <h3 className="text-3xl font-bold mt-1 text-red-500">{metricsData.reduce((acc, d) => acc + d.errors, 0)}</h3>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <h4 className="text-sm font-semibold mb-2">24-Hour Performance</h4>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={metricsData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis yAxisId="left" stroke="#888" />
                  <YAxis yAxisId="right" orientation="right" stroke="#888" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e1e1e', 
                      borderColor: '#333',
                      color: '#fff'
                    }} 
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="volume"
                    name="Data Volume (MB)"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                  />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="errors" 
                    name="Errors" 
                    stroke="#ff5555" 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Resumen de salud */}
            <div className="mt-6">
              <h5 className="text-xs font-semibold mb-1">Health Summary</h5>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Estado actual: <span className="font-semibold">{selectedConnector?.status}</span></li>
                <li>• Última recepción de datos: <span className="font-semibold">{selectedConnector?.lastData}</span></li>
                <li>• Errores recientes: <span className="font-semibold text-red-400">{metricsData.reduce((acc, d) => acc + d.errors, 0)}</span></li>
                <li>• Volumen promedio: <span className="font-semibold">{selectedConnector?.dataVolume}</span></li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsMetricsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog de Confirmación de Eliminación */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Connector</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this connector? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert className="border-red-500 bg-red-500 bg-opacity-10">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertTitle className="text-red-500">Warning</AlertTitle>
              <AlertDescription>
                Deleting {selectedConnector?.name} will permanently remove all configuration data and stop data collection from this source.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteConnector}
              disabled={deleteConnectorMutation.isPending}
            >
              {deleteConnectorMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : 'Delete Connector'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Connectors;
