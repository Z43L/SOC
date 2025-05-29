/**
 * Implementación del agente para Linux
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';
import { promisify } from 'util';
import { AgentBase } from '../common/agent-base';
import * as Monitoring from '../common/monitoring';
import { loadConfig, DEFAULT_CONFIG, AgentConfig } from '../common/agent-config';

const exec = promisify(childProcess.exec);

/**
 * Agente específico para sistemas Linux
 */
export class LinuxAgent extends AgentBase {
  // Monitores activos
  private fileWatcher: any = null;
  private processWatcher: NodeJS.Timeout | null = null;
  private networkWatcher: NodeJS.Timeout | null = null;
  
  // Cache de información para detectar cambios
  private lastProcessList: Map<number, Monitoring.ProcessInfo> = new Map();
  private lastNetworkConnections: Map<string, Monitoring.NetworkConnection> = new Map();
  
  // Guardar referencia a la configuración tipada
  private linuxConfig: AgentConfig;
  
  constructor(configPath: string) {
    super(configPath);
    this.linuxConfig = {
      ...DEFAULT_CONFIG,
      configPath
    };
  }
  
  /**
   * Obtiene información básica del sistema Linux
   */
  protected async getSystemInfo(): Promise<{
    hostname: string;
    ip: string;
    os: string;
    version: string;
  }> {
    // Obtener hostname del sistema
    const hostname = os.hostname();
    
    // Obtener dirección IP principal
    const networkInterfaces = os.networkInterfaces();
    let ip = '127.0.0.1';
    
    // Buscar la primera interfaz no interna con IPv4
    for (const interfaces of Object.values(networkInterfaces)) {
      if (!interfaces) continue;
      
      for (const iface of interfaces) {
        if (!iface.internal && iface.family === 'IPv4') {
          ip = iface.address;
          break;
        }
      }
      
      if (ip !== '127.0.0.1') break;
    }
    
    // Obtener información de la distribución
    let osInfo = 'Linux';
    let version = os.release();
    
    try {
      // Intentar leer /etc/os-release para información más detallada
      const osRelease = await fs.readFile('/etc/os-release', 'utf-8');
      const nameMatch = osRelease.match(/NAME="([^"]+)"/);
      const versionMatch = osRelease.match(/VERSION="?([^"\n]+)"?/);
      
      if (nameMatch) {
        osInfo = nameMatch[1];
      }
      
      if (versionMatch) {
        version = versionMatch[1];
      }
    } catch (error) {
      console.warn('Could not read /etc/os-release, using basic OS info');
    }
    
    return {
      hostname,
      ip,
      os: osInfo,
      version
    };
  }
  
  /**
   * Obtiene métricas del sistema Linux en tiempo real
   */
  protected async getSystemMetrics(): Promise<Monitoring.SystemMetrics> {
    // Valores por defecto
    const metrics: Monitoring.SystemMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIn: 0,
      networkOut: 0,
      runningProcesses: 0,
      timestamp: new Date()
    };
    
    try {
      // Obtener uso de CPU (promedio de carga de 1 minuto / núcleos * 100)
      const loadAvg = os.loadavg();
      const cpuCount = os.cpus().length;
      metrics.cpuUsage = Math.min(100, (loadAvg[0] / cpuCount) * 100);
      
      // Obtener uso de memoria
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      metrics.memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
      
      // Obtener uso de disco (del directorio raíz)
      try {
        const { stdout } = await exec('df -k / | tail -1');
        const parts = stdout.split(/\s+/);
        
        if (parts.length >= 5) {
          // El porcentaje está en la columna 5, formato "73%"
          const percentStr = parts[4].replace('%', '');
          metrics.diskUsage = parseInt(percentStr, 10);
        }
      } catch (error) {
        console.error('Error getting disk usage:', error);
      }
      
      // Obtener contador de procesos
      try {
        const { stdout } = await exec('ps -e | wc -l');
        metrics.runningProcesses = parseInt(stdout.trim(), 10) - 1; // Restar la línea de encabezado
      } catch (error) {
        console.error('Error getting process count:', error);
      }
      
      // Obtener estadísticas de red
      try {
        const { stdout } = await exec('cat /proc/net/dev');
        let totalRx = 0;
        let totalTx = 0;
        
        // Analizar cada línea excepto las 2 primeras (encabezados)
        const lines = stdout.split('\n').slice(2);
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          // Formato: face |bytes packets errs drop fifo frame compressed multicast|bytes packets...
          const parts = line.trim().split(/\s+/);
          
          if (parts.length >= 10 && !parts[0].startsWith('lo:')) {
            totalRx += parseInt(parts[1], 10);
            totalTx += parseInt(parts[9], 10);
          }
        }
        
        metrics.networkIn = totalRx;
        metrics.networkOut = totalTx;
      } catch (error) {
        console.error('Error getting network stats:', error);
      }
      
      // Obtener descriptores de archivo abiertos
      try {
        const { stdout } = await exec('cat /proc/sys/fs/file-nr | cut -f1');
        metrics.openFileDescriptors = parseInt(stdout.trim(), 10);
      } catch (error) {
        console.error('Error getting open file descriptors:', error);
      }
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
    
    return metrics;
  }
  
  /**
   * Inicia los monitores específicos de Linux
   */
  protected async startMonitoring(): Promise<void> {
    console.log('Starting Linux-specific monitoring');
    
    // Iniciar monitoreo de procesos si está habilitado
    if (this.config.capabilities.processMonitoring) {
      console.log('Starting process monitoring');
      this.processWatcher = setInterval(() => this.checkProcesses(), 60 * 1000); // Cada minuto
      await this.checkProcesses(); // Ejecutar inmediatamente
    }
    
    // Iniciar monitoreo de red si está habilitado
    if (this.config.capabilities.networkMonitoring) {
      console.log('Starting network monitoring');
      this.networkWatcher = setInterval(() => this.checkNetworkConnections(), 60 * 1000); // Cada minuto
      await this.checkNetworkConnections(); // Ejecutar inmediatamente
    }
    
    // Iniciar monitoreo de archivos si está habilitado
    if (this.config.capabilities.fileSystemMonitoring) {
      console.log('Starting file system monitoring');
      // En una implementación real, usaríamos inotify
      // Para esta versión simplificada, no implementamos monitoreo continuo
    }
  }
  
  /**
   * Detiene los monitores específicos de Linux
   */
  protected async stopMonitoring(): Promise<void> {
    console.log('Stopping Linux-specific monitoring');
    
    // Detener monitoreo de procesos
    if (this.processWatcher) {
      clearInterval(this.processWatcher);
      this.processWatcher = null;
    }
    
    // Detener monitoreo de red
    if (this.networkWatcher) {
      clearInterval(this.networkWatcher);
      this.networkWatcher = null;
    }
    
    // Detener monitoreo de archivos
    if (this.fileWatcher) {
      // En una implementación real, cerraríamos los monitores inotify
      this.fileWatcher = null;
    }
  }
  
  /**
   * Comprueba procesos en busca de actividad sospechosa
   */
  private async checkProcesses(): Promise<void> {
    try {
      // Obtener lista actual de procesos
      const processes = await this.getRunningProcesses();
      const currentProcessMap = new Map<number, Monitoring.ProcessInfo>();
      
      // Procesar cada proceso
      for (const process of processes) {
        currentProcessMap.set(process.pid, process);
        
        // Si es un proceso nuevo, comprobarlo
        if (!this.lastProcessList.has(process.pid)) {
          // Comprobar procesos sospechosos
          await this.checkSuspiciousProcess(process);
        }
      }
      
      // Comprobar procesos terminados
      for (const [pid, oldProcess] of this.lastProcessList) {
        if (!currentProcessMap.has(pid)) {
          // Registrar terminación de procesos importantes
          if (this.isImportantProcess(oldProcess)) {
            await this.queueEvent({
              eventType: 'process',
              severity: 'medium',
              timestamp: new Date(),
              message: `Important process terminated: ${oldProcess.name} (PID: ${oldProcess.pid})`,
              details: oldProcess
            });
          }
        }
      }
      
      // Actualizar caché de procesos
      this.lastProcessList = currentProcessMap;
      
    } catch (error) {
      console.error('Error checking processes:', error);
    }
  }
  
  /**
   * Verifica si un proceso es importante para monitoreo
   */
  private isImportantProcess(process: Monitoring.ProcessInfo): boolean {
    const importantNames = [
      'sshd', 'httpd', 'apache2', 'nginx', 'mysql', 'postgresql',
      'mongod', 'redis-server', 'firewalld', 'systemd', 'init',
      'docker', 'containerd', 'dockerd', 'kubelet'
    ];
    
    return importantNames.some(name => 
      process.name.includes(name) || 
      (process.path && process.path.includes(name))
    );
  }
  
  /**
   * Verifica si un proceso es sospechoso basado en diferentes criterios
   * - Nombre o comando sospechoso
   * - Alta utilización de CPU
   * - Ejecución desde un directorio inusual
   */
  private async checkSuspiciousProcess(process: Monitoring.ProcessInfo): Promise<void> {
    // Lista de nombres sospechosos de procesos (herramientas de hacking y pentesting)
    const suspiciousNames = [
      'nc', 'netcat', 'ncat', 'nmap', 'wireshark', 'tcpdump', 'ettercap',
      'mimikatz', 'meterpreter', 'msfconsole', 'msfvenom', 'metasploit',
      'john', 'hashcat', 'hydra', 'responder', 'cain', 'backdoor', 'trojan'
    ];
    
    // Procesos con nombres o comandos sospechosos
    if (suspiciousNames.some(name => 
      process.name.toLowerCase().includes(name) || 
      (process.command && process.command.toLowerCase().includes(name))
    )) {
      // Usar el formato directo de evento en lugar de helpers que causan problemas de tipo
      await this.queueEvent({
        eventType: 'process',
        severity: 'high',
        timestamp: new Date(),
        message: `Process with suspicious name detected: ${process.name}`,
        details: {
          process,
          reason: 'Process with suspicious name detected'
        }
      });
      return;
    }
    
    // Procesos con alta utilización de CPU configurable
    const cpuThreshold = this.linuxConfig.cpuAlertThreshold || 90;
    if (process.cpuUsage > cpuThreshold) {
      await this.queueEvent({
        eventType: 'process',
        severity: 'medium',
        timestamp: new Date(),
        message: `High CPU usage detected: ${process.name} (${process.cpuUsage.toFixed(1)}%)`,
        details: {
          process,
          reason: `High CPU usage: ${process.cpuUsage.toFixed(1)}%`
        }
      });
      return;
    }
    
    // Procesos ejecutados desde directorios inusuales
    if (process.path) {
      const suspiciousPaths = [
        '/tmp/', '/dev/shm/', '/var/tmp/', '/private/tmp'
      ];
      
      if (suspiciousPaths.some(dirPath => process.path?.startsWith(dirPath))) {
        await this.queueEvent({
          eventType: 'process',
          severity: 'high',
          timestamp: new Date(),
          message: `Process running from suspicious location: ${process.name} (${process.path})`,
          details: {
            process,
            reason: `Process running from suspicious location: ${process.path}`
          }
        });
        return;
      }
    }
  }
  
  /**
   * Obtiene la lista de procesos en ejecución
   */
  private async getRunningProcesses(): Promise<Monitoring.ProcessInfo[]> {
    try {
      // Obtener lista básica de procesos con ps
      const { stdout } = await exec('ps -eo pid,ppid,user,%cpu,%mem,lstart,cmd');
      
      const processes: Monitoring.ProcessInfo[] = [];
      
      // Analizar la salida, saltando la línea de encabezado
      const lines = stdout.split('\n').slice(1);
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Formato aproximado: PID PPID USER %CPU %MEM STARTED CMD
        const parts = line.trim().split(/\s+/);
        
        if (parts.length >= 7) {
          const pid = parseInt(parts[0], 10);
          
          // Extraer el nombre del proceso del comando
          const cmdParts = parts.slice(6).join(' ').split('/');
          const name = cmdParts[cmdParts.length - 1].split(' ')[0];
          
          // Crear información del proceso
          const processInfo: Monitoring.ProcessInfo = {
            pid,
            name,
            command: parts.slice(6).join(' '),
            user: parts[2],
            cpuUsage: parseFloat(parts[3]),
            memoryUsage: parseFloat(parts[4]),
            startTime: new Date(parts.slice(5, 10).join(' ')),
            status: 'running',
            path: await this.getProcessPath(pid)
          };
          
          processes.push(processInfo);
        }
      }
      
      return processes;
    } catch (error) {
      console.error('Error getting running processes:', error);
      return [];
    }
  }
  
  /**
   * Obtiene la ruta del ejecutable de un proceso
   */
  private async getProcessPath(pid: number): Promise<string | undefined> {
    try {
      const exePath = `/proc/${pid}/exe`;
      const target = await fs.readlink(exePath);
      return target;
    } catch (error) {
      // Es normal que algunos procesos no tengan enlace exe accesible
      return undefined;
    }
  }
  
  /**
   * Comprueba conexiones de red en busca de actividad sospechosa
   */
  private async checkNetworkConnections(): Promise<void> {
    try {
      // Obtener conexiones de red actuales
      const connections = await this.getNetworkConnections();
      const currentConnectionMap = new Map<string, Monitoring.NetworkConnection>();
      
      // Generar clave única para cada conexión
      const getConnectionKey = (conn: Monitoring.NetworkConnection) => 
        `${conn.protocol}-${conn.localAddress}:${conn.localPort}-${conn.remoteAddress}:${conn.remotePort}`;
      
      // Procesar cada conexión
      for (const connection of connections) {
        const key = getConnectionKey(connection);
        currentConnectionMap.set(key, connection);
        
        // Si es una conexión nueva, verificarla
        if (!this.lastNetworkConnections.has(key)) {
          await this.checkSuspiciousConnection(connection);
        }
      }
      
      // Actualizar caché de conexiones
      this.lastNetworkConnections = currentConnectionMap;
      
    } catch (error) {
      console.error('Error checking network connections:', error);
    }
  }
  
  /**
   * Verifica si una conexión de red es sospechosa
   */
  private async checkSuspiciousConnection(connection: Monitoring.NetworkConnection): Promise<void> {
    // Lista de puertos sospechosos
    const suspiciousPorts = [
      // Puertos comunes de backdoors
      4444, 5000, 5001, 5555, 6666, 6667, 6697, 8080, 8888, 9999,
      // Puertos comunes de troyanos conocidos
      31337, 12345, 54321
    ];
    
    // Conexiones a puertos sospechosos
    if (suspiciousPorts.includes(connection.remotePort)) {
      await this.queueEvent({
        eventType: 'network',
        severity: 'high',
        timestamp: new Date(),
        message: `Connection to suspicious port ${connection.remotePort} detected`,
        details: {
          connection,
          reason: `Connection to suspicious port ${connection.remotePort}`
        }
      });
      return;
    }
    
    // Lista de países/rangos IP sospechosos (simplificada)
    // En la implementación real se usaría una base de datos GeoIP
    const suspiciousIPs = [
      '185.', '194.', '5.188.', '5.45.',  // Ejemplos ficticios
    ];
    
    // Conexiones a direcciones IP sospechosas
    if (suspiciousIPs.some(ip => connection.remoteAddress.startsWith(ip))) {
      await this.queueEvent({
        eventType: 'network',
        severity: 'high',
        timestamp: new Date(),
        message: `Connection to suspicious IP address ${connection.remoteAddress} detected`,
        details: {
          connection,
          reason: `Connection to suspicious IP address ${connection.remoteAddress}`
        }
      });
      return;
    }
    
    // Procesos con conexiones inusuales
    if (connection.processName) {
      const nonNetworkProcesses = [
        'bash', 'sh', 'python', 'perl', 'ruby', 'nc', 'netcat',
        'powershell', 'cmd', 'msfconsole'
      ];
      
      if (nonNetworkProcesses.some(name => 
        connection.processName?.toLowerCase().includes(name)
      )) {
        await this.queueEvent({
          eventType: 'network',
          severity: 'medium',
          timestamp: new Date(),
          message: `Unusual process ${connection.processName} has unexpected network activity`,
          details: {
            connection,
            reason: `Unusual process ${connection.processName} has network activity`,
            process: connection.processName
          }
        });
        return;
      }
    }
  }
  
  /**
   * Obtiene la lista de conexiones de red activas
   */
  private async getNetworkConnections(): Promise<Monitoring.NetworkConnection[]> {
    try {
      // Intentar usar ss primero (más moderno)
      try {
        const { stdout } = await exec('ss -tunp');
        return this.parseSSOutput(stdout);
      } catch (error) {
        // Si ss falla, usar netstat como alternativa
        const { stdout } = await exec('netstat -tunp');
        return this.parseNetstatOutput(stdout);
      }
    } catch (error) {
      console.error('Error getting network connections:', error);
      return [];
    }
  }
  
  /**
   * Analiza la salida del comando ss
   */
  private parseSSOutput(output: string): Monitoring.NetworkConnection[] {
    const connections: Monitoring.NetworkConnection[] = [];
    
    // Analizar la salida, saltando la línea de encabezado
    const lines = output.split('\n').slice(1);
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Formato aproximado: 
      // State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 5) {
        const protocol = parts[0].includes('tcp') ? 'tcp' : 'udp';
        const state = parts[1];
        
        // Analizar dirección local (IP:Puerto)
        const localParts = parts[4].split(':');
        const localPort = parseInt(localParts.pop() || '0', 10);
        const localAddress = localParts.join(':').replace(/[\[\]]/g, '');
        
        // Analizar dirección remota (IP:Puerto)
        const remoteParts = parts[5].split(':');
        const remotePort = parseInt(remoteParts.pop() || '0', 10);
        const remoteAddress = remoteParts.join(':').replace(/[\[\]]/g, '');
        
        // Extraer información del proceso (pid/nombre)
        let processId: number | undefined;
        let processName: string | undefined;
        
        if (parts.length >= 7) {
          const processPart = parts[6];
          const procMatch = processPart.match(/pid=(\d+)/);
          
          if (procMatch) {
            processId = parseInt(procMatch[1], 10);
            
            // Intentar obtener el nombre del proceso
            const nameMatch = processPart.match(/users:\(\(([^,]+)/);
            if (nameMatch) {
              processName = nameMatch[1];
            }
          }
        }
        
        connections.push({
          protocol,
          state,
          localAddress,
          localPort,
          remoteAddress,
          remotePort,
          processId,
          processName,
          established: new Date()
        });
      }
    }
    
    return connections;
  }
  
  /**
   * Analiza la salida del comando netstat
   */
  private parseNetstatOutput(output: string): Monitoring.NetworkConnection[] {
    const connections: Monitoring.NetworkConnection[] = [];
    
    // Analizar la salida, saltando las líneas de encabezado
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (!line.trim() || line.startsWith('Proto') || line.startsWith('Active')) continue;
      
      // Formato aproximado: 
      // Proto Recv-Q Send-Q Local Address Foreign Address State PID/Program name
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 5) {
        const protocol = parts[0].toLowerCase().includes('tcp') ? 'tcp' : 'udp';
        
        // Analizar dirección local (IP:Puerto)
        const localParts = parts[3].split(':');
        const localPort = parseInt(localParts.pop() || '0', 10);
        const localAddress = localParts.join(':');
        
        // Analizar dirección remota (IP:Puerto)
        const remoteParts = parts[4].split(':');
        const remotePort = parseInt(remoteParts.pop() || '0', 10);
        const remoteAddress = remoteParts.join(':');
        
        // Estado (puede no estar presente en UDP)
        const state = protocol === 'tcp' ? parts[5] : '';
        
        // Extraer información del proceso (pid/nombre)
        let processId: number | undefined;
        let processName: string | undefined;
        
        if (parts.length >= 7) {
          const processPart = parts[6];
          const procMatch = processPart.match(/(\d+)\/([^/]+)/);
          
          if (procMatch) {
            processId = parseInt(procMatch[1], 10);
            processName = procMatch[2];
          }
        }
        
        connections.push({
          protocol,
          state,
          localAddress,
          localPort,
          remoteAddress,
          remotePort,
          processId,
          processName,
          established: new Date()
        });
      }
    }
    
    return connections;
  }
  
  /**
   * Escanea el sistema de archivos en busca de archivos sospechosos
   */
  protected async scanFileSystem(): Promise<void> {
    this.log('info', 'Scanning file system for suspicious files');
    const directoriesToScan = this.linuxConfig.directoriesToScan || [
      '/tmp', '/var/tmp', '/dev/shm', '/home'
    ];
    for (const directory of directoriesToScan) {
      await this.scanDirectory(directory);
    }
  }
  
  /**
   * Escanea un directorio en busca de archivos sospechosos
   */
  private async scanDirectory(directory: string, depth: number = 0): Promise<void> {
    // Limitar profundidad de escaneo para evitar recursión excesiva
    if (depth > 3) return;
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // Escanear subdirectorios recursivamente
            await this.scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Verificar si el archivo es sospechoso
            if (await this.isSuspiciousFile(fullPath, entry.name)) {
              // Crear evento de archivo sospechoso
              const event: Monitoring.FileEvent = {
                path: fullPath,
                action: 'create', // Asumimos detección inicial
                timestamp: new Date()
              };
              
              // Crear evento directamente en vez de usar función helper para evitar problemas de tipo
              await this.queueEvent({
                eventType: 'file',
                severity: 'high',
                timestamp: new Date(),
                message: `Suspicious file detected: ${fullPath}`,
                details: {
                  file: event
                }
              });
            }
          }
        } catch (error) {
          // Ignorar errores de permisos o archivos que desaparecen
          console.debug(`Error scanning ${fullPath}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${directory}:`, error);
    }
  }
  
  /**
   * Verifica si un archivo es sospechoso basado en nombre y permisos
   */
  private async isSuspiciousFile(filePath: string, fileName: string): Promise<boolean> {
    // Extensiones sospechosas
    const suspiciousExtensions = [
      '.sh', '.py', '.rb', '.pl', '.php', '.exe', '.bin', '.elf'
    ];
    
    // Verificar extensión
    if (suspiciousExtensions.some(ext => fileName.endsWith(ext))) {
      // Verificar permisos (archivos ejecutables)
      try {
        const stats = await fs.stat(filePath);
        
        // Verificar si el archivo tiene permisos de ejecución (mode & 0o111)
        if (stats.mode & 0o111) {
          // Verificar ubicación
          if (filePath.startsWith('/tmp/') || 
              filePath.startsWith('/var/tmp/') || 
              filePath.startsWith('/dev/shm/')) {
            return true;
          }
          
          // Verificar tamaño sospechosamente pequeño para un binario
          if ((fileName.endsWith('.bin') || fileName.endsWith('.elf') || fileName.endsWith('.exe')) && 
              stats.size < 10000) {
            return true;
          }
        }
      } catch (error) {
        // Ignorar errores de acceso
      }
    }
    
    // Nombres sospechosos
    const suspiciousNames = [
      'backdoor', 'hack', 'rootkit', 'exploit', 'miner', 'crypto',
      'scan', 'crack', 'trojan', 'virus', 'malware', 'payload'
    ];
    
    if (suspiciousNames.some(name => fileName.toLowerCase().includes(name))) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Escanea procesos en ejecución
   * En la implementación de Linux, esto es redundante con checkProcesses
   * pero lo mantenemos para compatibilidad con la interfaz AgentBase
   */
  protected async scanProcesses(): Promise<void> {
    await this.checkProcesses();
  }
  
  /**
   * Escanea conexiones de red
   * En la implementación de Linux, esto es redundante con checkNetworkConnections
   * pero lo mantenemos para compatibilidad con la interfaz AgentBase
   */
  protected async scanNetworkConnections(): Promise<void> {
    await this.checkNetworkConnections();
  }
  
  /**
   * Escanea el registro (no aplicable en Linux)
   */
  protected async scanRegistry(): Promise<void> {
    // No hay registro al estilo Windows en Linux
    // Esta función existe sólo para compatibilidad con la interfaz
    return;
  }
  
  /**
   * Escanea para detectar malware
   * Implementación simplificada sin uso de motor antivirus
   */
  protected async scanForMalware(): Promise<void> {
    console.log('Scanning for malware (simplified implementation)');
    
    // En una implementación real, se utilizaría ClamAV u otro motor antivirus
    // Esta es una versión simplificada que busca scripts y binarios sospechosos
    
    // Directorios a escanear
    const suspiciousDirectories = [
      '/tmp', '/var/tmp', '/dev/shm', '/var/www/html', '/home'
    ];
    
    for (const directory of suspiciousDirectories) {
      await this.scanDirectoryForMalware(directory);
    }
  }
  
  /**
   * Escanea un directorio en busca de malware
   */
  private async scanDirectoryForMalware(directory: string, depth: number = 0): Promise<void> {
    // Limitar profundidad para evitar recursión excesiva
    if (depth > 2) return;
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // Escanear subdirectorios recursivamente
            await this.scanDirectoryForMalware(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Comprobar si es un archivo sospechoso
            if (await this.isPotentialMalware(fullPath)) {
              // Simular detección de malware
              const malwareDetection: Monitoring.MalwareDetection = {
                filePath: fullPath,
                fileHash: await this.getFileHash(fullPath) || 'unknown',
                malwareName: 'Suspicious Script or Binary',
                confidence: 0.7,
                quarantined: false
              };
              
              // Crear evento directamente en vez de usar función helper para evitar problemas de tipo
              await this.queueEvent({
                eventType: 'malware',
                severity: 'critical',
                timestamp: new Date(),
                message: `Possible malware detected: ${malwareDetection.malwareName} in ${malwareDetection.filePath}`,
                details: {
                  detection: malwareDetection,
                  confidence: malwareDetection.confidence
                }
              });
            }
          }
        } catch (error) {
          // Ignorar errores de permisos
        }
      }
    } catch (error) {
      console.error(`Error scanning directory for malware ${directory}:`, error);
    }
  }
  
  /**
   * Verifica si un archivo es potencialmente malware
   */
  private async isPotentialMalware(filePath: string): Promise<boolean> {
    try {
      const fileName = path.basename(filePath).toLowerCase();
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        this.log('debug', `No se pudo acceder a ${filePath}:`, error);
        return false;
      }
      
      // Archivos ejecutables en ubicaciones temporales
      if ((stats.mode & 0o111) && (
          filePath.startsWith('/tmp/') || 
          filePath.startsWith('/var/tmp/') || 
          filePath.startsWith('/dev/shm/')
      )) {
        return true;
      }
      
      // Scripts con contenido sospechoso
      if (fileName.endsWith('.sh') || fileName.endsWith('.py') || 
          fileName.endsWith('.pl') || fileName.endsWith('.rb')) {
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Patrones sospechosos
        const suspiciousPatterns = [
          'wget http', 'curl http', 'base64 -d', '| bash',
          'nc -e', 'netcat -e', '/dev/tcp/', 'eval $(',
          'chmod +x', 'socat', 'reverse shell', 'backdoor',
          'miner', 'crypto', 'exploit'
        ];
        
        if (suspiciousPatterns.some(pattern => content.includes(pattern))) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.log('debug', `Error analizando posible malware en ${filePath}:`, error);
      return false;
    }
  }
  
  /**
   * Obtiene el hash de un archivo
   */
  private async getFileHash(filePath: string): Promise<string | null> {
    try {
      // TODO: Integrar cálculo real de hash SHA-256
      return 'calculated_file_hash_would_go_here';
    } catch (error) {
      this.log('debug', `Error calculando hash de ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Escanea vulnerabilidades en el sistema
   */
  protected async scanForVulnerabilities(): Promise<void> {
    console.log('Scanning for vulnerabilities (simplified implementation)');
    
    // En una implementación real, se utilizaría una base de datos de CVEs
    // Esta es una versión simplificada que solo busca algunos paquetes conocidos
    
    try {
      // Comprobar versiones de paquetes comúnmente vulnerables
      await this.checkVulnerablePackage('openssl');
      await this.checkVulnerablePackage('bash');
      await this.checkVulnerablePackage('openssh-server');
      await this.checkVulnerablePackage('apache2');
      await this.checkVulnerablePackage('nginx');
    } catch (error) {
      console.error('Error scanning for vulnerabilities:', error);
    }
  }
  
  /**
   * Comprueba si un paquete instalado tiene vulnerabilidades conocidas
   */
  private async checkVulnerablePackage(packageName: string): Promise<void> {
    try {
      // Intentar obtener la versión del paquete
      const versionCommand = `dpkg-query -W -f='\${Version}' ${packageName} 2>/dev/null || rpm -q --qf '%{VERSION}' ${packageName} 2>/dev/null`;
      const { stdout } = await exec(versionCommand);
      
      const version = stdout.trim();
      
      if (!version || version.includes('not installed')) {
        return;
      }
      
      // Lista simulada de versiones vulnerables
      // En una implementación real, esto vendría de una base de datos de CVEs
      const vulnerableVersions = {
        'openssl': [
          { version: '1.0.1', cve: 'CVE-2014-0160', name: 'Heartbleed' },
          { version: '1.0.2', cve: 'CVE-2016-0800', name: 'DROWN' }
        ],
        'bash': [
          { version: '4.3', cve: 'CVE-2014-6271', name: 'Shellshock' }
        ],
        'openssh-server': [
          { version: '7.2', cve: 'CVE-2016-6210', name: 'User enumeration' }
        ],
        'apache2': [
          { version: '2.4.0', cve: 'CVE-2021-44790', name: 'Buffer overflow' }
        ],
        'nginx': [
          { version: '1.13', cve: 'CVE-2017-7529', name: 'Integer overflow' }
        ]
      };
      
      // Comprobar si el paquete tiene una versión vulnerable
      const packageVulnerabilities = vulnerableVersions[packageName as keyof typeof vulnerableVersions] || [];
      
      for (const vulnerability of packageVulnerabilities) {
        if (version.startsWith(vulnerability.version)) {
          // Vulnerabilidad detectada
          const vulnerabilityInfo: Monitoring.VulnerabilityDetection = {
            softwareName: packageName,
            version: version,
            cveId: vulnerability.cve,
            severity: 'high',
            description: `${vulnerability.name} vulnerability in ${packageName}`,
            fixAvailable: true,
            fixVersion: `${vulnerability.version}.latest`
          };
          
          // Crear evento directamente en vez de usar función helper para evitar problemas de tipo
          await this.queueEvent({
            eventType: 'vulnerability',
            severity: 'high',
            timestamp: new Date(),
            message: `Vulnerability detected in ${vulnerabilityInfo.softwareName}: ${vulnerabilityInfo.cveId}`,
            details: {
              vulnerability: vulnerabilityInfo,
              cveId: vulnerabilityInfo.cveId,
              packageName: vulnerabilityInfo.softwareName
            }
          });
        }
      }
    } catch (error) {
      // Ignorar errores, probablemente el paquete no está instalado
    }
  }
  
  // Logging según nivel
  private log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = this.linuxConfig.logLevel || 'info';
    if (levels[level] >= levels[configLevel as keyof typeof levels]) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](...args);
    }
  }
  
  // Sobrescribir initialize para cargar config extendida
  async initialize(): Promise<boolean> {
    this.linuxConfig = await loadConfig(this.config.configPath);
    this.config = this.linuxConfig;
    await super.initialize();
    return true;
  }
}