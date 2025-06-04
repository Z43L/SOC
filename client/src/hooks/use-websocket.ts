import { useEffect, useCallback, useRef, useState } from 'react';

type WebSocketEvent = {
  type: string;
  data: any;
};

type WebSocketOptions = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (event: WebSocketEvent) => void;
  reconnectOnClose?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  manualMode?: boolean; // New option for manual control
};

export const useWebSocket = (
  url: string, 
  options: WebSocketOptions = {}
) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'>('disconnected');
  const [manuallyDisabled, setManuallyDisabled] = useState(false);

  const {
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnectOnClose = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
    manualMode = false
  } = options;

  const connect = useCallback(() => {
    if (!url || wsRef.current?.readyState === WebSocket.OPEN || (manualMode && manuallyDisabled)) return;
    setConnectionStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    try {
      console.log('Attempting WebSocket connection to:', url);
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionStatus('connected');
        console.log('WebSocket connection established');
        if (onOpen) onOpen();
      };

      wsRef.current.onclose = (event) => {
        setConnectionStatus('disconnected');
        console.log('WebSocket connection closed:', event.code, event.reason);
        if (onClose) onClose(event);

        if (reconnectOnClose && reconnectAttemptsRef.current < maxReconnectAttempts && !manualMode && !manuallyDisabled) {
          reconnectAttemptsRef.current += 1;
          setConnectionStatus('reconnecting');
          if (reconnectIntervalRef.current) {
            clearTimeout(reconnectIntervalRef.current);
          }
          reconnectIntervalRef.current = setTimeout(() => {
            console.log(`Attempting WebSocket reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionStatus('failed');
          console.error('WebSocket connection failed after maximum attempts');
        }
      };

      wsRef.current.onerror = (error) => {
        setConnectionStatus('disconnected');
        console.error('WebSocket error:', error);
        if (onError) onError(error);
      };

      wsRef.current.onmessage = (message) => {
        try {
          const parsedData = JSON.parse(message.data);
          if (onMessage) onMessage(parsedData);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    } catch (error) {
      setConnectionStatus('disconnected');
      console.error("WebSocket connection error:", error);
      if (reconnectOnClose && reconnectAttemptsRef.current < maxReconnectAttempts && !manualMode && !manuallyDisabled) {
        reconnectAttemptsRef.current += 1;
        setConnectionStatus('reconnecting');
        setTimeout(() => {
          connect();
        }, reconnectInterval);
      } else {
        setConnectionStatus('failed');
      }
    }
  }, [url, onOpen, onClose, onError, onMessage, reconnectOnClose, reconnectInterval, maxReconnectAttempts, manualMode, manuallyDisabled]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectIntervalRef.current) {
      clearTimeout(reconnectIntervalRef.current);
      reconnectIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus('disconnected');
  }, []);

  const toggleConnection = useCallback(() => {
    if (manuallyDisabled || connectionStatus === 'disconnected' || connectionStatus === 'failed') {
      setManuallyDisabled(false);
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      setManuallyDisabled(true);
      disconnect();
    }
  }, [manuallyDisabled, connectionStatus, connect, disconnect]);

  useEffect(() => {
    if (!manualMode) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, manualMode]);

  return { 
    send, 
    disconnect, 
    reconnect: connect, 
    connectionStatus, 
    toggleConnection, 
    isManuallyDisabled: manuallyDisabled 
  };
};

export default useWebSocket;