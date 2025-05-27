import { FC, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Alert, SeverityTypes } from "@shared/schema";
import { Link } from "wouter";
import { getSeverityBadge, getStatusBadge, formatTimeAgo } from "@/lib/utils/severityUtils";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CalendarIcon, CheckCircle, Filter, MoreHorizontal, X } from "lucide-react";

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

const Alerts: FC<AlertsProps> = ({ user, organization }) => {
  const [filterSeverity, setFilterSeverity] = useState<string[]>(['all']);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState<boolean>(false);
  const [groupByField, setGroupByField] = useState<string>('sourceIp');
  const { toast } = useToast();
  const { organizationId } = useTenant();
  
  const [newAlert, setNewAlert] = useState({
    title: '',
    description: '',
    severity: 'medium',
    source: 'Manual Entry',
    sourceIp: '',
    destinationIp: ''
  });
  
  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['/api/alerts', organizationId],
  });
  
  const { data: connectors = [] } = useQuery<{id: string; name: string}[]>({
    queryKey: ['/api/connectors', organizationId],
  });
  
  const createAlertMutation = useMutation({
    mutationFn: async (alertData: typeof newAlert) => {
      const response = await apiRequest('POST', '/api/alerts', alertData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setCreateAlertOpen(false);
      resetNewAlertForm();
      toast({
        title: "Alerta creada",
        description: "La alerta se ha creado con éxito y se enviará para su análisis con IA.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error al crear la alerta",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  const updateAlertsMutation = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[], data: Partial<Alert> }) => {
      const response = await apiRequest('PUT', '/api/alerts/bulk', { ids, data });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setSelectedAlerts([]);
      toast({
        title: "Alertas actualizadas",
        description: "Las alertas seleccionadas han sido actualizadas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar las alertas",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const resetNewAlertForm = () => {
    setNewAlert({
      title: '',
      description: '',
      severity: 'medium',
      source: 'Manual Entry',
      sourceIp: '',
      destinationIp: ''
    });
  };
  
  const handleCreateAlert = () => {
    if (!newAlert.title || !newAlert.description) {
      toast({
        title: "Error de validación",
        description: "El título y la descripción son campos obligatorios.",
        variant: "destructive",
      });
      return;
    }
    
    createAlertMutation.mutate(newAlert);
  };
  
  const handleSelectAlert = (alert: Alert) => {
    setSelectedAlert(alert);
    setIsSheetOpen(true);
  };
  
  const handleToggleAlertSelection = (alertId: string) => {
    setSelectedAlerts(prev => 
      prev.includes(alertId) 
        ? prev.filter(id => id !== alertId) 
        : [...prev, alertId]
    );
  };
  
  const handleBulkAcknowledge = () => {
    if (selectedAlerts.length === 0) return;
    updateAlertsMutation.mutate({ 
      ids: selectedAlerts, 
      data: { status: 'acknowledged' } 
    });
  };
  
  const handleBulkDismiss = () => {
    if (selectedAlerts.length === 0) return;
    updateAlertsMutation.mutate({ 
      ids: selectedAlerts, 
      data: { status: 'dismissed' } 
    });
  };
  
  const handleBulkAssign = (userId: number) => {
    if (selectedAlerts.length === 0) return;
    updateAlertsMutation.mutate({ 
      ids: selectedAlerts, 
      data: { assignedTo: userId } 
    });
  };
  
  const handleCreateIncident = () => {
    if (selectedAlerts.length === 0) return;
    // Navigate to the incident creation page with selected alert IDs
    window.location.href = `/incident/new?alerts=${selectedAlerts.join(',')}`;
  };
  
  const handleGroupAlerts = () => {
    if (selectedAlerts.length === 0) return;
    setIsGroupDialogOpen(true);
  };
  
  const handleToggleAllAlerts = (checked: boolean) => {
    if (checked) {
      const allAlertIds = filteredAlerts.map(alert => alert.id.toString());
      setSelectedAlerts(allAlertIds);
    } else {
      setSelectedAlerts([]);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  const filteredAlerts = alerts.filter(alert => {
    // If "all" is selected or severity matches
    const matchesSeverity = filterSeverity.includes('all') || filterSeverity.includes(alert.severity);
    // If "all" is selected or status matches
    const matchesStatus = filterStatus === 'all' || alert.status === filterStatus;
    // If "all" is selected or source matches
    const matchesSource = filterSource === 'all' || alert.source === filterSource;
    // If date range is selected, check if alert is within range
    const matchesDate = !dateRange.from ? true : (
      new Date(alert.timestamp) >= dateRange.from && 
      (!dateRange.to || new Date(alert.timestamp) <= dateRange.to)
    );
    
    return matchesSeverity && matchesStatus && matchesSource && matchesDate;
  });
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="alerts" />
      
      <MainContent pageTitle="Security Alerts" organization={organization}>
        {/* Filters */}
        <div className="bg-background-card rounded-lg border border-input p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
              <div className="flex gap-2 items-center">
                {['critical', 'high', 'medium', 'low'].map((severity) => (
                  <div key={severity} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`severity-${severity}`} 
                      checked={filterSeverity.includes(severity)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilterSeverity(prev => 
                            prev.includes('all') 
                              ? [severity] 
                              : [...prev.filter(s => s !== 'all'), severity]
                          );
                        } else {
                          setFilterSeverity(prev => {
                            const newFilter = prev.filter(s => s !== severity);
                            return newFilter.length ? newFilter : ['all'];
                          });
                        }
                      }}
                    />
                    <label 
                      htmlFor={`severity-${severity}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Source</label>
              <Select
                value={filterSource}
                onValueChange={(value) => setFilterSource(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {connectors.map(connector => (
                    <SelectItem key={connector.id} value={connector.name}>
                      {connector.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="Manual Entry">Manual Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className="w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd/MM/yyyy")} -{" "}
                          {format(dateRange.to, "dd/MM/yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "dd/MM/yyyy")
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {(filterSeverity.length > 0 && !filterSeverity.includes('all')) || 
             filterStatus !== 'all' || 
             filterSource !== 'all' || 
             dateRange.from ? (
              <Button 
                variant="outline" 
                className="gap-1"
                onClick={() => {
                  setFilterSeverity(['all']);
                  setFilterStatus('all');
                  setFilterSource('all');
                  setDateRange({});
                }}
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            ) : null}
            
            <div className="ml-auto">
              <Button onClick={() => setCreateAlertOpen(true)}>
                New Alert
              </Button>
            </div>
          </div>
        </div>
        
        {/* Alerts Actions */}
        <div className="flex justify-between mb-4">
          <div className="flex gap-2">
            {selectedAlerts.length > 0 ? (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleBulkAcknowledge}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Acknowledge
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleBulkDismiss}
                >
                  Dismiss
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleCreateIncident}
                >
                  Create Incident
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleGroupAlerts}
                >
                  Group Similar
                </Button>
              </>
            ) : null}
          </div>
          
          <div className="text-sm text-muted-foreground">
            {selectedAlerts.length > 0 ? `${selectedAlerts.length} alerts selected` : ''}
          </div>
        </div>
        
        
        {/* Alerts Table */}
        <div className="bg-background-card rounded-lg border border-input overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <i className="fas fa-bell-slash text-3xl mb-3"></i>
              <p>No alerts match the selected filters</p>
              {(filterSeverity.length > 0 && !filterSeverity.includes('all')) || 
               filterStatus !== 'all' || 
               filterSource !== 'all' || 
               dateRange.from ? (
                <button 
                  className="mt-3 text-primary hover:underline"
                  onClick={() => {
                    setFilterSeverity(['all']);
                    setFilterStatus('all');
                    setFilterSource('all');
                    setDateRange({});
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="text-left bg-background-lighter">
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider w-8">
                    <Checkbox 
                      checked={selectedAlerts.length > 0 && selectedAlerts.length === filteredAlerts.length}
                      onCheckedChange={handleToggleAllAlerts}
                    />
                  </th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Severity</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Alert</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Source</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Time</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Assigned</th>
                  <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800"
          <div className="bg-background-card rounded-lg border border-input p-4">
            <div className="text-sm text-muted-foreground">Total Alerts</div>
            <div className="text-2xl font-bold">{alerts.length}</div>
          </div>
          <div className="bg-background-card rounded-lg border border-input p-4">
            <div className="text-sm text-muted-foreground">Unreviewed</div>
            <div className="text-2xl font-bold">
              {alerts.filter(a => a.status === 'new').length}
            </div>
          </div>
          <div className="bg-background-card rounded-lg border border-input p-4">
            <div className="text-sm text-muted-foreground">Critical</div>
            <div className="text-2xl font-bold text-red-500">
              {alerts.filter(a => a.severity === 'critical').length}
            </div>
          </div>
          <div className="bg-background-card rounded-lg border border-input p-4">
            <div className="text-sm text-muted-foreground">Acknowledged</div>
            <div className="text-2xl font-bold">
              {alerts.filter(a => a.status === 'acknowledged').length}
            </div>
          </div>
        </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                <span>Loading alerts...</span>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <i className="fas fa-bell-slash text-3xl mb-3"></i>
                <p>No alerts match the selected filters</p>
                {(filterSeverity !== 'all' || filterStatus !== 'all') && (
                  <button 
                    className="mt-3 text-primary hover:underline"
                    onClick={() => {
                      setFilterSeverity('all');
                      setFilterStatus('all');
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="text-left bg-background-lighter">
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Severity</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Alert</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Source</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Source IP</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Time</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                    <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-background-lighter">
                      <td className="p-3">
                        <span className={getSeverityBadge(alert.severity)}>
                          <span className={`w-2 h-2 rounded-full bg-${alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'red-500' : alert.severity === 'medium' ? 'orange-500' : 'green-500'} mr-1.5`}></span>
                          {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{alert.source}</td>
                      <td className="p-3 text-sm text-muted-foreground">{alert.sourceIp || 'N/A'}</td>
                      <td className="p-3 text-sm text-muted-foreground">{formatTimeAgo(alert.timestamp)}</td>
                      <td className="p-3">
                        <span className={getStatusBadge(alert.status)}>
                          {alert.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex space-x-2">
                          <Link href={`/incident/${alert.id}`}>
                            <a className="text-primary hover:text-opacity-80" title="Investigate">
                              <i className="fas fa-search"></i>
                            </a>
                          </Link>
                          {alert.severity === 'critical' && alert.status !== 'resolved' && (
                            <button className="text-destructive hover:text-opacity-80" title="Isolate Host">
                              <i className="fas fa-shield-alt"></i>
                            </button>
                          )}
                          <button className="text-muted-foreground hover:text-primary" title="More Actions">
                            <i className="fas fa-ellipsis-v"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </MainContent>
      
      {/* Create Alert Dialog */}
      <Dialog open={createAlertOpen} onOpenChange={setCreateAlertOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Alert</DialogTitle>
            <DialogDescription>
              Enter the details for the new security alert.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Alert Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Enter alert title"
                value={newAlert.title}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe the security alert"
                value={newAlert.description}
                onChange={handleInputChange}
                className="min-h-[100px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select 
                value={newAlert.severity} 
                onValueChange={(value) => handleSelectChange('severity', value)}
              >
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                name="source"
                placeholder="Alert source system/tool"
                value={newAlert.source}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sourceIp">Source IP (optional)</Label>
                <Input
                  id="sourceIp"
                  name="sourceIp"
                  placeholder="10.0.0.1"
                  value={newAlert.sourceIp}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="destinationIp">Destination IP (optional)</Label>
                <Input
                  id="destinationIp"
                  name="destinationIp"
                  placeholder="10.0.0.2"
                  value={newAlert.destinationIp}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setCreateAlertOpen(false);
                resetNewAlertForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAlert}
              disabled={createAlertMutation.isPending}
            >
              {createAlertMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Creating...
                </>
              ) : (
                'Create Alert'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Detail Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[450px] sm:w-[540px]">
          {selectedAlert && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {getSeverityBadge(selectedAlert.severity)}
                  {selectedAlert.title}
                </SheetTitle>
                <SheetDescription>
                  {formatTimeAgo(selectedAlert.timestamp)} • {selectedAlert.source}
                </SheetDescription>
              </SheetHeader>
              
              <div className="py-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedAlert.description}
                    </p>
                  </div>
                  
                  {selectedAlert.sourceIp && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Source IP</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedAlert.sourceIp}
                      </p>
                    </div>
                  )}
                  
                  {selectedAlert.destinationIp && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Destination IP</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedAlert.destinationIp}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Status</h4>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedAlert.status)}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Assigned To</h4>
                    {selectedAlert.assignedTo ? (
                      <div className="flex items-center">
                        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-xs mr-2">
                          {user.initials}
                        </div>
                        <span className="text-sm">{user.name}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Unassigned</p>
                    )}
                  </div>
                </div>
              </div>
              
              <SheetFooter className="flex gap-2 flex-row">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    updateAlertsMutation.mutate({
                      ids: [selectedAlert.id.toString()], 
                      data: { status: 'acknowledged' }
                    });
                    setIsSheetOpen(false);
                  }}
                >
                  Acknowledge
                </Button>
                <Button
                  onClick={() => {
                    window.location.href = `/incident/new?alerts=${selectedAlert.id}`;
                  }}
                >
                  Create Incident
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      
      {/* Group Alerts Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Group Similar Alerts</DialogTitle>
            <DialogDescription>
              Choose a field to group alerts by similar characteristics
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="groupByField">Group by field</Label>
            <Select
              value={groupByField}
              onValueChange={setGroupByField}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sourceIp">Source IP</SelectItem>
                <SelectItem value="destinationIp">Destination IP</SelectItem>
                <SelectItem value="fileHash">File Hash</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsGroupDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Handle grouping logic
                toast({
                  title: "Alerts grouped",
                  description: `${selectedAlerts.length} alerts grouped by ${groupByField}`,
                });
                setIsGroupDialogOpen(false);
              }}
            >
              Group Alerts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Alerts;
