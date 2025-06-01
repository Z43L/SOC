/**
 * Colector del Registro de Eventos de Windows
 */

import { Collector, CollectorConfig } from '../types';
import { Logger } from '../../core/logger';

// Módulo para acceder al Registro de Eventos de Windows
let eventlog: any = null;

// Canales de registro a monitorear
const EVENT_CHANNELS = [
  'Security',
  'System',
  'Application',
  'Microsoft-Windows-PowerShell/Operational'
];

// Manejadores de eventos para cada canal
const eventHandlers: any[] = [];

// Callback para procesar eventos
let eventCallback: ((event: any) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

export const eventLogCollector: Collector = {
  name: 'windows-eventlog',
  description: 'Monitorea eventos de seguridad en el Registro de Eventos de Windows',
  compatibleSystems: ['win32'],
  
  /**
   * Configura el colector
   */
  async configure(config: CollectorConfig): Promise<void> {
    eventCallback = config.eventCallback || null;
    logger = config.logger || null;
  },
  
  /**
   * Inicia el monitoreo del Registro de Eventos
   */
  async start(): Promise<boolean> {
    try {
      // Intentar cargar el módulo node-windows-eventlog
      try {
        eventlog = require('node-windows-eventlog');
      } catch (error) {
        if (logger) {
          logger.error('Módulo node-windows-eventlog no encontrado. Por favor, instálelo manualmente: npm install node-windows-eventlog');
          logger.error('El colector del Registro de Eventos requiere dependencias adicionales para funcionar en Windows');
        }
        return false;
      }
      
      // Verificar que el módulo tiene las funciones necesarias
      if (!eventlog.EventLogMonitor || typeof eventlog.EventLogMonitor !== 'function') {
        if (logger) {
          logger.error('El módulo node-windows-eventlog no tiene la clase EventLogMonitor requerida');
        }
        return false;
      }
      
      // Iniciar monitoreo para cada canal con mejor manejo de errores
      const startResults: boolean[] = [];
      for (const channel of EVENT_CHANNELS) {
        try {
          await startEventLogMonitoring(channel);
          startResults.push(true);
        } catch (error) {
          if (logger) {
            logger.error(`Fallo al iniciar monitoreo para canal ${channel}:`, error);
          }
          startResults.push(false);
        }
      }
      
      // Verificar si al menos un canal se inició correctamente
      const successfulChannels = startResults.filter(result => result).length;
      
      if (successfulChannels === 0) {
        if (logger) {
          logger.error('No se pudo iniciar monitoreo para ningún canal del Registro de Eventos');
        }
        return false;
      }
      
      if (successfulChannels < EVENT_CHANNELS.length) {
        if (logger) {
          logger.warn(`Se iniciaron ${successfulChannels} de ${EVENT_CHANNELS.length} canales del Registro de Eventos`);
        }
      }
      
      if (logger) {
        logger.info('Colector del Registro de Eventos iniciado');
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al iniciar colector del Registro de Eventos:', error);
      }
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo del Registro de Eventos
   */
  async stop(): Promise<boolean> {
    try {
      if (eventHandlers.length === 0) {
        if (logger) {
          logger.info('No hay manejadores de eventos activos para detener');
        }
        return true;
      }
      
      if (logger) {
        logger.info(`Deteniendo ${eventHandlers.length} manejadores de eventos...`);
      }
      
      // Detener todos los manejadores de eventos con validación
      const stopPromises = eventHandlers.map(async (handler, index) => {
        try {
          if (!handler) {
            if (logger) {
              logger.warn(`Manejador en índice ${index} es nulo`);
            }
            return false;
          }
          
          // Intentar diferentes métodos para detener el handler
          if (typeof handler.stop === 'function') {
            await handler.stop();
          } else if (typeof handler.close === 'function') {
            await handler.close();
          } else if (typeof handler.removeAllListeners === 'function') {
            handler.removeAllListeners();
          }
          
          return true;
        } catch (error) {
          if (logger) {
            logger.error(`Error deteniendo manejador en índice ${index}:`, error);
          }
          return false;
        }
      });
      
      // Esperar a que todos los handlers se detengan
      const stopResults = await Promise.allSettled(stopPromises);
      const successfulStops = stopResults.filter(result => 
        result.status === 'fulfilled' && result.value === true
      ).length;
      
      // Limpiar la lista de manejadores
      eventHandlers.length = 0;
      
      // Reset el módulo eventlog
      eventlog = null;
      
      if (logger) {
        logger.info(`Colector del Registro de Eventos detenido (${successfulStops}/${stopResults.length} manejadores detenidos correctamente)`);
      }
      
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error al detener colector del Registro de Eventos:', error);
      }
      return false;
    }
  }
};

/**
 * Inicia el monitoreo para un canal específico del Registro de Eventos
 */
async function startEventLogMonitoring(channel: string): Promise<void> {
  try {
    if (!eventlog) {
      throw new Error('Módulo node-windows-eventlog no inicializado');
    }
    
    // Validar que el canal sea uno de los permitidos
    if (!EVENT_CHANNELS.includes(channel)) {
      throw new Error(`Canal no válido: ${channel}`);
    }
    
    if (logger) {
      logger.info(`Iniciando monitoreo para canal: ${channel}`);
    }
    
    // Verificar que la clase EventLogMonitor exista
    if (!eventlog.EventLogMonitor || typeof eventlog.EventLogMonitor !== 'function') {
      throw new Error('EventLogMonitor no está disponible en el módulo node-windows-eventlog');
    }
    
    // Crear manejador para el canal
    const handler = new eventlog.EventLogMonitor(channel);
    
    // Validar que el handler se creó correctamente
    if (!handler) {
      throw new Error(`No se pudo crear manejador para el canal: ${channel}`);
    }
    
    // Registrar el manejador
    eventHandlers.push(handler);
    
    // Configurar manejador de eventos con validación
    handler.on('eventlog', (eventData: any) => {
      try {
        // Validar datos del evento antes de procesar
        if (!eventData || typeof eventData !== 'object') {
          if (logger) {
            logger.warn(`Datos de evento inválidos recibidos del canal ${channel}`);
          }
          return;
        }
        
        // Procesar el evento
        processEventLogEntry(channel, eventData);
      } catch (error) {
        if (logger) {
          logger.error(`Error procesando evento del canal ${channel}:`, error);
        }
      }
    });
    
    // Manejar errores del handler
    handler.on('error', (error: any) => {
      if (logger) {
        logger.error(`Error en el manejador del canal ${channel}:`, error);
      }
    });
    
    // Iniciar el monitoreo con validación
    try {
      handler.start();
    } catch (startError) {
      throw new Error(`Error al iniciar monitoreo para ${channel}: ${startError}`);
    }
    
    if (logger) {
      logger.info(`Monitoreo iniciado para canal: ${channel}`);
    }
  } catch (error) {
    if (logger) {
      logger.error(`Error iniciando monitoreo para canal ${channel}:`, error);
    }
    // Propagar el error para que el caller pueda manejar fallos
    throw error;
  }
}

/**
 * Procesa una entrada del Registro de Eventos
 */
function processEventLogEntry(channel: string, eventData: any): void {
  try {
    // Validar datos básicos del evento
    if (!eventData || typeof eventData !== 'object') {
      if (logger) {
        logger.warn(`Datos de evento inválidos para canal ${channel}`);
      }
      return;
    }
    
    // Validar campos mínimos requeridos
    const eventId = eventData.eventId || eventData.id || 0;
    const level = eventData.level || eventData.severity || 'Unknown';
    const timeCreated = eventData.timeCreated || eventData.timestamp || new Date().toISOString();
    const message = eventData.message || eventData.description || `Evento ${eventId} en ${channel}`;
    
    // Mapear nivel de evento a severidad con validación
    let severity = 'info';
    if (typeof level === 'string') {
      const lowerLevel = level.toLowerCase();
      if (lowerLevel === 'error' || lowerLevel === 'critical') {
        severity = 'high';
      } else if (lowerLevel === 'warning' || lowerLevel === 'warn') {
        severity = 'medium';
      }
    }
    
    // Ajustar severidad basado en IDs de eventos conocidos
    if (typeof eventId === 'number' && isSecurityCriticalEvent(channel, eventId)) {
      severity = 'high';
    }
    
    // Crear timestamp válido
    let timestamp: Date;
    try {
      timestamp = new Date(timeCreated);
      if (isNaN(timestamp.getTime())) {
        timestamp = new Date();
      }
    } catch {
      timestamp = new Date();
    }
    
    // Crear evento normalizado con validación
    const normalizedEvent = {
      source: 'windows-eventlog',
      channel: String(channel),
      type: 'windows_event' as const,
      timestamp,
      severity,
      message: String(message).substring(0, 1000), // Limitar longitud del mensaje
      details: {
        eventId: Number(eventId) || 0,
        level: String(level),
        provider: String(eventData.providerName || eventData.provider || 'Unknown'),
        computer: String(eventData.computerName || eventData.computer || 'Unknown'),
        userId: eventData.userId ? String(eventData.userId) : undefined,
        properties: eventData.properties || {}
      }
    };
    
    // Validar evento antes de enviarlo
    if (!normalizedEvent.message || normalizedEvent.message.trim().length === 0) {
      if (logger) {
        logger.warn(`Evento con mensaje vacío ignorado para canal ${channel}`);
      }
      return;
    }
    
    // Enviar evento a través del callback si está registrado
    if (eventCallback && typeof eventCallback === 'function') {
      try {
        eventCallback(normalizedEvent);
      } catch (error) {
        if (logger) {
          logger.error(`Error en callback de evento para canal ${channel}:`, error);
        }
      }
    } else if (logger) {
      logger.debug(`No hay callback registrado para procesar evento del canal ${channel}`);
    }
  } catch (error) {
    if (logger) {
      logger.error(`Error procesando entrada del registro de eventos para canal ${channel}:`, error);
    }
  }
}

/**
 * Verifica si un evento es crítico para la seguridad
 */
function isSecurityCriticalEvent(channel: string, eventId: number): boolean {
  if (channel === 'Security') {
    // Eventos críticos del canal Security
    const criticalSecurityEvents = [
      4624, // Successful login
      4625, // Failed login
      4648, // Explicit credential logon
      4649, // A replay attack was detected
      4672, // Special privileges assigned to new logon
      4698, // Scheduled task created
      4699, // Scheduled task deleted
      4700, // Scheduled task enabled
      4701, // Scheduled task disabled
      4702, // Scheduled task updated
      4720, // A user account was created
      4722, // A user account was enabled
      4723, // An attempt was made to change an account's password
      4724, // An attempt was made to reset an account's password
      4725, // A user account was disabled
      4726, // A user account was deleted
      4728, // A member was added to a security-enabled global group
      4732, // A member was added to a security-enabled local group
      4738, // A user account was changed
      4756, // A member was added to a security-enabled universal group
      4767, // A user account was unlocked
      4768, // A Kerberos authentication ticket (TGT) was requested
      4769, // A Kerberos service ticket was requested
      4771, // Kerberos pre-authentication failed
      4776, // The computer attempted to validate the credentials for an account
      4778, // A session was reconnected to a Window Station
      4779, // A session was disconnected from a Window Station
      4798, // A user's local group membership was enumerated
      4799, // A security-enabled local group membership was enumerated
      5140, // A network share object was accessed
      5142, // A network share object was added
      5144, // A network share object was deleted
      5145, // A network share object was checked
      5156, // The Windows Filtering Platform has permitted a connection
      5157  // The Windows Filtering Platform has blocked a connection
    ];
    
    return criticalSecurityEvents.includes(eventId);
  } else if (channel === 'System') {
    // Eventos críticos del canal System
    const criticalSystemEvents = [
      7045, // A service was installed in the system
      7040, // The service start type was changed
      104,  // Log file was cleared
      1102  // The audit log was cleared
    ];
    
    return criticalSystemEvents.includes(eventId);
  } else if (channel === 'Microsoft-Windows-PowerShell/Operational') {
    // Eventos críticos de PowerShell
    const criticalPowerShellEvents = [
      4103, // Module logging
      4104, // Script block logging
      4105, // Command started
      4106  // Command completed
    ];
    
    return criticalPowerShellEvents.includes(eventId);
  }
  
  return false;
}



/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  eventCallback = callback;
}