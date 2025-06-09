/**
 * Simplified Agent class for Electron integration
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Version del agente
const AGENT_VERSION = '1.0.0';

/**
 * Simplified Agent class
 */
export class Agent {
  private configPath: string;
  private running: boolean = false;
  private config: any = {};

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<boolean> {
    try {
      console.log(`SOC Agent v${AGENT_VERSION} initializing...`);
      console.log(`Platform: ${os.platform()}`);
      console.log(`Architecture: ${os.arch()}`);
      console.log(`Config path: ${this.configPath}`);

      // Try to load configuration
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        if (this.configPath.endsWith('.json')) {
          this.config = JSON.parse(configData);
        } else {
          // Assume YAML
          const yaml = require('js-yaml');
          this.config = yaml.load(configData);
        }
        console.log('Configuration loaded successfully');
      } catch (error) {
        console.warn('Could not load configuration file:', error instanceof Error ? error.message : String(error));
        // Use default configuration
        this.config = this.getDefaultConfig();
      }

      return true;
    } catch (error) {
      console.error('Error initializing agent:', error);
      return false;
    }
  }

  /**
   * Start the agent
   */
  async start(): Promise<boolean> {
    try {
      console.log('Starting SOC Agent...');
      this.running = true;

      // Start monitoring (simplified for Electron)
      this.startMonitoring();

      console.log('SOC Agent started successfully');
      return true;
    } catch (error) {
      console.error('Error starting agent:', error);
      return false;
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    try {
      console.log('Stopping SOC Agent...');
      this.running = false;
      console.log('SOC Agent stopped');
    } catch (error) {
      console.error('Error stopping agent:', error);
    }
  }

  /**
   * Check if agent is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get agent status
   */
  getStatus(): { status: string; message: string } {
    return {
      status: this.running ? 'running' : 'stopped',
      message: this.running ? 'Agent is running normally' : 'Agent is stopped'
    };
  }

  /**
   * Start basic monitoring (placeholder for full functionality)
   */
  private startMonitoring(): void {
    if (!this.running) return;

    // Simplified monitoring - in full implementation this would start collectors
    console.log('Monitoring started...');
    
    // Example: periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(heartbeatInterval);
        return;
      }
      console.log(`[${new Date().toISOString()}] Agent heartbeat`);
    }, 60000); // Every minute
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): any {
    return {
      serverUrl: 'wss://localhost:3000',
      organizationKey: 'default-org-key',
      agentId: 'electron-agent-' + Math.random().toString(36).substr(2, 9),
      logLevel: 'info',
      heartbeatInterval: 60,
      capabilities: {
        fileSystemMonitoring: true,
        processMonitoring: true,
        networkMonitoring: true,
        securityLogsMonitoring: true
      }
    };
  }
}

/**
 * Main function for standalone execution
 */
async function main() {
  const execDir = path.dirname(process.execPath);
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  if (!configPath) {
    const platform = os.platform();
    switch (platform) {
      case 'win32':
        const winConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(winConfigPath);
          configPath = winConfigPath;
        } catch {
          configPath = path.join(process.env.ProgramData || 'C:\\ProgramData', 'SOC-Agent', 'agent.yaml');
        }
        break;
      case 'darwin':
        const macConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(macConfigPath);
          configPath = macConfigPath;
        } catch {
          configPath = '/etc/soc-agent/agent.yaml';
        }
        break;
      default: // linux
        const linuxConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(linuxConfigPath);
          configPath = linuxConfigPath;
        } catch {
          configPath = '/etc/soc-agent/agent.yaml';
        }
    }
  }

  const agent = new Agent(configPath);
  
  // Handle termination signals
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, stopping agent...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, stopping agent...');
    await agent.stop();
    process.exit(0);
  });

  const initialized = await agent.initialize();
  if (!initialized) {
    console.error('Failed to initialize agent');
    process.exit(1);
  }

  const started = await agent.start();
  if (!started) {
    console.error('Failed to start agent');
    process.exit(1);
  }

  console.log('Agent running. Press Ctrl+C to stop.');
  
  // Keep process alive
  await new Promise(() => {});
}

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}