/**
 * Configuración para agentes de SOC-Inteligente
 */
import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * Configuración predeterminada
 */
export const DEFAULT_CONFIG = {
    // Configuración de conexión al servidor
    serverUrl: 'https://soc-inteligente.replit.app',
    registrationKey: 'default-registration-key',
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
    logFilePath: './agent.log',
    maxStorageSize: 100, // 100 MB
    logLevel: 'info',
    // Personalización avanzada
    directoriesToScan: ['/tmp', '/var/tmp', '/dev/shm', '/home'],
    cpuAlertThreshold: 90
};
/**
 * Carga la configuración desde un archivo JSON
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
            // Si el archivo no existe, crear uno con la configuración predeterminada
            console.log(`Configuration file not found at ${configPath}, creating default`);
            const defaultConfig = {
                ...DEFAULT_CONFIG,
                configPath
            };
            await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
            return defaultConfig;
        }
        // Analizar el archivo JSON
        const fileConfig = JSON.parse(fileContent);
        // Combinar con la configuración predeterminada para asegurar que todos los campos estén presentes
        const config = {
            ...DEFAULT_CONFIG,
            ...fileConfig,
            configPath,
            capabilities: {
                ...DEFAULT_CONFIG.capabilities,
                ...fileConfig.capabilities
            }
        };
        return config;
    }
    catch (error) {
        console.error(`Error loading configuration from ${configPath}:`, error);
        // En caso de error, devolver la configuración predeterminada
        const fallbackConfig = {
            ...DEFAULT_CONFIG,
            configPath
        };
        return fallbackConfig;
    }
}
/**
 * Guarda la configuración en un archivo JSON
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
            // Ignorar error si el directorio ya existe
        }
        // Guardar la configuración
        await fs.writeFile(savePath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`Configuration saved to ${savePath}`);
    }
    catch (error) {
        console.error('Error saving configuration:', error);
        throw error;
    }
}
