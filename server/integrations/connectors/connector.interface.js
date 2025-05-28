/**
 * Connector Interface - Core contract for all data connectors
 * Defines the structure and behavior required for all connectors in the system
 */
/**
 * Registry for maintaining connector instances
 */
export class ConnectorRegistry {
    static instance;
    connectors = new Map();
    constructor() { }
    static getInstance() {
        if (!ConnectorRegistry.instance) {
            ConnectorRegistry.instance = new ConnectorRegistry();
        }
        return ConnectorRegistry.instance;
    }
    /**
     * Register a connector instance
     */
    registerConnector(connector) {
        this.connectors.set(connector.id, connector);
    }
    /**
     * Unregister a connector by ID
     */
    unregisterConnector(connectorId) {
        return this.connectors.delete(connectorId);
    }
    /**
     * Get a connector by ID
     */
    getConnector(connectorId) {
        return this.connectors.get(connectorId);
    }
    /**
     * Get all registered connectors
     */
    getAllConnectors() {
        return Array.from(this.connectors.values());
    }
    /**
     * Get connectors filtered by organizationId
     */
    getOrgConnectors(organizationId) {
        return this.getAllConnectors().filter(conn => conn.organizationId === organizationId);
    }
    /**
     * Get connectors filtered by type
     */
    getConnectorsByType(type) {
        return this.getAllConnectors().filter(conn => conn.type === type);
    }
}
// Export singleton instance
export const connectorRegistry = ConnectorRegistry.getInstance();
