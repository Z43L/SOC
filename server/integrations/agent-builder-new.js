/**
 * Configuración para agentes de SOC-Inteligente
 */
define("agents/core/agent-config", ["require", "exports", "fs/promises", "path", "crypto", "js-yaml"], function (require, exports, fs, path, crypto, yaml) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_CONFIG = void 0;
    exports.validateAgentIntegrity = validateAgentIntegrity;
    exports.encryptConfigValue = encryptConfigValue;
    exports.decryptConfigValue = decryptConfigValue;
    exports.validateConfig = validateConfig;
    exports.resolveAgentPath = resolveAgentPath;
    exports.loadConfig = loadConfig;
    exports.saveConfig = saveConfig;
    // Import logger - will be initialized later to avoid circular dependency
    let logger;
    /**
     * Validates the integrity of the agent binary
     */
    async function validateAgentIntegrity(expectedHash) {
        try {
            const binaryPath = process.execPath;
            const fileBuffer = await fs.readFile(binaryPath);
            const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            if (expectedHash && expectedHash !== actualHash) {
                if (logger) {
                    logger.error('Agent binary integrity check failed: hash mismatch');
                }
                return false;
            }
            if (logger) {
                logger.info(`Agent binary integrity validated: ${actualHash}`);
            }
            return true;
        }
        catch (error) {
            if (logger) {
                logger.error('Error validating agent integrity:', error);
            }
            return false;
        }
    }
    /**
     * Encrypts sensitive configuration values
     */
    function encryptConfigValue(value, secret) {
        const cipher = crypto.createCipher('aes-256-cbc', secret);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    /**
     * Decrypts sensitive configuration values
     */
    function decryptConfigValue(encryptedValue, secret) {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', secret);
            let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            throw new Error('Failed to decrypt configuration value');
        }
    }
    /**
     * Applies environment variable overrides to configuration
     */
    function applyEnvironmentOverrides(config) {
        // Server configuration
        if (process.env.AGENT_SERVER_URL) {
            config.serverUrl = process.env.AGENT_SERVER_URL;
        }
        if (process.env.AGENT_ORG_KEY) {
            config.organizationKey = process.env.AGENT_ORG_KEY;
        }
        // Logging configuration
        if (process.env.AGENT_LOG_LEVEL) {
            const logLevel = process.env.AGENT_LOG_LEVEL.toLowerCase();
            if (['debug', 'info', 'warn', 'error'].includes(logLevel)) {
                config.logLevel = logLevel;
            }
        }
        if (process.env.AGENT_LOG_FILE) {
            config.logFilePath = process.env.AGENT_LOG_FILE;
        }
        // Security configuration
        if (process.env.AGENT_VALIDATE_CERTS === 'false') {
            config.validateCertificates = false;
        }
        if (process.env.AGENT_ALLOW_INSECURE === 'true') {
            config.allowInsecureConnections = true;
        }
        // Intervals
        if (process.env.AGENT_HEARTBEAT_INTERVAL) {
            const interval = parseInt(process.env.AGENT_HEARTBEAT_INTERVAL, 10);
            if (!isNaN(interval) && interval >= 30) {
                config.heartbeatInterval = interval;
            }
        }
        if (process.env.AGENT_UPLOAD_INTERVAL) {
            const interval = parseInt(process.env.AGENT_UPLOAD_INTERVAL, 10);
            if (!isNaN(interval) && interval >= 30) {
                config.dataUploadInterval = interval;
            }
        }
        // Transport
        if (process.env.AGENT_TRANSPORT) {
            const transport = process.env.AGENT_TRANSPORT.toLowerCase();
            if (['https', 'websocket'].includes(transport)) {
                config.transport = transport;
            }
        }
        if (process.env.AGENT_COMPRESSION === 'false') {
            config.compressionEnabled = false;
        }
        // Capabilities overrides
        if (process.env.AGENT_DISABLE_CAPABILITIES) {
            const disabledCaps = process.env.AGENT_DISABLE_CAPABILITIES.split(',').map(c => c.trim());
            for (const cap of disabledCaps) {
                if (cap in config.capabilities) {
                    config.capabilities[cap] = false;
                }
            }
        }
    }
    function validateConfig(config) {
        const errors = [];
        // Validate required fields
        if (!config.serverUrl) {
            errors.push('serverUrl is required');
        }
        else if (!config.serverUrl.startsWith('http://') && !config.serverUrl.startsWith('https://')) {
            errors.push('serverUrl must be a valid HTTP/HTTPS URL');
        }
        if (!config.organizationKey) {
            errors.push('organizationKey is required for agent authentication');
        }
        // Validate intervals
        if (config.heartbeatInterval && config.heartbeatInterval < 30) {
            errors.push('heartbeatInterval must be at least 30 seconds');
        }
        if (config.dataUploadInterval && config.dataUploadInterval < 60) {
            errors.push('dataUploadInterval must be at least 60 seconds');
        }
        if (config.scanInterval && config.scanInterval < 300) {
            errors.push('scanInterval must be at least 300 seconds (5 minutes)');
        }
        // Validate log level
        if (config.logLevel && !['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
            errors.push('logLevel must be one of: debug, info, warn, error');
        }
        // Validate queue size
        if (config.queueSize && (config.queueSize < 100 || config.queueSize > 10000)) {
            errors.push('queueSize must be between 100 and 10000');
        }
        // Validate max storage size
        if (config.maxStorageSize && (config.maxStorageSize < 10 || config.maxStorageSize > 1000)) {
            errors.push('maxStorageSize must be between 10MB and 1000MB');
        }
        return errors;
    }
    /**
     * Resuelve una ruta relativa al directorio del ejecutable del agente
     * Esto es necesario para compatibilidad con binarios empaquetados
     */
    function resolveAgentPath(relativePath) {
        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }
        const execDir = path.dirname(process.execPath);
        return path.resolve(execDir, relativePath);
    }
    /**
     * Configuración predeterminada
     */
    exports.DEFAULT_CONFIG = {
        // Configuración de conexión al servidor
        serverUrl: 'https://soc.example.com',
        organizationKey: '', // Se debe proporcionar durante la instalación
        // Intervalos (en segundos)
        heartbeatInterval: 60,
        dataUploadInterval: 300,
        scanInterval: 3600,
        // Endpoints
        registrationEndpoint: '/api/agents/register',
        dataEndpoint: '/api/agents/data',
        heartbeatEndpoint: '/api/agents/heartbeat',
        // Seguridad
        signMessages: false,
        validateCertificates: true,
        maxMessageSize: 1048576, // 1MB
        allowInsecureConnections: false,
        // Capacidades
        capabilities: {
            fileSystemMonitoring: true,
            processMonitoring: true,
            networkMonitoring: true,
            registryMonitoring: false,
            securityLogsMonitoring: true,
            malwareScanning: false,
            vulnerabilityScanning: false
        },
        // Almacenamiento y registros
        logFilePath: 'agent.log', // Relativo al directorio del ejecutable
        maxStorageSize: 100, // 100 MB
        logLevel: 'info',
        // Cola de eventos
        queueSize: 1000,
        // Transporte
        transport: 'websocket',
        compressionEnabled: true,
        // Comandos push
        enableCommands: true,
        allowedCommands: ['script', 'configUpdate', 'isolate', 'upgrade'],
        // Personalización avanzada
        directoriesToScan: ['/tmp', '/var/tmp', '/dev/shm', '/home'],
        cpuAlertThreshold: 90
    };
    /**
     * Carga la configuración desde un archivo YAML
     */
    async function loadConfig(configPath) {
        try {
            // Crear directorio si no existe
            const directory = path.dirname(configPath);
            try {
                await fs.mkdir(directory, { recursive: true });
            }
            catch (error) {
                // Ignorar error si el directorio ya existe
            }
            // Intentar leer el archivo de configuración
            let fileContent;
            try {
                fileContent = await fs.readFile(configPath, 'utf-8');
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    // Si el archivo no existe, crear uno con la configuración predeterminada
                    (logger || console).log(`Configuration file not found at ${configPath}, creating default`);
                    const defaultConfig = {
                        ...exports.DEFAULT_CONFIG,
                        configPath
                    };
                    await saveConfig(defaultConfig, configPath);
                    return defaultConfig;
                }
                else if (error.code === 'EACCES') {
                    throw new Error(`Permission denied reading configuration file: ${configPath}`);
                }
                else {
                    throw new Error(`Failed to read configuration file: ${error.message}`);
                }
            }
            // Analizar el archivo YAML
            let fileConfig;
            try {
                fileConfig = yaml.load(fileContent);
                if (!fileConfig || typeof fileConfig !== 'object') {
                    throw new Error('Configuration file does not contain valid YAML object');
                }
            }
            catch (yamlError) {
                throw new Error(`Failed to parse YAML configuration: ${yamlError.message}`);
            }
            // Validate configuration before merging
            const validationErrors = validateConfig(fileConfig);
            if (validationErrors.length > 0) {
                (logger || console).warn(`Configuration validation warnings: ${validationErrors.join(', ')}`);
            }
            // Combinar con la configuración predeterminada para asegurar que todos los campos estén presentes
            const config = {
                ...exports.DEFAULT_CONFIG,
                ...fileConfig,
                configPath,
                capabilities: {
                    ...exports.DEFAULT_CONFIG.capabilities,
                    ...(fileConfig.capabilities || {})
                }
            };
            // Aplicar overrides de variables de entorno
            applyEnvironmentOverrides(config);
            // Resolver rutas relativas usando el directorio del ejecutable
            if (config.logFilePath && !path.isAbsolute(config.logFilePath)) {
                config.logFilePath = resolveAgentPath(config.logFilePath);
            }
            if (config.privateKeyPath && !path.isAbsolute(config.privateKeyPath)) {
                config.privateKeyPath = resolveAgentPath(config.privateKeyPath);
            }
            if (config.serverPublicKeyPath && !path.isAbsolute(config.serverPublicKeyPath)) {
                config.serverPublicKeyPath = resolveAgentPath(config.serverPublicKeyPath);
            }
            return config;
        }
        catch (error) {
            (logger || console).error(`Error loading configuration from ${configPath}:`, error);
            // En caso de error, devolver la configuración predeterminada
            const fallbackConfig = {
                ...exports.DEFAULT_CONFIG,
                configPath
            };
            return fallbackConfig;
        }
    }
    /**
     * Guarda la configuración en un archivo YAML
     */
    async function saveConfig(config, configPath) {
        try {
            const savePath = configPath || config.configPath;
            // Crear directorio si no existe
            const directory = path.dirname(savePath);
            try {
                await fs.mkdir(directory, { recursive: true });
            }
            catch (error) {
                if (error.code !== 'EEXIST') {
                    throw new Error(`Failed to create directory ${directory}: ${error.message}`);
                }
            }
            // Convertir a YAML y guardar
            let yamlContent;
            try {
                yamlContent = yaml.dump(config, {
                    indent: 2,
                    lineWidth: 100,
                    noRefs: true,
                });
            }
            catch (yamlError) {
                throw new Error(`Failed to serialize configuration to YAML: ${yamlError.message}`);
            }
            try {
                await fs.writeFile(savePath, yamlContent, 'utf-8');
                (logger || console).log(`Configuration saved to ${savePath}`);
            }
            catch (writeError) {
                if (writeError.code === 'EACCES') {
                    throw new Error(`Permission denied writing to configuration file: ${savePath}`);
                }
                else {
                    throw new Error(`Failed to write configuration file: ${writeError.message}`);
                }
            }
        }
        catch (error) {
            (logger || console).error('Error saving configuration:', error);
            throw error;
        }
    }
});
/**
 * Generador y compilador de agentes para SOC inteligente
 *
 * Este módulo permite generar agentes preconfigurados para Windows, macOS y Linux
 * que se pueden descargar directamente desde la plataforma SOC
 */
define("server/integrations/agent-builder", ["require", "exports", "fs", "path", "util", "child_process", "url", "path", "os", "uuid", "js-yaml"], function (require, exports, fs, path, util, child_process, url_1, path_1, os, uuid_1, yaml) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AgentBuilder = exports.AgentOS = void 0;
    const __filename = (0, url_1.fileURLToPath)(import.meta.url);
    const __dirname = (0, path_1.dirname)(__filename);
    const exec = util.promisify(child_process.exec);
    const writeFile = util.promisify(fs.writeFile);
    const readFile = util.promisify(fs.readFile);
    const mkdir = util.promisify(fs.mkdir);
    /**
     * Tipo de sistema operativo para el agente
     */
    var AgentOS;
    (function (AgentOS) {
        AgentOS["WINDOWS"] = "windows";
        AgentOS["MACOS"] = "macos";
        AgentOS["LINUX"] = "linux";
    })(AgentOS || (exports.AgentOS = AgentOS = {}));
    /**
     * Clase para construir y compilar agentes
     */
    class AgentBuilder {
        constructor() {
            // Directorios de trabajo
            this.buildDir = path.join(os.tmpdir(), 'soc-agent-builder');
            this.outputDir = path.join(process.cwd(), 'public', 'downloads'); // <-- fix here
            this.templatesDir = path.join(process.cwd(), 'agents');
            // Crear directorios si no existen
            this.ensureDirectories();
        }
        /**
         * Asegura que los directorios necesarios existan
         */
        async ensureDirectories() {
            try {
                if (!fs.existsSync(this.buildDir)) {
                    await mkdir(this.buildDir, { recursive: true });
                }
                if (!fs.existsSync(this.outputDir)) {
                    await mkdir(this.outputDir, { recursive: true });
                }
            }
            catch (error) {
                console.error('Error creating directories:', error);
            }
        }
        /**
         * Genera un agente preconfigurado para el sistema operativo especificado
         */
        async buildAgent(config) {
            try {
                // Generar ID único para este agente
                const agentId = `agent-${(0, uuid_1.v4)().substring(0, 8)}`;
                // Crear directorio de construcción único para este agente
                const buildPath = path.join(this.buildDir, agentId);
                await mkdir(buildPath, { recursive: true });
                // Generar configuración del agente
                const agentConfig = this.generateAgentConfig(config, agentId);
                // Guardar configuración en archivo
                const configPath = path.join(buildPath, 'agent-config.json');
                await writeFile(configPath, JSON.stringify(agentConfig, null, 2), 'utf-8');
                // Generar archivo empaquetado según el SO
                const result = await this.packageAgent(config.os, buildPath, agentConfig, agentId);
                // Limpiar archivos temporales
                this.cleanupBuildDir(buildPath).catch(error => {
                    console.warn('Error cleaning up build files:', error);
                });
                return {
                    success: result.success,
                    message: result.message,
                    filePath: result.filePath,
                    downloadUrl: result.downloadUrl,
                    agentId
                };
            }
            catch (error) {
                console.error('Error building agent:', error);
                return {
                    success: false,
                    message: `Error building agent: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        }
        /**
         * Genera la configuración para el agente
         */
        generateAgentConfig(config, agentId) {
            // Configurar capacidades del agente
            const capabilities = {
                fileSystemMonitoring: config.capabilities?.fileSystemMonitoring ?? true,
                processMonitoring: config.capabilities?.processMonitoring ?? true,
                networkMonitoring: config.capabilities?.networkMonitoring ?? true,
                registryMonitoring: config.os === AgentOS.WINDOWS && (config.capabilities?.registryMonitoring ?? true),
                securityLogsMonitoring: config.capabilities?.securityLogsMonitoring ?? true,
                malwareScanning: config.capabilities?.malwareScanning ?? true,
                vulnerabilityScanning: config.capabilities?.vulnerabilityScanning ?? true
            };
            // Generar configuración base usando el formato correcto del core agent-config
            return {
                // Información de conexión
                serverUrl: config.serverUrl,
                organizationKey: config.organizationKey, // Fixed: was registrationKey
                agentId: agentId,
                // Intervalos
                heartbeatInterval: 60,
                dataUploadInterval: 300,
                scanInterval: 3600,
                // Endpoints
                registrationEndpoint: '/api/agents/register',
                dataEndpoint: '/api/agents/data',
                heartbeatEndpoint: '/api/agents/heartbeat',
                // Seguridad
                signMessages: false,
                validateCertificates: true,
                maxMessageSize: 1048576, // 1MB
                allowInsecureConnections: false,
                // Capacidades
                capabilities,
                // Almacenamiento y registros
                configPath: this.getDefaultConfigPath(config.os),
                logFilePath: this.getDefaultLogPath(config.os),
                maxStorageSize: 100,
                logLevel: 'info',
                // Cola de eventos
                queueSize: 1000,
                // Transporte - Enable WebSocket by default
                transport: 'websocket',
                compressionEnabled: true,
                // Comandos push
                enableCommands: true,
                allowedCommands: ['script', 'configUpdate', 'isolate', 'upgrade'],
                // Personalización avanzada
                directoriesToScan: ['/tmp', '/var/tmp', '/dev/shm', '/home'],
                cpuAlertThreshold: 90
            };
        }
        /**
         * Devuelve la ruta por defecto para el archivo de configuración según el SO
         */
        getDefaultConfigPath(os) {
            switch (os) {
                case AgentOS.WINDOWS:
                    return 'C:\\ProgramData\\SOCIntelligent\\agent-config.json';
                case AgentOS.MACOS:
                    return '/Library/Application Support/SOCIntelligent/agent-config.json';
                case AgentOS.LINUX:
                    return '/etc/soc-intelligent/agent-config.json';
                default:
                    return './agent-config.json';
            }
        }
        /**
         * Devuelve la ruta por defecto para el archivo de log según el SO
         */
        getDefaultLogPath(os) {
            switch (os) {
                case AgentOS.WINDOWS:
                    return 'C:\\ProgramData\\SOCIntelligent\\agent.log';
                case AgentOS.MACOS:
                    return '/Library/Logs/SOCIntelligent/agent.log';
                case AgentOS.LINUX:
                    return '/var/log/soc-intelligent/agent.log';
                default:
                    return './agent.log';
            }
        }
        /**
         * Empaqueta el agente para el sistema operativo especificado
         */
        async packageAgent(os, buildPath, config, agentId) {
            try {
                console.log(`Packaging Electron agent for ${os}...`);
                
                // Create build environment
                const buildDir = path.join(buildPath, 'build');
                await mkdir(buildDir, { recursive: true });
                
                // Compile the Electron agent
                await this.compileAgent(buildDir, os, config, agentId);
                
                // Find the generated executable(s)
                const outputFiles = await this.findGeneratedExecutables(buildPath, os, agentId);
                
                if (outputFiles.length === 0) {
                    throw new Error(`No executable files found for ${os}`);
                }
                
                // Return the main executable file
                const mainExecutable = outputFiles[0];
                const fileName = path.basename(mainExecutable);
                const downloadUrl = `/downloads/${fileName}`;
                
                // Copy to output directory for download
                const outputPath = path.join(this.outputDir, fileName);
                await fs.promises.copyFile(mainExecutable, outputPath);
                
                return {
                    success: true,
                    message: `Electron agent packaged successfully for ${os}`,
                    filePath: outputPath,
                    downloadUrl,
                    executables: outputFiles.map(f => path.basename(f))
                };
                
            } catch (error) {
                console.error(`Error packaging Electron agent for ${os}:`, error);
                return {
                    success: false,
                    message: `Error packaging agent: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        }

        /**
         * Find generated executable files after Electron build
         */
        async findGeneratedExecutables(buildPath, os, agentId) {
            const files = [];
            // The output directory is set to buildPath in the electron-builder config
            const distPath = path.join(buildPath, 'build');
            
            try {
                const dirContents = await fs.promises.readdir(distPath);
                
                for (const item of dirContents) {
                    const itemPath = path.join(distPath, item);
                    const stat = await fs.promises.stat(itemPath);
                    
                    if (stat.isFile()) {
                        // Check if it's an executable file for the target OS
                        const isExecutable = this.isExecutableForOS(item, os, agentId);
                        if (isExecutable) {
                            files.push(itemPath);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error reading dist directory: ${error.message}`);
            }
            
            return files;
        }

        /**
         * Check if a file is an executable for the target OS
         */
        isExecutableForOS(fileName, os, agentId) {
            const lowerName = fileName.toLowerCase();
            
            switch (os) {
                case AgentOS.WINDOWS:
                    return lowerName.includes('windows') && (lowerName.endsWith('.exe') || lowerName.endsWith('.zip'));
                case AgentOS.LINUX:
                    return lowerName.includes('linux') && lowerName.endsWith('.appimage');
                case AgentOS.MACOS:
                    return lowerName.includes('macos') && lowerName.endsWith('.dmg');
                default:
                    return false;
            }
        }
        /**
         * Crea archivos necesarios para el agente Windows
         */
        async createWindowsAgentFiles(buildPath, config, agentId) {
            // Crear script de instalación (PowerShell)
            const installScript = `
# Instalador del Agente SOC-Inteligente para Windows
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

$ErrorActionPreference = "Stop"

# Crear directorios necesarios
$installDir = "C:\\Program Files\\SOCIntelligent"
$dataDir = "C:\\ProgramData\\SOCIntelligent"

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# Copiar archivos
Write-Host "Instalando archivos del agente..."
Copy-Item -Path ".\\agent\\*" -Destination $installDir -Recurse -Force

# Guardar configuración
Write-Host "Configurando agente..."
$configPath = "$dataDir\\agent-config.json"
$configJson = '${JSON.stringify(config)}'
Set-Content -Path $configPath -Value $configJson

# Crear servicio Windows
Write-Host "Instalando servicio de Windows..."
$serviceName = "SOCIntelligentAgent"

# Verificar si el servicio ya existe
$serviceExists = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($serviceExists) {
    Write-Host "El servicio ya existe. Deteniéndolo para actualizar..."
    Stop-Service -Name $serviceName
    Start-Sleep -Seconds 2
}

# Detectar Node.js en el sistema
Write-Host "Detectando Node.js..."
$nodePath = $null

# Intentar encontrar node.exe en el PATH
try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $nodePath = $nodeCommand.Source
    Write-Host "Node.js encontrado en: $nodePath" -ForegroundColor Green
} catch {
    # Buscar en ubicaciones comunes de Node.js
    $commonPaths = @(
        "$env:ProgramFiles\\nodejs\\node.exe",
        "$env:ProgramFiles(x86)\\nodejs\\node.exe",
        "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\node.exe",
        "$env:APPDATA\\npm\\node.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $nodePath = $path
            Write-Host "Node.js encontrado en: $nodePath" -ForegroundColor Green
            break
        }
    }
}

if (-not $nodePath) {
    Write-Host "Error: Node.js no encontrado en el sistema." -ForegroundColor Red
    Write-Host "Por favor, instale Node.js desde https://nodejs.org antes de continuar." -ForegroundColor Yellow
    exit 1
}

# Verificar que el archivo agent-windows.js existe
$agentScript = "$installDir\\agent-windows.js"
if (-not (Test-Path $agentScript)) {
    Write-Host "Error: Archivo del agente no encontrado en $agentScript" -ForegroundColor Red
    exit 1
}

# Usar NSSM para crear/actualizar el servicio
$nssmPath = "$installDir\\nssm.exe"

if (-not (Test-Path $nssmPath)) {
    Write-Host "Error: NSSM no encontrado en $nssmPath" -ForegroundColor Red
    exit 1
}

if ($serviceExists) {
    # Actualizar servicio existente
    & $nssmPath set $serviceName Application "$nodePath"
    & $nssmPath set $serviceName AppParameters "$agentScript"
    & $nssmPath set $serviceName AppDirectory "$installDir"
    & $nssmPath set $serviceName DisplayName "SOC Intelligent Security Agent"
    & $nssmPath set $serviceName Description "Monitoriza el sistema y envía datos de seguridad a la plataforma SOC-Inteligente"
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    & $nssmPath set $serviceName ObjectName LocalSystem
    & $nssmPath set $serviceName AppStdout "$dataDir\\agent-stdout.log"
    & $nssmPath set $serviceName AppStderr "$dataDir\\agent-stderr.log"
} else {
    # Crear nuevo servicio
    & $nssmPath install $serviceName "$nodePath" "$agentScript"
    & $nssmPath set $serviceName DisplayName "SOC Intelligent Security Agent"
    & $nssmPath set $serviceName Description "Monitoriza el sistema y envía datos de seguridad a la plataforma SOC-Inteligente"
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    & $nssmPath set $serviceName ObjectName LocalSystem
    & $nssmPath set $serviceName AppStdout "$dataDir\\agent-stdout.log"
    & $nssmPath set $serviceName AppStderr "$dataDir\\agent-stderr.log"
}

# Verificar que el servicio se configuró correctamente
Write-Host "Verificando configuración del servicio..."
$serviceInfo = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $serviceInfo) {
    Write-Host "Error: El servicio no fue creado correctamente." -ForegroundColor Red
    exit 1
}

# Intentar iniciar el servicio con manejo de errores mejorado
Write-Host "Iniciando servicio SOC-Intelligent..."
try {
    Start-Service -Name $serviceName -ErrorAction Stop
    
    # Verificar que el servicio se inició correctamente
    Start-Sleep -Seconds 3
    $serviceStatus = Get-Service -Name $serviceName
    
    if ($serviceStatus.Status -eq "Running") {
        Write-Host "Instalación completada. El agente está en ejecución." -ForegroundColor Green
        Write-Host "ID del Agente: ${config.agentId}" -ForegroundColor Cyan
        Write-Host "Servidor SOC: ${config.serverUrl}" -ForegroundColor Cyan
        Write-Host "Ubicación de logs: $dataDir\\agent-stdout.log" -ForegroundColor Cyan
    } else {
        Write-Host "Advertencia: El servicio fue creado pero no se está ejecutando." -ForegroundColor Yellow
        Write-Host "Estado actual: $($serviceStatus.Status)" -ForegroundColor Yellow
        Write-Host "Verifique los logs en: $dataDir\\agent-stderr.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error al iniciar el servicio: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "El servicio fue instalado pero falló al iniciar." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "1. Verifique que Node.js esté funcionando: $nodePath --version" -ForegroundColor Yellow
    Write-Host "2. Verifique el archivo del agente: $agentScript" -ForegroundColor Yellow
    Write-Host "3. Revise los logs de error en: $dataDir\\agent-stderr.log" -ForegroundColor Yellow
    Write-Host "4. Intente iniciar el servicio manualmente: Start-Service -Name $serviceName" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Para más información, ejecute: Get-EventLog -LogName System -Source 'Service Control Manager' -Newest 5" -ForegroundColor Yellow
    exit 1
}
`;
            // Crear script de desinstalación
            const uninstallScript = `
# Desinstalador del Agente SOC-Inteligente para Windows
# ----------------------------------------------

$ErrorActionPreference = "Stop"

$serviceName = "SOCIntelligentAgent"
$installDir = "C:\\Program Files\\SOCIntelligent"
$dataDir = "C:\\ProgramData\\SOCIntelligent"
$nssmPath = "$installDir\\nssm.exe"

# Detener y eliminar servicio
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Write-Host "Deteniendo servicio..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    
    if (Test-Path $nssmPath) {
        Write-Host "Eliminando servicio..."
        & $nssmPath remove $serviceName confirm
    } else {
        Write-Host "Eliminando servicio con sc..."
        sc.exe delete $serviceName
    }
}

# Eliminar archivos
if (Test-Path $installDir) {
    Write-Host "Eliminando archivos de instalación..."
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Opcionalmente, eliminar datos y configuración
$removeData = Read-Host "¿Desea eliminar también los datos y la configuración? (S/N)"
if ($removeData -eq "S" -or $removeData -eq "s") {
    if (Test-Path $dataDir) {
        Write-Host "Eliminando datos y configuración..."
        Remove-Item -Path $dataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Desinstalación completada." -ForegroundColor Green
`;
            // Crear directorio para archivos del agente
            const agentDir = path.join(buildPath, 'agent');
            await mkdir(agentDir, { recursive: true });
            // Escribir archivos
            await writeFile(path.join(buildPath, 'install.ps1'), installScript, 'utf-8');
            await writeFile(path.join(buildPath, 'uninstall.ps1'), uninstallScript, 'utf-8');
            // Descargar NSSM (Non-Sucking Service Manager) para gestionar servicios de Windows
            await this.downloadFile('https://nssm.cc/release/nssm-2.24.zip', path.join(buildPath, 'nssm.zip'));
            // Extraer NSSM
            await exec(`unzip -j ${path.join(buildPath, 'nssm.zip')} nssm-2.24/win64/nssm.exe -d ${agentDir}`);
            // Compilar agente para Windows
            await this.compileAgent(agentDir, AgentOS.WINDOWS, config, agentId);
        }
        /**
         * Crea archivos necesarios para el agente macOS
         */
        async createMacOSAgentFiles(buildPath, config, agentId) {
            // Crear script de instalación (bash)
            const installScript = `#!/bin/bash
# Instalador del Agente SOC-Inteligente para macOS
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

# Crear directorios necesarios
INSTALL_DIR="/Library/SOCIntelligent"
CONFIG_DIR="/Library/Application Support/SOCIntelligent"
LOG_DIR="/Library/Logs/SOCIntelligent"

mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
chmod 755 "$INSTALL_DIR"
chmod 755 "$CONFIG_DIR" 
chmod 755 "$LOG_DIR"

# Copiar archivos
echo "Instalando archivos del agente..."
cp -Rf ./agent/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/agent-macos"

# Guardar configuración
echo "Configurando agente..."
CONFIG_PATH="$CONFIG_DIR/agent-config.json"
echo '${JSON.stringify(config)}' > "$CONFIG_PATH"
chmod 644 "$CONFIG_PATH"

# Crear archivo de LaunchDaemon
PLIST_PATH="/Library/LaunchDaemons/com.soc-intelligent.agent.plist"
cat > "$PLIST_PATH" << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.soc-intelligent.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/agent-macos</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent-error.log</string>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
</dict>
</plist>
EOL

# Establecer permisos correctos
chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

# Iniciar el servicio
echo "Iniciando agente SOC-Intelligent..."
launchctl load -w "$PLIST_PATH"

echo "Instalación completada. El agente está en ejecución."
echo "ID del Agente: ${config.agentId}"
echo "Servidor SOC: ${config.serverUrl}"
`;
            // Crear script de desinstalación
            const uninstallScript = `#!/bin/bash
# Desinstalador del Agente SOC-Inteligente para macOS
# ----------------------------------------------

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

PLIST_PATH="/Library/LaunchDaemons/com.soc-intelligent.agent.plist"
INSTALL_DIR="/Library/SOCIntelligent"
CONFIG_DIR="/Library/Application Support/SOCIntelligent"
LOG_DIR="/Library/Logs/SOCInteligente"

# Detener y eliminar servicio
if [ -f "$PLIST_PATH" ]; then
  echo "Deteniendo agente..."
  launchctl unload -w "$PLIST_PATH"
  echo "Eliminando archivo LaunchDaemon..."
  rm -f "$PLIST_PATH"
fi

# Eliminar archivos
if [ -d "$INSTALL_DIR" ]; then
  echo "Eliminando archivos de instalación..."
  rm -rf "$INSTALL_DIR"
fi

# Opcionalmente, eliminar datos y configuración
read -p "¿Desea eliminar también los datos y la configuración? (s/n): " REMOVE_DATA
if [ "$REMOVE_DATA" = "s" ] || [ "$REMOVE_DATA" = "S" ]; then
  if [ -d "$CONFIG_DIR" ]; then
    echo "Eliminando datos y configuración..."
    rm -rf "$CONFIG_DIR"
  fi
  if [ -d "$LOG_DIR" ]; then
    echo "Eliminando logs..."
    rm -rf "$LOG_DIR"
  fi
fi

echo "Desinstalación completada."
`;
            // Crear directorio para archivos del agente
            const agentDir = path.join(buildPath, 'agent');
            await mkdir(agentDir, { recursive: true });
            // Escribir archivos
            await writeFile(path.join(buildPath, 'install.sh'), installScript, 'utf-8');
            await writeFile(path.join(buildPath, 'uninstall.sh'), uninstallScript, 'utf-8');
            // Dar permisos de ejecución a los scripts
            await exec(`chmod +x ${path.join(buildPath, 'install.sh')}`);
            await exec(`chmod +x ${path.join(buildPath, 'uninstall.sh')}`);
            // Compilar agente para macOS
            await this.compileAgent(agentDir, AgentOS.MACOS, config, agentId);
        }
        /**
         * Crea archivos necesarios para el agente Linux
         */
        async createLinuxAgentFiles(buildPath, config, agentId) {
            // Crear script de instalación (bash)
            const installScript = `#!/bin/bash
# Instalador del Agente SOC-Inteligente para Linux
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

# Crear directorios necesarios
INSTALL_DIR="/opt/soc-intelligent"
CONFIG_DIR="/etc/soc-intelligent"
LOG_DIR="/var/log/soc-intelligent"

mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
chmod 755 "$INSTALL_DIR"
chmod 750 "$CONFIG_DIR" 
chmod 755 "$LOG_DIR"

# Copiar archivos
echo "Instalando archivos del agente..."
cp -Rf ./agent/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/agent-linux"

# Guardar configuración
echo "Configurando agente..."
CONFIG_PATH="$CONFIG_DIR/agent-config.json"
echo '${JSON.stringify(config)}' > "$CONFIG_PATH"
chmod 640 "$CONFIG_PATH"

# Detectar sistema init
if [ -d /run/systemd/system ]; then
  # SystemD
  echo "Configurando servicio SystemD..."
  cat > /etc/systemd/system/soc-intelligent-agent.service << EOL
[Unit]
Description=SOC Intelligent Security Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/agent-linux
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent-error.log
SyslogIdentifier=soc-agent

[Install]
WantedBy=multi-user.target
EOL

  # Recargar SystemD y activar el servicio
  systemctl daemon-reload
  systemctl enable soc-intelligent-agent
  systemctl start soc-intelligent-agent
  echo "Servicio SystemD instalado y activado."
  
elif [ -x /sbin/initctl ]; then
  # Upstart
  echo "Configurando servicio Upstart..."
  cat > /etc/init/soc-intelligent-agent.conf << EOL
description "SOC Intelligent Security Agent"
author "SOC Intelligent"

start on (runlevel [2345] and started network)
stop on (runlevel [!2345] or stopping network)

respawn
respawn limit 10 5

setuid root
setgid root

exec $INSTALL_DIR/agent-linux >> $LOG_DIR/agent.log 2>> $LOG_DIR/agent-error.log
EOL

  # Iniciar el servicio con Upstart
  initctl reload-configuration
  initctl start soc-intelligent-agent
  echo "Servicio Upstart instalado y activado."
  
else
  # SysV Init
  echo "Configurando servicio SysV Init..."
  cat > /etc/init.d/soc-intelligent-agent << EOL
#!/bin/bash
### BEGIN INIT INFO
# Provides:          soc-intelligent-agent
# Required-Start:    \$network \$remote_fs \$syslog
# Required-Stop:     \$network \$remote_fs \$syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: SOC Intelligent Security Agent
# Description:       SOC Intelligent Security Agent for Linux
### END INIT INFO

DAEMON=$INSTALL_DIR/agent-linux
DAEMON_NAME=soc-intelligent-agent
DAEMON_USER=root
PIDFILE=/var/run/\$DAEMON_NAME.pid
LOG_FILE=$LOG_DIR/agent.log
ERROR_LOG=$LOG_DIR/agent-error.log

do_start() {
  echo "Starting \$DAEMON_NAME"
  start-stop-daemon --start --background --pidfile \$PIDFILE --make-pidfile --user \$DAEMON_USER --chuid \$DAEMON_USER --startas /bin/bash -- -c "exec \$DAEMON >> \$LOG_FILE 2>> \$ERROR_LOG"
}

do_stop() {
  echo "Stopping \$DAEMON_NAME"
  start-stop-daemon --stop --pidfile \$PIDFILE --retry 10
  rm -f \$PIDFILE
}

case "\$1" in
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  restart)
    do_stop
    do_start
    ;;
  status)
    status_of_proc -p \$PIDFILE "\$DAEMON" "\$DAEMON_NAME" && exit 0 || exit \$?
    ;;
  *)
    echo "Usage: /etc/init.d/\$DAEMON_NAME {start|stop|restart|status}"
    exit 1
    ;;
esac
exit 0
EOL

  # Dar permisos al script init
  chmod 755 /etc/init.d/soc-intelligent-agent
  
  # Activar el servicio
  if [ -x /usr/sbin/update-rc.d ]; then
    update-rc.d soc-intelligent-agent defaults
  elif [ -x /sbin/chkconfig ]; then
    chkconfig --add soc-intelligent-agent
    chkconfig soc-intelligent-agent on
  fi
  
  # Iniciar el servicio
  /etc/init.d/soc-intelligent-agent start
  echo "Servicio SysV Init instalado y activado."
fi

echo "Instalación completada. El agente está en ejecución."
echo "ID del Agente: ${config.agentId}"
echo "Servidor SOC: ${config.serverUrl}"
`;
            // Crear script de desinstalación
            const uninstallScript = `#!/bin/bash
# Desinstalador del Agente SOC-Inteligente para Linux
# ----------------------------------------------

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

INSTALL_DIR="/opt/soc-intelligent"
CONFIG_DIR="/etc/soc-intelligent"
LOG_DIR="/var/log/soc-intelligent"

# Detectar sistema init y detener/eliminar el servicio
if [ -d /run/systemd/system ]; then
  # SystemD
  echo "Deteniendo y eliminando servicio SystemD..."
  systemctl stop soc-intelligent-agent
  systemctl disable soc-intelligent-agent
  rm -f /etc/systemd/system/soc-intelligent-agent.service
  systemctl daemon-reload
  
elif [ -x /sbin/initctl ]; then
  # Upstart
  echo "Deteniendo y eliminando servicio Upstart..."
  initctl stop soc-intelligent-agent
  rm -f /etc/init/soc-intelligent-agent.conf
  initctl reload-configuration
  
else
  # SysV Init
  echo "Deteniendo y eliminando servicio SysV Init..."
  /etc/init.d/soc-intelligent-agent stop
  if [ -x /usr/sbin/update-rc.d ]; then
    update-rc.d -f soc-intelligent-agent remove
  elif [ -x /sbin/chkconfig ]; then
    chkconfig --del soc-intelligent-agent
  fi
  rm -f /etc/init.d/soc-intelligent-agent
fi

# Eliminar archivos
if [ -d "$INSTALL_DIR" ]; then
  echo "Eliminando archivos de instalación..."
  rm -rf "$INSTALL_DIR"
fi

# Opcionalmente, eliminar datos y configuración
read -p "¿Desea eliminar también los datos y la configuración? (s/n): " REMOVE_DATA
if [ "$REMOVE_DATA" = "s" ] || [ "$REMOVE_DATA" = "S" ]; then
  if [ -d "$CONFIG_DIR" ]; then
    echo "Eliminando datos y configuración..."
    rm -rf "$CONFIG_DIR"
  fi
  if [ -d "$LOG_DIR" ]; then
    echo "Eliminando logs..."
    rm -rf "$LOG_DIR"
  fi
fi

echo "Desinstalación completada."
`;
            // Crear directorio para archivos del agente
            const agentDir = path.join(buildPath, 'agent');
            await mkdir(agentDir, { recursive: true });
            // Escribir archivos
            await writeFile(path.join(buildPath, 'install.sh'), installScript, 'utf-8');
            await writeFile(path.join(buildPath, 'uninstall.sh'), uninstallScript, 'utf-8');
            // Dar permisos de ejecución a los scripts
            await exec(`chmod +x ${path.join(buildPath, 'install.sh')}`);
            await exec(`chmod +x ${path.join(buildPath, 'uninstall.sh')}`);
            // Compilar agente para Linux
            await this.compileAgent(agentDir, AgentOS.LINUX, config, agentId);
        }
        /**
         * Compila el agente para la plataforma especificada
         */
        async compileAgent(outputDir, os, config, agentId) {
            try {
                console.log(`Compiling Electron agent for ${os}...`);
                
                // Create Electron project structure
                const electronProjectDir = path.join(outputDir, 'electron-project');
                await mkdir(electronProjectDir, { recursive: true });
                
                // Copy agent source files
                const agentsDir = path.join(__dirname, '../../agents');
                await exec(`cp -r "${agentsDir}"/* "${electronProjectDir}"/`);
                
                // Create embedded configuration file
                const embeddedConfig = this.generateAgentConfig(config, agentId);
                await writeFile(path.join(electronProjectDir, 'agent-config.json'), JSON.stringify(embeddedConfig, null, 2), 'utf-8');
                
                // Update package.json for this specific build
                const packageJsonPath = path.join(electronProjectDir, 'package.json');
                const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
                
                // Update electron-builder configuration based on OS
                const buildConfig = {
                    appId: `com.soc.agent.${agentId}`,
                    productName: `SOC Agent ${agentId}`,
                    directories: {
                        output: outputDir
                    },
                    files: [
                        "dist/**/*",
                        "assets/**/*",
                        "agent-config.json",
                        "node_modules/**/*",
                        "!node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
                        "!node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
                        "!node_modules/*.d.ts",
                        "!node_modules/.bin",
                        "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
                        "!.editorconfig",
                        "!**/._*",
                        "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
                        "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
                        "!**/{appveyor.yml,.travis.yml,circle.yml}",
                        "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
                    ],
                    extraResources: [
                        {
                            from: "agent-config.json",
                            to: "agent-config.json"
                        }
                    ]
                };

                // Platform-specific build configuration
                switch (os) {
                    case AgentOS.WINDOWS:
                        buildConfig.win = {
                            target: [{ target: "portable", arch: ["x64"] }],
                            artifactName: `soc-agent-windows-${agentId}-\${arch}.\${ext}`
                        };
                        break;
                    case AgentOS.LINUX:
                        buildConfig.linux = {
                            target: [{ target: "AppImage", arch: ["x64"] }],
                            artifactName: `soc-agent-linux-${agentId}-\${arch}.\${ext}`
                        };
                        break;
                    case AgentOS.MACOS:
                        buildConfig.mac = {
                            target: [{ target: "dmg", arch: ["x64", "arm64"] }],
                            artifactName: `soc-agent-macos-${agentId}-\${arch}.\${ext}`
                        };
                        break;
                }

                packageJson.build = buildConfig;
                await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
                
                // Build the Electron application
                console.log(`Installing dependencies for Electron build...`);
                await exec(`cd "${electronProjectDir}" && npm install --production=false`, { cwd: electronProjectDir });
                
                console.log(`Building and packaging Electron application for ${os}...`);
                const buildCommand = this.getElectronBuildCommand(os);
                await exec(`cd "${electronProjectDir}" && npm run ${buildCommand}`, { cwd: electronProjectDir });
                
                console.log(`Electron agent compiled successfully for ${os}`);
                
            } catch (error) {
                console.error(`Error compiling Electron agent for ${os}:`, error);
                throw error;
            }
        }

        /**
         * Get the appropriate electron-builder command for the OS
         */
        getElectronBuildCommand(os) {
            switch (os) {
                case AgentOS.WINDOWS:
                    return 'build:agent:windows';
                case AgentOS.LINUX:
                    return 'build:agent:linux';
                case AgentOS.MACOS:
                    return 'build:agent:macos';
                default:
                    return 'build:agent';
            }
        }
        /**
         * Obtiene el nombre del archivo principal del agente según el SO
         */
        getAgentMainFile(os) {
            switch (os) {
                case AgentOS.WINDOWS:
                    return 'windows-agent.ts';
                case AgentOS.MACOS:
                    return 'macos-agent.ts';
                case AgentOS.LINUX:
                    return 'linux-agent.ts';
                default:
                    throw new Error(`Unsupported OS: ${os}`);
            }
        }
        /**
         * Obtiene el nombre de la clase del agente según el SO
         */
        getAgentClassName(os) {
            switch (os) {
                case AgentOS.WINDOWS:
                    return 'WindowsAgent';
                case AgentOS.MACOS:
                    return 'MacOSAgent';
                case AgentOS.LINUX:
                    return 'LinuxAgent';
                default:
                    throw new Error(`Unsupported OS: ${os}`);
            }
        }
        /**
         * Descarga un archivo desde una URL
         */
        async downloadFile(url, dest) {
            await exec(`curl -L -o "${dest}" "${url}"`);
        }
        /**
         * Crea un archivo ZIP con el contenido del directorio
         */
        async createZipArchive(sourceDir, outputPath) {
            // Cambiar al directorio y empaquetar todo
            await exec(`cd "${sourceDir}" && zip -r "${outputPath}" .`);
        }
        /**
         * Crea un archivo tarball (tar.gz) con el contenido del directorio
         */
        async createTarArchive(sourceDir, outputPath) {
            // Empaquetar todos los archivos, incluidos ocultos, usando find
            await exec(`cd "${sourceDir}" && tar -czf "${outputPath}" $(find . -mindepth 1 -maxdepth 1 -print)`);
            // Verificar que el archivo se creó y no está vacío
            const stat = await util.promisify(fs.stat)(outputPath).catch(() => null);
            if (!stat || stat.size === 0) {
                throw new Error(`Error creando el archivo tar.gz: el archivo resultante está vacío o no existe (${outputPath})`);
            }
        }
        /**
         * Genera el archivo agent.yaml con la configuración del agente
         */
        async generateAgentYamlConfig(packageDir, config) {
            try {
                // Convertir la configuración a YAML
                const yamlContent = yaml.dump(config, {
                    indent: 2,
                    lineWidth: 120,
                    noRefs: true,
                    sortKeys: false
                });
                // Escribir el archivo YAML
                const yamlPath = path.join(packageDir, 'agent.yaml');
                await writeFile(yamlPath, yamlContent, 'utf-8');
                console.log('agent.yaml configuration file generated successfully');
            }
            catch (error) {
                console.error('Error generating agent.yaml:', error);
                // No fallar el proceso completo si solo falla la generación de YAML
                // El archivo JSON seguirá disponible
            }
        }
        /**
         * Limpia los archivos temporales de construcción
         */
        async cleanupBuildDir(buildPath) {
            // await exec(`rm -rf "${buildPath}"`);
            console.log(`Build files in ${buildPath} preserved for debugging. Remember to clean up manually.`);
        }
    }
    exports.AgentBuilder = AgentBuilder;
});
