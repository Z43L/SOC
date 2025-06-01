/**
 * Funciones específicas para Windows que extienden el agente principal
 */

import * as os from 'os';
import * as child_process from 'child_process';
import { promisify } from 'util';
import { windowsCollectors } from './collectors/windows';
import { Logger } from './core/logger';

const exec = promisify(child_process.exec);

/**
 * Obtiene información del sistema específica de Windows
 */
export async function getWindowsSystemInfo(): Promise<{
  hostname: string;
  ip: string;
  os: string;
  version: string;
}> {
  try {
    const hostname = os.hostname();
    
    // Obtener versión detallada de Windows
    let windowsVersion = '';
    try {
      const { stdout } = await exec('wmic os get Caption,Version /format:list');
      const lines = stdout.split('\n');
      
      let caption = '';
      let version = '';
      
      for (const line of lines) {
        if (line.startsWith('Caption=')) {
          caption = line.substring(8).trim();
        } else if (line.startsWith('Version=')) {
          version = line.substring(8).trim();
        }
      }
      
      windowsVersion = `${caption} (${version})`;
    } catch {
      windowsVersion = `${os.type()} ${os.release()}`;
    }
    
    // Obtener IP principal
    let primaryIP = '127.0.0.1';
    try {
      const interfaces = os.networkInterfaces();
      for (const [name, nets] of Object.entries(interfaces)) {
        if (name.toLowerCase().includes('ethernet') || name.toLowerCase().includes('wi-fi')) {
          for (const net of nets || []) {
            if (net.family === 'IPv4' && !net.internal) {
              primaryIP = net.address;
              break;
            }
          }
          if (primaryIP !== '127.0.0.1') break;
        }
      }
    } catch (error) {
      console.warn('Could not determine primary IP address:', error);
    }
    
    return {
      hostname,
      ip: primaryIP,
      os: 'Windows',
      version: windowsVersion
    };
  } catch (error) {
    console.error('Error getting Windows system info:', error);
    throw error;
  }
}

/**
 * Obtiene métricas del sistema Windows
 */
export async function getWindowsSystemMetrics(): Promise<{
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  runningProcesses: number;
  timestamp: Date;
  uptime?: number;
  processCount?: number;
  networkConnections?: number;
}> {
  try {
    // Usar wmic para obtener métricas del sistema
    const metrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIn: 0,
      networkOut: 0,
      runningProcesses: 0,
      timestamp: new Date(),
      uptime: os.uptime(),
      processCount: 0,
      networkConnections: 0
    };
    
    // CPU usage
    try {
      const { stdout: cpuOutput } = await exec('wmic cpu get loadpercentage /value');
      const cpuMatch = cpuOutput.match(/LoadPercentage=(\d+)/);
      if (cpuMatch) {
        metrics.cpuUsage = parseInt(cpuMatch[1]);
      }
    } catch (error) {
      console.warn('Could not get CPU usage:', error);
    }
    
    // Memory usage
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      metrics.memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
    } catch (error) {
      console.warn('Could not get memory usage:', error);
    }
    
    // Disk usage (C: drive)
    try {
      const { stdout: diskOutput } = await exec('wmic logicaldisk where caption="C:" get freespace,size /value');
      const freeSpaceMatch = diskOutput.match(/FreeSpace=(\d+)/);
      const sizeMatch = diskOutput.match(/Size=(\d+)/);
      
      if (freeSpaceMatch && sizeMatch) {
        const freeSpace = parseInt(freeSpaceMatch[1]);
        const totalSpace = parseInt(sizeMatch[1]);
        metrics.diskUsage = Math.round(((totalSpace - freeSpace) / totalSpace) * 100);
      }
    } catch (error) {
      console.warn('Could not get disk usage:', error);
    }
    
    // Process count
    try {
      const { stdout: processOutput } = await exec('tasklist /fo csv | find /c /v ""');
      metrics.runningProcesses = parseInt(processOutput.trim()) - 1; // Exclude header
      metrics.processCount = metrics.runningProcesses;
    } catch (error) {
      console.warn('Could not get process count:', error);
    }
    
    // Network connections count
    try {
      const { stdout: netstatOutput } = await exec('netstat -an | find /c "ESTABLISHED"');
      metrics.networkConnections = parseInt(netstatOutput.trim());
    } catch (error) {
      console.warn('Could not get network connections count:', error);
    }
    
    return metrics;
  } catch (error) {
    console.error('Error getting Windows system metrics:', error);
    throw error;
  }
}

/**
 * Inicia los colectores específicos de Windows
 */
export async function startWindowsCollectors(logger: Logger, eventCallback: (event: any) => void): Promise<boolean> {
  try {
    console.log('Starting Windows-specific collectors...');
    
    let successCount = 0;
    
    // Inicializar y configurar todos los colectores de Windows
    for (const collector of windowsCollectors) {
      try {
        // Configurar el colector
        if (collector.configure) {
          await collector.configure({
            eventCallback: eventCallback,
            logger: logger
          });
        }
        
        // Iniciar el colector
        const started = await collector.start();
        if (started) {
          console.log(`Windows collector '${collector.name}' started successfully`);
          successCount++;
        } else {
          console.warn(`Failed to start Windows collector '${collector.name}'`);
        }
      } catch (error) {
        console.error(`Error starting Windows collector '${collector.name}':`, error);
      }
    }
    
    console.log(`Started ${successCount}/${windowsCollectors.length} Windows collectors`);
    return successCount > 0;
  } catch (error) {
    console.error('Error starting Windows collectors:', error);
    return false;
  }
}

/**
 * Detiene los colectores específicos de Windows
 */
export async function stopWindowsCollectors(): Promise<boolean> {
  try {
    console.log('Stopping Windows-specific collectors...');
    
    let successCount = 0;
    
    // Detener todos los colectores de Windows
    for (const collector of windowsCollectors) {
      try {
        const stopped = await collector.stop();
        if (stopped) {
          console.log(`Windows collector '${collector.name}' stopped successfully`);
          successCount++;
        } else {
          console.warn(`Failed to stop Windows collector '${collector.name}'`);
        }
      } catch (error) {
        console.error(`Error stopping Windows collector '${collector.name}':`, error);
      }
    }
    
    console.log(`Stopped ${successCount}/${windowsCollectors.length} Windows collectors`);
    return successCount === windowsCollectors.length;
  } catch (error) {
    console.error('Error stopping Windows collectors:', error);
    return false;
  }
}

/**
 * Realiza escaneos específicos de Windows
 */
export async function performWindowsScans(eventCallback: (event: any) => void): Promise<void> {
  try {
    console.log('Performing Windows-specific scans...');
    
    // Escaneo de sistema de archivos
    await scanWindowsFileSystem(eventCallback);
    
    // Escaneo de procesos
    await scanWindowsProcesses(eventCallback);
    
    // Escaneo de red
    await scanWindowsNetwork(eventCallback);
    
    // Escaneo de registro
    await scanWindowsRegistry(eventCallback);
    
    console.log('Windows scans completed');
  } catch (error) {
    console.error('Error performing Windows scans:', error);
  }
}

/**
 * Escaneo del sistema de archivos Windows
 */
async function scanWindowsFileSystem(eventCallback: (event: any) => void): Promise<void> {
  try {
    const criticalPaths = [
      'C:\\Windows\\System32',
      'C:\\Windows\\SysWOW64',
      'C:\\Program Files',
      'C:\\Program Files (x86)'
    ];
    
    for (const path of criticalPaths) {
      try {
        const { stdout } = await exec(`dir "${path}" /s /b /a:-d | findstr /i "\\.exe$ \\.dll$" | find /c /v ""`, {
          timeout: 30000
        });
        
        const fileCount = parseInt(stdout.trim()) || 0;
        
        eventCallback({
          eventType: 'file',
          severity: 'info',
          timestamp: new Date(),
          message: `Filesystem scan completed for ${path}: ${fileCount} executable files found`,
          details: {
            scanPath: path,
            fileCount: fileCount,
            scanType: 'executable_files'
          }
        });
      } catch (error) {
        console.warn(`Could not scan directory ${path}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in Windows filesystem scan:', error);
  }
}

/**
 * Escaneo de procesos Windows
 */
async function scanWindowsProcesses(eventCallback: (event: any) => void): Promise<void> {
  try {
    const { stdout } = await exec('tasklist /fo csv | find /c /v ""');
    const processCount = parseInt(stdout.trim()) - 1; // Exclude header
    
    eventCallback({
      eventType: 'process',
      severity: 'info',
      timestamp: new Date(),
      message: `Process scan completed: ${processCount} processes running`,
      details: {
        processCount: processCount,
        scanType: 'full_process_scan'
      }
    });
  } catch (error) {
    console.error('Error in Windows process scan:', error);
  }
}

/**
 * Escaneo de red Windows
 */
async function scanWindowsNetwork(eventCallback: (event: any) => void): Promise<void> {
  try {
    const { stdout } = await exec('netstat -an | find /c "ESTABLISHED"');
    const connectionCount = parseInt(stdout.trim()) || 0;
    
    eventCallback({
      eventType: 'network',
      severity: 'info',
      timestamp: new Date(),
      message: `Network scan completed: ${connectionCount} active connections`,
      details: {
        connectionCount: connectionCount,
        scanType: 'network_connections'
      }
    });
  } catch (error) {
    console.error('Error in Windows network scan:', error);
  }
}

/**
 * Escaneo del registro Windows
 */
async function scanWindowsRegistry(eventCallback: (event: any) => void): Promise<void> {
  try {
    const criticalKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
    ];
    
    let totalEntries = 0;
    
    for (const key of criticalKeys) {
      try {
        const { stdout } = await exec(`reg query "${key}" | find /c /v ""`);
        const entries = parseInt(stdout.trim()) || 0;
        totalEntries += entries;
      } catch (error) {
        // Continuar con otras claves si una falla
      }
    }
    
    eventCallback({
      eventType: 'registry',
      severity: 'info',
      timestamp: new Date(),
      message: `Registry scan completed: ${totalEntries} entries scanned`,
      details: {
        entryCount: totalEntries,
        scannedKeys: criticalKeys.length,
        scanType: 'registry_scan'
      }
    });
  } catch (error) {
    console.error('Error in Windows registry scan:', error);
  }
}