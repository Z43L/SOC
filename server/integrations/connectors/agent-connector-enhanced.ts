/**
 * Agent Connector
 * Handles communication with endpoint agents
 */

import { EventEmitter } from 'events';
import { Connector, ConnectorConfig, ConnectorStatus, RawEvent } from './connector.interface';
import { log } from '../../vite';
import { db } from '../../db';
import { connectors, agents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface AgentConnectorConfig extends ConnectorConfig {
  // Registration settings
  registrationEnabled: boolean;
  registrationRequiresApproval?: boolean;
  
  // Communication settings
  agentHeartbeatInterval?: number; // seconds
  batchSize?: number; // How many events to batch
  batchTimeLimit?: number; // Max seconds to wait before sending a batch
  
  // Agent capabilities
  capabilities?: string[]; // e.g., ['process-monitoring', 'file-monitoring', 'network-monitoring']
  
  // Organization-specific settings
  organizationKey: string; // Used for agent authentication
}

/**
 * Agent Connector implementation
 * Note: Unlike other connectors, this doesn't directly collect data.
 * Instead, it's a representation of the agent subsystem which receives data via API endpoints
 */
export class AgentConnector extends EventEmitter implements Connector {
  public readonly id: string;
  public readonly organizationId: string;
  public readonly name: string;
  public readonly type = 'agent';
  
  private _status: ConnectorStatus = 'active';
  private _config: AgentConnectorConfig;
  private _lastSuccessfulConnection?: Date;
  private _nextRun?: Date;
  private _errorCount: number = 0;
  private _lastError?: string;
  
  // Agent statistics
  private connectedAgentCount: number = 0;
  private lastAgentActivityTime?: Date;
  
  constructor(id: string, organizationId: string, name: string, config: AgentConnectorConfig) {
    super();
    this.id = id;
    this.organizationId = organizationId;
    this.name = name;
    this._config = config;
  }
  
  /**
   * Start the agent connector
   * For agent connectors, this initializes the state but doesn't start any active processes
   */
  public async start(): Promise<void> {
    try {
      log(`Starting agent connector ${this.name} (${this.id})`, 'agent-connector');
      
      // Update active agent count
      await this.updateAgentStats();
      
      this._status = 'active';
      this._lastSuccessfulConnection = new Date();
      
      // Update database
      await this.updateConnectorInDb({
        status: this._status,
        lastSuccessfulConnection: this._lastSuccessfulConnection
      });
      
      log(`Agent connector ${this.name} started`, 'agent-connector');
      this.emit('started');
    } catch (error) {
      this._status = 'error';
      this._errorCount++;
      this._lastError = error instanceof Error ? error.message : String(error);
      
      await this.updateConnectorInDb({
        status: this._status,
        errorMessage: this._lastError
      });
      
      log(`Error starting agent connector ${this.name}: ${this._lastError}`, 'agent-connector');
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Stop the agent connector
   */
  public async stop(): Promise<void> {
    try {
      log(`Stopping agent connector ${this.name} (${this.id})`, 'agent-connector');
      
      this._status = 'paused';
      
      // Update database
      await this.updateConnectorInDb({
        status: this._status
      });
      
      log(`Agent connector ${this.name} stopped`, 'agent-connector');
      this.emit('stopped');
    } catch (error) {
      log(`Error stopping agent connector ${this.name}: ${error}`, 'agent-connector');
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * For Agent connectors, runOnce refreshes agent statistics
   */
  public async runOnce(): Promise<void> {
    try {
      await this.updateAgentStats();
      
      this._lastSuccessfulConnection = new Date();
      
      // Update database
      await this.updateConnectorInDb({
        lastSuccessfulConnection: this._lastSuccessfulConnection
      });
      
      log(`Updated agent statistics for ${this.name}`, 'agent-connector');
    } catch (error) {
      log(`Error updating agent statistics: ${error}`, 'agent-connector');
      throw error;
    }
  }
  
  /**
   * Test the agent connector by checking database access
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Try to query the database to ensure we have access
      await db.select({ count: db.fn.count() }).from(agents)
        .where(eq(agents.organizationId, parseInt(this.organizationId)));
      
      return { success: true, message: 'Agent connector ready' };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Register a new agent
   */
  public async registerAgent(agentInfo: {
    hostname: string;
    ipAddress: string;
    operatingSystem: string;
    version: string;
    capabilities?: string[];
    systemInfo?: any;
  }): Promise<{ agentId: string; token: string; success: boolean; message: string }> {
    try {
      // Check if registration is enabled
      if (!this._config.registrationEnabled) {
        return {
          agentId: '',
          token: '',
          success: false,
          message: 'Agent registration is disabled'
        };
      }
      
      // Generate unique identifier and token
      const agentId = uuidv4();
      const token = uuidv4();
      
      // Create agent record
      const result = await db.insert(agents).values({
        name: `Agent-${agentInfo.hostname}`,
        hostname: agentInfo.hostname,
        ipAddress: agentInfo.ipAddress,
        operatingSystem: agentInfo.operatingSystem,
        version: agentInfo.version,
        status: this._config.registrationRequiresApproval ? 'inactive' : 'active',
        capabilities: agentInfo.capabilities || [],
        systemInfo: agentInfo.systemInfo || {},
        agentIdentifier: agentId,
        authToken: token,
        organizationId: parseInt(this.organizationId)
      }).returning();
      
      // Update agent count
      await this.updateAgentStats();
      
      return {
        agentId,
        token,
        success: true,
        message: this._config.registrationRequiresApproval
          ? 'Agent registered successfully and awaiting approval'
          : 'Agent registered successfully'
      };
    } catch (error) {
      log(`Error registering agent: ${error}`, 'agent-connector');
      return {
        agentId: '',
        token: '',
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Process agent heartbeat
   */
  public async processHeartbeat(agentId: string, heartbeat: {
    cpu: number;
    memory: number;
    version: string;
    timestamp: Date;
    diskSpace?: number;
    ipAddress?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      // Verify agent exists
      const agent = await db.select().from(agents)
        .where(eq(agents.agentIdentifier, agentId))
        .where(eq(agents.organizationId, parseInt(this.organizationId)));
      
      if (agent.length === 0) {
        return {
          success: false,
          message: 'Agent not found'
        };
      }
      
      // Update agent record
      await db.update(agents)
        .set({
          lastHeartbeat: new Date(),
          status: 'active',
          version: heartbeat.version,
          ipAddress: heartbeat.ipAddress || agent[0].ipAddress,
          lastMetrics: {
            cpu: heartbeat.cpu,
            memory: heartbeat.memory,
            diskSpace: heartbeat.diskSpace,
            timestamp: heartbeat.timestamp
          }
        })
        .where(eq(agents.agentIdentifier, agentId));
      
      // Update last activity time
      this.lastAgentActivityTime = new Date();
      
      return {
        success: true,
        message: 'Heartbeat processed successfully'
      };
    } catch (error) {
      log(`Error processing agent heartbeat: ${error}`, 'agent-connector');
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Process events from an agent
   */
  public async processEvents(agentId: string, events: any[]): Promise<{ success: boolean; message: string }> {
    try {
      // Verify agent exists
      const agent = await db.select().from(agents)
        .where(eq(agents.agentIdentifier, agentId))
        .where(eq(agents.organizationId, parseInt(this.organizationId)));
      
      if (agent.length === 0) {
        return {
          success: false,
          message: 'Agent not found'
        };
      }
      
      // Process each event
      for (const eventData of events) {
        // Create a normalized event
        const event: RawEvent = {
          id: uuidv4(),
          timestamp: new Date(eventData.timestamp || Date.now()),
          source: 'agent',
          type: eventData.type || 'agent-event',
          payload: eventData,
          tags: ['agent', eventData.type || 'event'],
          metadata: {
            connectorId: this.id,
            organizationId: this.organizationId,
            agentId
          }
        };
        
        // Emit the event
        this.emit('event', event);
      }
      
      // Update last activity time
      this.lastAgentActivityTime = new Date();
      
      return {
        success: true,
        message: `${events.length} events processed successfully`
      };
    } catch (error) {
      log(`Error processing agent events: ${error}`, 'agent-connector');
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Get the current connector status
   */
  public getStatus(): ConnectorStatus {
    return this._status;
  }
  
  /**
   * Update the connector status
   */
  public setStatus(status: ConnectorStatus, message?: string): void {
    const previousStatus = this._status;
    this._status = status;
    
    // If status changed, emit event
    if (previousStatus !== status) {
      this.emit('status-change', status, message);
      
      // Update status in database
      this.updateConnectorInDb({
        status: status,
        errorMessage: message || null
      });
    }
    
    // Handle error tracking
    if (status === 'error') {
      this._errorCount++;
      this._lastError = message;
      
      // Auto-disable if too many consecutive errors
      if (this._errorCount >= 5) {
        this.setStatus('disabled', 'Auto-disabled due to too many consecutive errors');
        this.emit('auto-disabled', this._errorCount, message);
      }
    } else if (status === 'active') {
      // Reset error count on successful status
      this._errorCount = 0;
      this._lastError = undefined;
    }
  }
  
  /**
   * Get the current configuration
   */
  public getConfig(): AgentConnectorConfig {
    return this._config;
  }
  
  /**
   * Update the connector configuration
   */
  public async updateConfig(config: Partial<AgentConnectorConfig>): Promise<void> {
    this._config = { ...this._config, ...config };
    
    // Update configuration in database
    await this.updateConnectorInDb({
      configuration: this._config
    });
    
    // Emit config-updated event
    this.emit('config-updated', this._config);
  }
  
  /**
   * Get connector status
   */
  public get status(): ConnectorStatus {
    return this._status;
  }
  
  /**
   * Get last successful connection time
   */
  public get lastSuccessfulConnection(): Date | undefined {
    return this._lastSuccessfulConnection;
  }
  
  /**
   * Get next run time
   * For Agent connectors, this doesn't apply
   */
  public get nextRun(): undefined {
    return undefined;
  }
  
  /**
   * Update agent statistics
   */
  private async updateAgentStats(): Promise<void> {
    try {
      // Get active agent count
      const result = await db.select({ count: db.fn.count() }).from(agents)
        .where(eq(agents.organizationId, parseInt(this.organizationId)))
        .where(eq(agents.status, 'active'));
      
      // Update count
      this.connectedAgentCount = Number(result[0].count);
      
      // Update dataVolume in database
      await this.updateConnectorInDb({
        dataVolume: `${this.connectedAgentCount} active agents`
      });
    } catch (error) {
      log(`Error updating agent statistics: ${error}`, 'agent-connector');
      throw error;
    }
  }
  
  /**
   * Update the connector record in the database
   */
  private async updateConnectorInDb(updates: Partial<any>): Promise<void> {
    try {
      await db.update(connectors)
        .set(updates)
        .where(eq(connectors.id, parseInt(this.id)));
    } catch (error) {
      log(`Error updating connector ${this.id} in database: ${error}`, 'agent-connector');
    }
  }
}