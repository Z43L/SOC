/**
 * Connector Module - Main entry point
 * Provides functions for managing and using different types of connectors
 */

import express from 'express';
import { Connector as DBConnector } from '@shared/schema';
import { storage } from '../../storage';
import { log } from '../../vite';

// Import old connectors for backwards compatibility
import { BaseConnector, ConnectorType as OldConnectorType, ConnectorConfig as OldConnectorConfig } from './base';
import type { ConnectorResult } from './base';
import { APIConnector } from './api';
import { SyslogConnector } from './syslog';
import { AgentConnector } from './agent';
import { VirusTotalConnector, OTXConnector, MISPConnector } from './implementations';

// Import new connector implementation
import { Connector, ConnectorConfig, ConnectorStatus, RawEvent, connectorRegistry } from './connector.interface';
import { connectorScheduler } from './connector-scheduler';
import { initializeConnectors as initNewConnectors, shutdownConnectors } from './connector-init';
import { eventPipeline } from './event-pipeline';
import { SyslogConnector as EnhancedSyslogConnector } from './syslog-connector-enhanced';
import { AgentConnector as EnhancedAgentConnector } from './agent-connector-enhanced';
import { AwsCloudWatchLogsConnector } from './aws-cloudwatch-connector';
import { GoogleWorkspaceConnector } from './google-workspace-connector';
import { ConnectorFactory } from './connector-factory';

// Export types and classes (both old and new)
export { 
  // Old exports for backward compatibility
  OldConnectorType as ConnectorType, 
  ConnectorResult,
  BaseConnector, 
  APIConnector, 
  SyslogConnector, 
  AgentConnector,
  VirusTotalConnector,
  OTXConnector,
  MISPConnector,
  
  // New exports
  Connector,
  ConnectorConfig,
  ConnectorStatus,
  RawEvent,
  connectorRegistry,
  connectorScheduler,
  EnhancedSyslogConnector,
  EnhancedAgentConnector,
  AwsCloudWatchLogsConnector,
  GoogleWorkspaceConnector,
  ConnectorFactory,
  eventPipeline
};

// Legacy maps for backward compatibility
const activeConnectors: Map<number, BaseConnector> = new Map();
const pollingIntervals: Map<number, NodeJS.Timeout> = new Map();

/**
 * Initialize all connectors in the system
 * This function now delegates to the new connector system
 */
export async function initializeConnectors(app: express.Express): Promise<void> {
  try {
    // Initialize the new connector system
    await initNewConnectors(app);
    
    // For backward compatibility, also initialize old-style connectors
    log('Initializing legacy connectors...', 'connectors');
    
    // Get all connectors from the database
    const connectors = await storage.listConnectors();
    
    log(`Found ${connectors.length} configured connectors`, 'connectors');
    
    // Initialize each active connector
    for (const connector of connectors) {
      if (connector.isActive) {
        await initializeConnector(connector, app);
      }
    }
    
    log('Connector initialization complete', 'connectors');
  } catch (error) {
    log(`Error initializing connectors: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connectors');
  }
}

/**
 * Initialize a specific connector
 * This is kept for backward compatibility
 */
export async function initializeConnector(connector: DBConnector, app: express.Express): Promise<BaseConnector | null> {
  try {
    log(`Initializing connector ${connector.name} (ID: ${connector.id})`, 'connectors');
    
    // Stop if there's already an active connector with the same ID
    if (activeConnectors.has(connector.id)) {
      shutdownConnector(connector.id);
    }
    
    // Create connector instance based on type
    let connectorInstance: BaseConnector | null = null;
    
    // Read and type configuration
    const config = connector.configuration as OldConnectorConfig;
    const connectorType = config.connectionMethod?.toLowerCase() || 'api';
    
    // First try to detect specific providers
    const vendor = connector.vendor.toLowerCase();
    
    if (connectorType === 'api') {
      // Use specific connectors for known providers
      if (vendor === 'virustotal') {
        log(`Initializing specific VirusTotal connector for ${connector.name}`, 'connectors');
        connectorInstance = new VirusTotalConnector(connector);
      } else if (vendor === 'otx' || vendor === 'alienvault' || vendor === 'alienvault otx') {
        log(`Initializing specific OTX AlienVault connector for ${connector.name}`, 'connectors');
        connectorInstance = new OTXConnector(connector);
      } else if (vendor === 'misp') {
        log(`Initializing specific MISP connector for ${connector.name}`, 'connectors');
        connectorInstance = new MISPConnector(connector);
      } else {
        log(`Initializing generic API connector for ${connector.name}`, 'connectors');
        connectorInstance = new APIConnector(connector);
      }
    } else {
      // For other connector types
      switch (connectorType) {
        case 'syslog':
          connectorInstance = new SyslogConnector(connector);
          break;
        case 'agent':
          const agentConnector = new AgentConnector(connector);
          
          // Register endpoints in Express for agents
          app.use(agentConnector.getRouter());
          
          connectorInstance = agentConnector;
          break;
        default:
          log(`Unsupported connector type: ${connectorType}`, 'connectors');
          return null;
      }
    }
    
    // Valid configuration
    if (!connectorInstance.validateConfig()) {
      log(`Invalid configuration for connector ${connector.name}`, 'connectors');
      return null;
    }
    
    // Execute the connector for the first time
    const result = await connectorInstance.execute();
    
    if (result.success) {
      log(`Connector ${connector.name} initialized successfully`, 'connectors');
      
      // Save in active connectors map
      activeConnectors.set(connector.id, connectorInstance);
      
      // Configure periodic polling if it's an API connector
      if (connectorType === 'api') {
        const apiConfig = config as any;
        const pollingInterval = apiConfig.pollingInterval || 300; // Default: 5 minutes
        
        log(`Configuring polling for ${connector.name} every ${pollingInterval} seconds`, 'connectors');
        
        const intervalId = setInterval(async () => {
          try {
            log(`Executing polling for ${connector.name}`, 'connectors');
            const pollResult = await connectorInstance!.execute();
            log(`Polling result for ${connector.name}: ${pollResult.success ? 'Success' : 'Error'} - ${pollResult.message}`, 'connectors');
          } catch (error) {
            log(`Error in polling for ${connector.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connectors');
          }
        }, pollingInterval * 1000);
        
        // Save reference to the interval
        pollingIntervals.set(connector.id, intervalId);
      }
      
      return connectorInstance;
    } else {
      log(`Error initializing connector ${connector.name}: ${result.message}`, 'connectors');
      return null;
    }
  } catch (error) {
    log(`Error initializing connector ${connector.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connectors');
    return null;
  }
}

/**
 * Stop and remove an active connector
 * This is kept for backward compatibility
 */
export function shutdownConnector(connectorId: number): void {
  // Stop polling interval if it exists
  if (pollingIntervals.has(connectorId)) {
    clearInterval(pollingIntervals.get(connectorId)!);
    pollingIntervals.delete(connectorId);
    log(`Polling stopped for connector ID ${connectorId}`, 'connectors');
  }
  
  // Remove from active connectors map
  if (activeConnectors.has(connectorId)) {
    activeConnectors.delete(connectorId);
    log(`Connector ID ${connectorId} shut down`, 'connectors');
  }
}

/**
 * Execute a specific connector manually
 * This is kept for backward compatibility
 */
export async function executeConnector(connectorId: number): Promise<ConnectorResult> {
  try {
    // Check if the connector is active
    if (!activeConnectors.has(connectorId)) {
      // Try to load from the database
      const connector = await storage.getConnector(connectorId);
      
      if (!connector) {
        return {
          success: false,
          message: `Connector ID ${connectorId} not found`
        };
      }
      
      // Don't initialize, just create a temporary instance
      let connectorInstance: BaseConnector;
      
      // Read and type configuration
      const config = connector.configuration as OldConnectorConfig;
      const connectorType = config.connectionMethod?.toLowerCase() || 'api';
      
      // Detect vendor for specific connectors
      const vendor = connector.vendor.toLowerCase();
      
      if (connectorType === 'api') {
        // Use specific connectors for known providers
        if (vendor === 'virustotal') {
          log(`Using specific VirusTotal connector for manual execution`, 'connectors');
          connectorInstance = new VirusTotalConnector(connector);
        } else if (vendor === 'otx' || vendor === 'alienvault' || vendor === 'alienvault otx') {
          log(`Using specific OTX AlienVault connector for manual execution`, 'connectors');
          connectorInstance = new OTXConnector(connector);
        } else if (vendor === 'misp') {
          log(`Using specific MISP connector for manual execution`, 'connectors');
          connectorInstance = new MISPConnector(connector);
        } else {
          log(`Using generic API connector for manual execution`, 'connectors');
          connectorInstance = new APIConnector(connector);
        }
      } else {
        switch (connectorType) {
          case 'syslog':
            connectorInstance = new SyslogConnector(connector);
            break;
          case 'agent':
            connectorInstance = new AgentConnector(connector);
            break;
          default:
            return {
              success: false,
              message: `Unsupported connector type: ${connectorType}`
            };
        }
      }
      
      // Execute
      return await connectorInstance.execute();
    }
    
    // Use the existing active connector
    const connectorInstance = activeConnectors.get(connectorId)!;
    return await connectorInstance.execute();
  } catch (error) {
    log(`Error executing connector ID ${connectorId}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connectors');
    return {
      success: false,
      message: `Error executing connector: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get the status of all active connectors
 * This is kept for backward compatibility
 */
export function getActiveConnectors(): { id: number, name: string, type: string }[] {
  return Array.from(activeConnectors.entries()).map(([id, connector]) => ({
    id,
    name: connector.getConnector().name,
    type: connector.getConnector().type
  }));
}

/**
 * Update the activation status of a connector
 * This is kept for backward compatibility
 */
export async function toggleConnector(connectorId: number, active: boolean): Promise<boolean> {
  try {
    // Get connector from the database
    const connector = await storage.getConnector(connectorId);
    
    if (!connector) {
      log(`Connector ID ${connectorId} not found`, 'connectors');
      return false;
    }
    
    if (active) {
      // Activate connector
      if (!activeConnectors.has(connectorId)) {
        const app = (global as any).expressApp as express.Express;
        const result = await initializeConnector(connector, app);
        return !!result;
      }
      return true;
    } else {
      // Deactivate connector
      shutdownConnector(connectorId);
      return true;
    }
  } catch (error) {
    log(`Error in toggleConnector for ID ${connectorId}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connectors');
    return false;
  }
}

/**
 * Run a connector once by ID (using the new system)
 */
export async function runConnector(connectorId: string): Promise<boolean> {
  try {
    await connectorScheduler.runConnectorNow(connectorId);
    return true;
  } catch (error) {
    log(`Error running connector ${connectorId}: ${error}`, 'connectors');
    return false;
  }
}

/**
 * Test a connector connection
 */
export async function testConnectorConnection(connectorId: string): Promise<{ success: boolean; message: string }> {
  try {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) {
      return { success: false, message: `Connector ${connectorId} not found` };
    }
    
    return await connector.testConnection();
  } catch (error) {
    return { 
      success: false, 
      message: `Error testing connector: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}