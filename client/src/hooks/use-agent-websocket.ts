import { useEffect, useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { io, Socket } from 'socket.io-client';

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

export const useAgentWebSocket = () => {
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'>('disconnected');
  const [isManuallyDisabled, setIsManuallyDisabled] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [connectedAgents, setConnectedAgents] = useState<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (isManuallyDisabled || socket?.connected) return;

    setConnectionStatus('connecting');
    console.log('Connecting to Socket.IO for agent monitoring...');

    const newSocket = io({
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Socket.IO connected for agent monitoring');
      toast({
        title: "WebSocket Connected",
        description: "Real-time agent monitoring is now active",
        variant: "default"
      });
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      console.log('Socket.IO disconnected');
    });

    newSocket.on('connect_error', (error) => {
      setConnectionStatus('failed');
      console.error('Socket.IO connection error:', error);
    });

    // Listen for agent events
    newSocket.on('agent_connected', (data) => {
      if (data.agentId) {
        setConnectedAgents(prev => new Set(prev).add(data.agentId));
        setAgentStatuses(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(data.agentId) || {
            agentId: data.agentId,
            status: 'active' as const,
            lastHeartbeat: new Date().toISOString()
          };
          newMap.set(data.agentId, {
            ...existing,
            status: 'active',
            lastHeartbeat: data.timestamp || new Date().toISOString()
          });
          return newMap;
        });
        
        toast({
          title: "Agent Connected",
          description: `Agent ${data.agentId} is now active`,
          variant: "default"
        });
      }
    });

    newSocket.on('agent_disconnected', (data) => {
      if (data.agentId) {
        setConnectedAgents(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.agentId);
          return newSet;
        });
        setAgentStatuses(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(data.agentId);
          if (existing) {
            newMap.set(data.agentId, {
              ...existing,
              status: 'inactive'
            });
          }
          return newMap;
        });

        toast({
          title: "Agent Disconnected", 
          description: `Agent ${data.agentId} went offline`,
          variant: "destructive"
        });
      }
    });

    newSocket.on('agent_heartbeat', (data) => {
      if (data.agentId && data.data) {
        setAgentStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(data.agentId, {
            agentId: data.agentId,
            status: data.data.status || 'active',
            lastHeartbeat: data.data.timestamp || new Date().toISOString(),
            metrics: data.data.metrics
          });
          return newMap;
        });
      }
    });

    newSocket.on('agent_logs', (data) => {
      if (data.agentId && data.data && Array.isArray(data.data.events)) {
        const newLogs: AgentLog[] = data.data.events.map((event: any) => ({
          agentId: data.agentId,
          timestamp: event.timestamp || new Date().toISOString(),
          message: event.message || 'No message',
          level: event.severity === 'high' || event.severity === 'critical' ? 'error' :
                 event.severity === 'medium' ? 'warning' : 'info',
          eventType: event.eventType
        }));

        setAgentLogs(prev => [...newLogs, ...prev].slice(0, 100)); // Keep only latest 100 logs
      }
    });

    setSocket(newSocket);
  }, [isManuallyDisabled, socket, toast]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setConnectionStatus('disconnected');
  }, [socket]);

  const toggleConnection = useCallback(() => {
    if (isManuallyDisabled || connectionStatus === 'disconnected' || connectionStatus === 'failed') {
      setIsManuallyDisabled(false);
      connect();
    } else {
      setIsManuallyDisabled(true);
      disconnect();
    }
  }, [isManuallyDisabled, connectionStatus, connect, disconnect]);

  const clearLogs = useCallback(() => {
    setAgentLogs([]);
  }, []);

  const getAgentStatus = useCallback((agentId: string): AgentStatus | undefined => {
    return agentStatuses.get(agentId);
  }, [agentStatuses]);

  const isAgentConnected = useCallback((agentId: string): boolean => {
    return connectedAgents.has(agentId);
  }, [connectedAgents]);

  useEffect(() => {
    // Auto-connect on component mount
    connect();

    return () => {
      disconnect();
    };
  }, []);

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