/**
 * Connector Scheduler Service
 * Manages scheduling of connector executions using node-cron
 */

import cron from 'node-cron';
import { log } from '../../vite';
import { connectorRegistry, Connector, ConnectorStatus } from './connector.interface';
import { db } from '../../db';
import { connectors } from '@shared/schema';
import { eq, ne } from 'drizzle-orm';

interface ScheduledTask {
  connector: Connector;
  task: cron.ScheduledTask;
}

export class ConnectorScheduler {
  private static instance: ConnectorScheduler;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  
  private constructor() {}
  
  public static getInstance(): ConnectorScheduler {
    if (!ConnectorScheduler.instance) {
      ConnectorScheduler.instance = new ConnectorScheduler();
    }
    return ConnectorScheduler.instance;
  }
  
  /**
   * Initialize the scheduler and start all active connectors
   */
  public async initialize(): Promise<void> {
    try {
      log('Initializing ConnectorScheduler...', 'connector-scheduler');
      
      // Load all active connectors from the database
      const activeConnectors = await db.select()
        .from(connectors)
        .where(ne(connectors.status, 'disabled'));
      
      for (const connectorData of activeConnectors) {
        const connector = connectorRegistry.getConnector(connectorData.id.toString());
        if (connector) {
          this.scheduleConnector(connector);
        }
      }
      
      log(`ConnectorScheduler initialized with ${this.scheduledTasks.size} tasks`, 'connector-scheduler');
    } catch (error) {
      log(`Error initializing ConnectorScheduler: ${error}`, 'connector-scheduler');
      throw error;
    }
  }
  
  /**
   * Schedule a connector based on its type and configuration
   */
  public scheduleConnector(connector: Connector): void {
    // Skip if already scheduled
    if (this.scheduledTasks.has(connector.id)) {
      this.unscheduleConnector(connector.id);
    }
    
    // Get connector configuration
    const config = connector.getConfig();
    
    if (connector.type === 'api') {
      // API connectors are scheduled with cron
      const pollInterval = config.pollInterval || 300; // Default: 5 minutes
      
      // Convert poll interval to cron expression
      // For intervals less than 60 seconds, we use */n * * * * * format
      // For intervals >= 60 seconds, we use */n * * * * format (n in minutes)
      let cronExpression: string;
      
      if (pollInterval < 60) {
        cronExpression = `*/${pollInterval} * * * * *`; // Every n seconds
      } else {
        const minutes = Math.floor(pollInterval / 60);
        cronExpression = `*/${minutes} * * * *`; // Every n minutes
      }
      
      log(`Scheduling connector ${connector.name} (${connector.id}) with cron: ${cronExpression}`, 'connector-scheduler');
      
      // Create the cron job
      const task = cron.schedule(cronExpression, async () => {
        try {
          log(`Executing scheduled task for connector ${connector.name} (${connector.id})`, 'connector-scheduler');
          await connector.runOnce();
        } catch (error) {
          log(`Error executing scheduled task for connector ${connector.id}: ${error}`, 'connector-scheduler');
        }
      });
      
      // Store the scheduled task
      this.scheduledTasks.set(connector.id, { connector, task });
    } else if (connector.type === 'syslog' || connector.type === 'agent') {
      // Syslog and agent connectors are started immediately and run continuously
      try {
        log(`Starting continuous connector ${connector.name} (${connector.id})`, 'connector-scheduler');
        connector.start().catch(error => {
          log(`Error starting continuous connector ${connector.id}: ${error}`, 'connector-scheduler');
        });
        
        // Store without a cron task
        this.scheduledTasks.set(connector.id, { connector, task: null as any });
      } catch (error) {
        log(`Error starting continuous connector ${connector.id}: ${error}`, 'connector-scheduler');
      }
    }
  }
  
  /**
   * Unschedule a connector by ID
   */
  public unscheduleConnector(connectorId: string): void {
    const scheduledTask = this.scheduledTasks.get(connectorId);
    if (scheduledTask) {
      if (scheduledTask.task) {
        scheduledTask.task.stop();
      }
      
      // For continuous connectors, call stop()
      if (scheduledTask.connector.type === 'syslog' || scheduledTask.connector.type === 'agent') {
        scheduledTask.connector.stop().catch(error => {
          log(`Error stopping continuous connector ${connectorId}: ${error}`, 'connector-scheduler');
        });
      }
      
      this.scheduledTasks.delete(connectorId);
      log(`Unscheduled connector ${connectorId}`, 'connector-scheduler');
    }
  }
  
  /**
   * Update the schedule for a connector
   */
  public updateConnectorSchedule(connector: Connector): void {
    this.unscheduleConnector(connector.id);
    
    // Only reschedule if connector is active
    if (connector.status !== 'disabled') {
      this.scheduleConnector(connector);
    }
  }
  
  /**
   * Run a connector once, regardless of its schedule
   */
  public async runConnectorNow(connectorId: string): Promise<void> {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    
    log(`Manually running connector ${connector.name} (${connector.id})`, 'connector-scheduler');
    await connector.runOnce();
  }
  
  /**
   * Stop all scheduled tasks
   */
  public shutdown(): void {
    log('Shutting down ConnectorScheduler...', 'connector-scheduler');
    
    for (const [connectorId, scheduledTask] of this.scheduledTasks.entries()) {
      this.unscheduleConnector(connectorId);
    }
    
    log('ConnectorScheduler shutdown complete', 'connector-scheduler');
  }
}

// Export singleton instance
export const connectorScheduler = ConnectorScheduler.getInstance();