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
      // Cargar el módulo node-windows-eventlog dinámicamente
      try {
        eventlog = require('node-windows-eventlog');
      } catch (error) {
        if (logger) {
          logger.warn('Módulo node-windows-eventlog no encontrado. Instalando...');
        }
        await installDependency('node-windows-eventlog');
        try {
          eventlog = require('node-windows-eventlog');
        } catch (innerError) {
          if (logger) {
            logger.error('No se pudo cargar node-windows-eventlog:', innerError);
          }
          return false;
        }
      }
      
      // Iniciar monitoreo para cada canal
      for (const channel of EVENT_CHANNELS) {
        await startEventLogMonitoring(channel);
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
      // Detener todos los manejadores de eventos
      for (const handler of eventHandlers) {
        if (handler && typeof handler.close === 'function') {
          handler.close();
        }
      }
      
      // Limpiar la lista de manejadores
      eventHandlers.length = 0;
      
      if (logger) {
        logger.info('Colector del Registro de Eventos detenido');
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
    
    if (logger) {
      logger.info(`Iniciando monitoreo para canal: ${channel}`);
    }
    
    // Crear manejador para el canal
    const handler = new eventlog.EventLogMonitor(channel);
    
    // Registrar el manejador
    eventHandlers.push(handler);
    
    // Configurar manejador de eventos
    handler.on('eventlog', (eventData: any) => {
      try {
        // Procesar el evento
        processEventLogEntry(channel, eventData);
      } catch (error) {
        if (logger) {
          logger.error(`Error procesando evento del canal ${channel}:`, error);
        }
      }
    });
    
    // Iniciar el monitoreo
    handler.start();
    
    if (logger) {
      logger.info(`Monitoreo iniciado para canal: ${channel}`);
    }
  } catch (error) {
    if (logger) {
      logger.error(`Error iniciando monitoreo para canal ${channel}:`, error);
    }
  }
}

/**
 * Procesa una entrada del Registro de Eventos
 */
function processEventLogEntry(channel: string, eventData: any): void {
  // Mapear nivel de evento a severidad
  let severity = 'info';
  if (eventData.level === 'Error' || eventData.level === 'Critical') {
    severity = 'high';
  } else if (eventData.level === 'Warning') {
    severity = 'medium';
  }
  
  // Ajustar severidad basado en IDs de eventos conocidos
  if (isSecurityCriticalEvent(channel, eventData.eventId)) {
    severity = 'high';
  }
  
  // Crear evento normalizado
  const normalizedEvent = {
    source: 'windows-eventlog',
    channel,
    type: 'windows_event',
    timestamp: new Date(eventData.timeCreated || Date.now()),
    severity,
    message: eventData.message || `Evento ${eventData.eventId} en ${channel}`,
    details: {
      eventId: eventData.eventId,
      level: eventData.level,
      provider: eventData.providerName,
      computer: eventData.computerName,
      userId: eventData.userId,
      properties: eventData.properties
    }
  };
  
  // Enviar evento a través del callback si está registrado
  if (eventCallback) {
    eventCallback(normalizedEvent);
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
 * Instala una dependencia Node.js
 */
async function installDependency(packageName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    if (logger) {
      logger.info(`Instalando dependencia: ${packageName}`);
    }
    
    exec(`npm install ${packageName}`, (error: any, stdout: string, stderr: string) => {
      if (error) {
        if (logger) {
          logger.error(`Error instalando ${packageName}:`, error);
        }
        reject(error);
        return;
      }
      
      if (logger) {
        logger.info(`Dependencia ${packageName} instalada correctamente`);
      }
      resolve();
    });
  });
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  eventCallback = callback;
}