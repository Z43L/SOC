/**
 * Simplified agent main entry point for packaging testing
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

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
 * Función principal simplificada
 */
async function main() {
  console.log(`SOC Agent v${AGENT_VERSION} starting...`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`Architecture: ${os.arch()}`);
  console.log(`Executable path: ${process.execPath}`);
  console.log(`Working directory: ${process.cwd()}`);
  
  // Determinar ruta de configuración
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  // Si no se especificó, usar ruta por defecto según plataforma
  if (!configPath) {
    const platform = os.platform();
    // Usar ruta relativa al ejecutable para compatibilidad con binarios empaquetados
    const execDir = path.dirname(process.execPath);
    
    switch (platform) {
      case 'win32':
        // Para Windows, buscar primero junto al ejecutable, luego en ProgramData
        const winConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(winConfigPath);
          configPath = winConfigPath;
        } catch {
          configPath = path.join(process.env.ProgramData || 'C:\\ProgramData', 'SOC-Agent', 'agent.yaml');
        }
        break;
      case 'darwin':
        // Para macOS, buscar primero junto al ejecutable, luego en /etc
        const macConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(macConfigPath);
          configPath = macConfigPath;
        } catch {
          configPath = '/etc/soc-agent/agent.yaml';
        }
        break;
      default: // linux y otros
        // Para Linux, buscar primero junto al ejecutable, luego en /etc
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
  
  // Verificar que podemos crear archivos relativos al ejecutable
  const testLogPath = resolveAgentPath('test.log');
  console.log(`Test log path: ${testLogPath}`);
  
  try {
    await fs.writeFile(testLogPath, `SOC Agent test log - ${new Date().toISOString()}\n`);
    console.log('Successfully wrote test log file');
    await fs.unlink(testLogPath);
    console.log('Successfully cleaned up test log file');
  } catch (error) {
    console.warn('Could not write test log file:', error);
  }
  
  // Simular funcionamiento básico
  console.log('Agent would start monitoring here...');
  console.log('Press Ctrl+C to stop.');
  
  // Manejar señales de terminación
  process.on('SIGINT', () => {
    console.log('Received SIGINT, stopping agent...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, stopping agent...');
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

// Ejecutar función principal
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});