/**
 * Registro dinámico de colectores según sistema operativo
 */

import * as os from 'os';
import { Collector } from './types';
import { Logger } from '../core/logger';

// Importación dinámica de colectores
let linuxCollectors: Promise<{ [key: string]: Collector }> | null = null;
let macosCollectors: Promise<{ [key: string]: Collector }> | null = null;
let windowsCollectors: Promise<{ [key: string]: Collector }> | null = null;

/**
 * Obtiene todos los colectores compatibles con el sistema operativo actual
 */
export async function getCompatibleCollectors(logger: Logger): Promise<Collector[]> {
  const platform = os.platform();
  const collectors: Collector[] = [];
  
  logger.info(`Loading collectors for platform: ${platform}`);
  
  try {
    // Cargar colectores específicos de la plataforma
    switch (platform) {
      case 'linux':
        if (!linuxCollectors) {
          linuxCollectors = import('./linux');
        }
        const linuxModules = await linuxCollectors;
        Object.values(linuxModules).forEach(collector => {
          if (isCollector(collector)) {
            collectors.push(collector);
          }
        });
        break;
      
      case 'darwin':
        if (!macosCollectors) {
          macosCollectors = import('./macos');
        }
        const macosModules = await macosCollectors;
        Object.values(macosModules).forEach(collector => {
          if (isCollector(collector)) {
            collectors.push(collector);
          }
        });
        break;
      
      case 'win32':
        if (!windowsCollectors) {
          windowsCollectors = import('./windows');
        }
        const windowsModules = await windowsCollectors;
        Object.values(windowsModules).forEach(collector => {
          if (isCollector(collector)) {
            collectors.push(collector);
          }
        });
        break;
      
      default:
        logger.warn(`Unsupported platform: ${platform}`);
    }
    
    logger.info(`Loaded ${collectors.length} collectors for ${platform}`);
    return collectors;
  } catch (error) {
    logger.error(`Error loading collectors: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Type guard para verificar si un objeto es un colector válido
 */
function isCollector(obj: any): obj is Collector {
  return obj && 
         typeof obj === 'object' &&
         typeof obj.name === 'string' &&
         typeof obj.description === 'string' &&
         Array.isArray(obj.compatibleSystems) &&
         typeof obj.start === 'function' &&
         typeof obj.stop === 'function';
}

/**
 * Carga todos los colectores y filtra por los que están habilitados
 */
export async function loadEnabledCollectors(
  enabledCollectors: string[],
  logger: Logger
): Promise<Collector[]> {
  const allCollectors = await getCompatibleCollectors(logger);
  
  // Filtrar por los habilitados
  return allCollectors.filter(collector => enabledCollectors.includes(collector.name));
}

/**
 * Inicia todos los colectores especificados
 */
export async function startCollectors(collectors: Collector[], logger: Logger): Promise<void> {
  for (const collector of collectors) {
    try {
      logger.info(`Starting collector: ${collector.name}`);
      const success = await collector.start();
      
      if (success) {
        logger.info(`Collector ${collector.name} started successfully`);
      } else {
        logger.warn(`Collector ${collector.name} failed to start`);
      }
    } catch (error) {
      logger.error(`Error starting collector ${collector.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Detiene todos los colectores especificados
 */
export async function stopCollectors(collectors: Collector[], logger: Logger): Promise<void> {
  for (const collector of collectors) {
    try {
      logger.info(`Stopping collector: ${collector.name}`);
      await collector.stop();
    } catch (error) {
      logger.error(`Error stopping collector ${collector.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}