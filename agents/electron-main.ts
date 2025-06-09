import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Agent } from './agent-simple';

let mainWindow: BrowserWindow | null = null;
let agent: Agent | null = null;

/**
 * Create the main Electron window (hidden for headless operation)
 */
function createWindow(): void {
  // Create a hidden window for the agent to run in background
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false, // Keep hidden by default
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // Load a simple HTML file for status display
  mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize and start the SOC agent
 */
async function initializeAgent(): Promise<void> {
  try {
    // Determine config path based on platform and app location
    let configPath: string;
    const execDir = path.dirname(process.execPath);
    const resourcesPath = process.resourcesPath;
    
    // Try to find config file in resources first, then in executable directory
    const possiblePaths = [
      path.join(resourcesPath, 'agent-config.json'),
      path.join(execDir, 'agent-config.json'),
      path.join(__dirname, 'agent-config.json')
    ];

    configPath = '';
    for (const possiblePath of possiblePaths) {
      try {
        await fs.access(possiblePath);
        configPath = possiblePath;
        break;
      } catch {
        // Continue to next path
      }
    }

    if (!configPath) {
      throw new Error('No agent configuration file found');
    }

    console.log(`Using config file: ${configPath}`);

    // Convert JSON config to YAML format expected by agent
    const configJson = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const yamlConfigPath = path.join(path.dirname(configPath), 'agent.yaml');
    
    // Write YAML config
    const yaml = require('js-yaml');
    await fs.writeFile(yamlConfigPath, yaml.dump(configJson), 'utf-8');

    // Initialize agent
    agent = new Agent(yamlConfigPath);
    
    const initialized = await agent.initialize();
    if (!initialized) {
      throw new Error('Failed to initialize SOC agent');
    }

    const started = await agent.start();
    if (!started) {
      throw new Error('Failed to start SOC agent');
    }

    console.log('SOC Agent started successfully');

    // Set up IPC handlers for status updates
    setupIPCHandlers();

  } catch (error) {
    console.error('Error initializing agent:', error);
    dialog.showErrorBox('SOC Agent Error', `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  }
}

/**
 * Set up IPC handlers for communication with renderer process
 */
function setupIPCHandlers(): void {
  ipcMain.handle('get-agent-status', () => {
    if (!agent) {
      return { status: 'stopped', message: 'Agent not initialized' };
    }
    return { status: 'running', message: 'Agent is running normally' };
  });

  ipcMain.handle('show-window', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle('hide-window', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('stop-agent', async () => {
    if (agent) {
      await agent.stop();
      agent = null;
    }
    app.quit();
  });
}

/**
 * Handle app ready event
 */
app.whenReady().then(() => {
  createWindow();
  initializeAgent();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Handle window close events
 */
app.on('window-all-closed', () => {
  // Keep running in background even when window is closed
  // unless explicitly quit on macOS
  if (process.platform !== 'darwin') {
    // On Windows and Linux, keep running in background
    return;
  }
});

/**
 * Handle app quit
 */
app.on('before-quit', async (event) => {
  if (agent) {
    event.preventDefault();
    console.log('Stopping SOC Agent...');
    await agent.stop();
    agent = null;
    app.quit();
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('SOC Agent Fatal Error', `Fatal error: ${error.message}`);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  dialog.showErrorBox('SOC Agent Error', `Unhandled error: ${reason}`);
});