/**
 * Connector Initialization Module
 * Initializes all connectors from the database
 */
import { db } from '../../db';
import { connectors } from '@shared/schema';
import { ne } from 'drizzle-orm';
import { log } from '../../vite';
import { ConnectorFactory } from './connector-factory';
import { connectorRegistry } from './connector.interface';
import { connectorScheduler } from './connector-scheduler';
import { eventPipeline } from './event-pipeline';
import agentRoutes from './agent-routes';
/**
 * Initialize all connectors
 */
export async function initializeConnectors(app) {
    try {
        log('Initializing connectors...', 'connector-init');
        // Register API routes
        app.use('/api/agents', agentRoutes);
        // Load active connectors from the database
        const activeConnectors = await db.select()
            .from(connectors)
            .where(ne(connectors.status, 'disabled'));
        log(`Found ${activeConnectors.length} active connectors`, 'connector-init');
        // Create connector instances
        for (const connectorData of activeConnectors) {
            try {
                const id = connectorData.id.toString();
                const organizationId = connectorData.organizationId?.toString() || '0';
                const name = connectorData.name;
                const type = connectorData.type;
                const config = connectorData.configuration;
                // Create and register the connector
                ConnectorFactory.createConnector(id, organizationId, name, type, config);
            }
            catch (error) {
                log(`Error creating connector ${connectorData.name}: ${error}`, 'connector-init');
            }
        }
        // Initialize the scheduler
        await connectorScheduler.initialize();
        // Ensure the event pipeline is initialized
        eventPipeline; // This accesses the singleton instance to ensure it's created
        log(`Initialized ${connectorRegistry.getAllConnectors().length} connectors`, 'connector-init');
    }
    catch (error) {
        log(`Error initializing connectors: ${error}`, 'connector-init');
        throw error;
    }
}
/**
 * Shutdown all connectors
 */
export async function shutdownConnectors() {
    try {
        log('Shutting down connectors...', 'connector-init');
        // Shutdown the scheduler
        connectorScheduler.shutdown();
        // Stop all connectors
        const connectorInstances = connectorRegistry.getAllConnectors();
        for (const connector of connectorInstances) {
            try {
                await connector.stop();
                log(`Stopped connector: ${connector.name} (${connector.id})`, 'connector-init');
            }
            catch (error) {
                log(`Error stopping connector ${connector.name}: ${error}`, 'connector-init');
            }
        }
        log('All connectors shut down', 'connector-init');
    }
    catch (error) {
        log(`Error shutting down connectors: ${error}`, 'connector-init');
        throw error;
    }
}
