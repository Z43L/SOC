/**
 * Colector de Servicios de Windows
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

// Cache de servicios para detectar cambios
let servicesCache = new Map<string, ServiceInfo>();

// Servicios críticos que deben estar siempre ejecutándose
const CRITICAL_SERVICES = new Set([
  'Windows Defender Antivirus Service',
  'Windows Security Service',
  'Windows Firewall',
  'Windows Update',
  'Windows Event Log',
  'Security Accounts Manager',
  'Local Security Authority Process',
  'Windows Management Instrumentation'
]);

interface ServiceInfo {
  name: string;
  displayName: string;
  state: string;
  startMode: string;
  pathName?: string;
  pid?: number;
}

export const servicesCollector: Collector = {
  name: 'windows-services',
  description: 'Monitorea servicios de Windows para detectar cambios de estado y servicios sospechosos',
  compatibleSystems: ['win32'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    eventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo de servicios
   */
  async start(): Promise<boolean> {
    try {
      if (logger) {
        logger.info('Iniciando colector de servicios de Windows...');
      }
      
      // Verificar que estamos en Windows
      if (process.platform !== 'win32') {
        if (logger) {
          logger.error('El colector de servicios solo funciona en sistemas Windows');
        }
        return false;
      }
      
      // Realizar escaneo inicial
      await scanServices();
      
      // Configurar monitoreo periódico cada 60 segundos
      monitoringInterval = setInterval(() => {
        scanServices().catch(error => {
          if (logger) {
            logger.error('Error en escaneo de servicios periódico:', error);
          }
        });
      }, 60000);
      
      if (logger) {
        logger.info('Colector de servicios iniciado correctamente');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al iniciar colector de servicios:', error);
      }
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo de servicios
   */
  async stop(): Promise<boolean> {
    try {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
      
      // Limpiar cache
      servicesCache.clear();
      
      if (logger) {
        logger.info('Colector de servicios detenido');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al detener colector de servicios:', error);
      }
      return false;
    }
  }
};

/**
 * Escanea servicios del sistema
 */
async function scanServices(): Promise<void> {
  try {
    // Obtener lista de servicios usando sc query
    const services = await getSystemServices();
    
    // Detectar servicios nuevos, modificados y eliminados
    const currentServices = new Map<string, ServiceInfo>();
    
    for (const service of services) {
      currentServices.set(service.name, service);
      
      const previousService = servicesCache.get(service.name);
      
      if (!previousService) {
        // Servicio nuevo
        await reportServiceChange('service_created', service);
      } else if (previousService.state !== service.state) {
        // Cambio de estado
        await reportServiceChange('state_changed', service, previousService);
      } else if (previousService.startMode !== service.startMode) {
        // Cambio de modo de inicio
        await reportServiceChange('startmode_changed', service, previousService);
      }
    }
    
    // Detectar servicios eliminados
    for (const [serviceName, previousService] of servicesCache) {
      if (!currentServices.has(serviceName)) {
        await reportServiceChange('service_deleted', previousService);
      }
    }
    
    // Verificar servicios críticos
    await checkCriticalServices(currentServices);
    
    // Actualizar cache
    servicesCache = currentServices;
    
  } catch (error) {
    if (logger) {
      logger.error('Error escaneando servicios:', error);
    }
  }
}

/**
 * Obtiene lista de servicios usando sc query y WMI
 */
async function getSystemServices(): Promise<ServiceInfo[]> {
  try {
    // Usar WMI para obtener información detallada de servicios
    const wmiQuery = `wmic service get Name,DisplayName,State,StartMode,PathName,ProcessId /format:csv`;
    const { stdout } = await exec(wmiQuery, { timeout: 30000 });
    
    const lines = stdout.split('\n').slice(1); // Omitir header
    const services: ServiceInfo[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        // Parse CSV output from WMI
        const columns = line.split(',');
        
        if (columns.length >= 6) {
          const service: ServiceInfo = {
            name: (columns[2] || '').trim(),
            displayName: (columns[1] || '').trim(),
            state: (columns[4] || '').trim(),
            startMode: (columns[3] || '').trim(),
            pathName: (columns[2] || '').trim(),
            pid: parseInt(columns[5]) || undefined
          };
          
          if (service.name && service.name !== 'Name') {
            services.push(service);
          }
        }
      } catch (parseError) {
        // Ignorar líneas que no se puedan parsear
        continue;
      }
    }
    
    return services;
  } catch (error) {
    if (logger) {
      logger.warn('Error obteniendo servicios con WMI, intentando con sc query:', error);
    }
    
    // Fallback a sc query si WMI falla
    return await getServicesWithScQuery();
  }
}

/**
 * Obtiene servicios usando sc query como fallback
 */
async function getServicesWithScQuery(): Promise<ServiceInfo[]> {
  try {
    const { stdout } = await exec('sc query type=service state=all', { timeout: 20000 });
    
    const services: ServiceInfo[] = [];
    const serviceBlocks = stdout.split('\n\n');
    
    for (const block of serviceBlocks) {
      if (!block.trim()) continue;
      
      try {
        const lines = block.split('\n').map(line => line.trim());
        let serviceName = '';
        let displayName = '';
        let state = '';
        
        for (const line of lines) {
          if (line.startsWith('SERVICE_NAME:')) {
            serviceName = line.substring(13).trim();
          } else if (line.startsWith('DISPLAY_NAME:')) {
            displayName = line.substring(13).trim();
          } else if (line.includes('STATE')) {
            const stateParts = line.split(/\s+/);
            state = stateParts[3] || '';
          }
        }
        
        if (serviceName) {
          services.push({
            name: serviceName,
            displayName: displayName || serviceName,
            state: state || 'Unknown',
            startMode: 'Unknown'
          });
        }
      } catch (parseError) {
        continue;
      }
    }
    
    return services;
  } catch (error) {
    if (logger) {
      logger.error('Error obteniendo servicios con sc query:', error);
    }
    return [];
  }
}

/**
 * Verifica el estado de servicios críticos
 */
async function checkCriticalServices(currentServices: Map<string, ServiceInfo>): Promise<void> {
  try {
    for (const service of currentServices.values()) {
      if (CRITICAL_SERVICES.has(service.displayName) || CRITICAL_SERVICES.has(service.name)) {
        if (service.state !== 'Running' && service.state !== 'RUNNING') {
          await reportCriticalServiceDown(service);
        }
      }
    }
  } catch (error) {
    if (logger) {
      logger.error('Error verificando servicios críticos:', error);
    }
  }
}

/**
 * Reporta cambios en servicios
 */
async function reportServiceChange(
  changeType: string, 
  service: ServiceInfo, 
  previousService?: ServiceInfo
): Promise<void> {
  try {
    let severity: 'info' | 'low' | 'medium' | 'high' = 'info';
    let message = '';
    
    switch (changeType) {
      case 'service_created':
        severity = 'medium';
        message = `Nuevo servicio creado: ${service.displayName} (${service.name})`;
        break;
        
      case 'service_deleted':
        severity = 'medium';
        message = `Servicio eliminado: ${service.displayName} (${service.name})`;
        break;
        
      case 'state_changed':
        severity = service.state === 'Running' ? 'info' : 'medium';
        message = `Servicio cambió de estado: ${service.displayName} - ${previousService?.state} → ${service.state}`;
        break;
        
      case 'startmode_changed':
        severity = 'medium';
        message = `Servicio cambió modo de inicio: ${service.displayName} - ${previousService?.startMode} → ${service.startMode}`;
        break;
        
      default:
        message = `Cambio detectado en servicio: ${service.displayName}`;
    }
    
    // Aumentar severidad si es un servicio crítico
    if (CRITICAL_SERVICES.has(service.displayName) || CRITICAL_SERVICES.has(service.name)) {
      if (severity === 'info') severity = 'medium';
      if (severity === 'medium') severity = 'high';
    }
    
    const event = {
      eventType: 'system' as const,
      severity,
      timestamp: new Date(),
      message,
      details: {
        changeType,
        service,
        previousService,
        isCritical: CRITICAL_SERVICES.has(service.displayName) || CRITICAL_SERVICES.has(service.name)
      }
    };
    
    if (eventCallback) {
      eventCallback(event);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error reportando cambio de servicio:', error);
    }
  }
}

/**
 * Reporta cuando un servicio crítico está detenido
 */
async function reportCriticalServiceDown(service: ServiceInfo): Promise<void> {
  try {
    const event = {
      eventType: 'system' as const,
      severity: 'high' as const,
      timestamp: new Date(),
      message: `CRÍTICO: Servicio esencial detenido - ${service.displayName} (${service.name})`,
      details: {
        service,
        reason: 'Critical service not running',
        recommendation: 'Verify service status and restart if necessary'
      }
    };
    
    if (eventCallback) {
      eventCallback(event);
    }
    
  } catch (error) {
    if (logger) {
      logger.error('Error reportando servicio crítico detenido:', error);
    }
  }
}