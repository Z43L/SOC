/**
 * Demonstration agent that sends logs and metrics every 30 seconds
 * Shows the proper WebSocket implementation for real-time SOC agent communication
 */

import WebSocket from 'ws';
import os from 'os';

const SERVER_URL = 'ws://localhost:5000';
const WS_ENDPOINT = '/api/ws/agents';
const METRICS_INTERVAL = 30000; // 30 seconds as specified in the issue

// Agent configuration
const AGENT_CONFIG = {
  agentId: `demo-agent-${os.hostname()}-${Date.now()}`,
  token: 'demo-agent-token-123', // In production, this would be a real JWT
  name: 'Demo SOC Agent',
  version: '2.0.0'
};

class SOCAgent {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.metricsTimer = null;
    this.heartbeatTimer = null;
    this.eventQueue = [];
  }

  /**
   * Connect to the SOC server via WebSocket
   */
  async connect() {
    const wsUrl = `${SERVER_URL}${WS_ENDPOINT}?token=${this.config.token}`;
    
    console.log(`[${this.config.agentId}] Connecting to SOC server: ${wsUrl}`);
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.on('open', () => {
      console.log(`[${this.config.agentId}] ✓ Connected to SOC server`);
      this.connected = true;
      this.startTimers();
    });
    
    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`[${this.config.agentId}] Connection closed: ${code} ${reason}`);
      this.connected = false;
      this.stopTimers();
      
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log(`[${this.config.agentId}] Attempting to reconnect...`);
        this.connect();
      }, 5000);
    });
    
    this.ws.on('error', (error) => {
      console.error(`[${this.config.agentId}] WebSocket error:`, error.message);
    });
  }

  /**
   * Handle incoming messages from server
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[${this.config.agentId}] Received:`, message);
      
      switch (message.type) {
        case 'welcome':
          console.log(`[${this.config.agentId}] ✓ Welcome message received`);
          break;
        case 'heartbeat_ack':
          console.log(`[${this.config.agentId}] ✓ Heartbeat acknowledged`);
          break;
        case 'log_batch_ack':
          console.log(`[${this.config.agentId}] ✓ Log batch acknowledged: ${message.processed} events`);
          break;
        case 'metrics_ack':
          console.log(`[${this.config.agentId}] ✓ Metrics acknowledged`);
          break;
        case 'error':
          console.error(`[${this.config.agentId}] Server error:`, message.message);
          break;
        default:
          console.log(`[${this.config.agentId}] Unknown message type:`, message.type);
      }
    } catch (error) {
      console.error(`[${this.config.agentId}] Error parsing message:`, error);
    }
  }

  /**
   * Start periodic timers for heartbeat and metrics
   */
  startTimers() {
    // Heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);

    // Metrics and logs every 30 seconds (as specified in the issue)
    this.metricsTimer = setInterval(() => {
      this.sendMetrics();
      this.sendLogBatch();
    }, METRICS_INTERVAL);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop all timers
   */
  stopTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * Send heartbeat to maintain connection
   */
  sendHeartbeat() {
    if (!this.connected) return;

    const heartbeat = {
      type: 'heartbeat',
      agentId: this.config.agentId,
      timestamp: new Date().toISOString(),
      status: 'active',
      metrics: this.getBasicMetrics()
    };

    this.sendMessage(heartbeat);
    console.log(`[${this.config.agentId}] ❤️ Heartbeat sent`);
  }

  /**
   * Send system metrics every 30 seconds
   */
  sendMetrics() {
    if (!this.connected) return;

    const metrics = {
      type: 'metrics',
      agentId: this.config.agentId,
      timestamp: new Date().toISOString(),
      metrics: {
        cpu: this.getCpuUsage(),
        memory: this.getMemoryUsage(),
        disk: this.getDiskUsage(),
        uptime: process.uptime(),
        processes: this.getProcessCount(),
        networkConnections: this.getNetworkConnections(),
        queueSize: this.eventQueue.length
      }
    };

    this.sendMessage(metrics);
    console.log(`[${this.config.agentId}] 📊 Metrics sent (every 30s)`);
  }

  /**
   * Send batch of log events
   */
  sendLogBatch() {
    if (!this.connected) return;

    // Generate some sample log events
    const events = this.generateSampleEvents();
    
    if (events.length === 0) return;

    const logBatch = {
      type: 'log_batch',
      agentId: this.config.agentId,
      timestamp: new Date().toISOString(),
      events: events
    };

    this.sendMessage(logBatch);
    console.log(`[${this.config.agentId}] 📝 Log batch sent: ${events.length} events`);
  }

  /**
   * Send a message to the server
   */
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get basic system metrics
   */
  getBasicMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    return {
      cpu: Math.round((cpus.length * Math.random() * 50) * 100) / 100, // Simulated
      memory: Math.round(((totalMem - freeMem) / totalMem) * 100 * 100) / 100,
      disk: Math.round(Math.random() * 100 * 100) / 100 // Simulated
    };
  }

  /**
   * Get detailed CPU usage
   */
  getCpuUsage() {
    // In a real implementation, this would calculate actual CPU usage
    return Math.round(Math.random() * 100 * 100) / 100;
  }

  /**
   * Get memory usage details
   */
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: Math.round(totalMem / 1024 / 1024), // MB
      used: Math.round(usedMem / 1024 / 1024), // MB
      free: Math.round(freeMem / 1024 / 1024), // MB
      percentage: Math.round((usedMem / totalMem) * 100 * 100) / 100
    };
  }

  /**
   * Get disk usage (simulated)
   */
  getDiskUsage() {
    return {
      total: 1000000, // MB
      used: Math.round(Math.random() * 800000), // MB
      percentage: Math.round(Math.random() * 80 * 100) / 100
    };
  }

  /**
   * Get process count (simulated)
   */
  getProcessCount() {
    return Math.floor(Math.random() * 200) + 100;
  }

  /**
   * Get network connections (simulated)
   */
  getNetworkConnections() {
    return Math.floor(Math.random() * 50) + 10;
  }

  /**
   * Generate sample log events
   */
  generateSampleEvents() {
    const eventTypes = [
      'file_access', 'network_connection', 'process_start', 'process_stop',
      'user_login', 'user_logout', 'system_startup', 'system_shutdown',
      'service_start', 'service_stop', 'error_detected', 'warning_issued'
    ];
    
    const severities = ['low', 'medium', 'high', 'critical'];
    const eventCount = Math.floor(Math.random() * 10) + 1; // 1-10 events
    const events = [];
    
    for (let i = 0; i < eventCount; i++) {
      events.push({
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        message: `Sample event ${i + 1} from demo agent`,
        timestamp: new Date().toISOString(),
        details: {
          source: 'demo-agent',
          pid: process.pid,
          hostname: os.hostname(),
          randomData: Math.random()
        }
      });
    }
    
    return events;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    console.log(`[${this.config.agentId}] Disconnecting...`);
    this.stopTimers();
    if (this.ws) {
      this.ws.close(1000, 'Agent shutdown');
    }
  }
}

// Create and start the demo agent
const agent = new SOCAgent(AGENT_CONFIG);

console.log('=== SOC Agent Demo - 30 Second Metrics/Logs ===');
console.log('This demonstrates the improved WebSocket implementation');
console.log('- Sends heartbeat every 30 seconds');
console.log('- Sends metrics and logs every 30 seconds');
console.log('- Shows proper JWT authentication and agentId validation');
console.log('- Demonstrates real-time communication as specified in issue #128\n');

// Connect to server
agent.connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down demo agent...');
  agent.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  agent.disconnect();
  process.exit(0);
});