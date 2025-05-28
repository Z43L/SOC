import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { soarExecutor } from './SoarExecutorService';
import { eventBus } from './eventBus';

interface SocketUser {
  id: string;
  organizationId: number;
  permissions: string[];
}

export class SoarWebSocketService {
  private io: SocketIOServer;
  private connectedClients = new Map<string, SocketUser>();

  constructor(httpServer: HttpServer) {
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

  private setupConnectionMonitoring(): void {
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

  private setupSocketHandlers(): void {
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

  private setupEventListeners(): void {
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

  private handleAuthentication(socket: any, data: any): void {
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
    } catch (error) {
      console.error('[SoarWebSocket] Authentication error:', error);
      socket.emit('auth:error', { message: 'Authentication failed' });
    }
  }

  private handleExecutionSubscription(socket: any, data: any): void {
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

  private handlePlaybookSubscription(socket: any, data: any): void {
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

  private handleUnsubscription(socket: any, data: any): void {
    const { type, id } = data;
    
    if (type === 'execution' && id) {
      socket.leave(`execution:${id}`);
    } else if (type === 'playbooks') {
      const user = this.connectedClients.get(socket.id);
      if (user) {
        socket.leave(`playbooks:${user.organizationId}`);
      }
    }

    socket.emit('unsubscription:confirmed', { type, id });
  }

  private handleTestTrigger(socket: any, data: any): void {
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

  private handleDisconnect(socket: any): void {
    const user = this.connectedClients.get(socket.id);
    if (user) {
      console.log(`[SoarWebSocket] Client ${socket.id} disconnected (org: ${user.organizationId})`);
      this.connectedClients.delete(socket.id);
    }
  }

  // Broadcast execution updates to relevant clients
  private broadcastExecutionUpdate(organizationId: number, event: string, data: any): void {
    // Broadcast to organization room
    this.io.to(`org:${organizationId}`).emit(event, data);
    
    // Broadcast to specific execution room if executionId is present
    if (data.executionId) {
      this.io.to(`execution:${data.executionId}`).emit(event, data);
    }
  }

  // Broadcast playbook updates to relevant clients
  private broadcastPlaybookUpdate(organizationId: number, event: string, data: any): void {
    this.io.to(`playbooks:${organizationId}`).emit(event, data);
  }

  // Send execution progress update
  sendExecutionProgress(executionId: string, progress: number, stepInfo: any): void {
    this.io.to(`execution:${executionId}`).emit('execution:progress', {
      executionId,
      progress,
      currentStep: stepInfo,
      timestamp: new Date().toISOString(),
    });
  }

  // Send step update
  sendStepUpdate(executionId: string, stepId: string, status: string, result?: any, error?: string): void {
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
  sendLogMessage(executionId: string, level: string, message: string, stepId?: string): void {
    this.io.to(`execution:${executionId}`).emit('execution:log', {
      executionId,
      level,
      message,
      stepId,
      timestamp: new Date().toISOString(),
    });
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get clients by organization
  getClientsByOrganization(organizationId: number): SocketUser[] {
    return Array.from(this.connectedClients.values())
      .filter(user => user.organizationId === organizationId);
  }

  // Shutdown
  shutdown(): void {
    this.io.close();
    console.log('[SoarWebSocket] WebSocket service shutdown');
  }
}

let soarWebSocket: SoarWebSocketService;

export function initializeWebSocket(httpServer: HttpServer): SoarWebSocketService {
  soarWebSocket = new SoarWebSocketService(httpServer);
  return soarWebSocket;
}

export function getSoarWebSocket(): SoarWebSocketService {
  if (!soarWebSocket) {
    throw new Error('WebSocket service not initialized');
  }
  return soarWebSocket;
}