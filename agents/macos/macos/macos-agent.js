"use strict";
/**
 * Implementación del agente para macOS
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacOSAgent = void 0;
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const childProcess = require("child_process");
const util_1 = require("util");
const agent_base_1 = require("../common/agent-base");
// Convertir exec a Promise
const exec = (0, util_1.promisify)(childProcess.exec);
/**
 * Agente específico para sistemas macOS
 */
class MacOSAgent extends agent_base_1.AgentBase {
    constructor(configPath) {
        super(configPath);
        // Monitores activos
        this.fileWatcher = null;
        this.processWatcher = null;
        this.networkWatcher = null;
        // Cache de información para detectar cambios
        this.lastProcessList = new Map();
        this.lastNetworkConnections = new Map();
        // Directorios sospechosos a monitorear
        this.suspiciousDirectories = [
            '/tmp',
            '/var/tmp',
            '/Library/LaunchAgents',
            '/Library/LaunchDaemons',
            '~/Library/LaunchAgents',
            os.tmpdir()
        ];
    }
    /**
     * Obtiene información básica del sistema macOS
     */
    async getSystemInfo() {
        // Obtener hostname del sistema
        const hostname = os.hostname();
        // Obtener dirección IP principal
        const networkInterfaces = os.networkInterfaces();
        let ip = '127.0.0.1';
        // Buscar la primera interfaz no interna con IPv4
        for (const [, interfaces] of Object.entries(networkInterfaces)) {
            if (!interfaces)
                continue;
            for (const iface of interfaces) {
                if (!iface.internal && iface.family === 'IPv4') {
                    ip = iface.address;
                    break;
                }
            }
            if (ip !== '127.0.0.1')
                break;
        }
        // Obtener información detallada del sistema macOS
        let osInfo = 'macOS';
        let version = os.release();
        try {
            // Usar sw_vers para obtener la versión exacta de macOS
            const { stdout: productVersion } = await exec('sw_vers -productVersion');
            const { stdout: buildVersion } = await exec('sw_vers -buildVersion');
            const { stdout: productName } = await exec('sw_vers -productName');
            osInfo = productName.trim();
            version = `${productVersion.trim()} (${buildVersion.trim()})`;
        }
        catch (error) {
            console.error('Error getting detailed macOS version (sw_vers):', error);
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
    async getSystemMetrics() {
        try {
            // Uso de CPU
            let cpuUsage = 0;
            try {
                // Obtener uso de CPU con top en modo batch
                const { stdout } = await exec('top -l 1 -n 0 | grep "CPU usage"');
                const match = stdout.match(/(\d+\.\d+)%\s+user,\s+(\d+\.\d+)%\s+sys,\s+(\d+\.\d+)%\s+idle/);
                if (match) {
                    const userPercent = parseFloat(match[1]);
                    const sysPercent = parseFloat(match[2]);
                    cpuUsage = Math.round(userPercent + sysPercent);
                }
            }
            catch (error) {
                console.error('Error getting CPU usage (top):', error);
            }
            // Uso de memoria
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
            // Uso de disco
            let diskUsage = 0;
            try {
                // Obtener uso del disco raíz
                const { stdout } = await exec('df -h / | tail -1');
                const match = stdout.match(/(\d+)%/);
                if (match) {
                    diskUsage = parseInt(match[1], 10);
                }
            }
            catch (error) {
                console.error('Error getting disk usage (df):', error);
            }
            // Procesos en ejecución
            let processCount = 0;
            try {
                const { stdout } = await exec('ps -A | wc -l');
                processCount = parseInt(stdout.trim(), 10);
            }
            catch (error) {
                console.error('Error counting processes (ps):', error);
            }
            // Conexiones de red activas
            let networkConnections = 0;
            try {
                const { stdout } = await exec('netstat -an | grep -E "tcp4|udp4" | wc -l');
                networkConnections = parseInt(stdout.trim(), 10);
            }
            catch (error) {
                console.error('Error counting network connections (netstat):', error);
            }
            // Uptime en segundos
            const uptime = os.uptime();
            return {
                timestamp: new Date(),
                cpuUsage,
                memoryUsage,
                diskUsage,
                networkIn: networkConnections,
                networkOut: 0,
                runningProcesses: processCount
            };
        }
        catch (error) {
            console.error('Error getting system metrics:', error);
            // Devolver métricas básicas en caso de error
            return {
                timestamp: new Date(),
                cpuUsage: 0,
                memoryUsage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
                diskUsage: 0,
                networkIn: 0,
                networkOut: 0,
                runningProcesses: 0
            };
        }
    }
    /**
     * Inicia los monitores específicos de macOS
     */
    async startMonitoring() {
        console.log('Iniciando monitoreo específico de macOS...');
        // Iniciar monitoreo de procesos
        if (this.config.capabilities.processMonitoring) {
            console.log('Iniciando monitoreo de procesos');
            // Ejecutar comprobación inicial
            await this.checkProcesses();
            // Configurar comprobación periódica
            this.processWatcher = setInterval(() => {
                this.checkProcesses().catch(error => {
                    console.error('Error in process monitoring:', error);
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
                    console.error('Error in network monitoring:', error);
                });
            }, 60000); // Comprobar cada minuto
        }
        console.log('Monitoreo de macOS iniciado correctamente');
    }
    /**
     * Detiene los monitores específicos de macOS
     */
    async stopMonitoring() {
        console.log('Deteniendo monitoreo específico de macOS...');
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
        console.log('Monitoreo de macOS detenido correctamente');
    }
    /**
     * Verifica procesos en ejecución y detecta cambios
     */
    async checkProcesses() {
        try {
            // Obtener lista de procesos con ps
            const { stdout } = await exec('ps -eo pid,user,command -c');
            const lines = stdout.split('\n');
            const currentProcesses = new Map();
            // Saltar la primera línea (cabecera)
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line)
                    continue;
                // Separar los componentes
                const parts = line.split(/\s+/);
                if (parts.length < 3)
                    continue;
                const pid = parseInt(parts[0], 10);
                if (isNaN(pid))
                    continue;
                const user = parts[1];
                const command = parts.slice(2).join(' ');
                const cmdPath = command.split(' ')[0];
                // Obtener nombre base del proceso
                const processName = path.basename(cmdPath);
                // Crear objeto de información del proceso
                currentProcesses.set(pid, {
                    pid,
                    name: processName,
                    path: cmdPath,
                    command,
                    user,
                    cpuUsage: 0,
                    memoryUsage: 0,
                    startTime: new Date(),
                    status: ''
                });
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
        }
        catch (error) {
            console.error('Error checking running processes:', error);
        }
    }
    /**
     * Verifica si un proceso es sospechoso basado en patrones conocidos
     */
    async isSuspiciousProcess(process) {
        // Nombres de procesos sospechosos
        const suspiciousNames = [
            'ncat', 'netcat', 'nc', 'meterpreter', 'msfvenom', 'python', 'perl',
            'bash', 'sh', 'zsh', 'ruby', 'osascript', 'socat', 'tcpdump',
            'wireshark', 'backdoor', 'payload', 'exploit'
        ];
        // Verificar por nombre (solo si se ejecuta en contexto privilegiado o por usuario no root)
        if (process.user === 'root' &&
            suspiciousNames.some(name => process.name.toLowerCase() === name.toLowerCase())) {
            return true;
        }
        // Verificar patrones sospechosos en la línea de comando
        const suspiciousPatterns = [
            'nc -l', 'nc -e', 'netcat -l', 'python -m SimpleHTTPServer',
            'python -m http.server', 'bash -i', '/dev/tcp/', 'reverse shell',
            'curl | bash', 'wget | bash', 'curl | sh', 'wget | sh',
            'base64 -d', 'base64.*\\|.*bash'
        ];
        for (const pattern of suspiciousPatterns) {
            const cmd = process.command ?? '';
            if (cmd.includes(pattern) || new RegExp(pattern).test(cmd)) {
                return true;
            }
        }
        // Verificar ubicación sospechosa
        if (process.path) {
            for (const dir of this.suspiciousDirectories) {
                const expandedDir = dir.startsWith('~')
                    ? dir.replace('~', os.homedir())
                    : dir;
                if (process.path.startsWith(expandedDir)) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Verifica conexiones de red y detecta cambios
     */
    async checkNetworkConnections() {
        try {
            // Obtener conexiones de red con lsof
            const { stdout } = await exec('lsof -i -n -P');
            const lines = stdout.split('\n');
            const currentConnections = new Map();
            // Procesar cada línea de lsof
            for (let i = 1; i < lines.length; i++) { // Saltar cabecera
                const line = lines[i].trim();
                if (!line)
                    continue;
                const parts = line.split(/\s+/);
                if (parts.length < 9)
                    continue;
                const processName = parts[0];
                const pid = parseInt(parts[1], 10);
                // El protocolo puede estar en la columna 7 u 8 dependiendo de la versión de lsof
                let protocol = 'TCP';
                let addressInfo = '';
                if (parts[7] && (parts[7].includes('TCP') || parts[7].includes('UDP'))) {
                    protocol = parts[7].includes('UDP') ? 'UDP' : 'TCP';
                    addressInfo = parts[8];
                }
                else if (parts[8] && (parts[8].includes('TCP') || parts[8].includes('UDP'))) {
                    protocol = parts[8].includes('UDP') ? 'UDP' : 'TCP';
                    addressInfo = parts[8];
                }
                else {
                    // fallback: usar la última columna
                    addressInfo = parts[parts.length - 1];
                }
                let localIP = '0.0.0.0';
                let localPort = 0;
                let remoteIP = '0.0.0.0';
                let remotePort = 0;
                let state = 'UNKNOWN';
                // Formato: TYPE=PROTOCOL->ADDRESS->STATE
                if (addressInfo.includes('->')) {
                    // Hay una dirección remota
                    const [localPart, remotePart] = addressInfo.split('->');
                    if (localPart.includes(':')) {
                        const [ip, port] = localPart.split(':');
                        localIP = ip;
                        localPort = parseInt(port, 10);
                    }
                    if (remotePart.includes(':')) {
                        let [ip, portAndState] = remotePart.split(':');
                        remoteIP = ip;
                        if (portAndState && portAndState.includes('(')) {
                            const [port, stateWithParens] = portAndState.split('(');
                            remotePort = parseInt(port, 10);
                            state = stateWithParens.replace(')', '');
                        }
                        else if (portAndState) {
                            remotePort = parseInt(portAndState, 10);
                        }
                    }
                }
                else {
                    // Solo hay dirección local (típicamente escuchando)
                    if (addressInfo.includes(':')) {
                        const [ip, port] = addressInfo.split(':');
                        localIP = ip;
                        localPort = parseInt(port, 10);
                    }
                    state = 'LISTEN';
                }
                // Crear identificador único para esta conexión
                const id = `${protocol}:${localIP}:${localPort}:${remoteIP}:${remotePort}`;
                // Crear objeto de conexión
                const connection = {
                    protocol: protocol.toLowerCase(),
                    localAddress: localIP,
                    localPort,
                    remoteAddress: remoteIP,
                    remotePort,
                    state,
                    processId: pid,
                    processName,
                    established: new Date()
                };
                currentConnections.set(id, connection);
                // Detectar nuevas conexiones que no estaban en la lista anterior
                if (!this.lastNetworkConnections.has(id)) {
                    // Verificar si es una conexión sospechosa
                    if (await this.isSuspiciousConnection(connection)) {
                        console.log(`¡Conexión de red sospechosa detectada! ${processName} (${protocol} ${localIP}:${localPort} -> ${remoteIP}:${remotePort})`);
                        // Crear evento
                        await this.queueEvent({
                            eventType: 'network',
                            severity: 'medium',
                            timestamp: new Date(),
                            message: `Suspicious network connection: ${processName} (${protocol} ${localIP}:${localPort} -> ${remoteIP}:${remotePort})`,
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
        }
        catch (error) {
            console.error('Error checking network connections (lsof):', error);
        }
    }
    /**
     * Verifica si una conexión de red es sospechosa
     */
    async isSuspiciousConnection(connection) {
        // Puertos sospechosos (típicamente asociados a C&C o malware)
        const suspiciousPorts = [
            4444, 4445, 5555, 6666, 31337, 9001, 9002, // Metasploit, Cobalt Strike
            1080, 1081, 1082, 1083, 1084, 1085, 3128, 8080, 8081, 8082, // Proxies comunes
            6667, 6668, 6669, 6697 // IRC (usado para C&C)
        ];
        // Verificar puertos sospechosos
        if (suspiciousPorts.includes(connection.remotePort)) {
            return true;
        }
        // Procesos sospechosos con conexiones
        const suspiciousProcesses = [
            'bash', 'sh', 'zsh', 'python', 'perl', 'ruby', 'nc', 'ncat',
            'netcat', 'tcpdump', 'wireshark'
        ];
        // Verificar procesos sospechosos con conexiones establecidas
        const procName = connection.processName ?? '';
        if (connection.state === 'ESTABLISHED' &&
            suspiciousProcesses.some(proc => procName.toLowerCase() === proc.toLowerCase())) {
            return true;
        }
        return false;
    }
    /**
     * Escanea el sistema de archivos en busca de ficheros sospechosos
     */
    async scanFileSystem() {
        console.log('Escaneando sistema de archivos macOS...');
        // Expandir ~/Library/LaunchAgents a la ruta real
        const expandedDirs = this.suspiciousDirectories.map(dir => dir.startsWith('~') ? dir.replace('~', os.homedir()) : dir);
        for (const directory of expandedDirs) {
            await this.scanDirectoryForSuspiciousFiles(directory);
        }
        // Escanear archivos de arranque específicos de macOS
        await this.scanStartupItems();
    }
    /**
     * Escanea recursivamente un directorio
     */
    async scanDirectoryForSuspiciousFiles(directory, depth = 0) {
        // Limitar profundidad de recursión
        if (depth > 2)
            return;
        try {
            // Verificar si el directorio existe
            try {
                await fs.access(directory);
            }
            catch (error) {
                return; // Directorio no existe o no accesible
            }
            const entries = await fs.readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);
                try {
                    if (entry.isDirectory()) {
                        // Escanear subdirectorios recursivamente
                        await this.scanDirectoryForSuspiciousFiles(fullPath, depth + 1);
                    }
                    else if (entry.isFile()) {
                        // Comprobar si el archivo es sospechoso
                        if (await this.isSuspiciousFile(fullPath, entry.name)) {
                            // Crear evento para archivo sospechoso
                            const fileEvent = {
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
                                    file: fileEvent
                                }
                            });
                        }
                    }
                }
                catch (error) {
                    // Ignorar errores de permisos o archivos que desaparecen
                    console.error(`Error scanning file or directory '${fullPath}':`, error);
                }
            }
        }
        catch (error) {
            console.error(`Error scanning directory '${directory}':`, error);
        }
    }
    /**
     * Escanea elementos de arranque específicos de macOS
     */
    async scanStartupItems() {
        try {
            // Directorios a escanear
            const startupDirs = [
                '/Library/StartupItems',
                '/Library/LaunchAgents',
                '/Library/LaunchDaemons',
                os.homedir() + '/Library/LaunchAgents'
            ];
            for (const dir of startupDirs) {
                try {
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (!entry.isFile() || !entry.name.endsWith('.plist'))
                            continue;
                        const fullPath = path.join(dir, entry.name);
                        // Leer el contenido del plist
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            // Buscar patrones sospechosos
                            if (content.includes('python') || content.includes('perl') ||
                                content.includes('bash') || content.includes('sh ') ||
                                content.includes('nc ') || content.includes('curl') ||
                                content.includes('wget') || content.includes('ssh')) {
                                // Crear evento para plist sospechoso
                                const fileEvent = {
                                    path: fullPath,
                                    action: 'create', // Asumimos detección inicial
                                    timestamp: new Date()
                                };
                                // Crear evento
                                await this.queueEvent({
                                    eventType: 'file',
                                    severity: 'high',
                                    timestamp: new Date(),
                                    message: `Suspicious startup plist detected: ${fullPath}`,
                                    details: {
                                        file: fileEvent
                                    }
                                });
                            }
                        }
                        catch (error) {
                            console.error(`Error reading plist file '${fullPath}':`, error);
                        }
                    }
                }
                catch (error) {
                    console.error(`Error accessing directory '${dir}':`, error);
                }
            }
        }
        catch (error) {
            console.error('Error scanning macOS startup items:', error);
        }
    }
    /**
     * Verifica si un archivo es sospechoso basado en nombre y extensión
     */
    async isSuspiciousFile(filePath, fileName) {
        // Extensiones sospechosas en macOS
        const suspiciousExtensions = [
            '.sh', '.py', '.rb', '.pl', '.php', '.js', '.plist',
            '.dylib', '.kext', '.app', '.osax', '.ksh'
        ];
        // Verificar extensión
        if (suspiciousExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
            try {
                const stats = await fs.stat(filePath);
                // Verificar si es ejecutable
                if (stats.mode & 0o111) {
                    // Verificar ubicación
                    for (const dir of this.suspiciousDirectories) {
                        const expandedDir = dir.startsWith('~') ?
                            dir.replace('~', os.homedir()) : dir;
                        if (filePath.startsWith(expandedDir)) {
                            return true;
                        }
                    }
                }
            }
            catch (error) {
                // Ignorar errores de acceso
                return false;
            }
        }
        // Nombres sospechosos
        const suspiciousNames = [
            'backdoor', 'hack', 'rootkit', 'exploit', 'miner', 'crypto',
            'scan', 'crack', 'trojan', 'virus', 'malware', 'payload',
            'keylogger', 'screencapture', 'exfiltrate'
        ];
        if (suspiciousNames.some(name => fileName.toLowerCase().includes(name))) {
            return true;
        }
        return false;
    }
    /**
     * Escanea procesos en ejecución
     */
    async scanProcesses() {
        await this.checkProcesses();
    }
    /**
     * Escanea conexiones de red
     */
    async scanNetworkConnections() {
        await this.checkNetworkConnections();
    }
    /**
     * Escanea el registro (no aplicable en macOS)
     * Implementado para mantener compatibilidad con la interfaz base
     */
    async scanRegistry() {
        // macOS no tiene un registro al estilo Windows
        console.log('Registry scanning not applicable for macOS');
        return;
    }
    /**
     * Escanea en busca de malware
     */
    async scanForMalware() {
        console.log('Escaneando en busca de malware (implementación simplificada)');
        // Expandir ~/Library/LaunchAgents a la ruta real
        const suspiciousDirectories = this.suspiciousDirectories.map(dir => dir.startsWith('~') ? dir.replace('~', os.homedir()) : dir);
        // Añadir directorios específicos para malware
        suspiciousDirectories.push('/Library/Application Support');
        suspiciousDirectories.push(os.homedir() + '/Library/Application Support');
        for (const directory of suspiciousDirectories) {
            await this.scanDirectoryForMalware(directory);
        }
    }
    /**
     * Escanea un directorio en busca de malware
     */
    async scanDirectoryForMalware(directory, depth = 0) {
        // Limitar profundidad para evitar recursión excesiva
        if (depth > 2)
            return;
        try {
            // Verificar si el directorio existe
            try {
                await fs.access(directory);
            }
            catch (error) {
                return; // Directorio no existe o no accesible
            }
            const entries = await fs.readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);
                try {
                    if (entry.isDirectory()) {
                        // Escanear subdirectorios recursivamente
                        await this.scanDirectoryForMalware(fullPath, depth + 1);
                    }
                    else if (entry.isFile()) {
                        // Comprobar si es un archivo potencialmente malicioso
                        if (await this.isPotentialMalware(fullPath, entry.name)) {
                            // Simular detección de malware
                            const malwareDetection = {
                                filePath: fullPath,
                                fileHash: await this.getFileHash(fullPath) || 'unknown',
                                malwareName: 'Suspicious macOS File',
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
                }
                catch (error) {
                    // Ignorar errores de permisos
                    console.error(`Error scanning file or directory '${fullPath}':`, error);
                }
            }
        }
        catch (error) {
            console.error(`Error scanning directory for malware ${directory}:`, error);
        }
    }
    /**
     * Verifica si un archivo es potencialmente malware
     */
    async isPotentialMalware(filePath, fileName) {
        try {
            const stats = await fs.stat(filePath);
            // Verificar si es ejecutable
            if (stats.mode & 0o111) {
                // Extensiones de interés
                if (fileName.endsWith('.sh') || fileName.endsWith('.py') ||
                    fileName.endsWith('.pl') || fileName.endsWith('.rb') ||
                    filePath.includes('/bin/') || filePath.includes('/sbin/')) {
                    // En macOS, podemos intentar leer el contenido del script
                    try {
                        const content = await fs.readFile(filePath, 'utf-8');
                        // Patrones sospechosos
                        const suspiciousPatterns = [
                            'curl.*sh', 'wget.*sh', 'curl.*bash', 'wget.*bash',
                            'rm -rf', 'sudo rm', 'chmod 777', '/dev/tcp/',
                            'nc -e', 'nc -l', 'netcat', 'reverse shell',
                            'python -m SimpleHTTPServer', 'python -m http.server',
                            'base64 -d', 'openssl enc', 'diskutil secureErase'
                        ];
                        for (const pattern of suspiciousPatterns) {
                            if (content.includes(pattern) ||
                                new RegExp(pattern).test(content)) {
                                return true;
                            }
                        }
                    }
                    catch (error) {
                        // Ignorar errores al leer archivos
                    }
                }
                // Verificar ubicación sospechosa
                for (const dir of this.suspiciousDirectories) {
                    const expandedDir = dir.startsWith('~') ?
                        dir.replace('~', os.homedir()) : dir;
                    if (filePath.startsWith(expandedDir)) {
                        if (fileName.endsWith('.dylib') || fileName.endsWith('.kext')) {
                            return true;
                        }
                    }
                }
            }
            // Verificar archivo de plist sospechoso
            if (fileName.endsWith('.plist')) {
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    // Patrones sospechosos en plist
                    if ((content.includes('<string>/usr/bin/python</string>') ||
                        content.includes('<string>/usr/bin/bash</string>') ||
                        content.includes('<string>/usr/bin/sh</string>') ||
                        content.includes('<string>/usr/bin/perl</string>')) &&
                        (content.includes('LaunchDaemons') ||
                            content.includes('LaunchAgents'))) {
                        return true;
                    }
                }
                catch (error) {
                    // Ignorar errores al leer archivos
                }
            }
            return false;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Obtiene el hash de un archivo
     */
    async getFileHash(filePath) {
        try {
            // Usar comando md5 en macOS
            const { stdout } = await exec(`md5 -q "${filePath}"`);
            return stdout.trim();
        }
        catch (error) {
            console.debug(`Error getting file hash for ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Escanea vulnerabilidades en el sistema
     */
    async scanForVulnerabilities() {
        console.log('Escaneando vulnerabilidades en macOS (implementación simplificada)');
        try {
            // Verificar actualizaciones pendientes
            await this.checkPendingUpdates();
            // Verificar permisos SIP
            await this.checkSIPStatus();
            // Verificar versión de macOS
            await this.checkMacOSVersion();
        }
        catch (error) {
            console.error('Error scanning for vulnerabilities:', error);
        }
    }
    /**
     * Verifica actualizaciones pendientes de macOS
     */
    async checkPendingUpdates() {
        try {
            // Usar softwareupdate para verificar actualizaciones
            const { stdout } = await exec('softwareupdate -l');
            if (stdout.includes('recommended') || stdout.includes('restart required')) {
                const vulnerabilityInfo = {
                    softwareName: 'macOS',
                    version: os.release(),
                    cveId: 'MISSING-UPDATES',
                    severity: 'high',
                    description: 'Missing security updates detected',
                    fixAvailable: true,
                    fixVersion: 'Latest macOS Update'
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
        catch (error) {
            console.debug('Error checking macOS updates:', error);
        }
    }
    /**
     * Verifica el estado de System Integrity Protection (SIP)
     */
    async checkSIPStatus() {
        try {
            // Verificar si SIP está habilitado
            const { stdout } = await exec('csrutil status');
            if (stdout.includes('disabled')) {
                const vulnerabilityInfo = {
                    softwareName: 'macOS SIP',
                    version: os.release(),
                    cveId: 'SIP-DISABLED',
                    severity: 'critical',
                    description: 'System Integrity Protection is disabled',
                    fixAvailable: true,
                    fixVersion: 'Enable SIP in Recovery Mode'
                };
                // Crear evento directamente en vez de usar función helper para evitar problemas de tipo
                await this.queueEvent({
                    eventType: 'vulnerability',
                    severity: 'critical',
                    timestamp: new Date(),
                    message: `Vulnerability detected: System Integrity Protection is disabled`,
                    details: {
                        vulnerability: vulnerabilityInfo,
                        cveId: vulnerabilityInfo.cveId,
                        packageName: vulnerabilityInfo.softwareName
                    }
                });
            }
        }
        catch (error) {
            console.debug('Error checking SIP status:', error);
        }
    }
    /**
     * Verifica si la versión de macOS está actualizada
     */
    async checkMacOSVersion() {
        try {
            // Obtener versión de macOS
            const { stdout } = await exec('sw_vers -productVersion');
            const version = stdout.trim();
            // Lista de versiones vulnerables conocidas
            const vulnerableVersions = [
                { version: '10.13.', cve: 'CVE-2020-9934', severity: 'high', description: 'High Sierra vulnerability' },
                { version: '10.14.', cve: 'CVE-2021-30657', severity: 'critical', description: 'Mojave vulnerability' },
                { version: '10.15.6', cve: 'CVE-2021-30713', severity: 'high', description: 'Catalina vulnerability' }
            ];
            // Comprobar si la versión es vulnerable
            for (const vulnerable of vulnerableVersions) {
                if (version.startsWith(vulnerable.version)) {
                    const vulnerabilityInfo = {
                        softwareName: 'macOS',
                        version: version,
                        cveId: vulnerable.cve,
                        severity: vulnerable.severity,
                        description: vulnerable.description,
                        fixAvailable: true,
                        fixVersion: 'Latest macOS Update'
                    };
                    // Crear evento directamente en vez de usar función helper para evitar problemas de tipo
                    await this.queueEvent({
                        eventType: 'vulnerability',
                        severity: vulnerabilityInfo.severity,
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
        catch (error) {
            console.debug('Error checking macOS version:', error);
        }
    }
}
exports.MacOSAgent = MacOSAgent;
