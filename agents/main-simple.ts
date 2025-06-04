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
  
  try {
    const execDir = path.dirname(process.execPath);
    return path.resolve(execDir, relativePath);
  } catch (error) {
    console.error('Error resolving agent path:', error);
    // Fallback to current directory
    return path.resolve(process.cwd(), relativePath);
  }
}

/**
 * Provides guidance for Windows installation in paths with spaces
 */
function printWindowsInstallationGuidance(): void {
  if (os.platform() !== 'win32') return;
  
  console.log('\n=== Windows Installation Guidance ===');
  console.log('If you are experiencing "Cannot find module" errors with paths containing spaces:');
  console.log('');
  console.log('1. When running the agent manually, always use quotes:');
  console.log('   "C:\\Program Files\\SOC-Agent\\soc-agent.exe"');
  console.log('');
  console.log('2. When creating Windows services, ensure paths are quoted:');
  console.log('   sc create SOC-Agent binPath= "\\"C:\\Program Files\\SOC-Agent\\soc-agent.exe\\""');
  console.log('');
  console.log('3. Consider installing to a path without spaces:');
  console.log('   C:\\SOC-Agent\\ or C:\\opt\\soc-agent\\');
  console.log('');
  console.log('4. If using Task Scheduler, ensure the "Program/script" field is quoted properly.');
  console.log('=====================================\n');
}

/**
 * Función principal simplificada
 */
async function main() {
  console.log(`SOC Agent v${AGENT_VERSION} starting...`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`Architecture: ${os.arch()}`);
  
  // Validate and display executable path with proper error handling
  let execPath = '';
  try {
    execPath = process.execPath;
    console.log(`Executable path: ${execPath}`);
    
    // Check if path contains spaces and warn about potential issues
    if (execPath.includes(' ') && os.platform() === 'win32') {
      console.warn('⚠️  Warning: Executable path contains spaces. This may cause issues if not properly quoted in scripts or services.');
      console.warn('   Ensure the agent is invoked with proper path quoting: "' + execPath + '"');
    }
  } catch (error) {
    console.error('Error accessing executable path:', error);
    execPath = 'unknown';
  }
  
  console.log(`Working directory: ${process.cwd()}`);
  
  // Determinar ruta de configuración
  let configPath = process.env.AGENT_CONFIG_PATH || '';
  
  // Si no se especificó, usar ruta por defecto según plataforma
  if (!configPath) {
    const platform = os.platform();
    // Usar ruta relativa al ejecutable para compatibilidad con binarios empaquetados
    let execDir = '';
    
    try {
      execDir = path.dirname(execPath);
    } catch (error) {
      console.error('Error determining executable directory:', error);
      // Fallback to current directory
      execDir = process.cwd();
    }
    
    switch (platform) {
      case 'win32':
        // Para Windows, buscar primero junto al ejecutable, luego en ProgramData
        const winConfigPath = path.join(execDir, 'agent.yaml');
        try {
          await fs.access(winConfigPath);
          configPath = winConfigPath;
        } catch {
          const programData = process.env.ProgramData || 'C:\\ProgramData';
          configPath = path.join(programData, 'SOC-Agent', 'agent.yaml');
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
  
  // If we detected a path with spaces issue, show guidance
  if (execPath.includes(' ') && os.platform() === 'win32') {
    printWindowsInstallationGuidance();
  }
  
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

// Ejecutar función principal con manejo mejorado de errores
main().catch(error => {
  console.error('Unhandled error:', error);
  
  // Check if this is the specific Windows path issue
  if (error.message && error.message.includes('Cannot find module') && error.message.includes('Program')) {
    console.error('\n🚨 DETECTED WINDOWS PATH ISSUE 🚨');
    console.error('This error occurs when the agent executable path contains spaces and is not properly quoted.');
    console.error('');
    printWindowsInstallationGuidance();
  }
  
  process.exit(1);
});