import { FC } from 'react';
import { Alert } from '@shared/schema';
import { Link } from 'wouter';
import { Loader2, BellOff, Search, ShieldAlert, MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RecentAlertsProps {
  alerts: Alert[];
  isLoading: boolean;
}

const RecentAlerts: FC<RecentAlertsProps> = ({ alerts, isLoading }) => {
  // Asegurarse de que alerts sea un array
  const displayAlerts = Array.isArray(alerts) ? alerts : [];
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <Badge className="bg-destructive text-destructive-foreground">
            Critical
          </Badge>
        );
      case 'high':
        return (
          <Badge className="bg-red-700 text-red-100">
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-orange-700 text-orange-100">
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge className="bg-green-700 text-green-100">
            Low
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-700 text-blue-100">
            Info
          </Badge>
        );
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return (
          <Badge variant="outline" className="border-primary text-primary">
            New
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            In Progress
          </Badge>
        );
      case 'resolved':
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">
            Resolved
          </Badge>
        );
      case 'acknowledged':
        return (
          <Badge variant="outline" className="border-purple-400 text-purple-400">
            Acknowledged
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-gray-400 text-gray-400">
            Unknown
          </Badge>
        );
    }
  };
  
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} hours ago`;
    
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays} days ago`;
  };
  
  return (
    <Card>
      <CardHeader className="p-4 pb-0 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium">Recent Alerts</CardTitle>
        <Link href="/alerts">
          <Button variant="link" className="text-xs p-0 h-auto">View All Alerts</Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>Loading alerts...</span>
          </div>
        ) : displayAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <BellOff className="h-12 w-12 mb-2 opacity-20" />
            <span>No alerts found</span>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="text-left bg-muted/50">
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Severity</th>
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Alert</th>
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Source</th>
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Time</th>
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayAlerts.map(alert => (
                <tr key={alert.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    {getSeverityBadge(alert.severity)}
                  </td>
                  <td className="p-3">
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{alert.source}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {formatTimeAgo(new Date(alert.timestamp || new Date()))}
                  </td>
                  <td className="p-3">
                    {getStatusBadge(alert.status)}
                  </td>
                  <td className="p-3">
                    <div className="flex space-x-2">
                      <Link href={`/incident/${alert.id}`}>
                        <Button
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-primary"
                          title="Investigate"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </Link>
                      {alert.severity === 'critical' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title="Isolate Host"
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        title="More Actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentAlerts;
