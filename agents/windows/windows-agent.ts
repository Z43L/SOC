/**
 * Implementación del agente para Windows
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';
import { promisify } from 'util';
import { AgentBase } from '../common/agent-base';
import * as Monitoring from '../common/monitoring';
import { loadConfig, DEFAULT_CONFIG, AgentConfig } from '../common/agent-config';

// Convertir exec a Promise
const exec = promisify(childProcess.exec);

/**
 * Agente específico para sistemas Windows
 */
import { Collector } from '../collectors/index';
import { initializeCollectors, stopCollectors } from './collectors-manager';

export class WindowsAgent extends AgentBase {
  // Monitores activos
  private fileWatcher: any = null;
  private processWatcher: NodeJS.Timeout | null = null;
  private networkWatcher: NodeJS.Timeout | null = null;
  private registryWatcher: NodeJS.Timeout | null = null;
  
  // Colectores del nuevo sistema
  private activeCollectors: Collector[] = [];
  
  // Cache de información para detectar cambios
  private lastProcessList: Map<number, Monitoring.ProcessInfo> = new Map();
  private lastNetworkConnections: Map<string, Monitoring.NetworkConnection> = new Map();
  private lastRegistryKeys: Map<string, string> = new Map();
  
  // Claves de registro a monitorear por defecto
  private registryKeysToMonitor = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    'HKLM\\SYSTEM\\CurrentControlSet\\Services',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  ];
  
  // Directorios sospechosos a monitorear
  private suspiciousDirectories = [
    'C:\\Windows\\Temp',
    'C:\\Temp',
    'C:\\Users\\Public',
    os.tmpdir()
  ];
  
  private winConfig: AgentConfig;
  
  constructor(configPath: string) {
    super(configPath);
    this.winConfig = {
      ...DEFAULT_CONFIG,
      configPath
    };
  }
  
  /**
   * Obtiene información básica del sistema Windows
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
    for (const [, interfaces] of Object.entries(networkInterfaces)) {
      if (!interfaces) continue;
      
      for (const iface of interfaces) {
        if (!iface.internal && iface.family === 'IPv4') {
          ip = iface.address;
          break;
        }
      }
      
      if (ip !== '127.0.0.1') break;
    }
    
    // Obtener información de la versión de Windows
    let osInfo = 'Windows';
    let version = os.release();
    
    try {
      const { stdout } = await exec('wmic os get Caption,Version /value');
      
      const captionMatch = stdout.match(/Caption=([^\r\n]+)/);
      const versionMatch = stdout.match(/Version=([^\r\n]+)/);
      
      if (captionMatch && captionMatch[1]) {
        osInfo = captionMatch[1].trim();
      }
      
      if (versionMatch && versionMatch[1]) {
        version = versionMatch[1].trim();
      }
    } catch (error) {
      console.error('Error obteniendo información detallada del sistema:', error);
    }
    
    return {
      hostname,
      ip,
      os: osInfo,
      version
    };
  }
  
  /**
   * Obtiene métricas del sistema en tiempo real
   */
  protected async getSystemMetrics(): Promise<Monitoring.SystemMetrics> {
    try {
      // Uso de CPU (Windows)
      let cpuUsage = 0;
      try {
        const { stdout: cpuOut } = await exec('wmic cpu get LoadPercentage /value');
        const cpuMatch = cpuOut.match(/LoadPercentage=(\d+)/);
        if (cpuMatch && cpuMatch[1]) {
          cpuUsage = parseInt(cpuMatch[1], 10);
        }
      } catch (error) {
        console.error('Error obteniendo uso de CPU:', error);
      }
      
      // Uso de memoria
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      // Uso de disco
      let diskUsage = 0;
      try {
        // Obtener uso del disco C:
        const { stdout: diskOut } = await exec('wmic logicaldisk where DeviceID="C:" get FreeSpace,Size /value');
        const freeMatch = diskOut.match(/FreeSpace=(\d+)/);
        const sizeMatch = diskOut.match(/Size=(\d+)/);
        
        if (freeMatch && freeMatch[1] && sizeMatch && sizeMatch[1]) {
          const freeSpace = parseInt(freeMatch[1], 10);
          const totalSize = parseInt(sizeMatch[1], 10);
          
          if (totalSize > 0) {
            diskUsage = Math.round(((totalSize - freeSpace) / totalSize) * 100);
          }
        }
      } catch (error) {
        console.error('Error obteniendo uso de disco:', error);
      }
      
      // Procesos en ejecución
      let processCount = 0;
      try {
        const { stdout: processOut } = await exec('wmic process get ProcessId /value');
        const matches = processOut.matchAll(/ProcessId=(\d+)/g);
        processCount = Array.from(matches).length;
      } catch (error) {
        console.error('Error contando procesos:', error);
      }
      
      // Conexiones de red activas
      let networkConnections = 0;
      try {
        const { stdout: netOut } = await exec('netstat -ano');
        const lines = netOut.split('\n');
        // Contar líneas no vacías que empiezan con TCP o UDP
        networkConnections = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('TCP') || trimmed.startsWith('UDP');
        }).length;
      } catch (error) {
        console.error('Error contando conexiones de red:', error);
      }
      
      // Uptime en segundos
      const uptime = os.uptime();
      
      return {
        timestamp: new Date(),
        cpuUsage,
        memoryUsage,
        diskUsage,
        uptime,
        processCount,
        networkConnections
      };
    } catch (error) {
      console.error('Error obteniendo métricas del sistema:', error);
      
      // Devolver métricas básicas en caso de error
      return {
        timestamp: new Date(),
        cpuUsage: 0,
        memoryUsage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
        diskUsage: 0,
        uptime: os.uptime(),
        processCount: 0,
        networkConnections: 0
      };
    }
  }
  
  /**
   * Inicia los monitores específicos de Windows
   */
  protected async startMonitoring(): Promise<void> {
    console.log('Iniciando monitoreo específico de Windows...');
    
    // Iniciar el nuevo sistema de colectores
    try {
      this.activeCollectors = await initializeCollectors((event) => {
        this.handleCollectorEvent(event);
      });
    } catch (error) {
      console.error('Error al iniciar colectores:', error);
    }
    
    // Iniciar monitoreo de procesos
    if (this.config.capabilities.processMonitoring) {
      console.log('Iniciando monitoreo de procesos');
      // Ejecutar comprobación inicial
      await this.checkProcesses();
      
      // Configurar comprobación periódica
      this.processWatcher = setInterval(() => {
        this.checkProcesses().catch(error => {
          console.error('Error en monitoreo de procesos:', error);
        });
      }, 60000); // Comprobar cada minuto
    }
    
    // Iniciar monitoreo de red
    if (this.config.capabilities.networkMonitoring) {
      console.log('Iniciando monitoreo de red');
      // Ejecutar comprobación inicial
      await this.checkNetworkConnections();
      
      // Configurar comprobación periódica
      this.networkWatcher = setInterval(() => {
        this.checkNetworkConnections().catch(error => {
          console.error('Error en monitoreo de red:', error);
        });
      }, 60000); // Comprobar cada minuto
    }
    
    // Iniciar monitoreo de registro
    if (this.config.capabilities.registryMonitoring) {
      console.log('Iniciando monitoreo de registro de Windows');
      // Ejecutar comprobación inicial
      await this.checkRegistry();
      
      // Configurar comprobación periódica
      this.registryWatcher = setInterval(() => {
        this.checkRegistry().catch(error => {
          console.error('Error en monitoreo de registro:', error);
        });
      }, 300000); // Comprobar cada 5 minutos
    }
    
    console.log('Monitoreo de Windows iniciado correctamente');
  }
  
  /**
   * Detiene los monitores específicos de Windows
   */
  protected async stopMonitoring(): Promise<void> {
    console.log('Deteniendo monitoreo específico de Windows...');
    
    // Detener los colectores del nuevo sistema
    if (this.activeCollectors.length > 0) {
      await stopCollectors(this.activeCollectors);
      this.activeCollectors = [];
    }
    
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
    
    // Detener monitoreo de registro
    if (this.registryWatcher) {
      clearInterval(this.registryWatcher);
      this.registryWatcher = null;
    }
    
    console.log('Monitoreo de Windows detenido correctamente');
  }
  
  /**
   * Procesa eventos recibidos de los colectores
   */
  private async handleCollectorEvent(event: any): Promise<void> {
    try {
      if (!event || !event.source) {
        return;
      }
      
      // Convertir el evento del colector al formato esperado por el agente
      const agentEvent = {
        eventType: event.type || event.source,
        severity: event.severity || 'info',
        timestamp: event.timestamp || new Date(),
        message: event.message || `Evento de ${event.source}`,
        details: event.details || {}
      };
      
      // Encolar el evento para su envío
      await this.queueEvent(agentEvent);
    } catch (error) {
      console.error('Error procesando evento de colector:', error);
    }
  }
  
  /**
   * Verifica procesos en ejecución y detecta cambios
   */
  private async checkProcesses(): Promise<void> {
    try {
      // Obtener lista de procesos con PowerShell para obtener más detalles
      const { stdout } = await exec(
        'powershell -Command "Get-Process | Select-Object Id, ProcessName, Path, Company, Description, CPU | ConvertTo-Csv -NoTypeInformation"'
      );
      
      // Parsear la salida CSV
      const lines = stdout.split('\n').map(line => line.trim());
      const currentProcesses = new Map<number, Monitoring.ProcessInfo>();
      
      // Saltar la primera línea (cabecera)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const fields = this.parseCsvLine(line);
        if (fields.length >= 2) {
          const pid = parseInt(fields[0].replace(/"/g, ''), 10);
          if (isNaN(pid)) continue;
          const processName = fields[1].replace(/"/g, '');
          const path = fields[2]?.replace(/"/g, '') || '';
          const company = fields[3]?.replace(/"/g, '') || '';
          const description = fields[4]?.replace(/"/g, '') || '';
          currentProcesses.set(pid, {
            pid,
            name: processName,
            path,
            user: '',
            cmdline: '',
            cpuUsage: 0,
            memoryUsage: 0,
            company,
            description,
            startTime: new Date(),
            status: ''
          });
        }
      }
      
      // Detectar procesos nuevos
      for (const [pid, processInfo] of currentProcesses.entries()) {
        if (!this.lastProcessList.has(pid)) {
          // Proceso nuevo detectado
          console.log(`Nuevo proceso detectado: ${processInfo.name} (PID: ${pid})`);
          
          // Verificar si es un proceso sospechoso
          if (await this.isSuspiciousProcess(processInfo)) {
            console.log(`¡Proceso sospechoso detectado! ${processInfo.name} (PID: ${pid})`);
            
            // Crear evento
            await this.queueEvent({
              eventType: 'process',
              severity: 'high',
              timestamp: new Date(),
              message: `Suspicious process detected: ${processInfo.name} (PID: ${pid})`,
              details: {
                process: processInfo,
                reason: 'Suspicious process pattern'
              }
            });
          }
        }
      }
      
      // Detectar procesos terminados
      for (const [pid, processInfo] of this.lastProcessList.entries()) {
        if (!currentProcesses.has(pid)) {
          // Proceso terminado
          console.log(`Proceso terminado: ${processInfo.name} (PID: ${pid})`);
        }
      }
      
      // Actualizar la lista para la siguiente comprobación
      this.lastProcessList = currentProcesses;
    } catch (error) {
      console.error('Error checking processes:', error);
    }
  }
  
  /**
   * Verifica si un proceso es sospechoso basado en patrones conocidos
   */
  private async isSuspiciousProcess(process: Monitoring.ProcessInfo): Promise<boolean> {
    // Nombres de procesos sospechosos
    const suspiciousNames = [
      'mimikatz', 'psexec', 'procdump', 'pwdump', 'gsecdump', 'wceservice',
      'lsassdump', 'ntdsdump', 'fgdump', 'cachedump', 'quarks', 'pwdumpx',
      'wce', 'dump', 'hack', 'crack', 'exploit', 'payload'
    ];
    
    // Nombres de compañías sospechosas
    const suspiciousCompanies = [
      'N/A', 'Unknown', 'Not trusted'
    ];
    
    // Verificar por nombre
    if (suspiciousNames.some(name => process.name.toLowerCase().includes(name))) {
      return true;
    }
    
    // Verificar ubicación sospechosa
    if (process.path) {
      const lowerPath = process.path.toLowerCase();
      if (this.suspiciousDirectories.some(dir => lowerPath.startsWith(dir.toLowerCase()))) {
        return true;
      }
      
      // Ejecutables en directorios temporales
      if (lowerPath.includes('\\temp\\') || lowerPath.includes('\\tmp\\') || lowerPath.includes('\\downloads\\')) {
        if (lowerPath.endsWith('.exe') || lowerPath.endsWith('.dll') || lowerPath.endsWith('.bat') ||
            lowerPath.endsWith('.ps1') || lowerPath.endsWith('.vbs')) {
          return true;
        }
      }
    }
    
    // Verificar compañía desconocida en un proceso con acceso a red
    if (
      suspiciousCompanies.includes(process.company || '') &&
      process.path &&
      process.path.toLowerCase().includes('\\windows\\') === false
    ) {
      // Ejecutables que no están en Windows pero sin compañía verificada son sospechosos
      return true;
    }
    
    return false;
  }
  
  /**
   * Verifica conexiones de red y detecta cambios
   */
  private async checkNetworkConnections(): Promise<void> {
    try {
      // Obtener conexiones de red con netstat
      const { stdout } = await exec('netstat -ano');
      
      const lines = stdout.split('\n');
      const currentConnections = new Map<string, Monitoring.NetworkConnection>();
      
      // Procesar cada línea de netstat
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Saltar líneas que no son conexiones
        if (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP')) {
          continue;
        }
        
        // Parsear la información
        const parts = trimmed.split(/\s+/);
        if (parts.length < 4) continue;
        
        const protocol = parts[0];
        const localAddress = parts[1];
        const remoteAddress = parts[2];
        const state = protocol === 'TCP' ? parts[3] : 'STATELESS';
        const pid = protocol === 'TCP' ? parseInt(parts[4], 10) : parseInt(parts[3], 10);
        
        // Crear identificador único para esta conexión
        const id = `${protocol}:${localAddress}:${remoteAddress}`;
        
        // Extraer IP y puerto de las direcciones
        const localParts = localAddress.split(':');
        const remoteParts = remoteAddress.split(':');
        
        const localIp = localParts.slice(0, -1).join(':') || '0.0.0.0';
        const localPort = parseInt(localParts[localParts.length - 1], 10);
        
        const remoteIp = remoteParts.slice(0, -1).join(':') || '0.0.0.0';
        const remotePort = parseInt(remoteParts[remoteParts.length - 1], 10);
        
        // Obtener nombre del proceso
        let processName = 'Unknown';
        try {
          const processInfo = this.lastProcessList.get(pid);
          if (processInfo) {
            processName = processInfo.name;
          }
        } catch (error) {
          // Ignorar errores al obtener el nombre del proceso
        }
        
        // Crear objeto de conexión
        const connection: Monitoring.NetworkConnection = {
          protocol,
          localIp,
          localPort,
          remoteIp,
          remotePort,
          state,
          pid,
          processName
        };
        
        currentConnections.set(id, connection);
        
        // Detectar nuevas conexiones que no estaban en la lista anterior
        if (!this.lastNetworkConnections.has(id)) {
          // Verificar si es una conexión sospechosa
          if (await this.isSuspiciousConnection(connection)) {
            console.log(`¡Conexión de red sospechosa detectada! ${processName} (${protocol} ${localIp}:${localPort} -> ${remoteIp}:${remotePort})`);
            
            // Crear evento
            await this.queueEvent({
              eventType: 'network',
              severity: 'medium',
              timestamp: new Date(),
              message: `Suspicious network connection: ${processName} (${protocol} ${localIp}:${localPort} -> ${remoteIp}:${remotePort})`,
              details: {
                connection,
                reason: 'Suspicious connection pattern'
              }
            });
          }
        }
      }
      
      // Actualizar la lista para la siguiente comprobación
      this.lastNetworkConnections = currentConnections;
    } catch (error) {
      console.error('Error checking network connections:', error);
    }
  }
  
  /**
   * Verifica si una conexión de red es sospechosa
   */
  private async isSuspiciousConnection(connection: Monitoring.NetworkConnection): Promise<boolean> {
    // Puertos sospechosos
    const suspiciousPorts = [
      4444, 4445, 5555, 6666, 31337, 9001, 9002, // Metasploit, Cobalt Strike
      1080, 1081, 1082, 1083, 1084, 1085, 3128, 8080, 8081, 8082, // Proxies comunes
      6667, 6668, 6669, 6697 // IRC (usado para C&C)
    ];
    
    // Verificar puertos sospechosos
    if (suspiciousPorts.includes(connection.remotePort)) {
      return true;
    }
    
    // Verificar procesos sospechosos haciendo conexiones
    if (connection.processName.toLowerCase().includes('powershell') && 
        connection.state === 'ESTABLISHED' && 
        connection.remotePort !== 443 && 
        connection.remotePort !== 80) {
      // PowerShell con conexiones fuera de los puertos web estándar
      return true;
    }
    
    // Verificar conexiones a procesos menos comunes
    const uncommonProcesses = ['cmd', 'calc', 'notepad', 'mshta', 'regsvr32', 'wscript', 'cscript'];
    if (uncommonProcesses.some(proc => connection.processName.toLowerCase().includes(proc)) && 
        connection.state === 'ESTABLISHED') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Verifica el registro de Windows en busca de cambios
   */
  private async checkRegistry(): Promise<void> {
    if (!this.config.capabilities.registryMonitoring) {
      return;
    }
    
    try {
      for (const regKey of this.registryKeysToMonitor) {
        // Convertir la clave a formato para PowerShell
        const psRegKey = regKey.replace('HKLM\\', 'HKLM:').replace('HKCU\\', 'HKCU:');
        
        // Obtener valores de la clave
        try {
          const { stdout } = await exec(
            `powershell -Command "Get-ItemProperty -Path '${psRegKey}' | ConvertTo-Json -Compress"`
          );
          
          // Convertir a un string único para comparación
          const regContent = stdout.trim();
          const keyId = regKey;
          
          // Verificar si ha cambiado desde la última comprobación
          if (this.lastRegistryKeys.has(keyId)) {
            const previousContent = this.lastRegistryKeys.get(keyId);
            if (previousContent !== regContent) {
              console.log(`Clave de registro modificada: ${regKey}`);
              
              // Crear evento
              await this.queueEvent({
                eventType: 'registry',
                severity: 'medium',
                timestamp: new Date(),
                message: `Registry key modified: ${regKey}`,
                details: {
                  key: regKey,
                  oldValue: previousContent,
                  newValue: regContent
                }
              });
            }
          }
          
          // Guardar el contenido actual
          this.lastRegistryKeys.set(keyId, regContent);
          
        } catch (error) {
          // Ignorar errores para claves que no existan o no se puedan leer
          console.debug(`No se pudo leer la clave ${regKey}: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error checking registry:', error);
    }
  }
  
  /**
   * Escanea el sistema de archivos en busca de ficheros sospechosos
   */
  protected async scanFileSystem(): Promise<void> {
    this.log('info', 'Scanning file system for suspicious files');
    const directoriesToScan = this.winConfig.directoriesToScan || [
      'C:\\Windows\\Temp', 'C:\\Temp', 'C:\\Users', 'C:\\ProgramData\\Temp'
    ];
    for (const directory of directoriesToScan) {
      await this.scanDirectory(directory);
    }
  }
  
  /**
   * Escanea recursivamente un directorio
   */
  private async scanDirectory(directory: string, depth: number = 0): Promise<void> {
    // Limitar profundidad de recursión
    if (depth > 2) return;
    
    try {
      // Verificar si el directorio existe
      try {
        await fs.access(directory);
      } catch (error) {
        return; // Directorio no existe o no accesible
      }
      
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // Escanear subdirectorios recursivamente
            await this.scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Comprobar si el archivo es sospechoso
            if (await this.isSuspiciousFile(fullPath, entry.name)) {
              // Crear evento para archivo sospechoso
              const event: Monitoring.FileEvent = {
                path: fullPath,
                fileName: entry.name,
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
   * Verifica si un archivo es sospechoso basado en nombre y extensión
   */
  private async isSuspiciousFile(filePath: string, fileName: string): Promise<boolean> {
    // Extensiones sospechosas en Windows
    const suspiciousExtensions = [
      '.exe', '.dll', '.ps1', '.bat', '.vbs', '.js', '.jar',
      '.hta', '.msi', '.wsf', '.scr', '.reg', '.pif'
    ];
    
    // Verificar extensión
    if (suspiciousExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
      try {
        const stats = await fs.stat(filePath);
        
        // Verificar ubicación
        const lowerPath = filePath.toLowerCase();
        if (this.suspiciousDirectories.some(dir => lowerPath.startsWith(dir.toLowerCase()))) {
          // Archivos ejecutables en lugares sospechosos
          return true;
        }
        
        // Verificar tamaño sospechosamente pequeño para un ejecutable
        if ((fileName.endsWith('.exe') || fileName.endsWith('.dll')) && stats.size < 20000) {
          return true;
        }
      } catch (error) {
        // Ignorar errores de acceso
        return false;
      }
    }
    
    // Nombres sospechosos
    const suspiciousNames = [
      'backdoor', 'hack', 'rootkit', 'exploit', 'miner', 'crypto',
      'scan', 'crack', 'trojan', 'virus', 'malware', 'payload',
      'mimikatz', 'psexec', 'netcat', 'ratter', 'keylogger'
    ];
    
    if (suspiciousNames.some(name => fileName.toLowerCase().includes(name))) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Escanea procesos en ejecución
   */
  protected async scanProcesses(): Promise<void> {
    await this.checkProcesses();
  }
  
  /**
   * Escanea conexiones de red
   */
  protected async scanNetworkConnections(): Promise<void> {
    await this.checkNetworkConnections();
  }
  
  /**
   * Escanea el registro de Windows
   */
  protected async scanRegistry(): Promise<void> {
    await this.checkRegistry();
  }
  
  /**
   * Escanea en busca de malware
   */
  protected async scanForMalware(): Promise<void> {
    console.log('Escaneando en busca de malware (implementación simplificada)');
    
    // Directorios a escanear
    const suspiciousDirectories = [
      'C:\\Windows\\Temp',
      'C:\\Temp',
      os.tmpdir(),
      'C:\\Users\\Public\\Documents',
      'C:\\ProgramData\\Temp'
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
      // Verificar si el directorio existe
      try {
        await fs.access(directory);
      } catch (error) {
        return; // Directorio no existe o no accesible
      }
      
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // Escanear subdirectorios recursivamente
            await this.scanDirectoryForMalware(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Comprobar si es un archivo potencialmente malicioso
            if (await this.isPotentialMalware(fullPath)) {
              // Simular detección de malware
              const malwareDetection: Monitoring.MalwareDetection = {
                filePath: fullPath,
                fileHash: await this.getFileHash(fullPath) || 'unknown',
                malwareName: 'Suspicious Windows Executable',
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
          console.debug(`Error scanning ${fullPath}:`, error);
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
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        this.log('debug', `No se pudo acceder a ${filePath}:`, error);
        return false;
      }
      
      // Verificar extensión ejecutable
      if (filePath.endsWith('.exe') || filePath.endsWith('.dll') || 
          filePath.endsWith('.ps1') || filePath.endsWith('.bat') || 
          filePath.endsWith('.vbs') || filePath.endsWith('.scr')) {
        
        // Verificar ubicación
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.includes('\\temp\\') || 
            lowerPath.includes('\\tmp\\') || 
            lowerPath.includes('\\public\\')) {
          return true;
        }
        
        // Verificar tamaño sospechoso
        if (stats.size < 20000 && (filePath.endsWith('.exe') || filePath.endsWith('.dll'))) {
          return true;
        }
        
        // Verificar nombres sospechosos
        const suspiciousNames = [
          'install', 'setup', 'update', 'patch', 'crack', 'keygen',
          'loader', 'activator', 'activador', 'patcher', 'downloader',
          'executor', 'runner', 'exploit', 'backdoor', 'trojan'
        ];
        
        if (suspiciousNames.some(name => filePath.includes(name))) {
          return true;
        }
        
        // Verificar con PowerShell si tiene firma digital inválida
        try {
          const { stdout } = await exec(
            `powershell -Command "Get-AuthenticodeSignature -FilePath '${filePath}' | Format-List Status | Out-String"`
          );
          
          if (stdout.includes('NotSigned') || stdout.includes('HashMismatch') || 
              stdout.includes('NotTrusted') || stdout.includes('Invalid')) {
            // Sin firma o firma inválida en ubicación sospechosa
            if (lowerPath.includes('\\windows\\') === false) {
              return true;
            }
          }
        } catch (error) {
          // Ignorar errores al verificar firma
        }
      }
    } catch (error) {
      this.log('debug', `Error analizando posible malware en ${filePath}:`, error);
      return false;
    }
    
    return false;
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
    console.log('Escaneando vulnerabilidades en Windows (implementación simplificada)');
    
    try {
      // Verificar actualizaciones pendientes de Windows
      await this.checkPendingUpdates();
      
      // Verificar servicios vulnerables
      await this.checkVulnerableServices();
      
      // Verificar software obsoleto
      await this.checkOutdatedSoftware();
    } catch (error) {
      console.error('Error scanning for vulnerabilities:', error);
    }
  }
  
  /**
   * Verifica actualizaciones pendientes de Windows
   */
  private async checkPendingUpdates(): Promise<void> {
    try {
      // Usar PowerShell para verificar actualizaciones pendientes
      const { stdout } = await exec(
        'powershell -Command "Get-WmiObject -Class Win32_QuickFixEngineering | Select-Object HotFixID, Description, InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 5 | ConvertTo-Json"'
      );
      
      // Contar actualizaciones recientes (últimos 90 días)
      const updates = JSON.parse(stdout.trim());
      const today = new Date();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(today.getDate() - 90);
      
      let recentUpdates = 0;
      
      if (Array.isArray(updates)) {
        for (const update of updates) {
          try {
            const installedDate = new Date(update.InstalledOn);
            if (installedDate > ninetyDaysAgo) {
              recentUpdates++;
            }
          } catch (error) {
            // Ignorar errores de fecha
          }
        }
      }
      
      // Si no hay actualizaciones recientes, reportar vulnerabilidad
      if (recentUpdates === 0) {
        const vulnerabilityInfo: Monitoring.VulnerabilityDetection = {
          softwareName: 'Windows',
          version: os.release(),
          cveId: 'MISSING-UPDATES',
          severity: 'high',
          description: 'Missing security updates detected',
          fixAvailable: true,
          fixVersion: 'Latest Windows Update'
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
    } catch (error) {
      console.debug('Error checking Windows updates:', error);
    }
  }
  
  /**
   * Verifica servicios vulnerables conocidos
   */
  private async checkVulnerableServices(): Promise<void> {
    try {
      // Servicios vulnerables conocidos
      const vulnerableServices = [
        { name: 'RemoteRegistry', cve: 'CVE-2020-0605', severity: 'high', description: 'Remote Registry Vulnerability' },
        { name: 'RpcSs', cve: 'CVE-2021-1675', severity: 'critical', description: 'PrintNightmare Vulnerability' },
        { name: 'LanmanServer', cve: 'CVE-2020-0796', severity: 'critical', description: 'SMBGhost Vulnerability' }
      ];
      
      // Verificar servicios activos
      const { stdout } = await exec(
        'powershell -Command "Get-Service | Where-Object {$_.Status -eq \'Running\'} | Select-Object Name | ConvertTo-Json"'
      );
      
      const runningServices = JSON.parse(stdout.trim());
      const runningServiceNames = new Set<string>();
      
      if (Array.isArray(runningServices)) {
        for (const service of runningServices) {
          runningServiceNames.add(service.Name);
        }
      } else if (runningServices && runningServices.Name) {
        // Si solo hay un servicio, es un objeto en lugar de un array
        runningServiceNames.add(runningServices.Name);
      }
      
      // Verificar servicios vulnerables activos
      for (const vulnerable of vulnerableServices) {
        if (runningServiceNames.has(vulnerable.name)) {
          const vulnerabilityInfo: Monitoring.VulnerabilityDetection = {
            softwareName: `Windows Service ${vulnerable.name}`,
            version: os.release(),
            cveId: vulnerable.cve,
            severity: vulnerable.severity as 'high' | 'medium' | 'low' | 'critical',
            description: vulnerable.description,
            fixAvailable: true,
            fixVersion: 'Latest Windows Update'
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
      console.debug('Error checking vulnerable services:', error);
    }
  }
  
  /**
   * Verifica software obsoleto
   */
  private async checkOutdatedSoftware(): Promise<void> {
    try {
      // Lista de software vulnerable conocido
      const vulnerableSoftware = [
        { name: 'Java', version: '8.0.', cve: 'CVE-2022-21449', severity: 'high', description: 'Java vulnerability' },
        { name: 'Adobe Reader', version: '2020.', cve: 'CVE-2021-28550', severity: 'high', description: 'Adobe Reader vulnerability' },
        { name: 'VLC', version: '3.0.11', cve: 'CVE-2021-5912', severity: 'medium', description: 'VLC media player vulnerability' }
      ];
      
      // Obtener software instalado
      const { stdout } = await exec(
        'powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion | ConvertTo-Json"'
      );
      
      const installedSoftware = JSON.parse(stdout.trim());
      
      if (Array.isArray(installedSoftware)) {
        for (const software of installedSoftware) {
          if (!software.DisplayName || !software.DisplayVersion) continue;
          
          // Verificar si el software instalado coincide con alguno de los vulnerables
          for (const vulnerable of vulnerableSoftware) {
            if (software.DisplayName.includes(vulnerable.name) && 
                software.DisplayVersion.includes(vulnerable.version)) {
              
              const vulnerabilityInfo: Monitoring.VulnerabilityDetection = {
                softwareName: software.DisplayName,
                version: software.DisplayVersion,
                cveId: vulnerable.cve,
                severity: vulnerable.severity as 'high' | 'medium' | 'low' | 'critical',
                description: vulnerable.description,
                fixAvailable: true,
                fixVersion: 'Latest Version'
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
        }
      }
    } catch (error) {
      console.debug('Error checking outdated software:', error);
    }
  }
  
  /**
   * Inicializa el agente y carga la configuración
   */
  async initialize(): Promise<boolean> {
    this.winConfig = await loadConfig(this.config.configPath);
    this.config = this.winConfig;
    await super.initialize();
    return true;
  }
  
  /**
   * Registra un mensaje en el log del agente
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = this.winConfig.logLevel || 'info';
    if (levels[level] >= levels[configLevel]) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](...args);
    }
  }
  
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field);
    return fields;
  }
}