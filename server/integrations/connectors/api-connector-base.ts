/**
 * Base API Connector Class
 * Implements common functionality for all API-based connectors
 */

import { EventEmitter } from 'events';
import { Connector, ConnectorConfig, ConnectorStatus, RawEvent } from './connector.interface';
import { ConnectorType } from './interfaces';
import { log } from '../../vite';
import { db } from '../../db';
import { connectors } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ApiConnectorConfig extends ConnectorConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  pagination?: {
    enabled: boolean;
    type: 'offset' | 'cursor' | 'nextUrl';
    paramName?: string;
    limitParamName?: string;
    limitValue?: number;
    maxPages?: number;
  };
  backoff?: {
    initialDelay: number;
    maxDelay: number;
    factor: number;
    jitter: boolean;
  };
}

/**
 * Base class for all API-based connectors
 */
export abstract class ApiConnector extends EventEmitter implements Connector {
  public readonly id: string;
  public readonly organizationId: string;
  public readonly name: string;
  public readonly type: ConnectorType = 'api';
  
  protected _status: ConnectorStatus = 'active';
  protected _config: ApiConnectorConfig;
  protected _lastSuccessfulConnection?: Date;
  protected _nextRun?: Date;
  protected _errorCount: number = 0;
  protected _lastError?: string;
  
  constructor(id: string, organizationId: string, name: string, config: ApiConnectorConfig) {
    super();
    this.id = id;
    this.organizationId = organizationId;
    this.name = name;
    this._config = config;
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
  public getConfig(): ApiConnectorConfig {
    return this._config;
  }
  
  /**
   * Update the connector configuration
   */
  public async updateConfig(config: Partial<ApiConnectorConfig>): Promise<void> {
    this._config = { ...this._config, ...config };
    
    // Update configuration in database
    await this.updateConnectorInDb({
      configuration: this._config
    });
    
    // Emit config-updated event
    this.emit('config-updated', this._config);
  }
  
  /**
   * Start the connector
   * For API connectors, this doesn't do anything as scheduling is handled externally
   */
  public async start(): Promise<void> {
    log(`Starting API connector ${this.name} (${this.id})`, 'api-connector');
    
    if (this._status === 'disabled') {
      throw new Error('Cannot start a disabled connector');
    }
    
    this.setStatus('active');
    this.emit('started');
  }
  
  /**
   * Stop the connector
   * For API connectors, this doesn't do anything as scheduling is handled externally
   */
  public async stop(): Promise<void> {
    log(`Stopping API connector ${this.name} (${this.id})`, 'api-connector');
    this.setStatus('paused');
    this.emit('stopped');
  }
  
  /**
   * Execute the connector once
   * This is the main method that performs the API request and processes the response
   */
  public async runOnce(): Promise<void> {
    try {
      log(`Running API connector ${this.name} (${this.id})`, 'api-connector');
      
      // Check if connector is enabled
      if (this._status === 'disabled') {
        throw new Error('Cannot run a disabled connector');
      }
      
      // Update connector state
      this._lastSuccessfulConnection = new Date();
      await this.updateConnectorInDb({
        lastSuccessfulConnection: this._lastSuccessfulConnection
      });
      
      // Fetch batch of events from the API
      const events = await this.fetchBatch();
      
      // Emit events
      for (const event of events) {
        this.emit('event', event);
      }
      
      log(`Successfully ran API connector ${this.name} (${this.id}), processed ${events.length} events`, 'api-connector');
      this.setStatus('active');
    } catch (error) {
      log(`Error running API connector ${this.name} (${this.id}): ${error}`, 'api-connector');
      this.setStatus('error', error instanceof Error ? error.message : String(error));
      this.emit('error', error);
    }
  }
  
  /**
   * Test the connection to the API
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Perform a simple test - try to fetch a small amount of data
      await this.testApi();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Get the next run time
   */
  public get nextRun(): Date | undefined {
    return this._nextRun;
  }
  
  /**
   * Get the last successful connection time
   */
  public get lastSuccessfulConnection(): Date | undefined {
    return this._lastSuccessfulConnection;
  }
  
  /**
   * Get the current status
   */
  public get status(): ConnectorStatus {
    return this._status;
  }
  
  /**
   * Abstract method to fetch a batch of events from the API
   * Must be implemented by specific API connector classes
   */
  protected abstract fetchBatch(): Promise<RawEvent[]>;
  
  /**
   * Abstract method to test the API connection
   * Must be implemented by specific API connector classes
   */
  protected abstract testApi(): Promise<void>;
  
  /**
   * Update the connector record in the database
   */
  protected async updateConnectorInDb(updates: Partial<any>): Promise<void> {
    try {
      await db.update(connectors)
        .set(updates)
        .where(eq(connectors.id, parseInt(this.id)));
    } catch (error) {
      log(`Error updating connector ${this.id} in database: ${error}`, 'api-connector');
    }
  }
  
  /**
   * Helper method to calculate backoff delay for retries
   */
  protected calculateBackoffDelay(attempt: number): number {
    const backoff = this._config.backoff || {
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
      jitter: true
    };
    
    // Calculate exponential backoff
    let delay = backoff.initialDelay * Math.pow(backoff.factor, attempt);
    delay = Math.min(delay, backoff.maxDelay);
    
    // Add jitter if configured
    if (backoff.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return delay;
  }
}