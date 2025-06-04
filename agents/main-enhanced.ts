/**
 * Enhanced agent main entry point with telemetry demonstration
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// Versión actual del agente
const AGENT_VERSION = '1.0.0';

/**
 * Resuelve una ruta relativa al directorio del ejecutable del agente
 */
function resolveAgentPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  
  const execDir = path.dirname(process.execPath);
  return path.resolve(execDir, relativePath);
}

/**
 * Calcula el checksum del binario actual
 */
async function calculateBinaryChecksum(): Promise<string | null> {
  try {
    const binaryPath = process.execPath;
    const fileContent = await fs.readFile(binaryPath);
    const hash = crypto.createHash('sha256');
    hash.update(fileContent);
    return hash.digest('hex');
  } catch (error) {
    console.warn('Could not calculate binary checksum:', error);
    return null;
  }
}

/**
 * Genera datos de telemetría del agente
 */
async function generateTelemetry() {
  const startTime = Date.now();
  const uptime = process.uptime() * 1000; // Convert to milliseconds
  const binaryChecksum = await calculateBinaryChecksum();
  
  return {
    version: AGENT_VERSION,
    platform: os.platform(),
    arch: os.arch(),
    uptime,
    binaryChecksum,
    installationMethod: process.env.SOC_AGENT_INSTALL_METHOD || 'manual',
    timestamp: new Date().toISOString(),
    executablePath: process.execPath,
    workingDirectory: process.cwd(),
    nodeVersion: process.version,
    pid: process.pid,
    memoryUsage: process.memoryUsage(),
    systemInfo: {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      loadavg: os.loadavg(),
    }
  };
}

/**
 * Simula envío de heartbeat con telemetría
 */
async function sendHeartbeat() {
  const telemetry = await generateTelemetry();
  
  console.log('=== HEARTBEAT ===');
  console.log('Agent Telemetry:');
  console.log(JSON.stringify(telemetry, null, 2));
  console.log('================');
  
  // En una implementación real, esto se enviaría al servidor SOC
  return telemetry;
}

/**
 * Función principal
 */
async function main() {
  console.log(`SOC Agent v${AGENT_VERSION} starting...`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`Architecture: ${os.arch()}`);
  console.log(`Executable path: ${process.execPath}`);
  console.log(`Working directory: ${process.cwd()}`);
  
  // Determinar ruta de configuración con lógica de fallback
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  if (!configPath) {
    const platform = os.platform();
    const execDir = path.dirname(process.execPath);
    
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
      default: // linux y otros
        const linuxConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(linuxConfigPath);
          configPath = linuxConfigPath;
        } catch {
          configPath = '/etc/soc-agent/agent.yaml';
        }
    }
  }
  
  console.log(`Configuration path: ${configPath}`);
  console.log(`Resolved config path: ${resolveAgentPath(configPath)}`);
  
  // Enviar heartbeat inicial
  await sendHeartbeat();
  
  // Configurar envío periódico de heartbeats
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendHeartbeat();
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }, 30000); // Cada 30 segundos para demo
  
  console.log('\nAgent is running...');
  console.log('- Heartbeats will be sent every 30 seconds');
  console.log('- Press Ctrl+C to stop');
  
  // Manejar señales de terminación
  const cleanup = () => {
    console.log('\nShutting down agent...');
    clearInterval(heartbeatInterval);
    console.log('Cleanup completed.');
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the process running
  await new Promise(() => {});
}

// Ejecutar función principal
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});