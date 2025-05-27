/**
 * Connector Factory
 * Creates appropriate connector instances based on configuration
 */

import { connectorRegistry, Connector, ConnectorConfig } from './connector.interface';
import { SyslogConnector, SyslogConnectorConfig } from './syslog-connector-enhanced';
import { AgentConnector, AgentConnectorConfig } from './agent-connector-enhanced';
import { AwsCloudWatchLogsConnector, AwsCloudWatchLogsConfig } from './aws-cloudwatch-connector';
import { GoogleWorkspaceConnector, GoogleWorkspaceConfig } from './google-workspace-connector';
import { log } from '../../vite';

/**
 * Factory for creating connector instances
 */
export class ConnectorFactory {
  /**
   * Create and register a connector instance based on configuration
   */
  public static createConnector(
    id: string,
    organizationId: string,
    name: string,
    type: string,
    config: ConnectorConfig
  ): Connector {
    let connector: Connector;
    
    switch (type) {
      case 'syslog':
        connector = new SyslogConnector(id, organizationId, name, config as SyslogConnectorConfig);
        break;
        
      case 'agent':
        connector = new AgentConnector(id, organizationId, name, config as AgentConnectorConfig);
        break;
        
      case 'api':
        // For API connectors, check the subtype
        switch (config.subtype) {
          case 'aws-cloudwatch':
            connector = new AwsCloudWatchLogsConnector(id, organizationId, name, config as AwsCloudWatchLogsConfig);
            break;
            
          case 'google-workspace':
            connector = new GoogleWorkspaceConnector(id, organizationId, name, config as GoogleWorkspaceConfig);
            break;
            
          default:
            throw new Error(`Unsupported API connector subtype: ${config.subtype}`);
        }
        break;
        
      default:
        throw new Error(`Unsupported connector type: ${type}`);
    }
    
    // Register the connector
    connectorRegistry.registerConnector(connector);
    log(`Created and registered ${type} connector: ${name} (${id})`, 'connector-factory');
    
    return connector;
  }
}