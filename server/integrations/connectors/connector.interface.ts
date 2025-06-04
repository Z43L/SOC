/**
 * Connector Interface - Core contract for all data connectors
 * Defines the structure and behavior required for all connectors in the system
 */

import { EventEmitter } from 'events';
import { ConnectorType } from './interfaces';

/**
 * Connector status values
 */
export type ConnectorStatus = 'active' | 'error' | 'disabled' | 'paused';

/**
 * Common connector configuration properties
 */
export interface ConnectorConfig {
  // Core configuration
  pollInterval?: number; // in seconds
  credentials?: {
    [key: string]: any;
  };
  protocol?: string;
  port?: number;
  
  // Specific connector settings
  [key: string]: any;
}

/**
 * Connector interface that all connector implementations must implement
 */
export interface Connector extends EventEmitter {
  // Identifiers
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly type: ConnectorType;
  
  // Status information
  readonly status: ConnectorStatus;
  readonly lastSuccessfulConnection?: Date;
  readonly nextRun?: Date;
  
  // Core functionality
  start(): Promise<void>;
  stop(): Promise<void>;
  runOnce(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  
  // State management
  getStatus(): ConnectorStatus;
  setStatus(status: ConnectorStatus, message?: string): void;
  
  // Configuration
  getConfig(): ConnectorConfig;
  updateConfig(config: Partial<ConnectorConfig>): Promise<void>;
}

/**
 * Raw event format emitted by connectors
 */
export interface RawEvent {
  id: string;
  timestamp: Date;
  source: string;
  type: string;
  payload: any;
  tags: string[];
  metadata?: {
    connectorId: string;
    organizationId: string;
    [key: string]: any;
  };
}

/**
 * Registry for maintaining connector instances
 */
export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private connectors: Map<string, Connector> = new Map();
  
  private constructor() {}
  
  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }
  
  /**
   * Register a connector instance
   */
  public registerConnector(connector: Connector): void {
    this.connectors.set(connector.id, connector);
  }
  
  /**
   * Unregister a connector by ID
   */
  public unregisterConnector(connectorId: string): boolean {
    return this.connectors.delete(connectorId);
  }
  
  /**
   * Get a connector by ID
   */
  public getConnector(connectorId: string): Connector | undefined {
    return this.connectors.get(connectorId);
  }
  
  /**
   * Get all registered connectors
   */
  public getAllConnectors(): Connector[] {
    return Array.from(this.connectors.values());
  }
  
  /**
   * Get connectors filtered by organizationId
   */
  public getOrgConnectors(organizationId: string): Connector[] {
    return this.getAllConnectors().filter(conn => conn.organizationId === organizationId);
  }
  
  /**
   * Get connectors filtered by type
   */
  public getConnectorsByType(type: ConnectorType): Connector[] {
    return this.getAllConnectors().filter(conn => conn.type === type);
  }
}

// Export singleton instance
export const connectorRegistry = ConnectorRegistry.getInstance();