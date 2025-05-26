// Common scanner types and registry

export type ScanTarget = {
  path?: string;
  processId?: number;
  containerId?: string;
};

export interface ScanResult {
  id: string;
  agentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'malware' | 'vulnerability';
  engine: string;
  cveId?: string;
  malwareFamily?: string;
  path?: string;
  processId?: number;
  containerId?: string;
  description: string;
  timestamp: number;
  fileHash?: string;
}

export interface ScanEngine {
  name: string;
  init?(): Promise<void>;
  scan(target: ScanTarget): Promise<ScanResult[]>;
  shutdown?(): Promise<void>;
}

const engines: ScanEngine[] = [];

/**
 * Register a new scan engine plugin
 */
export function registerEngine(engine: ScanEngine): void {
  engines.push(engine);
}

/**
 * Return all registered engines
 */
export function getEngines(): ScanEngine[] {
  return engines;
}
