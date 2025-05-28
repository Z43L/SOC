import React from "react";
import { Alert } from "@shared/schema";
import { getSeverityBadge, getStatusBadge, formatTimeAgo } from "@/lib/utils/severityUtils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AlertDetailProps {
  alert: Alert;
  onStatusChange: (alertId: number, newStatus: string) => void;
  onAssigneeChange: (alertId: number, assigneeId: number | null) => void;
  availableUsers: { id: number, name: string, role: string }[];
}

export const AlertDetail: React.FC<AlertDetailProps> = ({
  alert,
  onStatusChange,
  onAssigneeChange,
  availableUsers,
}) => {
  const handleStatusChange = (value: string) => {
    onStatusChange(alert.id as number, value);
  };

  const handleAssigneeChange = (value: string) => {
    onAssigneeChange(alert.id as number, value === "none" ? null : parseInt(value));
  };

  // Filter for users with analyst role
  const analysts = availableUsers.filter(user => user.role === "analyst");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{alert.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Severity</Label>
          <div>
            <span className={getSeverityBadge(alert.severity)}>
              <span className={`w-2 h-2 rounded-full bg-${alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'red-500' : alert.severity === 'medium' ? 'orange-500' : 'green-500'} mr-1.5`}></span>
              {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select 
            value={alert.status}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Assigned To</Label>
        <Select 
          value={alert.assignedTo?.toString() || "none"}
          onValueChange={handleAssigneeChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {analysts.map(user => (
              <SelectItem key={user.id} value={user.id.toString()}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Source</Label>
          <p className="text-sm">{alert.source}</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Time</Label>
          <p className="text-sm">{formatTimeAgo(alert.timestamp)}</p>
        </div>
      </div>

      {(alert.sourceIp || alert.destinationIp) && (
        <div className="grid grid-cols-2 gap-4">
          {alert.sourceIp && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Source IP</Label>
              <p className="text-sm">{alert.sourceIp}</p>
            </div>
          )}
          
          {alert.destinationIp && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Destination IP</Label>
              <p className="text-sm">{alert.destinationIp}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 pt-4 border-t border-gray-800">
        <Button variant="outline" className="w-full">
          <i className="fas fa-search mr-2"></i> Investigate
        </Button>
        
        {(alert.severity === "critical" || alert.severity === "high") && (
          <Button variant="destructive" className="w-full">
            <i className="fas fa-shield-alt mr-2"></i> Isolate Host
          </Button>
        )}
        
        <Button variant="outline" className="w-full">
          <i className="fas fa-cog mr-2"></i> Run Playbook
        </Button>
      </div>
    </div>
  );
};