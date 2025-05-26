import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Code, 
  Copy, 
  Edit, 
  Eye, 
  FileText, 
  Filter, 
  Globe, 
  HardDrive, 
  Lock, 
  Mail, 
  MoreHorizontal, 
  Play, 
  Plus, 
  Power, 
  RefreshCcw, 
  Search, 
  Settings, 
  Shield, 
  Trash, 
  Users, 
  X, 
  Zap 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import PlaybookWizard from "./PlaybookWizard";
import PlaybookTester from "./PlaybookTester";

// Types
interface PlaybookTrigger {
  id: string;
  type: string;
  name: string;
  description: string;
  configuration: Record<string, any>;
}

interface PlaybookAction {
  id: string;
  type: string;
  name: string;
  description: string;
  configuration: Record<string, any>;
  order: number;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  category: 'incident-response' | 'threat-hunting' | 'vulnerability-management' | 'compliance' | 'general';
  status: 'active' | 'inactive' | 'draft';
  trigger: PlaybookTrigger;
  actions: PlaybookAction[];
  created: string;
  lastModified: string;
  lastRun: string | null;
  runCount: number;
  successRate: number;
  isAutomated: boolean;
  author: string;
  tags: string[];
}

interface ExecutionLog {
  id: string;
  playbookId: string;
  playbookName: string;
  status: 'success' | 'failed' | 'in-progress';
  startTime: string;
  endTime: string | null;
  triggeredBy: string;
  details: {
    actionId: string;
    actionName: string;
    status: 'success' | 'failed' | 'skipped' | 'in-progress';
    message: string;
    timestamp: string;
  }[];
}

// Validation schema
const playbookSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  category: z.string(),
  triggerType: z.string(),
  triggerConfiguration: z.record(z.any()).optional(),
  isAutomated: z.boolean().default(false),
});

// Action types
const actionTypes = [
  { value: "notify", label: "Send Notification", icon: Mail, description: "Sends notifications through email, Slack, or other channels" },
  { value: "enrich", label: "Enrich Data", icon: Search, description: "Enriches incident data with additional information" },
  { value: "block", label: "Block Entity", icon: Shield, description: "Blocks malicious IPs, domains, or other entities" },
  { value: "scan", label: "Run Scan", icon: Search, description: "Runs security scans on affected systems" },
  { value: "investigate", label: "Investigate", icon: Shield, description: "Performs automated investigation of the threat" },
  { value: "containment", label: "Containment", icon: Lock, description: "Executes containment actions to isolate the threat" },
  { value: "api-call", label: "API Call", icon: Globe, description: "Makes API calls to external services" },
  { value: "script", label: "Run Script", icon: Code, description: "Runs custom scripts or commands" },
  { value: "update-ticket", label: "Update Ticket", icon: Edit, description: "Updates tickets in ticketing systems" },
  { value: "escalate", label: "Escalate", icon: Users, description: "Escalates the incident to specific teams or individuals" },
];

// Trigger types
const triggerTypes = [
  { value: "alert", label: "Alert", icon: AlertTriangle, description: "Triggered by specific alerts" },
  { value: "incident", label: "Incident", icon: Shield, description: "Triggered by incident creation or updates" },
  { value: "schedule", label: "Schedule", icon: Clock, description: "Runs on a defined schedule" },
  { value: "manual", label: "Manual", icon: Play, description: "Manually executed by users" },
  { value: "threat-intel", label: "Threat Intel", icon: Globe, description: "Triggered by new threat intelligence" },
];

export default function PlaybookManager() {
  const { toast } = useToast();
  
  // States
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [activeTab, setActiveTab] = useState("playbooks");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showWizard, setShowWizard] = useState(false);
  const [viewPlaybook, setViewPlaybook] = useState<Playbook | null>(null);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [viewLog, setViewLog] = useState<ExecutionLog | null>(null);
  const [viewAction, setViewAction] = useState<PlaybookAction | null>(null);
  const [showTester, setShowTester] = useState(false);
  const [actionList, setActionList] = useState<PlaybookAction[]>([]);
  
  // Fetch playbooks from API
  const { isLoading: isLoadingPlaybooks, error: playbooksError } = useQuery({
    queryKey: ['/api/playbooks'],
    onError: (error) => {
      console.error("Error fetching playbooks:", error);
      toast({
        title: "Error loading playbooks",
        description: "Using sample data instead",
        variant: "destructive"
      });
      setPlaybooks(samplePlaybooks);
    }
  });

  // Update playbooks when data changes
  useEffect(() => {
    const data = queryClient.getQueryData(['/api/playbooks']);
    if (data) {
      try {
        // Convert the API data into our frontend Playbook format
        const formattedPlaybooks: Playbook[] = (data as any[]).map((pb: any) => ({
          id: pb.id.toString(),
          name: pb.name,
          description: pb.description,
          category: pb.category || 'general',
          status: pb.status || 'active',
          trigger: {
            id: `trigger-${pb.id}`,
            type: pb.triggerType,
            name: `${pb.triggerType.charAt(0).toUpperCase() + pb.triggerType.slice(1)} Trigger`,
            description: `Triggered by ${pb.triggerType}`,
            configuration: pb.triggerCondition || {}
          },
          actions: pb.steps ? parseSteps(pb.steps) : [],
          created: pb.createdAt || new Date().toISOString(),
          lastModified: pb.lastModified || pb.createdAt || new Date().toISOString(),
          lastRun: pb.lastExecuted,
          runCount: pb.executionCount || 0,
          successRate: 100, // Default to 100% if not provided
          isAutomated: pb.isActive,
          author: "System",
          tags: pb.tags ? (typeof pb.tags === 'string' ? JSON.parse(pb.tags) : pb.tags) : []
        }));
        if (formattedPlaybooks.length > 0) {
          setPlaybooks(formattedPlaybooks);
        } else {
          setPlaybooks(samplePlaybooks);
        }
      } catch (error) {
        console.error("Error processing playbook data:", error);
        setPlaybooks(samplePlaybooks);
      }
    } else {
      setPlaybooks(samplePlaybooks);
    }
  }, [queryClient.getQueryData(['/api/playbooks'])]);
  
  // Fetch playbook executions from API
  const { isLoading: isLoadingExecutions, error: executionsError } = useQuery({
    queryKey: ['/api/playbook-executions'],
    onError: (error) => {
      console.error("Error fetching execution logs:", error);
      toast({
        title: "Error loading execution logs",
        description: "Using sample data instead",
        variant: "destructive"
      });
      setExecutionLogs(sampleExecutionLogs);
    }
  });

  // Update execution logs when data changes
  useEffect(() => {
    const data = queryClient.getQueryData(['/api/playbook-executions']);
    if (data) {
      try {
        // Convert API data to our frontend ExecutionLog format
        const formattedLogs: ExecutionLog[] = (data as any[]).map((execution: any) => ({
          id: execution.id.toString(),
          playbookId: execution.playbookId.toString(),
          playbookName: execution.playbookName || 'Unknown Playbook',
          status: execution.status,
          startTime: execution.startTime || execution.createdAt,
          endTime: execution.endTime || execution.updatedAt,
          triggeredBy: execution.triggeredBy || 'system',
          details: execution.results ? parseExecutionDetails(execution.results) : []
        }));
        if (formattedLogs.length > 0) {
          setExecutionLogs(formattedLogs);
        } else {
          setExecutionLogs(sampleExecutionLogs);
        }
      } catch (error) {
        console.error("Error processing execution logs data:", error);
        setExecutionLogs(sampleExecutionLogs);
      }
    } else {
      setExecutionLogs(sampleExecutionLogs);
    }
  }, [queryClient.getQueryData(['/api/playbook-executions'])]);
  
  // Helper function to parse steps JSON into our frontend format
  function parseSteps(stepsData: any): PlaybookAction[] {
    if (!stepsData) return [];
    
    try {
      // If steps is already an array, use it directly
      const steps = Array.isArray(stepsData) ? stepsData : 
                    (typeof stepsData === 'string' ? JSON.parse(stepsData) : []);
      
      return steps.map((step: any, index: number) => ({
        id: step.id || `action-${index}`,
        type: step.type || 'unknown',
        name: step.name || `Action ${index + 1}`,
        description: step.description || '',
        configuration: step.configuration || {},
        order: step.order || index + 1
      }));
    } catch (error) {
      console.error("Error parsing playbook steps:", error);
      return [];
    }
  }
  
  // Helper function to parse execution results into our frontend format
  function parseExecutionDetails(resultsData: any): any[] {
    if (!resultsData) return [];
    
    try {
      const results = typeof resultsData === 'string' ? JSON.parse(resultsData) : resultsData;
      
      if (Array.isArray(results)) {
        return results.map((result: any, index: number) => ({
          actionId: result.actionId || `action-${index}`,
          actionName: result.actionName || `Step ${index + 1}`,
          status: result.status || 'unknown',
          message: result.message || '',
          timestamp: result.timestamp || new Date().toISOString()
        }));
      }
      return [];
    } catch (error) {
      console.error("Error parsing execution results:", error);
      return [];
    }
  }
  
  // Form for creating/editing playbooks
  const form = useForm<z.infer<typeof playbookSchema>>({
    resolver: zodResolver(playbookSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "general",
      isAutomated: false,
      triggerType: "manual",
    },
  });
  
  useEffect(() => {
    if (editingPlaybook) {
      form.reset({
        name: editingPlaybook.name,
        description: editingPlaybook.description,
        category: editingPlaybook.category,
        isAutomated: editingPlaybook.isAutomated,
        triggerType: editingPlaybook.trigger.type as any,
      });
      setActionList([...editingPlaybook.actions]);
    } else {
      form.reset({
        name: "",
        description: "",
        category: "general",
        isAutomated: false,
        triggerType: "manual",
      });
      setActionList([]);
    }
  }, [editingPlaybook, form]);
  
  // Filter playbooks based on search term and filters
  const filteredPlaybooks = playbooks.filter(playbook => {
    const matchesSearch = playbook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          playbook.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          playbook.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = categoryFilter === "all" || playbook.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || playbook.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });
  
  // Filter logs based on search term
  const filteredLogs = executionLogs.filter(log => {
    return log.playbookName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           log.triggeredBy.toLowerCase().includes(searchTerm.toLowerCase());
  });
  
  // Mutations for API interactions
  const executePlaybookMutation = useMutation({
    mutationFn: async (playbookId: number | string) => {
      const res = await apiRequest('POST', `/api/playbooks/${playbookId}/execute`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbook-executions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: "Playbook Execution Started",
        description: "The playbook execution has been queued",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const togglePlaybookStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number | string, isActive: boolean }) => {
      const res = await apiRequest('PATCH', `/api/playbooks/${id}/toggle-status`, { isActive });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: data.isActive ? "Playbook Activated" : "Playbook Deactivated",
        description: `"${data.name}" status updated`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Status Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const deletePlaybookMutation = useMutation({
    mutationFn: async (id: number | string) => {
      const res = await apiRequest('DELETE', `/api/playbooks/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      // Find the playbook in our local state to display the name in the toast
      const deletedPlaybook = playbooks.find(p => p.id.toString() === id.toString());
      
      toast({
        title: "Playbook Deleted",
        description: deletedPlaybook ? `"${deletedPlaybook.name}" has been removed` : "Playbook has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const createPlaybookMutation = useMutation({
    mutationFn: async (playbookData: any) => {
      const res = await apiRequest('POST', '/api/playbooks', playbookData);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: "Playbook Created",
        description: `"${data.name}" has been created`,
      });
      
      setShowWizard(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const updatePlaybookMutation = useMutation({
    mutationFn: async ({ id, playbookData }: { id: number | string, playbookData: any }) => {
      const res = await apiRequest('PATCH', `/api/playbooks/${id}`, playbookData);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playbooks'] });
      
      toast({
        title: "Playbook Updated",
        description: `"${data.name}" has been updated`,
      });
      
      setShowWizard(false);
      setEditingPlaybook(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handlers that connect UI interactions to API mutations
  const handleRunPlaybook = (playbook: Playbook) => {
    executePlaybookMutation.mutate(playbook.id);
    
    // For immediate feedback, we'll also update the UI optimistically
    const newLog: ExecutionLog = {
      id: `el${new Date().getTime()}`,
      playbookId: playbook.id,
      playbookName: playbook.name,
      status: 'in-progress',
      startTime: new Date().toISOString(),
      endTime: null,
      triggeredBy: "Manual User",
      details: playbook.actions.map(action => ({
        actionId: action.id,
        actionName: action.name,
        status: 'in-progress',
        message: `Executing ${action.name}...`,
        timestamp: new Date().toISOString()
      }))
    };
    
    setExecutionLogs(prev => [newLog, ...prev]);
  };
  
  const handleTogglePlaybook = (playbook: Playbook, newStatus: 'active' | 'inactive') => {
    togglePlaybookStatusMutation.mutate({ 
      id: playbook.id, 
      isActive: newStatus === 'active' 
    });
    
    // Optimistic update
    setPlaybooks(prev => {
      const updated = [...prev];
      const index = updated.findIndex(p => p.id === playbook.id);
      
      if (index !== -1) {
        updated[index] = {
          ...updated[index],
          status: newStatus
        };
      }
      
      return updated;
    });
  };
  
  const handleDeletePlaybook = (playbook: Playbook) => {
    if (window.confirm(`Are you sure you want to delete the playbook "${playbook.name}"?`)) {
      deletePlaybookMutation.mutate(playbook.id);
      
      // Optimistic update
      setPlaybooks(prev => prev.filter(p => p.id !== playbook.id));
    }
  };
  
  const handleDuplicatePlaybook = (playbook: Playbook) => {
    // Create a copy of the playbook data for the API
    const playbookData = {
      name: `${playbook.name} (Copy)`,
      description: playbook.description,
      category: playbook.category,
      triggerType: playbook.trigger.type,
      triggerCondition: playbook.trigger.configuration,
      steps: JSON.stringify(playbook.actions),
      isActive: false,
      tags: JSON.stringify(playbook.tags)
    };
    
    createPlaybookMutation.mutate(playbookData);
    
    // For immediate feedback, also create a temporary version in the UI
    const newPlaybook: Playbook = {
      ...playbook,
      id: `temp-${Date.now()}`,
      name: `${playbook.name} (Copy)`,
      status: 'draft',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lastRun: null,
      runCount: 0,
      successRate: 0
    };
    
    setPlaybooks(prev => [...prev, newPlaybook]);
  };
  
  const handleViewExecutionLog = (log: ExecutionLog) => {
    setViewLog(log);
  };
  
  const getTriggerDescription = (trigger: PlaybookTrigger) => {
    switch (trigger.type) {
      case 'alert':
        return `Triggered by alerts matching criteria`;
      case 'incident':
        return `Triggered when incidents are created/updated`;
      case 'schedule':
        return `Runs on schedule: ${trigger.configuration.schedule || 'Daily'}`;
      case 'manual':
        return `Manually executed by users`;
      case 'threat-intel':
        return `Triggered by new threat intelligence`;
      default:
        return `Custom trigger`;
    }
  };
  
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'incident-response':
        return <Badge className="bg-red-600 hover:bg-red-700">Incident Response</Badge>;
      case 'threat-hunting':
        return <Badge className="bg-blue-600 hover:bg-blue-700">Threat Hunting</Badge>;
      case 'vulnerability-management':
        return <Badge className="bg-yellow-600 hover:bg-yellow-700">Vulnerability Management</Badge>;
      case 'compliance':
        return <Badge className="bg-green-600 hover:bg-green-700">Compliance</Badge>;
      default:
        return <Badge>General</Badge>;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600 hover:bg-green-700">Active</Badge>;
      case 'inactive':
        return <Badge variant="outline">Inactive</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  const getExecutionStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-600 hover:bg-green-700">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-600 hover:bg-red-700">Failed</Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-600 hover:bg-blue-700">In Progress</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  const getActionStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-600 hover:bg-green-700">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-600 hover:bg-red-700">Failed</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-600 hover:bg-blue-700">In Progress</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  const getActionIcon = (type: string) => {
    const action = actionTypes.find(a => a.value === type);
    const Icon = action?.icon || Settings;
    return <Icon className="h-5 w-5 mr-2" />;
  };
  
  const handleCreateSubmit = (values: z.infer<typeof playbookSchema>) => {
    if (actionList.length === 0) {
      toast({
        title: "Error",
        description: "You must add at least one action to the playbook",
        variant: "destructive",
      });
      return;
    }
    
    // Prepare the data for API submission
    const playbookData = {
      name: values.name,
      description: values.description,
      category: values.category,
      isActive: values.isAutomated,
      triggerType: values.triggerType,
      triggerCondition: values.triggerConfiguration || {},
      steps: JSON.stringify(actionList),
      tags: JSON.stringify([])
    };
    
    if (editingPlaybook) {
      // Update existing playbook
      updatePlaybookMutation.mutate({
        id: editingPlaybook.id,
        playbookData
      });
      
      // Optimistic update to the UI
      setPlaybooks(prev => {
        const updated = [...prev];
        const index = updated.findIndex(p => p.id === editingPlaybook.id);
        
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            name: values.name,
            description: values.description,
            category: values.category as any,
            isAutomated: values.isAutomated,
            trigger: {
              ...updated[index].trigger,
              type: values.triggerType,
              name: `${values.triggerType.charAt(0).toUpperCase() + values.triggerType.slice(1)} Trigger`,
              configuration: values.triggerConfiguration || {}
            },
            actions: actionList,
            lastModified: new Date().toISOString()
          };
        }
        
        return updated;
      });
    } else {
      // Create new playbook
      createPlaybookMutation.mutate(playbookData);
      
      // Optimistic update to the UI
      const newPlaybook: Playbook = {
        id: `temp-${new Date().getTime()}`,
        name: values.name,
        description: values.description,
        category: values.category as any,
        status: 'draft',
        trigger: {
          id: `t-temp-${new Date().getTime()}`,
          type: values.triggerType,
          name: `${values.triggerType.charAt(0).toUpperCase() + values.triggerType.slice(1)} Trigger`,
          description: `Triggered by ${values.triggerType}`,
          configuration: values.triggerConfiguration || {}
        },
        actions: actionList,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        lastRun: null,
        runCount: 0,
        successRate: 0,
        isAutomated: values.isAutomated,
        author: "Current User",
        tags: []
      };
      
      setPlaybooks(prev => [...prev, newPlaybook]);
    }
    
    setShowWizard(false);
  };
  
  const handleAddAction = () => {
    const newAction: PlaybookAction = {
      id: `a${actionList.length + 1}-new`,
      type: "notify",
      name: "New Action",
      description: "Description of new action",
      configuration: {},
      order: actionList.length + 1
    };
    
    setActionList(prev => [...prev, newAction]);
    setViewAction(newAction);
  };
  
  const handleUpdateAction = (updatedAction: PlaybookAction) => {
    setActionList(prev => {
      const updated = [...prev];
      const index = updated.findIndex(a => a.id === updatedAction.id);
      
      if (index !== -1) {
        updated[index] = updatedAction;
      }
      
      return updated;
    });
    
    setViewAction(null);
  };
  
  const handleRemoveAction = (actionId: string) => {
    setActionList(prev => prev.filter(a => a.id !== actionId));
    setViewAction(null);
  };
  
  const handleMoveAction = (actionId: string, direction: 'up' | 'down') => {
    setActionList(prev => {
      const updated = [...prev];
      const index = updated.findIndex(a => a.id === actionId);
      
      if (index === -1) return prev;
      
      if (direction === 'up' && index > 0) {
        // Swap with previous
        [updated[index-1], updated[index]] = [updated[index], updated[index-1]];
        // Update order
        updated[index].order = index + 1;
        updated[index-1].order = index;
      } else if (direction === 'down' && index < updated.length - 1) {
        // Swap with next
        [updated[index], updated[index+1]] = [updated[index+1], updated[index]];
        // Update order
        updated[index].order = index + 1;
        updated[index+1].order = index + 2;
      }
      
      return updated;
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">SOAR Playbooks</h2>
          <p className="text-muted-foreground">
            Automatiza tu respuesta de seguridad con playbooks predefinidos
          </p>
        </div>
        <Button onClick={() => {setShowWizard(true); setEditingPlaybook(null);}} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Crear Playbook
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-2 mb-4">
          <TabsList>
            <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
            <TabsTrigger value="execution">Execution Logs</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
          </TabsList>
          
          <div className="flex flex-1 md:justify-end space-x-2 mt-4 md:mt-0">
            <div className="relative w-full md:w-60">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {activeTab === "playbooks" && (
              <>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="incident-response">Incident Response</SelectItem>
                    <SelectItem value="threat-hunting">Threat Hunting</SelectItem>
                    <SelectItem value="vulnerability-management">Vulnerability Management</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>
        
        <TabsContent value="playbooks" className="space-y-4">
          {filteredPlaybooks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <div className="rounded-full bg-muted p-3 mb-4">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-medium mb-2">No playbooks found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchTerm || categoryFilter !== "all" || statusFilter !== "all" 
                    ? "Try changing your search or filters"
                    : "Get started by creating your first playbook"}
                </p>
                {searchTerm || categoryFilter !== "all" || statusFilter !== "all" ? (
                  <Button variant="outline" onClick={() => {
                    setSearchTerm("");
                    setCategoryFilter("all");
                    setStatusFilter("all");
                  }}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => {setShowWizard(true); setEditingPlaybook(null);}}>
                    <Plus className="mr-2 h-4 w-4" /> Create Playbook
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredPlaybooks.map(playbook => (
                <Card key={playbook.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        {getCategoryBadge(playbook.category)}
                        {getStatusBadge(playbook.status)}
                      </div>
                      <div className="flex space-x-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setViewPlaybook(playbook)} className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {playbook.name}
                                {getStatusBadge(playbook.status)}
                              </DialogTitle>
                              <DialogDescription>
                                Created {new Date(playbook.created).toLocaleDateString()} | Last modified {new Date(playbook.lastModified).toLocaleDateString()}
                              </DialogDescription>
                            </DialogHeader>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                              <div className="md:col-span-2">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Description</h4>
                                    <p className="text-sm text-muted-foreground">{playbook.description}</p>
                                  </div>
                                  
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Trigger</h4>
                                    <Alert>
                                      <div className="flex items-start">
                                        {(() => {
                                          const TriggerIcon = triggerTypes.find(t => t.value === playbook.trigger.type)?.icon || AlertTriangle;
                                          return <TriggerIcon className="h-5 w-5 mr-2" />;
                                        })()}
                                        <div>
                                          <AlertTitle>{playbook.trigger.name}</AlertTitle>
                                          <AlertDescription>
                                            {getTriggerDescription(playbook.trigger)}
                                          </AlertDescription>
                                        </div>
                                      </div>
                                    </Alert>
                                  </div>
                                  
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Actions</h4>
                                    <div className="space-y-2">
                                      {playbook.actions.map((action, index) => (
                                        <Alert key={action.id}>
                                          <div className="flex items-start">
                                            <div className="bg-muted h-6 w-6 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                                              <span className="text-xs">{index + 1}</span>
                                            </div>
                                            <div className="flex-1">
                                              <AlertTitle className="flex items-center">
                                                {getActionIcon(action.type)}
                                                {action.name}
                                              </AlertTitle>
                                              <AlertDescription>
                                                {action.description}
                                              </AlertDescription>
                                            </div>
                                          </div>
                                        </Alert>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  {playbook.tags.length > 0 && (
                                    <div>
                                      <h4 className="text-sm font-medium mb-1">Tags</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {playbook.tags.map(tag => (
                                          <Badge key={tag} variant="outline">{tag}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Details</CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Category</p>
                                      <p className="text-sm font-medium">
                                        {(() => {
                                          switch (playbook.category) {
                                            case 'incident-response': return 'Incident Response';
                                            case 'threat-hunting': return 'Threat Hunting';
                                            case 'vulnerability-management': return 'Vulnerability Management';
                                            case 'compliance': return 'Compliance';
                                            default: return 'General';
                                          }
                                        })()}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Author</p>
                                      <p className="text-sm font-medium">{playbook.author}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Execution Mode</p>
                                      <p className="text-sm font-medium">{playbook.isAutomated ? 'Automated' : 'Manual'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Execution Count</p>
                                      <p className="text-sm font-medium">{playbook.runCount} runs</p>
                                    </div>
                                    {playbook.runCount > 0 && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Success Rate</p>
                                        <div className="flex items-center">
                                          <Progress value={playbook.successRate} className="h-2 flex-1" />
                                          <span className="text-sm font-medium ml-2">{playbook.successRate.toFixed(1)}%</span>
                                        </div>
                                      </div>
                                    )}
                                    {playbook.lastRun && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Last Run</p>
                                        <p className="text-sm font-medium">{new Date(playbook.lastRun).toLocaleString()}</p>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                                
                                <div className="flex mt-4 space-x-2">
                                  <Button 
                                    className="flex-1" 
                                    disabled={playbook.status !== 'active'}
                                    onClick={() => {
                                      handleRunPlaybook(playbook);
                                      setViewPlaybook(null);
                                    }}
                                  >
                                    <Play className="mr-2 h-4 w-4" /> Run
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    className="flex-1"
                                    onClick={() => {
                                      setEditingPlaybook(playbook);
                                      setShowWizard(true);
                                      setViewPlaybook(null);
                                    }}
                                  >
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Playbook Options</DialogTitle>
                              <DialogDescription>
                                Manage "{playbook.name}" playbook
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-4">
                              <Button 
                                className="w-full justify-start" 
                                onClick={() => {
                                  handleRunPlaybook(playbook);
                                }}
                                disabled={playbook.status !== 'active'}
                              >
                                <Play className="mr-2 h-4 w-4" /> Run Playbook
                              </Button>
                              <Button 
                                className="w-full justify-start" 
                                variant="outline"
                                onClick={() => {
                                  setEditingPlaybook(playbook);
                                  setShowWizard(true);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" /> Edit Playbook
                              </Button>
                              <Button 
                                className="w-full justify-start" 
                                variant="outline"
                                onClick={() => handleDuplicatePlaybook(playbook)}
                              >
                                <Copy className="mr-2 h-4 w-4" /> Duplicate Playbook
                              </Button>
                              <Button 
                                className="w-full justify-start" 
                                variant="outline"
                                onClick={() => handleTogglePlaybook(
                                  playbook, 
                                  playbook.status === 'active' ? 'inactive' : 'active'
                                )}
                              >
                                <Power className="mr-2 h-4 w-4" />
                                {playbook.status === 'active' ? 'Deactivate' : 'Activate'} Playbook
                              </Button>
                              <Button 
                                className="w-full justify-start text-red-600 hover:text-red-700" 
                                variant="outline"
                                onClick={() => handleDeletePlaybook(playbook)}
                              >
                                <Trash className="mr-2 h-4 w-4" /> Delete Playbook
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <h3 className="font-semibold">{playbook.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {playbook.description}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between pt-0">
                    <div className="text-xs text-muted-foreground">
                      {formatTimeAgo(playbook.lastModified)}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setEditingPlaybook(playbook);
                          setShowWizard(true);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        disabled={playbook.status !== 'active'}
                        onClick={() => handleRunPlaybook(playbook)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Run
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="execution" className="space-y-4">
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Playbook</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Triggered By</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No execution logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {getExecutionStatusBadge(log.status)}
                      </TableCell>
                      <TableCell className="font-medium">{log.playbookName}</TableCell>
                      <TableCell>{new Date(log.startTime).toLocaleString()}</TableCell>
                      <TableCell>
                        {log.endTime 
                          ? calculateDuration(log.startTime, log.endTime)
                          : "In progress"}
                      </TableCell>
                      <TableCell>{log.triggeredBy}</TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewExecutionLog(log)}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <PlaybookTester 
            playbooks={filteredPlaybooks}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['playbooks'] })}
          />
        </TabsContent>
      </Tabs>
      
      {/* Asistente de Creación de Playbook */}
      <PlaybookWizard 
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        editingPlaybook={editingPlaybook}
      />
      
      {/* View Execution Log Dialog */}
      <Dialog open={!!viewLog} onOpenChange={(open) => !open && setViewLog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execution Log
              {viewLog && getExecutionStatusBadge(viewLog.status)}
            </DialogTitle>
            <DialogDescription>
              {viewLog?.playbookName} - Started {viewLog && new Date(viewLog.startTime).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          {viewLog && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-sm font-medium">{viewLog.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-medium">
                        {viewLog.endTime 
                          ? calculateDuration(viewLog.startTime, viewLog.endTime)
                          : "In progress"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Triggered By</p>
                      <p className="text-sm font-medium">{viewLog.triggeredBy}</p>
                    </div>
                  </CardContent>
                </Card>
                
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium mb-2">Execution Timeline</h3>
                  <div className="space-y-2">
                    {viewLog.details.map((detail, index) => (
                      <div key={detail.actionId} className="flex space-x-4 border-l-2 pl-4 pb-6 relative">
                        <div className="absolute w-3 h-3 rounded-full bg-background border-2 border-primary left-[-7px] top-0"></div>
                        <div className="text-xs text-muted-foreground mt-0">
                          {new Date(detail.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="font-medium text-sm">{detail.actionName}</span>
                            <span className="ml-2">{getActionStatusBadge(detail.status)}</span>
                          </div>
                          <p className="text-sm mt-1">{detail.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLog(null)}>
              Close
            </Button>
            {viewLog && viewLog.status === 'in-progress' && (
              <Button variant="outline">
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Action Dialog */}
      <Dialog open={!!viewAction} onOpenChange={(open) => !open && setViewAction(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Action</DialogTitle>
            <DialogDescription>
              Configure the action settings
            </DialogDescription>
          </DialogHeader>
          
          {viewAction && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="action-name">Action Name</Label>
                  <Input 
                    id="action-name"
                    value={viewAction.name}
                    onChange={(e) => setViewAction({...viewAction, name: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="action-type">Action Type</Label>
                  <Select 
                    value={viewAction.type}
                    onValueChange={(value) => setViewAction({...viewAction, type: value})}
                  >
                    <SelectTrigger id="action-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {actionTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center">
                            <type.icon className="mr-2 h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="action-description">Description</Label>
                <Textarea 
                  id="action-description"
                  value={viewAction.description}
                  onChange={(e) => setViewAction({...viewAction, description: e.target.value})}
                />
              </div>
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Configuration options will vary based on the action type selected.
                </AlertDescription>
              </Alert>
              
              {viewAction.type === 'notify' && (
                <div className="space-y-4 border rounded-md p-4">
                  <h4 className="font-medium">Notification Settings</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notify-channel">Channel</Label>
                    <Select
                      value={viewAction.configuration.channel || 'email'}
                      onValueChange={(value) => setViewAction({
                        ...viewAction,
                        configuration: {...viewAction.configuration, channel: value}
                      })}
                    >
                      <SelectTrigger id="notify-channel">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="teams">Microsoft Teams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notify-recipients">Recipients</Label>
                    <Input 
                      id="notify-recipients"
                      placeholder="Email addresses or channel names"
                      value={viewAction.configuration.recipients || ''}
                      onChange={(e) => setViewAction({
                        ...viewAction,
                        configuration: {...viewAction.configuration, recipients: e.target.value}
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notify-template">Template</Label>
                    <Input 
                      id="notify-template"
                      placeholder="Template name or ID"
                      value={viewAction.configuration.template || ''}
                      onChange={(e) => setViewAction({
                        ...viewAction,
                        configuration: {...viewAction.configuration, template: e.target.value}
                      })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAction(null)}>
              Cancel
            </Button>
            <Button onClick={() => handleUpdateAction(viewAction!)}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sample data for development and fallbacks
const samplePlaybooks: Playbook[] = [];

const sampleExecutionLogs: ExecutionLog[] = [];

// Utility functions
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
}

function calculateDuration(startTimeStr: string, endTimeStr: string): string {
  const startTime = new Date(startTimeStr).getTime();
  const endTime = new Date(endTimeStr).getTime();
  const durationMs = endTime - startTime;
  
  // Convert to seconds
  const durationSec = Math.floor(durationMs / 1000);
  
  if (durationSec < 60) {
    return `${durationSec} seconds`;
  }
  
  // Convert to minutes and seconds
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  
  // Convert to hours, minutes, and seconds
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m ${seconds}s`;
}
