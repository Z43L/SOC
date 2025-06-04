/**
 * Agent API Routes
 * Provides endpoints for agent registration, heartbeat, and data transmission
 */
import express from 'express';
import { log } from '../../vite';
import { connectorRegistry } from './connector.interface';
import { verifyAgentJwt } from './jwt-auth';
import jwt from 'jsonwebtoken';
import { db } from '../../db';
import { agents } from '@shared/schema';
import { eq } from 'drizzle-orm';
// Create router
const router = express.Router();
/**
 * Register a new agent
 * POST /api/agents/register
 */
router.post('/register', async (req, res) => {
    try {
        const { hostname, ipAddress, operatingSystem, version, capabilities, systemInfo, organizationKey } = req.body;
        // Validate required fields
        if (!hostname || !ipAddress || !operatingSystem || !version || !organizationKey) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        // Find the agent connector for this organization
        const connectors = connectorRegistry.getAllConnectors()
            .filter(connector => connector.type === 'agent' &&
            connector.getConfig().organizationKey === organizationKey);
        if (connectors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invalid organization key'
            });
        }
        // Use the first matching connector
        const connector = connectors[0];
        // Register the agent
        const result = await connector.registerAgent({
            hostname,
            ipAddress,
            operatingSystem,
            version,
            capabilities,
            systemInfo
        });
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Generate JWT token for future authentication
        const token = jwt.sign({
            agentId: result.agentId,
            userId: 0, // System user for agents registered via organization key
            organizationId: connector.organizationId,
            type: 'agent'
        }, process.env.JWT_SECRET || 'soc-platform-secret', {
            expiresIn: '1y'
        });
        // Return success response with token
        return res.json({
            ...result,
            token
        });
    }
    catch (error) {
        log(`Error registering agent: ${error}`, 'agent-api');
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
/**
 * Process agent heartbeat
 * POST /api/agents/heartbeat
 */
router.post('/heartbeat', verifyAgentJwt, async (req, res) => {
    try {
        const { agentId, organizationId } = req.user;
        const { cpu, memory, version, diskSpace, ipAddress } = req.body;
        // Validate required fields
        if (cpu === undefined || memory === undefined || !version) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        // Find the agent connector for this organization
        const connectors = connectorRegistry.getAllConnectors()
            .filter(connector => connector.type === 'agent' &&
            connector.organizationId === organizationId);
        if (connectors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Agent connector not found for this organization'
            });
        }
        // Use the first matching connector
        const connector = connectors[0];
        // Process heartbeat
        const result = await connector.processHeartbeat(agentId, {
            cpu,
            memory,
            version,
            diskSpace,
            ipAddress,
            timestamp: new Date()
        });
        return res.json(result);
    }
    catch (error) {
        log(`Error processing agent heartbeat: ${error}`, 'agent-api');
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
/**
 * Receive data from an agent
 * POST /api/agents/data
 */
router.post('/data', verifyAgentJwt, async (req, res) => {
    try {
        const { agentId, organizationId } = req.user;
        const { events } = req.body;
        // Validate events array
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or empty events array'
            });
        }
        // Find the agent connector for this organization
        const connectors = connectorRegistry.getAllConnectors()
            .filter(connector => connector.type === 'agent' &&
            connector.organizationId === organizationId);
        if (connectors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Agent connector not found for this organization'
            });
        }
        // Use the first matching connector
        const connector = connectors[0];
        // Process events
        const result = await connector.processEvents(agentId, events);
        // Update agent's last heartbeat time
        await db.update(agents)
            .set({ lastHeartbeat: new Date() })
            .where(eq(agents.agentIdentifier, agentId));
        return res.json(result);
    }
    catch (error) {
        log(`Error processing agent data: ${error}`, 'agent-api');
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
/**
 * Get configuration for an agent
 * GET /api/agents/config
 */
router.get('/config', verifyAgentJwt, async (req, res) => {
    try {
        const { agentId, organizationId } = req.user;
        // Get agent record
        const agentRecord = await db.select().from(agents)
            .where(eq(agents.agentIdentifier, agentId))
            .where(eq(agents.organizationId, parseInt(organizationId)));
        if (agentRecord.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        // Find the agent connector for this organization
        const connectors = connectorRegistry.getAllConnectors()
            .filter(connector => connector.type === 'agent' &&
            connector.organizationId === organizationId);
        if (connectors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Agent connector not found for this organization'
            });
        }
        // Use the first matching connector
        const connector = connectors[0];
        const config = connector.getConfig();
        // Return agent configuration
        return res.json({
            success: true,
            config: {
                heartbeatInterval: config.agentHeartbeatInterval || 60, // seconds
                batchSize: config.batchSize || 100,
                batchTimeLimit: config.batchTimeLimit || 120, // seconds
                capabilities: agentRecord[0].capabilities || config.capabilities || [],
                customConfig: agentRecord[0].configuration || {}
            }
        });
    }
    catch (error) {
        log(`Error getting agent configuration: ${error}`, 'agent-api');
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
export default router;
