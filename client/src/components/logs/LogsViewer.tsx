import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface LogsViewerProps {
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    message: string;
    data?: any;
  }>;
  maxHeight?: string;
  title?: string;
  description?: string;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({
  logs,
  maxHeight = "400px",
  title = "Recent Events",
  description = "Events collected from this connector"
}) => {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const toggleLogExpand = (id: string) => {
    if (expandedLog === id) {
      setExpandedLog(null);
    } else {
      setExpandedLog(id);
    }
  };

  const getLogLevelBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return <Badge variant="outline" className="bg-red-900/20 text-red-500 border-red-600">Error</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-yellow-900/20 text-yellow-500 border-yellow-600">Warning</Badge>;
      case 'info':
        return <Badge variant="outline" className="bg-blue-900/20 text-blue-500 border-blue-600">Info</Badge>;
      case 'debug':
        return <Badge variant="outline" className="bg-gray-900/20 text-gray-400 border-gray-600">Debug</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className={`w-full overflow-auto pr-3`} style={{ maxHeight }}>
          <div className="space-y-3">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No events found for this connector.
              </div>
            ) : (
              logs.map((log) => (
                <div 
                  key={log.id}
                  className="border border-gray-800 rounded-md p-3 hover:bg-gray-900/30 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-grow space-y-1">
                      <div className="flex items-center gap-2">
                        {getLogLevelBadge(log.level)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{log.message}</p>
                    </div>
                    {log.data && (
                      <button
                        onClick={() => toggleLogExpand(log.id)}
                        className="text-xs text-blue-500 hover:text-blue-400"
                      >
                        {expandedLog === log.id ? 'Hide Details' : 'Show Details'}
                      </button>
                    )}
                  </div>
                  
                  {expandedLog === log.id && log.data && (
                    <div className="mt-2 pt-2 border-t border-gray-800">
                      <pre className="text-xs bg-gray-950 p-2 rounded overflow-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default LogsViewer;