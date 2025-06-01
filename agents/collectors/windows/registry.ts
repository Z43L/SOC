/**
 * Colector del Registro de Windows
 */

import { Collector, CollectorConfig, AgentEvent } from '../types';
import { Logger } from '../../core/logger';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

// Callback para procesar eventos
let eventCallback: ((event: Omit<AgentEvent, 'agentId' | 'agentVersion' | 'hostId'>) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

// Intervalo de monitoreo
let monitoringInterval: NodeJS.Timeout | null = null;

// Cache del estado del registro
let registryCache = new Map<string, any>();

// Claves críticas del registro a monitorear
const CRITICAL_REGISTRY_KEYS = [
  // Autorun / Startup
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  
  // Servicios
  'HKLM\\SYSTEM\\CurrentControlSet\\Services',
  
  // Políticas de seguridad
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies',
  
  // Windows Defender
  'HKLM\\SOFTWARE\\Microsoft\\Windows Defender',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender',
  
  // Firewall
  'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy',
  
  // UAC
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
  
  // Network settings
  'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
  
  // Proxy settings
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
];

export const registryCollector: Collector = {
  name: 'windows-registry',
  description: 'Monitorea cambios críticos en el Registro de Windows',
  compatibleSystems: ['win32'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    eventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo del registro
   */
  async start(): Promise<boolean> {
    try {
      if (logger) {
        logger.info('Iniciando colector del Registro de Windows...');
      }
      
      // Verificar que estamos en Windows
      if (process.platform !== 'win32') {
        if (logger) {
          logger.error('El colector del registro solo funciona en sistemas Windows');
        }
        return false;
      }
      
      // Realizar escaneo inicial para establecer baseline
      await scanRegistryKeys();
      
      // Configurar monitoreo periódico cada 60 segundos
      monitoringInterval = setInterval(() => {
        scanRegistryKeys().catch(error => {
          if (logger) {
            logger.error('Error en escaneo del registro periódico:', error);
          }
        });
      }, 60000);
      
      if (logger) {
        logger.info('Colector del registro iniciado correctamente');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al iniciar colector del registro:', error);
      }
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo del registro
   */
  async stop(): Promise<boolean> {
    try {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
      
      // Limpiar cache
      registryCache.clear();
      
      if (logger) {
        logger.info('Colector del registro detenido');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al detener colector del registro:', error);
      }
      return false;
    }
  }
};

/**
 * Escanea las claves críticas del registro
 */
async function scanRegistryKeys(): Promise<void> {
  try {
    for (const keyPath of CRITICAL_REGISTRY_KEYS) {
      try {
        await scanRegistryKey(keyPath);
      } catch (error) {
        // Continuar con otras claves si una falla
        if (logger) {
          logger.warn(`Error escaneando clave del registro ${keyPath}:`, error);
        }
      }
    }
  } catch (error) {
    if (logger) {
      logger.error('Error en escaneo general del registro:', error);
    }
  }
}

/**
 * Escanea una clave específica del registro
 */
async function scanRegistryKey(keyPath: string): Promise<void> {
  try {
    // Usar reg query para obtener valores de la clave
    const { stdout } = await exec(`reg query "${keyPath}" /s`, { 
      timeout: 10000 // Timeout de 10 segundos
    });
    
    // Parse del output del comando reg query
    const currentState = parseRegQueryOutput(stdout);
    
    // Comparar con estado anterior si existe
    const previousState = registryCache.get(keyPath);
    
    if (previousState) {
      // Detectar cambios
      const changes = detectRegistryChanges(keyPath, previousState, currentState);
      
      // Reportar cambios si los hay
      for (const change of changes) {
        await reportRegistryChange(keyPath, change);
      }
    }
    
    // Actualizar cache
    registryCache.set(keyPath, currentState);
    
  } catch (error) {
    // Ignorar errores de acceso denegado o claves inexistentes
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('Access is denied') && 
        !errorMessage.includes('The system cannot find') &&
        !errorMessage.includes('ERROR: The system was unable to find')) {
      throw error;
    }
  }
}

/**
 * Parsea la salida del comando reg query
 */
function parseRegQueryOutput(output: string): Map<string, any> {
  const result = new Map<string, any>();
  
  try {
    const lines = output.split('\n');
    let currentKey = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) continue;
      
      // Detectar líneas de clave
      if (trimmedLine.startsWith('HKEY_') || trimmedLine.includes('\\')) {
        currentKey = trimmedLine;
        if (!result.has(currentKey)) {
          result.set(currentKey, new Map<string, any>());
        }
        continue;
      }
      
      // Detectar líneas de valor
      if (currentKey && trimmedLine.includes('REG_')) {
        const parts = trimmedLine.split(/\s+/);
        if (parts.length >= 3) {
          const valueName = parts[0];
          const valueType = parts[1];
          const valueData = parts.slice(2).join(' ');
          
          const keyData = result.get(currentKey) || new Map();
          keyData.set(valueName, { type: valueType, data: valueData });
          result.set(currentKey, keyData);
        }
      }
    }
  } catch (error) {
    if (logger) {
      logger.error('Error parseando salida de reg query:', error);
    }
  }
  
  return result;
}

/**
 * Detecta cambios entre dos estados del registro
 */
function detectRegistryChanges(keyPath: string, previousState: Map<string, any>, currentState: Map<string, any>): any[] {
  const changes: any[] = [];
  
  try {
    // Detectar claves nuevas
    for (const [subkey, values] of currentState) {
      if (!previousState.has(subkey)) {
        changes.push({
          type: 'key_added',
          subkey,
          values
        });
        continue;
      }
      
      // Detectar valores nuevos o modificados
      const previousValues = previousState.get(subkey) || new Map();
      const currentValues = values || new Map();
      
      for (const [valueName, valueData] of currentValues) {
        if (!previousValues.has(valueName)) {
          changes.push({
            type: 'value_added',
            subkey,
            valueName,
            valueData
          });
        } else {
          const previousData = previousValues.get(valueName);
          if (JSON.stringify(previousData) !== JSON.stringify(valueData)) {
            changes.push({
              type: 'value_modified',
              subkey,
              valueName,
              previousData,
              currentData: valueData
            });
          }
        }
      }
      
      // Detectar valores eliminados
      for (const [valueName] of previousValues) {
        if (!currentValues.has(valueName)) {
          changes.push({
            type: 'value_deleted',
            subkey,
            valueName,
            previousData: previousValues.get(valueName)
          });
        }
      }
    }
    
    // Detectar claves eliminadas
    for (const [subkey] of previousState) {
      if (!currentState.has(subkey)) {
        changes.push({
          type: 'key_deleted',
          subkey,
          previousValues: previousState.get(subkey)
        });
      }
    }
  } catch (error) {
    if (logger) {
      logger.error('Error detectando cambios del registro:', error);
    }
  }
  
  return changes;
}

/**
 * Reporta un cambio en el registro
 */
async function reportRegistryChange(keyPath: string, change: any): Promise<void> {
  try {
    // Determinar severidad basada en el tipo de cambio y la clave
    let severity: 'info' | 'low' | 'medium' | 'high' = 'medium';
    
    // Cambios en claves críticas son más importantes
    if (keyPath.includes('\\Run') || 
        keyPath.includes('\\Services') || 
        keyPath.includes('\\Policies\\System') ||
        keyPath.includes('Windows Defender')) {
      severity = 'high';
    }
    
    // Construir mensaje descriptivo
    let message = '';
    switch (change.type) {
      case 'key_added':
        message = `Nueva clave de registro creada: ${change.subkey}`;
        break;
      case 'key_deleted':
        message = `Clave de registro eliminada: ${change.subkey}`;
        break;
      case 'value_added':
        message = `Nuevo valor agregado en registro: ${change.subkey}\\${change.valueName}`;
        break;
      case 'value_modified':
        message = `Valor del registro modificado: ${change.subkey}\\${change.valueName}`;
        break;
      case 'value_deleted':
        message = `Valor del registro eliminado: ${change.subkey}\\${change.valueName}`;
        break;
      default:
        message = `Cambio detectado en registro: ${keyPath}`;
    }
    
    const event = {
      eventType: 'registry' as const,
      severity,
      timestamp: new Date(),
      message,
      details: {
        keyPath,
        change,
        changeType: change.type
      }
    };
    
    if (eventCallback) {
      eventCallback(event);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error reportando cambio del registro:', error);
    }
  }
}