import { useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

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
};

export const useWebSocket = (
  url: string, 
  options: WebSocketOptions = {}
) => {
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const {
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnectOnClose = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5
  } = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
        if (onOpen) onOpen();
      };

      wsRef.current.onclose = (event) => {
        if (onClose) onClose(event);

        if (reconnectOnClose && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          if (reconnectIntervalRef.current) {
            clearTimeout(reconnectIntervalRef.current);
          }
          
          reconnectIntervalRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
          
          toast({
            title: "Connection Lost",
            description: `Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`,
            variant: "default"
          });
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          toast({
            title: "Connection Failed",
            description: "Unable to establish WebSocket connection after multiple attempts.",
            variant: "destructive"
          });
        }
      };

      wsRef.current.onerror = (error) => {
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
      console.error("WebSocket connection error:", error);
    }
  }, [url, onOpen, onClose, onError, onMessage, reconnectOnClose, reconnectInterval, maxReconnectAttempts, toast]);

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
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { send, disconnect, reconnect: connect };
};

export default useWebSocket;