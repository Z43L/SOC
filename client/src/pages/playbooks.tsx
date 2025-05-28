import { FC, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlaybookWizard from "@/components/soar/PlaybookWizard";
import { Switch } from "@/components/ui/switch";
import { Search, PlusCircle, Calendar, ArrowRight, MoreHorizontal, Play, Edit, Trash2, AlertTriangle, History, CheckCircle2, Code } from "lucide-react";

interface PlaybooksProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

interface Playbook {
  id: number;
  name: string;
  description: string;
  category: string;
  triggerType: string;
  isActive: boolean;
  lastRun?: string;
  lastResult?: 'success' | 'failure' | null;
}

const getTriggerBadge = (triggerType: string) => {
  switch (triggerType) {
    case 'alert':
      return <Badge variant="outline" className="bg-blue-900/20 text-blue-500 border-blue-800">Alert</Badge>;
    case 'incident':
      return <Badge variant="outline" className="bg-amber-900/20 text-amber-500 border-amber-800">Incident</Badge>;
    case 'cron':
      return <Badge variant="outline" className="bg-purple-900/20 text-purple-500 border-purple-800">Scheduled</Badge>;
    case 'manual':
      return <Badge variant="outline" className="bg-gray-900/20 text-gray-500 border-gray-800">Manual</Badge>;
    case 'threat-intel':
      return <Badge variant="outline" className="bg-green-900/20 text-green-500 border-green-800">Threat Intel</Badge>;
    default:
      return <Badge variant="outline">{triggerType}</Badge>;
  }
};

const getCategoryBadge = (category: string) => {
  switch (category) {
    case 'detection':
      return <Badge className="bg-blue-900 text-blue-200">Detection</Badge>;
    case 'response':
      return <Badge className="bg-red-900 text-red-200">Response</Badge>;
    case 'enrichment':
      return <Badge className="bg-amber-900 text-amber-200">Enrichment</Badge>;
    case 'remediation':
      return <Badge className="bg-green-900 text-green-200">Remediation</Badge>;
    case 'notification':
      return <Badge className="bg-purple-900 text-purple-200">Notification</Badge>;
    default:
      return <Badge className="bg-gray-700">{category}</Badge>;
  }
};

const getLastResultBadge = (result: string | null | undefined) => {
  if (!result) return null;
  
  switch (result) {
    case 'success':
      return <Badge className="bg-green-900 text-green-200">Success</Badge>;
    case 'failure':
      return <Badge className="bg-red-900 text-red-200">Failed</Badge>;
    default:
      return <Badge className="bg-gray-700">{result}</Badge>;
  }
};

const Playbooks: FC<PlaybooksProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  
  // Fetch playbooks
  const { data: playbooks = [], isLoading, refetch } = useQuery<Playbook[]>({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/playbooks');
      if (!response.ok) {
        throw new Error('Failed to fetch playbooks');
      }
      return response.json();
    },
  });
  
  // Toggle playbook active state
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest('PATCH', `/api/playbooks/${id}`, {
        isActive,
      });
      
      if (!response.ok) {
        throw new Error('Failed to update playbook status');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      toast({
        title: "Playbook updated",
        description: "Playbook status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update playbook",
        description: error.toString(),
        variant: "destructive",
      });
    },
  });
  
  // Delete playbook
  const deletePlaybookMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/playbooks/${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to delete playbook');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      setConfirmDeleteOpen(false);
      toast({
        title: "Playbook deleted",
        description: "Playbook has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete playbook",
        description: error.toString(),
        variant: "destructive",
      });
    },
  });
  
  // Execute playbook manually
  const executePlaybookMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/playbooks/${id}/execute`);
      
      if (!response.ok) {
        throw new Error('Failed to execute playbook');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      toast({
        title: "Playbook executed",
        description: "Playbook execution has been triggered.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to execute playbook",
        description: error.toString(),
        variant: "destructive",
      });
    },
  });
  
  // Filter playbooks based on search query and active tab
  const filteredPlaybooks = playbooks.filter(playbook => {
    // Filter by search query
    const matchesSearch = !searchQuery || 
      playbook.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      playbook.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by active tab
    const matchesTab = activeTab === 'all' || 
      (activeTab === 'active' && playbook.isActive) ||
      (activeTab === 'inactive' && !playbook.isActive);
    
    return matchesSearch && matchesTab;
  });
  
  // Handler for toggling playbook active state
  const handleToggleActive = (id: number, currentState: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentState });
  };
  
  // Handler for editing a playbook
  const handleEditPlaybook = (playbook: Playbook) => {
    setEditingPlaybook(playbook);
    setWizardOpen(true);
  };
  
  // Handler for confirming playbook deletion
  const handleConfirmDelete = () => {
    if (selectedPlaybook) {
      deletePlaybookMutation.mutate(selectedPlaybook.id);
    }
  };
  
  // Handler for manually executing a playbook
  const handleExecutePlaybook = (id: number) => {
    executePlaybookMutation.mutate(id);
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="soar" />
      
      <MainContent pageTitle="Security Orchestration, Automation & Response" organization={organization}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Playbooks</h1>
            <p className="text-muted-foreground">
              Create and manage automated security response workflows
            </p>
          </div>
          
          <Button onClick={() => {
            setEditingPlaybook(null);
            setWizardOpen(true);
          }}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Playbook
          </Button>
        </div>
        
        <div className="mb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All Playbooks</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <div className="mb-6 flex items-center space-x-2">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search playbooks..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex justify-center items-center space-x-2">
                        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Loading playbooks...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPlaybooks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-sm">No playbooks found</p>
                          <p className="text-xs text-muted-foreground">
                            {searchQuery 
                              ? "Try adjusting your search query"
                              : "Create your first playbook to get started"
                            }
                          </p>
                        </div>
                        {!searchQuery && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPlaybook(null);
                              setWizardOpen(true);
                            }}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create Playbook
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlaybooks.map((playbook) => (
                    <TableRow key={playbook.id}>
                      <TableCell>
                        <div className="font-medium">{playbook.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {playbook.description}
                        </div>
                      </TableCell>
                      <TableCell>{getTriggerBadge(playbook.triggerType)}</TableCell>
                      <TableCell>{getCategoryBadge(playbook.category)}</TableCell>
                      <TableCell>
                        {playbook.lastRun ? (
                          <div className="text-xs">
                            <div>{format(new Date(playbook.lastRun), "MMM d, yyyy")}</div>
                            <div className="text-muted-foreground">{format(new Date(playbook.lastRun), "HH:mm:ss")}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getLastResultBadge(playbook.lastResult)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={playbook.isActive}
                            onCheckedChange={() => handleToggleActive(playbook.id, playbook.isActive)}
                          />
                          <span className="text-xs font-medium">
                            {playbook.isActive ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleEditPlaybook(playbook)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExecutePlaybook(playbook.id)}>
                              <Play className="mr-2 h-4 w-4" />
                              Run Now
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <History className="mr-2 h-4 w-4" />
                              View History
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Code className="mr-2 h-4 w-4" />
                              View YAML
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedPlaybook(playbook);
                                setConfirmDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </MainContent>
      
      {/* Playbook Creation/Edit Wizard */}
      <PlaybookWizard 
        isOpen={wizardOpen} 
        onClose={() => setWizardOpen(false)} 
        editingPlaybook={editingPlaybook}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the playbook 
              {selectedPlaybook && <strong> "{selectedPlaybook.name}"</strong>} and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Playbooks;