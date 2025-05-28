import React, { useState } from "react";
import { Alert } from "@shared/schema";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface GroupAlertsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAlerts: Alert[];
  onGroupAlerts: (keyField: string) => void;
}

export const GroupAlertsDialog: React.FC<GroupAlertsDialogProps> = ({
  isOpen,
  onClose,
  selectedAlerts,
  onGroupAlerts,
}) => {
  const [groupByField, setGroupByField] = useState<string>("sourceIp");

  const handleSubmit = () => {
    onGroupAlerts(groupByField);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Group Similar Alerts</DialogTitle>
          <DialogDescription>
            Group {selectedAlerts.length} selected alerts based on a common field.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <Label htmlFor="grouping-field">Group by field</Label>
            <RadioGroup
              value={groupByField}
              onValueChange={setGroupByField}
              id="grouping-field"
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sourceIp" id="sourceIp" />
                <Label htmlFor="sourceIp">Source IP</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="destinationIp" id="destinationIp" />
                <Label htmlFor="destinationIp">Destination IP</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fileHash" id="fileHash" />
                <Label htmlFor="fileHash">File Hash</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="source" id="source" />
                <Label htmlFor="source">Source</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Group Alerts</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};