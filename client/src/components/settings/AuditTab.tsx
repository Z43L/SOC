import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getQueryFn } from "@/lib/queryClient";
import { 
  Loader2, 
  History, 
  Search, 
  Download, 
  Filter,
  Calendar,
  User,
  Settings,
  Shield,
  Eye
} from "lucide-react";

interface AuditTabProps {
  user: {
    id: number;
    name: string;
    username: string;
    email: string;
    organizationId: number;
  };
  organization: {
    id: number;
    name: string;
  };
}

interface AuditLogEntry {
  id: string;
  userId: number;
  userName: string;
  action: string;
  category: 'settings' | 'security' | 'user' | 'organization' | 'integration';
  targetResource: string;
  changes: Record<string, { before: any; after: any }>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface AuditFilters {
  userId?: number;
  category?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export const AuditTab: FC<AuditTabProps> = ({ user, organization }) => {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Fetch audit logs
  const { data: auditLogs, isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: [`/api/settings/audit`, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return getQueryFn<AuditLogEntry[]>({ on401: "throw" })({ queryKey: [`/api/settings/audit${queryString}`] });
    },
    initialData: []
  });

  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'settings':
        return <Settings className="h-4 w-4" />;
      case 'security':
        return <Shield className="h-4 w-4" />;
      case 'user':
        return <User className="h-4 w-4" />;
      case 'organization':
        return <Settings className="h-4 w-4" />;
      case 'integration':
        return <Settings className="h-4 w-4" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };
  };

  const formatChanges = (changes: Record<string, { before: any; after: any }>) => {
    return Object.entries(changes).map(([field, change]) => ({
      field,
      before: JSON.stringify(change.before),
      after: JSON.stringify(change.after),
    }));
  };

  const exportAuditLogs = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
      
      const response = await fetch(`/api/settings/audit/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export audit logs:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Audit Log Filters
          </CardTitle>
          <CardDescription>
            Filter audit logs by various criteria to find specific events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search actions, resources..."
                  value={filters.search || ""}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={filters.category || ""}
                onValueChange={(value) => handleFilterChange("category", value || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="user">User Management</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="integration">Integrations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Select
                value={filters.action || ""}
                onValueChange={(value) => handleFilterChange("action", value || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="enable">Enable</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date-from">Date From</Label>
              <Input
                id="date-from"
                type="date"
                value={filters.dateFrom || ""}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date-to">Date To</Label>
              <Input
                id="date-to"
                type="date"
                value={filters.dateTo || ""}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              />
            </div>
            
            <div className="flex items-end space-x-2">
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
              <Button variant="outline" onClick={exportAuditLogs}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit Log Entries
          </CardTitle>
          <CardDescription>
            Detailed history of all changes and actions in your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No audit log entries found.</p>
              <p className="text-sm text-muted-foreground">
                {Object.keys(filters).length > 0
                  ? "Try adjusting your filters to see more results."
                  : "Audit logs will appear here as actions are performed."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.map((entry) => {
                const { date, time } = formatTimestamp(entry.timestamp);
                return (
                  <div
                    key={entry.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          {getCategoryIcon(entry.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{entry.action}</span>
                            <span className="text-muted-foreground">on</span>
                            <code className="bg-muted px-1 rounded text-sm">{entry.targetResource}</code>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {entry.userName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {date} at {time}
                            </span>
                            <span>{entry.ipAddress}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getSeverityBadge(entry.severity)}
                        <Badge variant="outline" className="capitalize">
                          {entry.category}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Entry Detail Modal */}
      {selectedEntry && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Audit Entry Details</CardTitle>
              <CardDescription>
                Full details for the selected audit log entry.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setSelectedEntry(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Action</Label>
                  <p className="text-sm">{selectedEntry.action}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Category</Label>
                  <p className="text-sm capitalize">{selectedEntry.category}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Target Resource</Label>
                  <p className="text-sm font-mono">{selectedEntry.targetResource}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Severity</Label>
                  <div className="mt-1">{getSeverityBadge(selectedEntry.severity)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">User</Label>
                  <p className="text-sm">{selectedEntry.userName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Timestamp</Label>
                  <p className="text-sm">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">IP Address</Label>
                  <p className="text-sm font-mono">{selectedEntry.ipAddress}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">User Agent</Label>
                  <p className="text-sm truncate" title={selectedEntry.userAgent}>
                    {selectedEntry.userAgent}
                  </p>
                </div>
              </div>

              {Object.keys(selectedEntry.changes).length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Changes Made</Label>
                  <div className="space-y-2">
                    {formatChanges(selectedEntry.changes).map(({ field, before, after }) => (
                      <div key={field} className="border rounded p-3 bg-muted/50">
                        <div className="font-medium text-sm mb-2">{field}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-red-600 font-medium">Before:</span>
                            <pre className="bg-red-50 border border-red-200 p-2 rounded mt-1 text-xs overflow-x-auto">
                              {before}
                            </pre>
                          </div>
                          <div>
                            <span className="text-green-600 font-medium">After:</span>
                            <pre className="bg-green-50 border border-green-200 p-2 rounded mt-1 text-xs overflow-x-auto">
                              {after}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{auditLogs.length}</div>
              <p className="text-xs text-muted-foreground">Total Entries</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {auditLogs.filter(log => log.category === 'security').length}
              </div>
              <p className="text-xs text-muted-foreground">Security Events</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {auditLogs.filter(log => log.severity === 'critical' || log.severity === 'high').length}
              </div>
              <p className="text-xs text-muted-foreground">High Priority</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {new Set(auditLogs.map(log => log.userId)).size}
              </div>
              <p className="text-xs text-muted-foreground">Active Users</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
