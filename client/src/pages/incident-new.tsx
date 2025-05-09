import { FC, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Alert, Incident as IncidentType } from "@shared/schema";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface IncidentPageProps {
  id: string;
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

// Helper to get color based on severity
const getSeverityColorClass = (severity: string) => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return {
        badge: "bg-red-900/20 text-red-500 border-red-800",
        icon: "text-red-500",
        border: "border-red-800",
        bg: "bg-red-900/10"
      };
    case 'high':
      return {
        badge: "bg-orange-900/20 text-orange-500 border-orange-800",
        icon: "text-orange-500",
        border: "border-orange-800",
        bg: "bg-orange-900/10"
      };
    case 'medium':
      return {
        badge: "bg-yellow-900/20 text-yellow-500 border-yellow-800",
        icon: "text-yellow-500",
        border: "border-yellow-800",
        bg: "bg-yellow-900/10"
      };
    case 'low':
      return {
        badge: "bg-green-900/20 text-green-500 border-green-800",
        icon: "text-green-500",
        border: "border-green-800",
        bg: "bg-green-900/10"
      };
    default:
      return {
        badge: "bg-blue-900/20 text-blue-500 border-blue-800",
        icon: "text-blue-500",
        border: "border-blue-800",
        bg: "bg-blue-900/10"
      };
  }
};

// Helper to get status badge styling
const getStatusBadgeClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'new':
      return "bg-blue-900/20 text-blue-500 border-blue-800";
    case 'in_progress':
    case 'in-progress':
      return "bg-yellow-900/20 text-yellow-500 border-yellow-800";
    case 'resolved':
      return "bg-green-900/20 text-green-500 border-green-800";
    case 'closed':
      return "bg-gray-900/20 text-gray-500 border-gray-800";
    default:
      return "bg-gray-900/20 text-gray-500 border-gray-800";
  }
};

// Format date
const formatDate = (date: Date | null | string): string => {
  if (!date) return 'N/A';
  return format(new Date(date), "PPpp");
};

// Format time ago
const formatTimeAgo = (date: Date | null | string): string => {
  if (!date) return 'N/A';
  
  const now = new Date();
  const pastDate = new Date(date);
  const seconds = Math.floor((now.getTime() - pastDate.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
};

// Mock MITRE ATT&CK Framework Tactics
const mitreTactics = [
  { id: "TA0001", name: "Initial Access", description: "Techniques used to gain initial access to a network" },
  { id: "TA0002", name: "Execution", description: "Techniques used to execute malicious code" },
  { id: "TA0003", name: "Persistence", description: "Techniques used to maintain access" },
  { id: "TA0004", name: "Privilege Escalation", description: "Techniques used to gain higher-level permissions" },
  { id: "TA0005", name: "Defense Evasion", description: "Techniques used to avoid detection" },
  { id: "TA0006", name: "Credential Access", description: "Techniques used to steal credentials" },
  { id: "TA0007", name: "Discovery", description: "Techniques used to gain knowledge about the system and network" },
  { id: "TA0008", name: "Lateral Movement", description: "Techniques used to move through the environment" },
  { id: "TA0009", name: "Collection", description: "Techniques used to gather data of interest" },
  { id: "TA0010", name: "Exfiltration", description: "Techniques used to steal data" },
  { id: "TA0011", name: "Command and Control", description: "Techniques used for communication with compromised systems" },
  { id: "TA0040", name: "Impact", description: "Techniques used to disrupt operations or manipulate data" }
];

// Mock list of playbooks
const availablePlaybooks = [
  { id: 1, name: "Ransomware Response", description: "Comprehensive response to ransomware attacks", automation: "Full" },
  { id: 2, name: "Phishing Investigation", description: "Investigation steps for phishing incidents", automation: "Partial" },
  { id: 3, name: "Data Exfiltration Response", description: "Steps to address data exfiltration", automation: "Partial" },
  { id: 4, name: "Malware Containment", description: "Isolate and contain malware infections", automation: "Full" },
  { id: 5, name: "Insider Threat Investigation", description: "Process to investigate insider threats", automation: "Manual" }
];

const IncidentPage: FC<IncidentPageProps> = ({ id, user, organization }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isPlaybookDialogOpen, setIsPlaybookDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [evidenceUploadName, setEvidenceUploadName] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [tacticsMapping, setTacticsMapping] = useState<Record<string, boolean>>({});
  const [selectedTactics, setSelectedTactics] = useState<string[]>([]);
  
  // Fetch incident data
  const { 
    data: incident, 
    isLoading: isIncidentLoading, 
    error: incidentError 
  } = useQuery<IncidentType>({
    queryKey: [`/api/incidents/${id}`],
  });
  
  // Fetch related alerts
  const { 
    data: relatedAlerts = [], 
    isLoading: isAlertsLoading 
  } = useQuery<Alert[]>({
    queryKey: [`/api/incidents/${id}/alerts`],
    enabled: !!incident,
  });
  
  // Update incident mutation
  const updateIncidentMutation = useMutation({
    mutationFn: async (updateData: Partial<IncidentType>) => {
      const response = await apiRequest('PATCH', `/api/incidents/${id}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/incidents/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
      toast({
        title: "Incident updated",
        description: "The incident has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update incident",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Add note to incident mutation
  const addNoteMutation = useMutation({
    mutationFn: async (noteData: { content: string }) => {
      const response = await apiRequest('POST', `/api/incidents/${id}/notes`, noteData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/incidents/${id}`] });
      setNoteText("");
      setIsNoteDialogOpen(false);
      toast({
        title: "Note added",
        description: "Your note has been added to the incident timeline.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add note",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Add evidence mutation
  const addEvidenceMutation = useMutation({
    mutationFn: async (evidenceData: { name: string, description: string }) => {
      const response = await apiRequest('POST', `/api/incidents/${id}/evidence`, evidenceData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/incidents/${id}`] });
      setEvidenceUploadName("");
      setEvidenceDescription("");
      toast({
        title: "Evidence added",
        description: "Evidence has been added to the incident.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add evidence",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Execute playbook mutation
  const executePlaybookMutation = useMutation({
    mutationFn: async (playbookData: { playbookId: number }) => {
      const response = await apiRequest('POST', `/api/incidents/${id}/playbooks`, playbookData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/incidents/${id}`] });
      setIsPlaybookDialogOpen(false);
      setSelectedPlaybook(null);
      toast({
        title: "Playbook execution started",
        description: "The selected playbook is now running.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to execute playbook",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Update MITRE ATT&CK tactics mapping
  const updateTacticsMutation = useMutation({
    mutationFn: async (tactics: string[]) => {
      const response = await apiRequest('POST', `/api/incidents/${id}/tactics`, { tactics });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/incidents/${id}`] });
      toast({
        title: "Tactics updated",
        description: "MITRE ATT&CK mapping has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update tactics",
        description: error.toString(),
        variant: "destructive",
      });
    }
  });
  
  // Initialize tactics mapping from incident data
  useEffect(() => {
    if (incident && incident.mitreTactics) {
      const tactics = Array.isArray(incident.mitreTactics) 
        ? incident.mitreTactics 
        : (typeof incident.mitreTactics === 'object' ? Object.keys(incident.mitreTactics) : []);
      
      const initialMapping: Record<string, boolean> = {};
      mitreTactics.forEach(tactic => {
        initialMapping[tactic.id] = tactics.includes(tactic.id);
      });
      
      setTacticsMapping(initialMapping);
      setSelectedTactics(tactics);
    }
  }, [incident]);
  
  // Handle status update
  const handleUpdateStatus = (newStatus: string) => {
    updateIncidentMutation.mutate({ status: newStatus });
  };
  
  // Handle assigning the incident
  const handleAssignIncident = (assigneeId: number) => {
    updateIncidentMutation.mutate({ assignedTo: assigneeId });
    setIsAssignDialogOpen(false);
  };
  
  // Handle adding a note
  const handleAddNote = () => {
    if (noteText.trim()) {
      addNoteMutation.mutate({ content: noteText });
    }
  };
  
  // Handle adding evidence
  const handleAddEvidence = () => {
    if (evidenceUploadName.trim() && evidenceDescription.trim()) {
      addEvidenceMutation.mutate({ 
        name: evidenceUploadName, 
        description: evidenceDescription 
      });
    }
  };
  
  // Handle executing a playbook
  const handleExecutePlaybook = () => {
    if (selectedPlaybook) {
      executePlaybookMutation.mutate({ playbookId: selectedPlaybook });
    }
  };
  
  // Handle updating MITRE ATT&CK tactics
  const handleUpdateTactics = () => {
    const selectedTactics = Object.entries(tacticsMapping)
      .filter(([_, isSelected]) => isSelected)
      .map(([tacticId]) => tacticId);
      
    updateTacticsMutation.mutate(selectedTactics);
  };
  
  // Handle checkbox change for tactics
  const handleTacticChange = (tacticId: string, checked: boolean) => {
    setTacticsMapping({
      ...tacticsMapping,
      [tacticId]: checked
    });
  };
  
  // Error state
  if (incidentError) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} activeSection="alerts" />
        <MainContent pageTitle="Incident Details" organization={organization}>
          <div className="bg-background-card rounded-lg border border-gray-800 p-6 flex flex-col items-center justify-center h-64">
            <div className="text-3xl text-destructive mb-4">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h2 className="text-xl font-medium mb-2">Error Loading Incident</h2>
            <p className="text-muted-foreground mb-4">
              There was a problem loading this incident details.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </MainContent>
      </div>
    );
  }
  
  // Loading state
  if (isIncidentLoading || !incident) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} activeSection="alerts" />
        <MainContent pageTitle="Incident Details" organization={organization}>
          <div className="flex items-center justify-center h-64">
            <i className="fas fa-spinner fa-spin mr-2"></i>
            <span>Loading incident data...</span>
          </div>
        </MainContent>
      </div>
    );
  }
  
  // Get severity class
  const severityColors = getSeverityColorClass(incident.severity);
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="alerts" />
      
      <MainContent pageTitle="Incident Details" organization={organization}>
        {/* Incident Header */}
        <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
          <div>
            <div className="flex items-center">
              <h1 className="text-2xl font-medium text-text-primary">
                {incident.title}
              </h1>
              <Badge 
                className={`ml-3 ${severityColors.badge}`} 
                variant="outline"
              >
                {incident.severity.toUpperCase()}
              </Badge>
              <Badge 
                className={`ml-2 ${getStatusBadgeClass(incident.status)}`} 
                variant="outline"
              >
                {incident.status.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Incident ID: {incident.id} • Created {formatTimeAgo(incident.createdAt)} • 
              {incident.assignedTo 
                ? ` Assigned to ${incident.assignedTo}` 
                : ' Unassigned'}
            </p>
          </div>
          
          <div className="flex space-x-2">
            {incident.status !== 'resolved' && incident.status !== 'closed' && (
              <Button 
                variant="outline" 
                className="border-green-600 text-green-600 hover:bg-green-900 hover:text-green-500 hover:bg-opacity-20"
                onClick={() => handleUpdateStatus('resolved')}
                disabled={updateIncidentMutation.isPending}
              >
                <i className="fas fa-check mr-2"></i> Resolve
              </Button>
            )}
            
            {incident.status === 'resolved' && (
              <Button 
                variant="outline" 
                className="border-gray-600 text-gray-400 hover:bg-gray-900 hover:text-gray-300 hover:bg-opacity-20"
                onClick={() => handleUpdateStatus('closed')}
                disabled={updateIncidentMutation.isPending}
              >
                <i className="fas fa-archive mr-2"></i> Close
              </Button>
            )}
            
            {incident.status === 'new' && (
              <Button 
                variant="outline" 
                className="border-blue-600 text-blue-600 hover:bg-blue-900 hover:text-blue-500 hover:bg-opacity-20"
                onClick={() => handleUpdateStatus('in_progress')}
                disabled={updateIncidentMutation.isPending}
              >
                <i className="fas fa-play mr-2"></i> Start Investigation
              </Button>
            )}
            
            <Dialog open={isPlaybookDialogOpen} onOpenChange={setIsPlaybookDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="border-purple-600 text-purple-500 hover:bg-purple-900 hover:text-purple-400 hover:bg-opacity-20"
                >
                  <i className="fas fa-cogs mr-2"></i> Run Playbook
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Execute Playbook</DialogTitle>
                  <DialogDescription>
                    Select a playbook to run against this incident.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {availablePlaybooks.map(playbook => (
                    <div 
                      key={playbook.id} 
                      className={`p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedPlaybook === playbook.id 
                          ? 'border-primary bg-primary/10' 
                          : 'border-gray-700 hover:border-gray-500'
                      }`}
                      onClick={() => setSelectedPlaybook(playbook.id)}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">{playbook.name}</h3>
                        <Badge variant="outline">
                          {playbook.automation}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {playbook.description}
                      </p>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsPlaybookDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    disabled={!selectedPlaybook || executePlaybookMutation.isPending}
                    onClick={handleExecutePlaybook}
                  >
                    {executePlaybookMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Executing...
                      </>
                    ) : (
                      <>Execute Playbook</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <i className="fas fa-ellipsis-v"></i>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Incident Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <i className="fas fa-user-plus mr-2"></i> Assign Incident
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign Incident</DialogTitle>
                      <DialogDescription>
                        Select a user to assign this incident to.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div 
                        className="p-3 border border-gray-700 rounded-md cursor-pointer hover:border-gray-500"
                        onClick={() => handleAssignIncident(user.id || 1)}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
                            {user.initials}
                          </div>
                          <div className="ml-3">
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-muted-foreground">{user.role}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div 
                        className="p-3 border border-gray-700 rounded-md cursor-pointer hover:border-gray-500"
                        onClick={() => handleAssignIncident(2)}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white">
                            JD
                          </div>
                          <div className="ml-3">
                            <p className="font-medium">Jane Doe</p>
                            <p className="text-sm text-muted-foreground">Security Analyst</p>
                          </div>
                        </div>
                      </div>
                      
                      <div 
                        className="p-3 border border-gray-700 rounded-md cursor-pointer hover:border-gray-500"
                        onClick={() => handleAssignIncident(3)}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white">
                            AS
                          </div>
                          <div className="ml-3">
                            <p className="font-medium">Alex Smith</p>
                            <p className="text-sm text-muted-foreground">Security Engineer</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <i className="fas fa-comment mr-2"></i> Add Note
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Investigation Note</DialogTitle>
                      <DialogDescription>
                        Add a note to document your findings or next steps.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <Textarea 
                        placeholder="Enter your investigation notes here..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="min-h-[150px]"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        disabled={!noteText.trim() || addNoteMutation.isPending}
                        onClick={handleAddNote}
                      >
                        {addNoteMutation.isPending ? (
                          <>
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                            Adding...
                          </>
                        ) : (
                          <>Add Note</>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                
                <DropdownMenuItem onClick={() => {
                  toast({
                    title: "Escalating Incident",
                    description: "This incident has been escalated to management.",
                  });
                }}>
                  <i className="fas fa-arrow-up mr-2"></i> Escalate
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={() => {
                  toast({
                    title: "Generating Report",
                    description: "Incident report is being generated.",
                  });
                }}>
                  <i className="fas fa-file-export mr-2"></i> Export Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Main Tabs */}
        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="alerts">Related Alerts</TabsTrigger>
            <TabsTrigger value="mitre">MITRE ATT&CK</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Incident Details */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Incident Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                      <p className="text-text-primary">{incident.description}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Severity</h3>
                        <Badge className={severityColors.badge}>
                          {incident.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                        <Badge className={getStatusBadgeClass(incident.status)}>
                          {incident.status.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Created</h3>
                        <p className="text-text-primary">{formatDate(incident.createdAt)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h3>
                        <p className="text-text-primary">{formatDate(incident.updatedAt)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Assigned To</h3>
                        <p className="text-text-primary">
                          {incident.assignedTo || 'Unassigned'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Related Alerts</h3>
                        <p className="text-text-primary">
                          {relatedAlerts.length || 0} alert(s)
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* AI Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`p-4 rounded-md ${severityColors.bg} mb-4`}>
                    <h3 className="font-medium flex items-center">
                      <i className={`fas fa-robot mr-2 ${severityColors.icon}`}></i>
                      Risk Assessment
                    </h3>
                    <p className="mt-2 text-sm">
                      {incident.aiAnalysis?.summary || 
                        "This incident has been assessed as a " + incident.severity + 
                        " severity threat based on observed indicators and potential impact."}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Recommended Actions</h3>
                    <ul className="space-y-2 text-sm">
                      {incident.aiAnalysis?.recommendations ? (
                        incident.aiAnalysis.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start">
                            <i className="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>{rec}</span>
                          </li>
                        ))
                      ) : (
                        <>
                          <li className="flex items-start">
                            <i className="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>Isolate affected systems to prevent lateral movement</span>
                          </li>
                          <li className="flex items-start">
                            <i className="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>Collect forensic evidence from compromised hosts</span>
                          </li>
                          <li className="flex items-start">
                            <i className="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>Review logs for additional indicators of compromise</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      toast({
                        title: "AI Analysis Refreshed",
                        description: "Updated analysis is being generated.",
                      });
                    }}
                  >
                    <i className="fas fa-sync-alt mr-2"></i> Refresh Analysis
                  </Button>
                </CardFooter>
              </Card>
              
              {/* Related Alerts */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Related Alerts</CardTitle>
                  <CardDescription>
                    Alerts that are part of this incident
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isAlertsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      <span>Loading alerts...</span>
                    </div>
                  ) : relatedAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <i className="fas fa-exclamation-circle text-3xl mb-3"></i>
                      <p>No related alerts found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {relatedAlerts.slice(0, 3).map(alert => {
                        const alertSeverityColors = getSeverityColorClass(alert.severity);
                        return (
                          <div 
                            key={alert.id} 
                            className="flex items-center justify-between p-3 rounded-md border border-gray-800 hover:border-gray-600 transition-colors"
                          >
                            <div className="flex items-center">
                              <div className={`w-2 h-10 rounded-l-md ${alertSeverityColors.bg} mr-3`}></div>
                              <div>
                                <h3 className="text-sm font-medium">{alert.title}</h3>
                                <p className="text-xs text-muted-foreground">
                                  {formatTimeAgo(alert.timestamp)} • {alert.source}
                                </p>
                              </div>
                            </div>
                            <Badge className={alertSeverityColors.badge}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                          </div>
                        );
                      })}
                      
                      {relatedAlerts.length > 3 && (
                        <Button 
                          variant="ghost" 
                          className="w-full mt-2 text-muted-foreground hover:text-text-primary"
                          onClick={() => setActiveTab("alerts")}
                        >
                          View All {relatedAlerts.length} Alerts
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Response Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Response Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Button 
                      variant="outline" 
                      className="w-full text-left justify-start border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        toast({
                          title: "Host Isolation Initiated",
                          description: "Affected hosts have been isolated from the network.",
                        });
                      }}
                    >
                      <i className="fas fa-shield-alt mr-2"></i>
                      Isolate Affected Hosts
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full text-left justify-start border-orange-600 text-orange-500 hover:bg-orange-900/10"
                      onClick={() => {
                        toast({
                          title: "Firewall Rule Added",
                          description: "Malicious IP addresses have been blocked.",
                        });
                      }}
                    >
                      <i className="fas fa-ban mr-2"></i>
                      Block Malicious IPs
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full text-left justify-start border-blue-600 text-blue-500 hover:bg-blue-900/10"
                      onClick={() => {
                        toast({
                          title: "Forensic Collection Started",
                          description: "Collecting forensic data from affected systems.",
                        });
                      }}
                    >
                      <i className="fas fa-search mr-2"></i>
                      Collect Forensic Data
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full text-left justify-start border-purple-600 text-purple-500 hover:bg-purple-900/10"
                      onClick={() => setIsPlaybookDialogOpen(true)}
                    >
                      <i className="fas fa-cogs mr-2"></i>
                      Run Automated Playbook
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Timeline Tab */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Investigation Timeline</CardTitle>
                  <CardDescription>
                    Chronological record of incident activities and findings
                  </CardDescription>
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                    <i className="fas fa-plus mr-2"></i> Add Note
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Timeline>
                  {/* Current time entry */}
                  <TimelineItem
                    icon={<i className="fas fa-pencil-alt"></i>}
                    iconColor="bg-blue-600"
                    title="Current Investigation"
                    time={new Date().toISOString()}
                    current
                  >
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-blue-500"
                        onClick={() => setIsNoteDialogOpen(true)}
                      >
                        <i className="fas fa-plus mr-2"></i> Add investigation notes
                      </Button>
                    </div>
                  </TimelineItem>
                  
                  {/* Sample timeline entries */}
                  {incident.timeline && Array.isArray(incident.timeline) ? (
                    incident.timeline.map((entry, index) => (
                      <TimelineItem
                        key={index}
                        icon={entry.icon || (
                          entry.type === 'note' ? <i className="fas fa-comment"></i> :
                          entry.type === 'status' ? <i className="fas fa-info-circle"></i> :
                          entry.type === 'action' ? <i className="fas fa-cog"></i> :
                          <i className="fas fa-clipboard-check"></i>
                        )}
                        iconColor={entry.iconColor || (
                          entry.type === 'note' ? "bg-blue-600" :
                          entry.type === 'status' ? "bg-purple-600" :
                          entry.type === 'action' ? "bg-orange-600" :
                          "bg-green-600"
                        )}
                        title={entry.title}
                        time={entry.timestamp}
                      >
                        <p className="text-sm">{entry.content}</p>
                      </TimelineItem>
                    ))
                  ) : (
                    <>
                      <TimelineItem
                        icon={<i className="fas fa-play-circle"></i>}
                        iconColor="bg-blue-600"
                        title="Investigation Started"
                        time={incident.createdAt}
                      >
                        <p className="text-sm">Incident created and investigation initiated.</p>
                      </TimelineItem>
                      
                      <TimelineItem
                        icon={<i className="fas fa-robot"></i>}
                        iconColor="bg-purple-600"
                        title="AI Analysis Completed"
                        time={incident.createdAt}
                      >
                        <p className="text-sm">
                          Automated analysis identified this as a {incident.severity} severity incident 
                          with potential impact on business operations.
                        </p>
                      </TimelineItem>
                      
                      <TimelineItem
                        icon={<i className="fas fa-shield-alt"></i>}
                        iconColor="bg-green-600"
                        title="Initial Containment Actions"
                        time={incident.createdAt}
                      >
                        <p className="text-sm">
                          Affected systems isolated from the network to prevent potential lateral movement.
                        </p>
                      </TimelineItem>
                    </>
                  )}
                </Timeline>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Evidence Tab */}
          <TabsContent value="evidence">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Evidence Collection</CardTitle>
                    <CardDescription>
                      Collected artifacts and forensic evidence
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Add evidence form */}
                    <div className="p-4 rounded-md border border-gray-800 bg-background-lighter">
                      <h3 className="text-sm font-medium mb-2">Add Evidence</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Evidence Name</label>
                          <Input 
                            placeholder="Network capture, Memory dump, etc."
                            value={evidenceUploadName}
                            onChange={(e) => setEvidenceUploadName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Description</label>
                          <Textarea 
                            placeholder="Brief description of the evidence"
                            value={evidenceDescription}
                            onChange={(e) => setEvidenceDescription(e.target.value)}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            disabled={!evidenceUploadName.trim() || !evidenceDescription.trim() || addEvidenceMutation.isPending}
                            onClick={handleAddEvidence}
                          >
                            {addEvidenceMutation.isPending ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Adding...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-plus mr-2"></i> Add Evidence
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Evidence list */}
                    {incident.evidence && Array.isArray(incident.evidence) && incident.evidence.length > 0 ? (
                      <div className="space-y-3">
                        {incident.evidence.map((item, index) => (
                          <div 
                            key={index} 
                            className="p-3 rounded-md border border-gray-800 hover:border-gray-600 transition-colors"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-sm font-medium flex items-center">
                                  <i className="fas fa-file-alt mr-2 text-blue-500"></i>
                                  {item.name}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Added {formatTimeAgo(item.timestamp)}
                                </p>
                              </div>
                              <div className="flex space-x-1">
                                <Button variant="ghost" size="sm">
                                  <i className="fas fa-download"></i>
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <i className="fas fa-eye"></i>
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm mt-2">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <i className="fas fa-folder-open text-3xl mb-3"></i>
                        <p>No evidence has been collected yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Evidence Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Available Sources</h3>
                    <div className="space-y-2">
                      <Button 
                        variant="outline" 
                        className="w-full text-left justify-start"
                        onClick={() => {
                          setEvidenceUploadName("Network Traffic Capture");
                          setEvidenceDescription("Full packet capture from affected subnet during the incident timeframe");
                        }}
                      >
                        <i className="fas fa-network-wired mr-2 text-blue-500"></i>
                        Network Traffic
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="w-full text-left justify-start"
                        onClick={() => {
                          setEvidenceUploadName("Endpoint Logs");
                          setEvidenceDescription("Security logs from affected endpoint systems");
                        }}
                      >
                        <i className="fas fa-laptop mr-2 text-green-500"></i>
                        Endpoint Logs
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="w-full text-left justify-start"
                        onClick={() => {
                          setEvidenceUploadName("Memory Dump");
                          setEvidenceDescription("RAM dump from potentially compromised server");
                        }}
                      >
                        <i className="fas fa-memory mr-2 text-purple-500"></i>
                        Memory Dumps
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="w-full text-left justify-start"
                        onClick={() => {
                          setEvidenceUploadName("Firewall Logs");
                          setEvidenceDescription("Perimeter firewall logs showing traffic patterns during the attack");
                        }}
                      >
                        <i className="fas fa-shield-alt mr-2 text-red-500"></i>
                        Firewall Logs
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="w-full text-left justify-start"
                        onClick={() => {
                          setEvidenceUploadName("Email Headers");
                          setEvidenceDescription("Headers from phishing emails related to the incident");
                        }}
                      >
                        <i className="fas fa-envelope mr-2 text-orange-500"></i>
                        Email Headers
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Related Alerts Tab */}
          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>Related Alerts</CardTitle>
                <CardDescription>
                  All alerts associated with this incident
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isAlertsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    <span>Loading alerts...</span>
                  </div>
                ) : relatedAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <i className="fas fa-exclamation-circle text-3xl mb-3"></i>
                    <p>No related alerts found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-left border-b border-gray-800">
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Severity</th>
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Title</th>
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Source</th>
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Time</th>
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Status</th>
                            <th className="pb-2 font-medium text-muted-foreground text-xs">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {relatedAlerts.map(alert => {
                            const alertSeverityColors = getSeverityColorClass(alert.severity);
                            return (
                              <tr key={alert.id} className="hover:bg-background-lighter">
                                <td className="py-3">
                                  <Badge className={alertSeverityColors.badge}>
                                    {alert.severity.toUpperCase()}
                                  </Badge>
                                </td>
                                <td className="py-3">
                                  <p className="font-medium">{alert.title}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {alert.description.substring(0, 60)}...
                                  </p>
                                </td>
                                <td className="py-3 text-sm">{alert.source}</td>
                                <td className="py-3 text-sm">{formatTimeAgo(alert.timestamp)}</td>
                                <td className="py-3">
                                  <Badge className={getStatusBadgeClass(alert.status)}>
                                    {alert.status.replace(/_/g, ' ').toUpperCase()}
                                  </Badge>
                                </td>
                                <td className="py-3">
                                  <Button variant="ghost" size="sm">
                                    <i className="fas fa-eye"></i>
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* MITRE ATT&CK Tab */}
          <TabsContent value="mitre">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>MITRE ATT&CK Mapping</CardTitle>
                  <CardDescription>
                    Tactics, techniques, and procedures identified in this incident
                  </CardDescription>
                </div>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleUpdateTactics}
                    disabled={updateTacticsMutation.isPending}
                  >
                    {updateTacticsMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i> Save Mapping
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mitreTactics.map((tactic) => (
                    <div 
                      key={tactic.id} 
                      className={`p-3 rounded-md border transition-colors ${
                        tacticsMapping[tactic.id] 
                          ? 'border-primary bg-primary/10' 
                          : 'border-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start">
                        <Checkbox 
                          id={`tactic-${tactic.id}`}
                          checked={tacticsMapping[tactic.id] || false}
                          onCheckedChange={(checked) => 
                            handleTacticChange(tactic.id, checked === true)
                          }
                          className="mt-1"
                        />
                        <div className="ml-3">
                          <label 
                            htmlFor={`tactic-${tactic.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {tactic.name}
                          </label>
                          <p className="text-xs text-muted-foreground mt-1">
                            {tactic.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </MainContent>
    </div>
  );
};

export default IncidentPage;