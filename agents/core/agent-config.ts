/**
 * Configuración para agentes de SOC-Inteligente
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Import logger - will be initialized later to avoid circular dependency
let logger: any;

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
    } catch (error) {
      // Si el archivo no existe, crear uno con la configuración predeterminada
      (logger || console).log(`Configuration file not found at ${configPath}, creating default`);
      const defaultConfig = {
        ...DEFAULT_CONFIG,
        configPath
      };
      
      await saveConfig(defaultConfig, configPath);
      return defaultConfig;
    }
    
    // Analizar el archivo YAML
    const fileConfig = yaml.load(fileContent) as Partial<AgentConfig>;
    
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
    } catch (error) {
      // Ignorar error si el directorio ya existe
    }
    
    // Convertir a YAML y guardar
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: 100,
      noRefs: true,
    });
    
    await fs.writeFile(savePath, yamlContent, 'utf-8');
    (logger || console).log(`Configuration saved to ${savePath}`);
  } catch (error) {
    (logger || console).error('Error saving configuration:', error);
    throw error;
  }
}