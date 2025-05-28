import { FC, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Incident } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DataTable, Column } from "@/components/ui/data-table/data-table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, Users, Clock, ChevronDown, AlertTriangle, Shield } from "lucide-react";

interface IncidentsProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

// Helper to get color based on status
const getStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'new':
      return <Badge variant="outline" className="bg-gray-800 text-gray-200 border-gray-700">New</Badge>;
    case 'in_progress':
      return <Badge variant="outline" className="bg-blue-900 text-blue-200 border-blue-700">Investigation</Badge>;
    case 'mitigated':
      return <Badge variant="outline" className="bg-amber-900 text-amber-200 border-amber-700">Mitigated</Badge>;
    case 'closed':
      return <Badge variant="outline" className="bg-green-900 text-green-200 border-green-700">Closed</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-800 text-gray-200 border-gray-700">{status}</Badge>;
  }
};

// Helper to get color based on priority
const getPriorityBadge = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'critical':
      return <Badge className="bg-red-900 text-red-200">Critical</Badge>;
    case 'high':
      return <Badge className="bg-orange-900 text-orange-200">High</Badge>;
    case 'medium':
      return <Badge className="bg-amber-900 text-amber-200">Medium</Badge>;
    case 'low':
      return <Badge className="bg-green-900 text-green-200">Low</Badge>;
    default:
      return <Badge className="bg-gray-700">{priority}</Badge>;
  }
};

const formatTimeAgo = (timestamp: string) => {
  const now = new Date();
  const date = new Date(timestamp);
  
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  
  return format(date, 'MMM d, yyyy');
};

// Calculate the SLA status
const getSlaStatus = (incident: any) => {
  if (incident.status === 'closed') {
    return <Badge className="bg-green-900 text-green-200">Completed</Badge>;
  }
  
  if (!incident.firstResponseAt && incident.status === 'new') {
    return <Badge className="bg-red-900 text-red-200">Response Required</Badge>;
  }
  
  if (incident.firstResponseAt && !incident.resolvedAt && incident.status !== 'closed') {
    return <Badge className="bg-amber-900 text-amber-200">In Progress</Badge>;
  }
  
  return <Badge className="bg-gray-700">Unknown</Badge>;
};

const calculateSlaTime = (incident: any) => {
  if (!incident.createdAt) return 'N/A';
  
  const createdAt = new Date(incident.createdAt);
  const responseAt = incident.firstResponseAt ? new Date(incident.firstResponseAt) : null;
  const resolvedAt = incident.resolvedAt ? new Date(incident.resolvedAt) : null;
  
  if (responseAt && !resolvedAt) {
    // Calculate time from creation to first response
    const diffMs = responseAt.getTime() - createdAt.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    return `Response: ${diffHrs}h`;
  }
  
  if (responseAt && resolvedAt) {
    // Calculate total resolution time
    const diffMs = resolvedAt.getTime() - createdAt.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    return `Resolved: ${diffHrs}h`;
  }
  
  // If still new, calculate time elapsed so far
  const diffMs = Date.now() - createdAt.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  return `Open: ${diffHrs}h`;
};

const Incidents: FC<IncidentsProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { organizationId } = useTenant();
  
  // State for filters
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // Column definition for the incidents data table
  const columns: Column<any>[] = [
    {
      id: 'title',
      header: 'Title',
      accessorKey: 'title',
      cell: ({ row }) => (
        <div>
          <Link href={`/incident/${row.original.id}`} className="font-medium hover:underline">
            {row.original.title}
          </Link>
          <div className="text-xs text-muted-foreground mt-1">
            {row.original.description?.substring(0, 60)}
            {row.original.description?.length > 60 ? '...' : ''}
          </div>
        </div>
      )
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row }) => getStatusBadge(row.original.status)
    },
    {
      id: 'priority',
      header: 'Priority',
      accessorKey: 'priority',
      cell: ({ row }) => getPriorityBadge(row.original.priority)
    },
    {
      id: 'createdAt',
      header: 'Created',
      accessorKey: 'createdAt',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{formatTimeAgo(row.original.createdAt)}</div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(row.original.createdAt), 'MMM d, yyyy HH:mm')}
          </div>
        </div>
      )
    },
    {
      id: 'assignedTo',
      header: 'Owner',
      accessorKey: 'assignedTo',
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.assignedTo ? (
            <>
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-xs mr-2">
                {row.original.assignedToUser?.name?.split(' ').map((n: string) => n[0]).join('') || 'NA'}
              </div>
              <div className="text-sm">{row.original.assignedToUser?.name || 'Unassigned'}</div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          )}
        </div>
      )
    },
    {
      id: 'sla',
      header: 'SLA',
      accessorKey: 'sla',
      cell: ({ row }) => (
        <div>
          {getSlaStatus(row.original)}
          <div className="text-xs text-muted-foreground mt-1">
            {calculateSlaTime(row.original)}
          </div>
        </div>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/incident/${row.original.id}`}>
            View
          </Link>
        </Button>
      )
    }
  ];
  
  // Query to fetch incidents
  const { data: incidents = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['incidents', priorityFilter, statusFilter, dateRange, organizationId],
    queryFn: async () => {
      // Build query parameters
      let params = new URLSearchParams();
      
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (dateRange?.from) params.append('from', dateRange.from.toISOString());
      if (dateRange?.to) params.append('to', dateRange.to.toISOString());
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await apiRequest('GET', `/api/incidents?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch incidents');
      }
      
      const data = await response.json();
      return data;
    },
    enabled: !!organizationId,
  });
  
  // Filter incidents based on active tab
  const filteredIncidents = incidents.filter((incident: any) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'new' && incident.status === 'new') return true;
    if (activeTab === 'investigation' && incident.status === 'in_progress') return true;
    if (activeTab === 'mitigated' && incident.status === 'mitigated') return true;
    if (activeTab === 'closed' && incident.status === 'closed') return true;
    return false;
  });
  
  // Handler for changing active tab
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== 'all') {
      setStatusFilter(
        value === 'investigation' ? 'in_progress' : value
      );
    } else {
      setStatusFilter('all');
    }
  };
  
  // Handler for clearing all filters
  const handleClearFilters = () => {
    setPriorityFilter('all');
    setStatusFilter('all');
    setDateRange(undefined);
    setSearchQuery('');
    setActiveTab('all');
  };
  
  // Handler for search query changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  
  // Handler for creating a new incident
  const handleCreateIncident = () => {
    setLocation('/incident/new');
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="incidents" />
      
      <MainContent pageTitle="Incident Management" organization={organization}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
            <p className="text-muted-foreground">
              Manage and respond to security incidents
            </p>
          </div>
          
          <Button onClick={handleCreateIncident}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Create Incident
          </Button>
        </div>
        
        <div className="mb-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="investigation">Investigation</TabsTrigger>
              <TabsTrigger value="mitigated">Mitigated</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <div className="mb-6 flex flex-wrap gap-2 sm:flex-row">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search incidents..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <DateRangePicker 
              date={dateRange} 
              onDateChange={setDateRange} 
              align="end"
              className="w-[260px]" 
            />
            
            <Button variant="outline" size="icon" onClick={handleClearFilters}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="rounded-md border">
          <DataTable
            columns={columns}
            data={filteredIncidents}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            noDataMessage="No incidents found"
            errorMessage="Failed to load incidents"
          />
        </div>
      </MainContent>
    </div>
  );
};

export default Incidents;