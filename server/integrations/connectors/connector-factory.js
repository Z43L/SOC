/**
 * Connector Factory
 * Creates appropriate connector instances based on configuration
 */
import { connectorRegistry } from './connector.interface';
import { SyslogConnector } from './syslog-connector-enhanced';
import { AgentConnector } from './agent-connector-enhanced';
import { AwsCloudWatchLogsConnector } from './aws-cloudwatch-connector';
import { GoogleWorkspaceConnector } from './google-workspace-connector';
import { log } from '../../vite';
/**
 * Factory for creating connector instances
 */
export class ConnectorFactory {
    /**
     * Create and register a connector instance based on configuration
     */
    static createConnector(id, organizationId, name, type, config) {
        let connector;
        switch (type) {
            case 'syslog':
                connector = new SyslogConnector(id, organizationId, name, config);
                break;
            case 'agent':
                connector = new AgentConnector(id, organizationId, name, config);
                break;
            case 'api':
                // For API connectors, check the subtype
                switch (config.subtype) {
                    case 'aws-cloudwatch':
                        connector = new AwsCloudWatchLogsConnector(id, organizationId, name, config);
                        break;
                    case 'google-workspace':
                        connector = new GoogleWorkspaceConnector(id, organizationId, name, config);
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
