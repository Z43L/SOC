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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    title: '',
    description: '',
    severity: 'medium',
    source: 'Manual Entry',
    sourceIp: '',
    destinationIp: ''
  });
  const { toast } = useToast();
  
  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['/api/alerts'],
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
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setNewAlert(prev => ({ ...prev, [name]: value }));
  };
  
  const filteredAlerts = alerts.filter(alert => {
    const matchesSeverity = filterSeverity === 'all' || alert.severity === filterSeverity;
    const matchesStatus = filterStatus === 'all' || alert.status === filterStatus;
    return matchesSeverity && matchesStatus;
  });
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="alerts" />
      
      <MainContent pageTitle="Security Alerts" organization={organization}>
        {/* Filters */}
        <div className="bg-background-card rounded-lg border border-gray-800 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-xs text-muted-foreground mr-2">Severity</label>
              <select 
                className="bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground mr-2">Status</label>
              <select 
                className="bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            
            <div className="ml-auto">
              <Button onClick={() => setCreateAlertOpen(true)}>
                <i className="fas fa-plus mr-1"></i> Create Alert
              </Button>
            </div>
          </div>
        </div>
        
        {/* Alerts Table */}
        <div className="bg-background-card rounded-lg border border-gray-800">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-medium text-text-primary">All Alerts</h3>
            <span className="text-xs text-muted-foreground">
              {filteredAlerts.length} {filteredAlerts.length === 1 ? 'alert' : 'alerts'}
            </span>
          </div>
          <div className="overflow-x-auto">
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
    </div>
  );
};

export default Alerts;
