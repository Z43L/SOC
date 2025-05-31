import { Server as SocketIOServer } from 'socket.io';
import { soarExecutor } from './SoarExecutorService';
import { eventBus } from './eventBus';
import { verifyAgentToken } from '../../integrations/connectors/jwt-auth';
import { db } from '../../db';
import { users, organizations, playbookExecutions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
export class SoarWebSocketService {
    io;
    connectedClients = new Map();
    connectionStats = {
        totalConnections: 0,
        activeConnections: 0,
        authenticationFailures: 0,
        rateLimitViolations: 0
    };
    INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    MAX_CONNECTIONS_PER_ORG = 50;
    cleanupInterval;
    constructor(httpServer) {
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                credentials: true,
            },
            path: '/soar/live',
            // Add connection timeout and heartbeat configuration
            pingTimeout: 60000,
            pingInterval: 25000,
            upgradeTimeout: 10000,
            // Allow multiple connection attempts
            allowEIO3: true,
        });
        this.setupSocketHandlers();
        this.setupEventListeners();
        this.setupConnectionMonitoring();
        this.startCleanupTimer();
        console.log('[SoarWebSocket] WebSocket service initialized');
    }
    setupConnectionMonitoring() {
        this.io.engine.on('connection_error', (err) => {
            console.error('[SoarWebSocket] Connection error:', err.req, err.code, err.message, err.context);
            this.connectionStats.authenticationFailures++;
        });
        // Log connection statistics every 30 seconds
        setInterval(() => {
            const clientCount = this.connectedClients.size;
            if (clientCount > 0) {
                console.log(`[SoarWebSocket] Connected clients: ${clientCount}`, {
                    totalConnections: this.connectionStats.totalConnections,
                    authFailures: this.connectionStats.authenticationFailures,
                    rateLimitViolations: this.connectionStats.rateLimitViolations
                });
            }
        }, 30000);
    }
    startCleanupTimer() {
        // Clean up inactive connections every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000);
    }
    cleanupInactiveConnections() {
        const now = new Date();
        const inactiveConnections = [];
        this.connectedClients.forEach((user, socketId) => {
            if (now.getTime() - user.lastActivity.getTime() > this.INACTIVE_TIMEOUT) {
                inactiveConnections.push(socketId);
            }
        });
        for (const socketId of inactiveConnections) {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                console.log(`[SoarWebSocket] Disconnecting inactive client: ${socketId}`);
                socket.disconnect(true);
            }
            this.connectedClients.delete(socketId);
        }
        if (inactiveConnections.length > 0) {
            console.log(`[SoarWebSocket] Cleaned up ${inactiveConnections.length} inactive connections`);
        }
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.connectionStats.totalConnections++;
            this.connectionStats.activeConnections++;
            console.log(`[SoarWebSocket] Client connected: ${socket.id}`);
            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (!this.connectedClients.has(socket.id)) {
                    console.log(`[SoarWebSocket] Disconnecting unauthenticated client: ${socket.id}`);
                    socket.disconnect(true);
                }
            }, 30000); // 30 seconds to authenticate
            // Handle connection errors
            socket.on('connect_error', (error) => {
                console.error(`[SoarWebSocket] Connection error for ${socket.id}:`, error);
            });
            // Handle authentication
            socket.on('authenticate', async (data) => {
                clearTimeout(connectionTimeout);
                await this.handleAuthentication(socket, data);
            });
            // Update activity tracking for authenticated users on any message
            socket.use((packet, next) => {
                const user = this.connectedClients.get(socket.id);
                if (user) {
                    user.lastActivity = new Date();
                }
                next();
            });
            // Handle subscription to playbook execution updates
            socket.on('subscribe:execution', async (data) => {
                await this.handleExecutionSubscription(socket, data);
            });
            // Handle subscription to playbook list updates
            socket.on('subscribe:playbooks', (data) => {
                this.handlePlaybookSubscription(socket, data);
            });
            // Handle unsubscription
            socket.on('unsubscribe', (data) => {
                this.handleUnsubscription(socket, data);
            });
            // Handle disconnect
            socket.on('disconnect', (reason) => {
                clearTimeout(connectionTimeout);
                this.handleDisconnect(socket, reason);
            });
            // Handle test trigger requests
            socket.on('test:trigger', (data) => {
                this.handleTestTrigger(socket, data);
            });
        });
    }
    setupEventListeners() {
        // Listen for playbook execution events
        eventBus.subscribeToEvent('playbook.execution.started', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'execution:started', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.execution.completed', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'execution:completed', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.execution.failed', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'execution:failed', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.step.started', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'step:started', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.step.completed', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'step:completed', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.step.failed', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastExecutionUpdate(orgId, 'step:failed', event.data);
            }
        });
        // Listen for playbook management events
        eventBus.subscribeToEvent('playbook.created', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastPlaybookUpdate(orgId, 'playbook:created', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.updated', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastPlaybookUpdate(orgId, 'playbook:updated', event.data);
            }
        });
        eventBus.subscribeToEvent('playbook.deleted', (event) => {
            const orgId = typeof event.data.organizationId === 'number' ? event.data.organizationId : 0;
            if (orgId > 0) {
                this.broadcastPlaybookUpdate(orgId, 'playbook:deleted', event.data);
            }
        });
    }
    async handleAuthentication(socket, data) {
        try {
            const { token, userId, organizationId, permissions } = data;
            // Validate required fields
            if (!token) {
                socket.emit('auth:error', { message: 'Authentication token required' });
                socket.disconnect(true);
                return;
            }
            if (!userId || !organizationId) {
                socket.emit('auth:error', { message: 'Invalid authentication data' });
                socket.disconnect(true);
                return;
            }
            // Verify JWT token
            let tokenData;
            try {
                tokenData = verifyAgentToken(token);
                if (!tokenData) {
                    socket.emit('auth:error', { message: 'Invalid or expired token' });
                    socket.disconnect(true);
                    return;
                }
            }
            catch (error) {
                console.error('[SoarWebSocket] JWT verification failed:', error);
                socket.emit('auth:error', { message: 'Token verification failed' });
                socket.disconnect(true);
                return;
            }
            // Validate token payload matches provided data
            if (tokenData.userId.toString() !== userId.toString() ||
                tokenData.organizationId !== organizationId.toString()) {
                console.error('[SoarWebSocket] Token data mismatch:', {
                    tokenUserId: tokenData.userId,
                    providedUserId: userId,
                    tokenOrgId: tokenData.organizationId,
                    providedOrgId: organizationId
                });
                socket.emit('auth:error', { message: 'Authentication data mismatch' });
                socket.disconnect(true);
                return;
            }
            // Verify user exists and belongs to the organization
            const user = await db
                .select({
                id: users.id,
                organizationId: users.organizationId,
                role: users.role,
                name: users.name
            })
                .from(users)
                .innerJoin(organizations, eq(users.organizationId, organizations.id))
                .where(and(eq(users.id, parseInt(userId)), eq(users.organizationId, parseInt(organizationId))))
                .limit(1);
            if (user.length === 0) {
                console.error('[SoarWebSocket] User validation failed:', { userId, organizationId });
                socket.emit('auth:error', { message: 'User not found or organization mismatch' });
                socket.disconnect(true);
                return;
            }
            const userData = user[0];
            // Check organization connection limits
            const orgConnections = this.getClientsByOrganization(parseInt(organizationId)).length;
            if (orgConnections >= this.MAX_CONNECTIONS_PER_ORG) {
                console.error(`[SoarWebSocket] Organization connection limit exceeded:`, {
                    organizationId,
                    currentConnections: orgConnections,
                    limit: this.MAX_CONNECTIONS_PER_ORG
                });
                socket.emit('auth:error', { message: 'Organization connection limit exceeded' });
                socket.disconnect(true);
                return;
            }
            // Store validated user info
            const now = new Date();
            this.connectedClients.set(socket.id, {
                id: userId,
                organizationId: parseInt(organizationId),
                permissions: permissions || [],
                connectedAt: now,
                lastActivity: now
            });
            // Join organization room
            socket.join(`org:${organizationId}`);
            socket.emit('auth:success', {
                message: 'Authentication successful',
                clientId: socket.id,
            });
            console.log(`[SoarWebSocket] Client ${socket.id} authenticated for user ${userData.name} (${userId}) in org ${organizationId}`);
        }
        catch (error) {
            console.error('[SoarWebSocket] Authentication error:', error);
            this.connectionStats.authenticationFailures++;
            socket.emit('auth:error', { message: 'Authentication failed' });
            socket.disconnect(true);
        }
    }
    async handleExecutionSubscription(socket, data) {
        const user = this.connectedClients.get(socket.id);
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        const { executionId } = data;
        if (!executionId) {
            socket.emit('error', { message: 'Execution ID required' });
            return;
        }
        try {
            // Validate execution exists and belongs to user's organization
            const execution = await db
                .select({
                id: playbookExecutions.id,
                organizationId: playbookExecutions.organizationId,
                status: playbookExecutions.status
            })
                .from(playbookExecutions)
                .where(eq(playbookExecutions.id, parseInt(executionId)))
                .limit(1);
            if (execution.length === 0) {
                socket.emit('error', { message: 'Execution not found' });
                return;
            }
            const executionData = execution[0];
            // Verify execution belongs to user's organization
            if (executionData.organizationId !== user.organizationId) {
                console.error(`[SoarWebSocket] Unauthorized execution access attempt:`, {
                    socketId: socket.id,
                    userId: user.id,
                    userOrgId: user.organizationId,
                    executionId,
                    executionOrgId: executionData.organizationId
                });
                socket.emit('error', { message: 'Access denied to execution' });
                return;
            }
            // Join execution-specific room
            socket.join(`execution:${executionId}`);
            // Send current execution state if available
            const executionState = soarExecutor.getExecutionState(executionId);
            if (executionState) {
                socket.emit('execution:state', {
                    executionId,
                    state: executionState,
                });
            }
            socket.emit('subscription:confirmed', {
                type: 'execution',
                executionId,
            });
            console.log(`[SoarWebSocket] Client ${socket.id} subscribed to execution ${executionId} (org: ${user.organizationId})`);
        }
        catch (error) {
            console.error('[SoarWebSocket] Error in execution subscription:', error);
            socket.emit('error', { message: 'Failed to subscribe to execution' });
        }
    }
    handlePlaybookSubscription(socket, data) {
        const user = this.connectedClients.get(socket.id);
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        // Join playbook updates room for organization
        socket.join(`playbooks:${user.organizationId}`);
        socket.emit('subscription:confirmed', {
            type: 'playbooks',
            organizationId: user.organizationId,
        });
        console.log(`[SoarWebSocket] Client ${socket.id} subscribed to playbook updates`);
    }
    handleUnsubscription(socket, data) {
        const { type, id } = data;
        if (type === 'execution' && id) {
            socket.leave(`execution:${id}`);
        }
        else if (type === 'playbooks') {
            const user = this.connectedClients.get(socket.id);
            if (user) {
                socket.leave(`playbooks:${user.organizationId}`);
            }
        }
        socket.emit('unsubscription:confirmed', { type, id });
    }
    handleTestTrigger(socket, data) {
        const user = this.connectedClients.get(socket.id);
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        // Check permissions
        if (!user.permissions.includes('soar.execute') && !user.permissions.includes('soar.manage')) {
            socket.emit('error', { message: 'Insufficient permissions' });
            return;
        }
        const { playbookId, sampleData } = data;
        // Emit test trigger event
        eventBus.publishEvent({
            type: 'playbook.test.trigger',
            entityId: playbookId,
            entityType: 'playbook',
            organizationId: user.organizationId,
            timestamp: new Date(),
            data: {
                playbookId,
                sampleData,
                userId: user.id,
            }
        });
        socket.emit('test:trigger:started', { playbookId });
        console.log(`[SoarWebSocket] Test trigger initiated for playbook ${playbookId}`);
    }
    handleDisconnect(socket, reason) {
        const user = this.connectedClients.get(socket.id);
        if (user) {
            console.log(`[SoarWebSocket] Client ${socket.id} disconnected (org: ${user.organizationId}, reason: ${reason || 'unknown'})`);
            this.connectedClients.delete(socket.id);
            this.connectionStats.activeConnections = Math.max(0, this.connectionStats.activeConnections - 1);
        }
    }
    // Broadcast execution updates to relevant clients
    broadcastExecutionUpdate(organizationId, event, data) {
        // Broadcast to organization room
        this.io.to(`org:${organizationId}`).emit(event, data);
        // Broadcast to specific execution room if executionId is present
        if (data.executionId) {
            this.io.to(`execution:${data.executionId}`).emit(event, data);
        }
    }
    // Broadcast playbook updates to relevant clients
    broadcastPlaybookUpdate(organizationId, event, data) {
        this.io.to(`playbooks:${organizationId}`).emit(event, data);
    }
    // Send execution progress update
    sendExecutionProgress(executionId, progress, stepInfo) {
        this.io.to(`execution:${executionId}`).emit('execution:progress', {
            executionId,
            progress,
            currentStep: stepInfo,
            timestamp: new Date().toISOString(),
        });
    }
    // Send step update
    sendStepUpdate(executionId, stepId, status, result, error) {
        this.io.to(`execution:${executionId}`).emit('step:update', {
            executionId,
            stepId,
            status,
            result,
            error,
            timestamp: new Date().toISOString(),
        });
    }
    // Send log message
    sendLogMessage(executionId, level, message, stepId) {
        this.io.to(`execution:${executionId}`).emit('execution:log', {
            executionId,
            level,
            message,
            stepId,
            timestamp: new Date().toISOString(),
        });
    }
    // Get connected clients count
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }
    // Get clients by organization
    getClientsByOrganization(organizationId) {
        return Array.from(this.connectedClients.values())
            .filter(user => user.organizationId === organizationId);
    }
    // Shutdown
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        // Disconnect all clients gracefully
        this.connectedClients.forEach((user, socketId) => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.disconnect(true);
            }
        });
        this.connectedClients.clear();
        this.io.close();
        console.log('[SoarWebSocket] WebSocket service shutdown');
    }
    // Get connection statistics
    getConnectionStats() {
        return { ...this.connectionStats };
    }
}
let soarWebSocket = null;
export function initializeWebSocket(httpServer) {
    if (soarWebSocket) {
        console.warn('[SoarWebSocket] WebSocket service already initialized, returning existing instance');
        return soarWebSocket;
    }
    try {
        soarWebSocket = new SoarWebSocketService(httpServer);
        console.log('[SoarWebSocket] WebSocket service successfully initialized');
        return soarWebSocket;
    }
    catch (error) {
        console.error('[SoarWebSocket] Failed to initialize WebSocket service:', error);
        throw new Error(`WebSocket service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function getSoarWebSocket() {
    if (!soarWebSocket) {
        throw new Error('WebSocket service not initialized. Call initializeWebSocket() first.');
    }
    return soarWebSocket;
}
export function isWebSocketInitialized() {
    return soarWebSocket !== null;
}
export function shutdownWebSocket() {
    if (soarWebSocket) {
        soarWebSocket.shutdown();
        soarWebSocket = null;
        console.log('[SoarWebSocket] WebSocket service shutdown complete');
    }
}
