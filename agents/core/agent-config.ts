/**
 * Configuración para agentes de SOC-Inteligente
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Import logger - will be initialized later to avoid circular dependency
let logger: any;

/**
 * Validates the integrity of configuration values
 */
export function validateConfig(config: Partial<AgentConfig>): string[] {
  const errors: string[] = [];
  
  // Validate required fields
  if (!config.serverUrl) {
    errors.push('serverUrl is required');
  } else if (!config.serverUrl.startsWith('http://') && !config.serverUrl.startsWith('https://')) {
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
export function resolveAgentPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  
  const execDir = path.dirname(process.execPath);
  return path.resolve(execDir, relativePath);
}

/**
 * Capacidades soportadas por el agente
 */
export interface AgentCapabilities {
  fileSystemMonitoring: boolean;
  processMonitoring: boolean;
  networkMonitoring: boolean;
  registryMonitoring: boolean;
  securityLogsMonitoring: boolean;
  malwareScanning: boolean;
  vulnerabilityScanning: boolean;
}

/**
 * Configuración del agente
 */
export interface AgentConfig {
  // Configuración de conexión al servidor
  serverUrl: string;
  organizationKey: string;
  
  // Identificación del agente (se obtiene al registrarse)
  agentId?: string;
  
  // Intervalos (en segundos)
  heartbeatInterval: number;
  dataUploadInterval: number;
  scanInterval: number;
  
  // Endpoints
  registrationEndpoint: string;
  dataEndpoint: string;
  heartbeatEndpoint: string;
  
  // Seguridad
  signMessages: boolean;
  privateKeyPath?: string;
  serverPublicKeyPath?: string;
  
  // Capacidades
  capabilities: AgentCapabilities;
  
  // Almacenamiento y registros
  configPath: string;
  logFilePath: string;
  maxStorageSize: number; // En MB
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Cola de eventos
  queueSize: number;
  queuePersistPath?: string;
  
  // Transporte
  transport: 'https' | 'websocket';
  compressionEnabled: boolean;
  
  // Comandos push
  enableCommands: boolean;
  allowedCommands?: string[];
  
  // Personalización avanzada
  directoriesToScan?: string[];
  cpuAlertThreshold?: number;
}

/**
 * Configuración predeterminada
 */
export const DEFAULT_CONFIG: Omit<AgentConfig, 'configPath'> = {
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
export async function loadConfig(configPath: string): Promise<AgentConfig> {
  try {
    // Crear directorio si no existe
    const directory = path.dirname(configPath);
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      // Ignorar error si el directorio ya existe
    }
    
    // Intentar leer el archivo de configuración
    let fileContent: string;
    try {
      fileContent = await fs.readFile(configPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Si el archivo no existe, crear uno con la configuración predeterminada
        (logger || console).log(`Configuration file not found at ${configPath}, creating default`);
        const defaultConfig = {
          ...DEFAULT_CONFIG,
          configPath
        };
        
        await saveConfig(defaultConfig, configPath);
        return defaultConfig;
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied reading configuration file: ${configPath}`);
      } else {
        throw new Error(`Failed to read configuration file: ${error.message}`);
      }
    }
    
    // Analizar el archivo YAML
    let fileConfig: Partial<AgentConfig>;
    try {
      fileConfig = yaml.load(fileContent) as Partial<AgentConfig>;
      if (!fileConfig || typeof fileConfig !== 'object') {
        throw new Error('Configuration file does not contain valid YAML object');
      }
    } catch (yamlError: any) {
      throw new Error(`Failed to parse YAML configuration: ${yamlError.message}`);
    }
    
    // Validate configuration before merging
    const validationErrors = validateConfig(fileConfig);
    if (validationErrors.length > 0) {
      (logger || console).warn(`Configuration validation warnings: ${validationErrors.join(', ')}`);
    }
    
    // Combinar con la configuración predeterminada para asegurar que todos los campos estén presentes
    const config: AgentConfig = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      configPath,
      capabilities: {
        ...DEFAULT_CONFIG.capabilities,
        ...(fileConfig.capabilities || {})
      }
    };
    
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
  } catch (error) {
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
export async function saveConfig(config: AgentConfig, configPath?: string): Promise<void> {
  try {
    const savePath = configPath || config.configPath;
    
    // Crear directorio si no existe
    const directory = path.dirname(savePath);
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${directory}: ${error.message}`);
      }
    }
    
    // Convertir a YAML y guardar
    let yamlContent: string;
    try {
      yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 100,
        noRefs: true,
      });
    } catch (yamlError: any) {
      throw new Error(`Failed to serialize configuration to YAML: ${yamlError.message}`);
    }
    
    try {
      await fs.writeFile(savePath, yamlContent, 'utf-8');
      (logger || console).log(`Configuration saved to ${savePath}`);
    } catch (writeError: any) {
      if (writeError.code === 'EACCES') {
        throw new Error(`Permission denied writing to configuration file: ${savePath}`);
      } else {
        throw new Error(`Failed to write configuration file: ${writeError.message}`);
      }
    }
  } catch (error) {
    (logger || console).error('Error saving configuration:', error);
    throw error;
  }
}