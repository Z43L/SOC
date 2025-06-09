/**
 * Configuración para agentes de SOC-Inteligente
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
// Import logger - will be initialized later to avoid circular dependency
let logger;
/**
 * Validates the integrity of the agent binary
 */
export async function validateAgentIntegrity(expectedHash) {
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
export function encryptConfigValue(value, secret) {
    const cipher = crypto.createCipher('aes-256-cbc', secret);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}
/**
 * Decrypts sensitive configuration values
 */
export function decryptConfigValue(encryptedValue, secret) {
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
export function validateConfig(config) {
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
export function resolveAgentPath(relativePath) {
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    const execDir = path.dirname(process.execPath);
    return path.resolve(execDir, relativePath);
}
/**
 * Configuración predeterminada
 */
export const DEFAULT_CONFIG = {
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
    transport: 'https',
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
export async function loadConfig(configPath) {
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
                    ...DEFAULT_CONFIG,
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
            ...DEFAULT_CONFIG,
            ...fileConfig,
            configPath,
            capabilities: {
                ...DEFAULT_CONFIG.capabilities,
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
            ...DEFAULT_CONFIG,
            configPath
        };
        return fallbackConfig;
    }
}
/**
 * Guarda la configuración en un archivo YAML
 */
export async function saveConfig(config, configPath) {
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
