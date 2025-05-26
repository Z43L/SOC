// Defines the shape of normalized events ingested by the SOC
export interface NormalizedEvent {
  id: string;
  agentId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'debug' | 'warn' | 'error';
  category: string;
  engine: string;
  timestamp: number;
  // additional connector-specific payload
  [key: string]: any;
}
