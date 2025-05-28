/**
 * Conector para monitoreo de archivos
 * Soporta vigilancia de directorios, filtros de archivos y detección de cambios
 */
import { BaseConnector } from './base-connector';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { log } from '../../vite';
/**
 * Conector para monitoreo de archivos y directorios
 * Utiliza chokidar para detección eficiente de cambios
 */
export class FileConnector extends BaseConnector {
    watcher;
    fileHashes = new Map();
    isRunning = false;
    constructor(config) {
        super(config);
        const fileConfig = this._config;
        if (!fileConfig.paths || fileConfig.paths.length === 0) {
            throw new Error('At least one path is required for FileConnector');
        }
        this.validateFileConfig(fileConfig);
    }
    /**
     * Valida la configuración del monitor de archivos
     */
    validateFileConfig(config) {
        if (!config.paths || config.paths.length === 0) {
            throw new Error('Paths array cannot be empty');
        }
        // Verificar que los paths existen
        for (const pathToWatch of config.paths) {
            if (!fs.existsSync(pathToWatch)) {
                log(`Warning: Path does not exist: ${pathToWatch}`, 'file-connector');
            }
        }
    }
    /**
     * Implementación de doStart - requerido por BaseConnector
     */
    async doStart() {
        const fileConfig = this._config;
        try {
            this.watcher = chokidar.watch(fileConfig.paths, {
                ignored: this.buildIgnorePatterns(fileConfig),
                persistent: true,
                ignoreInitial: !fileConfig.includeInitial,
                followSymlinks: fileConfig.followSymlinks || false,
                depth: fileConfig.maxDepth || undefined,
                usePolling: fileConfig.usePolling || false,
                interval: fileConfig.pollingInterval || 1000,
                binaryInterval: fileConfig.binaryInterval || 300
            });
            this.setupEventHandlers();
            this.isRunning = true;
            this.emitEvent({
                timestamp: new Date(),
                source: `FileMonitor-${fileConfig.paths.join(',')}`,
                message: `File monitoring started for ${fileConfig.paths.length} paths`,
                severity: 'info',
                rawData: { paths: fileConfig.paths }
            });
        }
        catch (error) {
            throw new Error(`Failed to start file monitoring: ${error}`);
        }
    }
    /**
     * Implementación de doStop - requerido por BaseConnector
     */
    async doStop() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = undefined;
        }
        this.isRunning = false;
        this.fileHashes.clear();
        this.emitEvent({
            timestamp: new Date(),
            source: 'FileMonitor',
            message: 'File monitoring stopped',
            severity: 'info',
            rawData: {}
        });
    }
    /**
     * Implementación de doHealthCheck - requerido por BaseConnector
     */
    async doHealthCheck() {
        const fileConfig = this._config;
        try {
            let accessiblePaths = 0;
            let totalPaths = fileConfig.paths.length;
            for (const pathToCheck of fileConfig.paths) {
                try {
                    await fs.promises.access(pathToCheck, fs.constants.R_OK);
                    accessiblePaths++;
                }
                catch {
                    // Path not accessible
                }
            }
            const healthy = accessiblePaths > 0;
            const message = healthy
                ? `${accessiblePaths}/${totalPaths} paths accessible, watcher ${this.isRunning ? 'running' : 'stopped'}`
                : 'No paths accessible';
            return {
                healthy,
                message,
                lastChecked: new Date(),
                details: {
                    accessiblePaths,
                    totalPaths,
                    watcherRunning: this.isRunning
                }
            };
        }
        catch (error) {
            return {
                healthy: false,
                message: `Health check failed: ${error}`,
                lastChecked: new Date()
            };
        }
    }
    /**
     * Implementación de doTestConnection - requerido por BaseConnector
     */
    async doTestConnection() {
        const fileConfig = this._config;
        try {
            let accessibleCount = 0;
            const results = [];
            for (const pathToTest of fileConfig.paths) {
                try {
                    const stats = await fs.promises.stat(pathToTest);
                    accessibleCount++;
                    results.push(`✓ ${pathToTest} (${stats.isDirectory() ? 'directory' : 'file'})`);
                }
                catch (error) {
                    results.push(`✗ ${pathToTest} (${error})`);
                }
            }
            const success = accessibleCount > 0;
            const message = `${accessibleCount}/${fileConfig.paths.length} paths accessible:\n${results.join('\n')}`;
            return { success, message };
        }
        catch (error) {
            return {
                success: false,
                message: `Connection test failed: ${error}`
            };
        }
    }
    /**
     * Configura los manejadores de eventos del watcher
     */
    setupEventHandlers() {
        if (!this.watcher)
            return;
        const fileConfig = this._config;
        this.watcher.on('add', (filePath, stats) => {
            this.handleFileEvent('add', filePath, stats);
        });
        this.watcher.on('change', (filePath, stats) => {
            this.handleFileEvent('change', filePath, stats);
        });
        this.watcher.on('unlink', (filePath) => {
            this.handleFileEvent('unlink', filePath);
        });
        if (fileConfig.monitorDirectories) {
            this.watcher.on('addDir', (dirPath, stats) => {
                this.handleFileEvent('addDir', dirPath, stats);
            });
            this.watcher.on('unlinkDir', (dirPath) => {
                this.handleFileEvent('unlinkDir', dirPath);
            });
        }
        this.watcher.on('error', (error) => {
            log(`File watcher error: ${error}`, 'file-connector');
            this.emitEvent({
                timestamp: new Date(),
                source: 'FileMonitor',
                message: `Watcher error: ${error}`,
                severity: 'error',
                rawData: { error: String(error) }
            });
        });
        this.watcher.on('ready', () => {
            log('File watcher ready', 'file-connector');
        });
    }
    /**
     * Maneja los eventos de archivos
     */
    async handleFileEvent(eventType, filePath, stats) {
        try {
            const fileConfig = this._config;
            // Aplicar filtros
            if (!this.shouldProcessFile(filePath, eventType)) {
                return;
            }
            const eventData = {
                eventType,
                filePath,
                stats
            };
            // Calcular hash para archivos (no directorios)
            if (stats && stats.isFile() && (eventType === 'add' || eventType === 'change')) {
                if (fileConfig.calculateHashes) {
                    eventData.previousHash = this.fileHashes.get(filePath);
                    eventData.hash = await this.calculateFileHash(filePath);
                    this.fileHashes.set(filePath, eventData.hash);
                }
            }
            else if (eventType === 'unlink') {
                eventData.previousHash = this.fileHashes.get(filePath);
                this.fileHashes.delete(filePath);
            }
            // Determinar severidad basada en el tipo de evento y path
            const severity = this.determineSeverity(eventData);
            // Emitir evento
            this.emitEvent({
                timestamp: new Date(),
                source: `FileMonitor-${path.basename(filePath)}`,
                message: this.buildEventMessage(eventData),
                severity,
                rawData: {
                    eventType,
                    filePath,
                    fileName: path.basename(filePath),
                    directory: path.dirname(filePath),
                    fileSize: stats?.size,
                    isDirectory: stats?.isDirectory(),
                    hash: eventData.hash,
                    previousHash: eventData.previousHash,
                    modified: stats?.mtime,
                    accessed: stats?.atime,
                    created: stats?.birthtime
                }
            });
        }
        catch (error) {
            log(`Error handling file event: ${error}`, 'file-connector');
        }
    }
    /**
     * Determina si un archivo debe ser procesado según filtros
     */
    shouldProcessFile(filePath, eventType) {
        const fileConfig = this._config;
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath);
        // Filtrar por extensiones
        if (fileConfig.extensions && fileConfig.extensions.length > 0) {
            if (!fileConfig.extensions.includes(fileExt)) {
                return false;
            }
        }
        // Filtrar por patrones de exclusión
        if (fileConfig.excludePatterns) {
            for (const pattern of fileConfig.excludePatterns) {
                if (fileName.match(new RegExp(pattern))) {
                    return false;
                }
            }
        }
        // Filtrar por patrones de inclusión
        if (fileConfig.includePatterns) {
            let matches = false;
            for (const pattern of fileConfig.includePatterns) {
                if (fileName.match(new RegExp(pattern))) {
                    matches = true;
                    break;
                }
            }
            if (!matches)
                return false;
        }
        return true;
    }
    /**
     * Construye patrones de ignorado para chokidar
     */
    buildIgnorePatterns(config) {
        const patterns = [];
        // Patrones por defecto
        patterns.push(/node_modules/);
        patterns.push(/\.git/);
        patterns.push(/\.DS_Store/);
        // Patrones personalizados
        if (config.excludePatterns) {
            for (const pattern of config.excludePatterns) {
                patterns.push(new RegExp(pattern));
            }
        }
        return patterns;
    }
    /**
     * Calcula el hash de un archivo
     */
    async calculateFileHash(filePath) {
        try {
            const data = await fs.promises.readFile(filePath);
            return createHash('sha256').update(data).digest('hex');
        }
        catch (error) {
            log(`Error calculating hash for ${filePath}: ${error}`, 'file-connector');
            return '';
        }
    }
    /**
     * Determina la severidad basada en el evento de archivo
     */
    determineSeverity(eventData) {
        const { eventType, filePath } = eventData;
        const fileName = path.basename(filePath);
        const fileConfig = this._config;
        // Archivos críticos del sistema
        const criticalPaths = [
            '/etc/passwd', '/etc/shadow', '/etc/hosts',
            'C:\\Windows\\System32\\drivers\\etc\\hosts',
            '/boot/', 'C:\\Windows\\System32\\'
        ];
        const isCriticalPath = criticalPaths.some(criticalPath => filePath.includes(criticalPath));
        // Archivos ejecutables
        const executableExtensions = ['.exe', '.bat', '.sh', '.ps1', '.cmd', '.msi', '.dmg'];
        const isExecutable = executableExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
        // Determinar severidad
        if (eventType === 'unlink' && isCriticalPath) {
            return 'critical';
        }
        if ((eventType === 'add' || eventType === 'change') && isExecutable) {
            return 'warn';
        }
        if (eventType === 'change' && isCriticalPath) {
            return 'error';
        }
        if (fileConfig.highPriorityPatterns) {
            for (const pattern of fileConfig.highPriorityPatterns) {
                if (fileName.match(new RegExp(pattern))) {
                    return eventType === 'unlink' ? 'error' : 'warn';
                }
            }
        }
        return 'info';
    }
    /**
     * Construye el mensaje del evento
     */
    buildEventMessage(eventData) {
        const { eventType, filePath, hash, previousHash } = eventData;
        const fileName = path.basename(filePath);
        switch (eventType) {
            case 'add':
                return `File created: ${fileName}`;
            case 'change':
                const hashChanged = hash && previousHash && hash !== previousHash;
                return `File modified: ${fileName}${hashChanged ? ' (content changed)' : ''}`;
            case 'unlink':
                return `File deleted: ${fileName}`;
            case 'addDir':
                return `Directory created: ${fileName}`;
            case 'unlinkDir':
                return `Directory deleted: ${fileName}`;
            default:
                return `File event: ${eventType} on ${fileName}`;
        }
    }
}
