import { useEffect, useState, useCallback } from 'react';
import useWebSocket from './use-websocket';
import { useToast } from './use-toast';

interface AgentStatus {
  agentId: string;
  status: 'active' | 'inactive' | 'warning' | 'error';
  lastHeartbeat: string;
  metrics?: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

interface AgentLog {
  agentId: string;
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  eventType?: string;
}

interface AgentWebSocketData {
  type: 'agent_status' | 'agent_heartbeat' | 'agent_logs' | 'agent_connected' | 'agent_disconnected';
  agentId?: string;
  data?: any;
  timestamp?: string;
}

export const useAgentWebSocket = () => {
  const { toast } = useToast();
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [connectedAgents, setConnectedAgents] = useState<Set<string>>(new Set());

  const handleMessage = useCallback((message: AgentWebSocketData) => {
    switch (message.type) {
      case 'agent_connected':
        if (message.agentId) {
          setConnectedAgents(prev => new Set(prev).add(message.agentId!));
          setAgentStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.agentId!) || {
              agentId: message.agentId!,
              status: 'active' as const,
              lastHeartbeat: new Date().toISOString()
            };
            newMap.set(message.agentId!, {
              ...existing,
              status: 'active',
              lastHeartbeat: new Date().toISOString()
            });
            return newMap;
          });
          
          toast({
            title: "Agent Connected",
            description: `Agent ${message.agentId} is now active`,
            variant: "default"
          });
        }
        break;

      case 'agent_disconnected':
        if (message.agentId) {
          setConnectedAgents(prev => {
            const newSet = new Set(prev);
            newSet.delete(message.agentId!);
            return newSet;
          });
          setAgentStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.agentId!);
            if (existing) {
              newMap.set(message.agentId!, {
                ...existing,
                status: 'inactive'
              });
            }
            return newMap;
          });

          toast({
            title: "Agent Disconnected", 
            description: `Agent ${message.agentId} went offline`,
            variant: "destructive"
          });
        }
        break;

      case 'agent_heartbeat':
        if (message.agentId && message.data) {
          setAgentStatuses(prev => {
            const newMap = new Map(prev);
            newMap.set(message.agentId!, {
              agentId: message.agentId!,
              status: message.data.status || 'active',
              lastHeartbeat: message.data.timestamp || new Date().toISOString(),
              metrics: message.data.metrics
            });
            return newMap;
          });
        }
        break;

      case 'agent_logs':
        if (message.agentId && message.data && Array.isArray(message.data.events)) {
          const newLogs: AgentLog[] = message.data.events.map((event: any) => ({
            agentId: message.agentId!,
            timestamp: event.timestamp || new Date().toISOString(),
            message: event.message || 'No message',
            level: event.severity === 'high' || event.severity === 'critical' ? 'error' :
                   event.severity === 'medium' ? 'warning' : 'info',
            eventType: event.eventType
          }));

          setAgentLogs(prev => [...newLogs, ...prev].slice(0, 100)); // Keep only latest 100 logs
        }
        break;

      case 'agent_status':
        if (message.agentId && message.data) {
          setAgentStatuses(prev => {
            const newMap = new Map(prev);
            newMap.set(message.agentId!, {
              agentId: message.agentId!,
              status: message.data.status || 'active',
              lastHeartbeat: message.data.lastHeartbeat || new Date().toISOString(),
              metrics: message.data.metrics
            });
            return newMap;
          });
        }
        break;
    }
  }, [toast]);

  const {
    connectionStatus,
    toggleConnection,
    isManuallyDisabled,
    send
  } = useWebSocket(
    `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:5000'}/api/ws/dashboard`,
    {
      manualMode: true,
      onMessage: handleMessage,
      onError: (error) => {
        console.warn("Agent WebSocket connection error:", error);
      },
      onOpen: () => {
        // Request initial agent status when connected
        send({ type: 'request_agent_status' });
      }
    }
  );

  const clearLogs = useCallback(() => {
    setAgentLogs([]);
  }, []);

  const getAgentStatus = useCallback((agentId: string): AgentStatus | undefined => {
    return agentStatuses.get(agentId);
  }, [agentStatuses]);

  const isAgentConnected = useCallback((agentId: string): boolean => {
    return connectedAgents.has(agentId);
  }, [connectedAgents]);

  return {
    connectionStatus,
    toggleConnection,
    isManuallyDisabled,
    agentStatuses: Array.from(agentStatuses.values()),
    agentLogs,
    connectedAgents: Array.from(connectedAgents),
    clearLogs,
    getAgentStatus,
    isAgentConnected
  };
};