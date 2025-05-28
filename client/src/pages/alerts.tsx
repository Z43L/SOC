import { FC, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DataTable, Column } from "@/components/ui/data-table/data-table";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useTenant } from "@/contexts/TenantContext";
import { AlertDetail } from "@/components/alerts/AlertDetail";
import { GroupAlertsDialog } from "@/components/alerts/GroupAlertsDialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Filter, Users, Clock, ChevronDown, BellRing, AlertCircle, Plus } from "lucide-react";

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
  // Use the TenantContext for organization-specific data
  const { organizationId, userRole } = useTenant();

  // State for filters
  const [severityFilters, setSeverityFilters] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // State for alert creation and detail view
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  
  // State for bulk actions
  const [selectedAlerts, setSelectedAlerts] = useState<Alert[]>([]);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  
  // State for the new alert form
  const [newAlert, setNewAlert] = useState({
    title: '',
    description: '',
    severity: 'medium',
    source: 'Manual Entry',
    sourceIp: '',
    destinationIp: ''
  });
  
  // State for the new incident form
  const [newIncident, setNewIncident] = useState({
    title: '',
    description: '',
    priority: 'medium'
  });
  
  const { toast } = useToast();
  
  // Fetch alerts data
  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['/api/alerts', organizationId],
  });
  
  // Fetch users for assignment
  const { data: users = [] } = useQuery<{id: number, name: string, role: string}[]>({
    queryKey: ['/api/users', organizationId],
  });

  // Mock data for sources/connectors and agents
  const availableSources = [
    { id: 'all', name: 'All Sources', type: 'all' },
    { id: 'firewall', name: 'Firewall', type: 'connector' },
    { id: 'endpoint', name: 'EDR', type: 'connector' },
    { id: 'siem', name: 'SIEM', type: 'connector' },
    { id: 'manual', name: 'Manual Entry', type: 'manual' },
    { id: 'email', name: 'Email Security', type: 'connector' },
    { id: 'windows-agent', name: 'Windows Agent', type: 'agent' },
    { id: 'linux-agent', name: 'Linux Agent', type: 'agent' },
    { id: 'cloud-agent', name: 'Cloud Workload Agent', type: 'agent' },
    { id: 'network-sensor', name: 'Network Sensor', type: 'connector' }
  ];
  
  // Mutation for creating new alerts
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
  
  // Mutation for updating alert status
  const updateAlertStatusMutation = useMutation({
    mutationFn: async ({ alertId, status }: { alertId: number, status: string }) => {
      const response = await apiRequest('PUT', `/api/alerts/${alertId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: "Alert Updated",
        description: "The alert status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error Updating Alert",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Mutation for assigning alerts
  const assignAlertMutation = useMutation({
    mutationFn: async ({ alertId, userId }: { alertId: number, userId: number | null }) => {
      const response = await apiRequest('PUT', `/api/alerts/${alertId}/assign`, { 
        assignedTo: userId 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: "Alert Assigned",
        description: "The alert has been assigned successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error Assigning Alert",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Mutation for bulk actions
  const bulkUpdateAlertsMutation = useMutation({
    mutationFn: async ({ alertIds, status }: { alertIds: number[], status: string }) => {
      const response = await apiRequest('PUT', `/api/alerts/bulk`, { 
        alertIds, 
        status 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setSelectedAlerts([]);
      toast({
        title: "Alerts Updated",
        description: "The selected alerts have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error Updating Alerts",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Mutation for bulk assignments
  const bulkAssignAlertsMutation = useMutation({
    mutationFn: async ({ alertIds, userId }: { alertIds: number[], userId: number | null }) => {
      const response = await apiRequest('PUT', `/api/alerts/bulk/assign`, { 
        alertIds, 
        assignedTo: userId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setSelectedAlerts([]);
      toast({
        title: "Alerts Assigned",
        description: "The selected alerts have been assigned successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error Assigning Alerts",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Reset form for new alerts
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
  
  // Handler for creating a new alert
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
  
  // Handler for changing alert status in detail view
  const handleStatusChange = (alertId: number, newStatus: string) => {
    updateAlertStatusMutation.mutate({ alertId, status: newStatus });
  };
  
  // Handler for assigning alerts in detail view
  const handleAssigneeChange = (alertId: number, assigneeId: number | null) => {
    assignAlertMutation.mutate({ alertId, userId: assigneeId });
  };
  
  // Handler for bulk acknowledging alerts
  const handleBulkAcknowledge = () => {
    const alertIds = selectedAlerts.map(alert => alert.id as number);
    bulkUpdateAlertsMutation.mutate({ alertIds, status: 'acknowledged' });
  };
  
  // Handler for bulk dismissing alerts
  const handleBulkDismiss = () => {
    const alertIds = selectedAlerts.map(alert => alert.id as number);
    bulkUpdateAlertsMutation.mutate({ alertIds, status: 'resolved' });
  };
  
  // Handler for bulk assigning alerts
  const handleBulkAssign = (userId: number | null) => {
    const alertIds = selectedAlerts.map(alert => alert.id as number);
    bulkAssignAlertsMutation.mutate({ alertIds, userId });
  };
  
  // Handler for opening an alert detail view
  const handleAlertClick = (alert: Alert) => {
    setSelectedAlert(alert);
    setIsDetailSheetOpen(true);
  };
  
  // Handler for input changes in the new alert form
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  // Handler for input changes in the new incident form
  const handleIncidentInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewIncident(prev => ({ ...prev, [name]: value }));
  };
  
  // Handler for select changes in the new incident form
  const handleIncidentSelectChange = (name: string, value: string) => {
    setNewIncident(prev => ({ ...prev, [name]: value }));
  };
  
  // Handler for creating an incident from alerts
  const handleCreateIncident = async () => {
    const alertIds = selectedAlerts.map(alert => alert.id as number);
    
    try {
      const response = await apiRequest('POST', '/api/incidents', {
        ...newIncident,
        alertIds,
        status: 'new'
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Incident Created",
          description: `Incident "${newIncident.title}" has been created successfully.`,
        });
        
        // Redirect to the new incident
        window.location.href = `/incident/${data.id}`;
      } else {
        throw new Error('Failed to create incident');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create incident. Please try again.",
        variant: "destructive",
      });
    }
    
    setCreateIncidentOpen(false);
    setSelectedAlerts([]);
  };
  
  // Handler for select changes in the new alert form
  const handleSelectChange = (name: string, value: string) => {
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  // Handler for grouping alerts
  const handleGroupAlerts = (keyField: string) => {
    // In a real implementation, this would group alerts by the specified field
    // For now, let's show a notification about what would happen
    toast({
      title: "Alerts Grouped",
      description: `${selectedAlerts.length} alerts have been grouped by ${keyField}.`,
    });
    setSelectedAlerts([]);
  };
  
  // Handler for toggling severity filters
  const handleSeverityFilterChange = (severity: string, checked: boolean) => {
    setSeverityFilters(prev => {
      if (checked) {
        return [...prev, severity];
      } else {
        return prev.filter(s => s !== severity);
      }
    });
  };

  // Count of unreviewed and critical alerts for tabs
  const unreviewedCount = alerts.filter(a => a.status === 'new').length;
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  
  // Apply all filters to the alerts
  const filteredAlerts = alerts.filter(alert => {
    // Tab filters
    if (activeTab === 'unreviewed' && alert.status !== 'new') return false;
    if (activeTab === 'critical' && alert.severity !== 'critical') return false;
    
    // Severity filters
    if (severityFilters.length > 0 && !severityFilters.includes(alert.severity)) return false;
    
    // Status filter
    if (statusFilter !== 'all' && alert.status !== statusFilter) return false;
    
    // Source filter
    if (sourceFilter !== 'all') {
      if (sourceFilter === 'connector') {
        // Check if the source is any connector
        const isConnector = availableSources.some(src => 
          src.type === 'connector' && src.id === alert.source
        );
        if (!isConnector) return false;
      } else if (sourceFilter === 'agent') {
        // Check if the source is any agent
        const isAgent = availableSources.some(src => 
          src.type === 'agent' && src.id === alert.source
        );
        if (!isAgent) return false;
      } else if (alert.source !== sourceFilter) {
        return false;
      }
    }
    
    // Date range filter
    if (dateRange?.from) {
      const alertDate = new Date(alert.timestamp);
      if (alertDate < dateRange.from) return false;
      if (dateRange.to && alertDate > dateRange.to) return false;
    }
    
    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        alert.title.toLowerCase().includes(query) ||
        alert.description.toLowerCase().includes(query) ||
        alert.source.toLowerCase().includes(query) ||
        (alert.sourceIp && alert.sourceIp.toLowerCase().includes(query))
      );
    }
    
    return true;
  });

  // Define columns for DataTable
  const columns: Column<Alert>[] = [
    {
      id: "severity",
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <span className={getSeverityBadge(row.severity)}>
          <span className={`w-2 h-2 rounded-full bg-${row.severity === 'critical' ? 'destructive' : row.severity === 'high' ? 'red-500' : row.severity === 'medium' ? 'orange-500' : 'green-500'} mr-1.5`}></span>
          {row.severity.charAt(0).toUpperCase() + row.severity.slice(1)}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "title",
      accessorKey: "title",
      header: "Alert",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.title}</p>
          <p className="text-xs text-muted-foreground">{row.description}</p>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "source",
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.source}</span>,
      enableSorting: true,
    },
    {
      id: "timestamp",
      accessorKey: "timestamp",
      header: "Time",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatTimeAgo(row.timestamp)}</span>,
      enableSorting: true,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className={getStatusBadge(row.status)}>
          {row.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "assignedTo",
      accessorKey: "assignedTo",
      header: "Assigned To",
      cell: ({ row }) => {
        const assignee = users.find(u => u.id === row.assignedTo);
        return <span className="text-sm text-muted-foreground">{assignee?.name || 'Unassigned'}</span>;
      },
      enableSorting: true,
    }
  ];
  
  // Bulk action buttons for DataTable
  const bulkActions = [
    {
      label: "Acknowledge",
      onClick: handleBulkAcknowledge,
    },
    {
      label: "Dismiss",
      onClick: handleBulkDismiss,
    },
    {
      label: "Group Similar",
      onClick: () => setIsGroupDialogOpen(true),
    },
    {
      label: "Create Incident",
      onClick: () => setCreateIncidentOpen(true),
    }
  ];
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="alerts" />
      
      <MainContent pageTitle="Security Alerts" organization={organization}>
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All Alerts</TabsTrigger>
            <TabsTrigger value="unreviewed" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Unreviewed <Badge variant="outline" className="ml-1">{unreviewedCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="critical" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Critical <Badge variant="outline" className="ml-1">{criticalCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* Enhanced Filters */}
        <div className="bg-background-card rounded-lg border border-gray-800 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1">
              <Input
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            {/* Source Filter - Enhanced with connector/agent distinction */}
            <div className="min-w-[180px]">
              <Select
                value={sourceFilter}
                onValueChange={setSourceFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="connector">All Connectors</SelectItem>
                  <SelectItem value="agent">All Agents</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Connectors</SelectLabel>
                    {availableSources
                      .filter(source => source.id !== 'all' && source.id !== 'manual' && source.type === 'connector')
                      .map(source => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Agents</SelectLabel>
                    {availableSources
                      .filter(source => source.id !== 'all' && source.type === 'agent')
                      .map(source => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Other</SelectLabel>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            {/* Status Filter */}
            <div className="min-w-[180px]">
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Severity Filter - Made Visible */}
            <div className="min-w-[180px]">
              <Select
                value={severityFilters.length === 0 ? "all" : 
                       severityFilters.length === 1 ? severityFilters[0] : "multiple"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setSeverityFilters([]);
                  } else if (value !== "multiple") {
                    setSeverityFilters([value]);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Severities">
                    {severityFilters.length === 0 && "All Severities"}
                    {severityFilters.length === 1 && severityFilters[0].charAt(0).toUpperCase() + severityFilters[0].slice(1)}
                    {severityFilters.length > 1 && `${severityFilters.length} Severities`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-destructive mr-1.5"></span>
                      Critical
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></span>
                      High
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-orange-500 mr-1.5"></span>
                      Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="low">
                    <div className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></span>
                      Low
                    </div>
                  </SelectItem>
                  <Separator className="my-2" />
                  <div className="p-2">
                    <div className="mb-2 text-sm text-muted-foreground">Multiple selection:</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-critical"
                          checked={severityFilters.includes('critical')}
                          onCheckedChange={(checked) => handleSeverityFilterChange('critical', checked as boolean)}
                        />
                        <Label htmlFor="filter-critical">Critical</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-high"
                          checked={severityFilters.includes('high')}
                          onCheckedChange={(checked) => handleSeverityFilterChange('high', checked as boolean)}
                        />
                        <Label htmlFor="filter-high">High</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-medium"
                          checked={severityFilters.includes('medium')}
                          onCheckedChange={(checked) => handleSeverityFilterChange('medium', checked as boolean)}
                        />
                        <Label htmlFor="filter-medium">Medium</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-low"
                          checked={severityFilters.includes('low')}
                          onCheckedChange={(checked) => handleSeverityFilterChange('low', checked as boolean)}
                        />
                        <Label htmlFor="filter-low">Low</Label>
                      </div>
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            
            {/* Date Range Picker */}
            <div>
              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
              />
            </div>
            
            {/* Clear Filters Button */}
            <div>
              <Button variant="outline" className="gap-2" onClick={() => {
                // Clear all filters
                setSeverityFilters([]);
                setSourceFilter('all');
                setStatusFilter('all');
                setDateRange(undefined);
                setSearchQuery('');
              }}>
                <Filter className="h-4 w-4" />
                Clear Filters
              </Button>
            </div>
            
            <div className="ml-auto">
              <Button onClick={() => setCreateAlertOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Alert
              </Button>
            </div>
          </div>
        </div>
        
        {/* Alerts DataTable */}
        <div className="bg-background-card rounded-lg border border-gray-800">
          <DataTable
            data={filteredAlerts}
            columns={columns}
            onRowClick={handleAlertClick}
            isLoading={isLoading}
            selectable={true}
            onSelectionChange={setSelectedAlerts}
            actions={bulkActions}
          />
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
      
      {/* Create Incident Dialog */}
      <Dialog open={createIncidentOpen} onOpenChange={setCreateIncidentOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Incident from Alerts</DialogTitle>
            <DialogDescription>
              Create a new incident from {selectedAlerts.length} selected alert(s).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="incident-title">Incident Title</Label>
              <Input
                id="incident-title"
                name="title"
                placeholder="Enter incident title"
                value={newIncident.title}
                onChange={handleIncidentInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="incident-description">Description</Label>
              <Textarea
                id="incident-description"
                name="description"
                placeholder="Describe the security incident"
                value={newIncident.description}
                onChange={handleIncidentInputChange}
                className="min-h-[100px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="incident-priority">Priority</Label>
              <Select 
                value={newIncident.priority} 
                onValueChange={(value) => handleIncidentSelectChange('priority', value)}
              >
                <SelectTrigger id="incident-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 border border-border rounded-md p-3">
              <h4 className="text-sm font-medium">Selected Alerts ({selectedAlerts.length})</h4>
              <div className="max-h-[150px] overflow-y-auto space-y-2">
                {selectedAlerts.map(alert => (
                  <div key={alert.id} className="text-sm flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-${alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'red-500' : alert.severity === 'medium' ? 'orange-500' : 'green-500'}`}></span>
                    <span>{alert.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateIncidentOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateIncident}
            >
              Create Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Alert Detail Sheet */}
      <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Alert Details</SheetTitle>
            <SheetDescription>
              View and manage alert information
            </SheetDescription>
          </SheetHeader>
          
          {selectedAlert && (
            <AlertDetail
              alert={selectedAlert}
              onStatusChange={handleStatusChange}
              onAssigneeChange={handleAssigneeChange}
              availableUsers={users}
            />
          )}
        </SheetContent>
      </Sheet>
      
      {/* Group Alerts Dialog */}
      <GroupAlertsDialog
        isOpen={isGroupDialogOpen}
        onClose={() => setIsGroupDialogOpen(false)}
        selectedAlerts={selectedAlerts}
        onGroupAlerts={handleGroupAlerts}
      />
    </div>
  );
};

export default Alerts;
