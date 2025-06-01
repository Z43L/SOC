/**
 * Colector para monitorear carga de módulos del kernel en Linux
 */

import * as fs from 'fs';
import { Collector, CollectorConfig } from '../types';
import { Logger } from '../../core/logger';

// Intervalo de sondeo para módulos
let moduleInterval: NodeJS.Timeout | null = null;

// Último estado de módulos para detectar cambios
let lastModules = new Map<string, KernelModule>();

// Callback para procesar eventos
let moduleEventCallback: ((event: any) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

// Intervalo de sondeo en milisegundos (default: 60 segundos)
const POLL_INTERVAL = 60 * 1000;

// Interfaz para información de módulo del kernel
interface KernelModule {
  name: string;
  size: number;
  usedBy: string[];
  state: string;
}

export const moduleCollector: Collector = {
  name: 'module',
  description: 'Monitorea carga y descarga de módulos del kernel en sistemas Linux',
  compatibleSystems: ['linux'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    moduleEventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo de módulos
   */
  async start(): Promise<boolean> {
    try {
      // Verificar si /proc/modules existe
      if (!fs.existsSync('/proc/modules')) {
        if (logger) {
          logger.warn('/proc/modules no está disponible, el colector de módulos no se iniciará');
        }
        return false;
      }
      
      // Inicializar estado actual
      await checkKernelModules();
      
      // Configurar monitoreo periódico
      moduleInterval = setInterval(async () => {
        await checkKernelModules();
      }, POLL_INTERVAL);
      
      console.log('Colector de módulos del kernel iniciado');
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al iniciar colector de módulos del kernel:', error);
      }
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo de módulos
   */
  async stop(): Promise<boolean> {
    try {
      if (moduleInterval) {
        clearInterval(moduleInterval);
        moduleInterval = null;
        console.log('Colector de módulos del kernel detenido');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al detener colector de módulos del kernel:', error);
      }
      return false;
    }
  }
};

/**
 * Verifica los módulos del kernel cargados
 */
async function checkKernelModules(): Promise<void> {
  try {
    // Leer /proc/modules
    const data = fs.readFileSync('/proc/modules', 'utf8');
    const lines = data.trim().split('\n');
    
    // Mapear módulos actuales
    const currentModules = new Map<string, KernelModule>();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 4) {
        const name = parts[0];
        const size = parseInt(parts[1], 10);
        const usedCount = parseInt(parts[2], 10);
        let usedBy: string[] = [];
        
        // Extraer módulos dependientes
        if (parts[3] !== '-' && usedCount > 0) {
          const usedByStr = parts[3].replace(/,/g, ' ');
          usedBy = usedByStr
            .split(' ')
            .filter(m => m.trim() !== '')
            .map(m => m.replace(/[^\w-]/g, '')); // Limpiar caracteres no alfanuméricos
        }
        
        // Estado del módulo (Live, Loading, Unloading)
        const state = parts.length > 4 ? parts[4].replace(/[()]/g, '') : 'Live';
        
        // Crear objeto del módulo
        const module: KernelModule = {
          name,
          size,
          usedBy,
          state
        };
        
        // Almacenar en el mapa actual
        currentModules.set(name, module);
        
        // Verificar si es un módulo nuevo
        if (!lastModules.has(name)) {
          // Módulo nuevo detectado
          processNewModule(module);
        }
      }
    }
    
    // Detectar módulos descargados
    for (const [name, module] of lastModules.entries()) {
      if (!currentModules.has(name)) {
        // Módulo descargado
        processRemovedModule(module);
      }
    }
    
    // Actualizar estado para la próxima ejecución
    lastModules = currentModules;
  } catch (error) {
    if (logger) {
      logger.error('Error al verificar módulos del kernel:', error);
    }
  }
}

/**
 * Procesa un nuevo módulo del kernel detectado
 */
function processNewModule(module: KernelModule): void {
  // Severidad predeterminada
  let severity = 'info';
  let message = `Nuevo módulo del kernel cargado: ${module.name}`;
  
  // Verificar si es un módulo potencialmente sospechoso
  if (isSuspiciousModule(module)) {
    severity = 'high';
    message = `Módulo del kernel sospechoso cargado: ${module.name}`;
  }
  
  // Crear evento para el nuevo módulo
  const event = {
    source: 'kernel',
    type: 'module_loaded',
    timestamp: new Date(),
    severity,
    message,
    details: {
      name: module.name,
      size: module.size,
      usedBy: module.usedBy,
      state: module.state
    }
  };
  
  // Enviar evento
  if (moduleEventCallback) {
    moduleEventCallback(event);
  }
}

/**
 * Procesa un módulo del kernel descargado
 */
function processRemovedModule(module: KernelModule): void {
  // Crear evento para el módulo descargado
  const event = {
    source: 'kernel',
    type: 'module_unloaded',
    timestamp: new Date(),
    severity: 'info',
    message: `Módulo del kernel descargado: ${module.name}`,
    details: {
      name: module.name,
      size: module.size,
      usedBy: module.usedBy,
      state: module.state
    }
  };
  
  // Enviar evento
  if (moduleEventCallback) {
    moduleEventCallback(event);
  }
}

/**
 * Verifica si un módulo del kernel es potencialmente sospechoso
 */
function isSuspiciousModule(module: KernelModule): boolean {
  // Lista de nombres sospechosos de módulos
  const suspiciousNames = [
    'hide', 'rootkit', 'intercept', 'hook', 'inject',
    'stealth', 'spy', 'keylog', 'capture', 'backdoor'
  ];
  
  // Verificar si el nombre contiene alguna palabra sospechosa
  for (const suspicious of suspiciousNames) {
    if (module.name.toLowerCase().includes(suspicious)) {
      return true;
    }
  }
  
  // Módulos específicos conocidos por ser utilizados en rootkits
  const knownMaliciousModules = [
    'jynx', 'suterusu', 'azazel', 'adore', 'knark',
    'modhide', 'kloak', 'diamorphine', 'reptile'
  ];
  
  // Verificar si es un módulo conocido como malicioso
  if (knownMaliciousModules.includes(module.name.toLowerCase())) {
    return true;
  }
  
  return false;
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  moduleEventCallback = callback;
}