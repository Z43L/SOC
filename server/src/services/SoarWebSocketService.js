import { Server as SocketIOServer } from 'socket.io';
import { soarExecutor } from './SoarExecutorService';
import { eventBus } from './eventBus';
export class SoarWebSocketService {
    io;
    connectedClients = new Map();
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
        console.log('[SoarWebSocket] WebSocket service initialized');
    }
    setupConnectionMonitoring() {
        this.io.engine.on('connection_error', (err) => {
            console.error('[SoarWebSocket] Connection error:', err.req, err.code, err.message, err.context);
        });
        // Log connection statistics every 30 seconds
        setInterval(() => {
            const clientCount = this.connectedClients.size;
            if (clientCount > 0) {
                console.log(`[SoarWebSocket] Connected clients: ${clientCount}`);
            }
        }, 30000);
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`[SoarWebSocket] Client connected: ${socket.id}`);
            // Handle connection errors
            socket.on('connect_error', (error) => {
                console.error(`[SoarWebSocket] Connection error for ${socket.id}:`, error);
            });
            // Handle authentication
            socket.on('authenticate', (data) => {
                this.handleAuthentication(socket, data);
            });
            // Handle subscription to playbook execution updates
            socket.on('subscribe:execution', (data) => {
                this.handleExecutionSubscription(socket, data);
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
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
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
            this.broadcastExecutionUpdate(event.data.organizationId, 'execution:started', event.data);
        });
        eventBus.subscribeToEvent('playbook.execution.completed', (event) => {
            this.broadcastExecutionUpdate(event.data.organizationId, 'execution:completed', event.data);
        });
        eventBus.subscribeToEvent('playbook.execution.failed', (event) => {
            this.broadcastExecutionUpdate(event.data.organizationId, 'execution:failed', event.data);
        });
        eventBus.subscribeToEvent('playbook.step.started', (event) => {
            this.broadcastExecutionUpdate(event.data.organizationId, 'step:started', event.data);
        });
        eventBus.subscribeToEvent('playbook.step.completed', (event) => {
            this.broadcastExecutionUpdate(event.data.organizationId, 'step:completed', event.data);
        });
        eventBus.subscribeToEvent('playbook.step.failed', (event) => {
            this.broadcastExecutionUpdate(event.data.organizationId, 'step:failed', event.data);
        });
        // Listen for playbook management events
        eventBus.subscribeToEvent('playbook.created', (event) => {
            this.broadcastPlaybookUpdate(event.data.organizationId, 'playbook:created', event.data);
        });
        eventBus.subscribeToEvent('playbook.updated', (event) => {
            this.broadcastPlaybookUpdate(event.data.organizationId, 'playbook:updated', event.data);
        });
        eventBus.subscribeToEvent('playbook.deleted', (event) => {
            this.broadcastPlaybookUpdate(event.data.organizationId, 'playbook:deleted', event.data);
        });
    }
    handleAuthentication(socket, data) {
        try {
            // In a real implementation, validate JWT token here
            const { token, userId, organizationId, permissions } = data;
            if (!userId || !organizationId) {
                socket.emit('auth:error', { message: 'Invalid authentication data' });
                return;
            }
            // Store user info
            this.connectedClients.set(socket.id, {
                id: userId,
                organizationId: parseInt(organizationId),
                permissions: permissions || [],
            });
            // Join organization room
            socket.join(`org:${organizationId}`);
            socket.emit('auth:success', {
                message: 'Authentication successful',
                clientId: socket.id,
            });
            console.log(`[SoarWebSocket] Client ${socket.id} authenticated for org ${organizationId}`);
        }
        catch (error) {
            console.error('[SoarWebSocket] Authentication error:', error);
            socket.emit('auth:error', { message: 'Authentication failed' });
        }
    }
    handleExecutionSubscription(socket, data) {
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
        console.log(`[SoarWebSocket] Client ${socket.id} subscribed to execution ${executionId}`);
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
    handleDisconnect(socket) {
        const user = this.connectedClients.get(socket.id);
        if (user) {
            console.log(`[SoarWebSocket] Client ${socket.id} disconnected (org: ${user.organizationId})`);
            this.connectedClients.delete(socket.id);
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
        this.io.close();
        console.log('[SoarWebSocket] WebSocket service shutdown');
    }
}
let soarWebSocket;
export function initializeWebSocket(httpServer) {
    soarWebSocket = new SoarWebSocketService(httpServer);
    return soarWebSocket;
}
export function getSoarWebSocket() {
    if (!soarWebSocket) {
        throw new Error('WebSocket service not initialized');
    }
    return soarWebSocket;
}
