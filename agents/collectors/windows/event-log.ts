/**
 * Colector del Registro de Eventos de Windows usando PowerShell
 */

import { Collector, CollectorConfig } from '../types';
import { Logger } from '../../core/logger';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

// Canales de registro a monitorear
const EVENT_CHANNELS = [
  'Security',
  'System',
  'Application',
  'Microsoft-Windows-PowerShell/Operational'
];

// Callback para procesar eventos
let eventCallback: ((event: any) => void) | null = null;

// Logger instance
let logger: Logger | null = null;

// Control de monitoreo
let isMonitoring = false;
let monitoringInterval: NodeJS.Timeout | null = null;

export const eventLogCollector: Collector = {
  name: 'windows-eventlog',
  description: 'Monitorea eventos de seguridad en el Registro de Eventos de Windows usando PowerShell',
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
      if (isMonitoring) {
        if (logger) {
          logger.warn('Event log collector is already running');
        }
        return true;
      }

      // Verificar que PowerShell esté disponible
      try {
        await exec('powershell -Command "Get-Command Get-WinEvent"');
      } catch (error) {
        if (logger) {
          logger.error('PowerShell o cmdlet Get-WinEvent no disponible. Se requiere PowerShell para el colector de eventos.');
        }
        return false;
      }
      
      if (logger) {
        logger.info('Iniciando colector del Registro de Eventos con PowerShell...');
      }

      // Iniciar monitoreo periódico
      isMonitoring = true;
      monitoringInterval = setInterval(() => {
        collectRecentEvents().catch(error => {
          if (logger) {
            logger.error('Error en recolección periódica de eventos:', error);
          }
        });
      }, 60000); // Cada minuto

      // Realizar recolección inicial
      await collectRecentEvents();
      
      if (logger) {
        logger.info('Colector del Registro de Eventos iniciado exitosamente');
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
      if (!isMonitoring) {
        if (logger) {
          logger.info('Event log collector is not running');
        }
        return true;
      }

      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }

      isMonitoring = false;
      
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
 * Recolecta eventos recientes de todos los canales configurados
 */
async function collectRecentEvents(): Promise<void> {
  if (!eventCallback) {
    return;
  }

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000); // Últimos 60 segundos
  
  for (const channel of EVENT_CHANNELS) {
    try {
      await collectChannelEvents(channel, oneMinuteAgo);
    } catch (error) {
      if (logger) {
        logger.error(`Error recolectando eventos del canal ${channel}:`, error);
      }
    }
  }
}

/**
 * Recolecta eventos de un canal específico
 */
async function collectChannelEvents(channel: string, since: Date): Promise<void> {
  try {
    const startTimeString = since.toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    // Comando PowerShell para obtener eventos recientes
    const command = `powershell -Command "Get-WinEvent -FilterHashtable @{LogName='${channel}'; StartTime='${startTimeString}'} -MaxEvents 50 -ErrorAction SilentlyContinue | Select-Object Id, LevelDisplayName, TimeCreated, Message, ProviderName, MachineName, UserId, @{Name='Properties';Expression={$_.Properties.Value}} | ConvertTo-Json -Depth 3"`;
    
    const { stdout, stderr } = await exec(command, { 
      timeout: 30000,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    if (stderr && stderr.trim()) {
      if (logger) {
        logger.debug(`PowerShell stderr for channel ${channel}: ${stderr.trim()}`);
      }
    }
    
    if (!stdout || stdout.trim() === '') {
      // No hay eventos nuevos
      return;
    }
    
    try {
      const events = JSON.parse(stdout);
      const eventArray = Array.isArray(events) ? events : [events];
      
      for (const event of eventArray) {
        processEventLogEntry(channel, event);
      }
      
      if (logger && eventArray.length > 0) {
        logger.debug(`Procesados ${eventArray.length} eventos del canal ${channel}`);
      }
    } catch (parseError) {
      if (logger) {
        logger.error(`Error parseando JSON de eventos del canal ${channel}:`, parseError);
        logger.debug(`Raw output: ${stdout.substring(0, 500)}...`);
      }
    }
  } catch (error: any) {
    // Filtrar errores comunes y no críticos
    if (error.message && error.message.includes('No events were found')) {
      // Es normal no tener eventos en algunos canales
      return;
    }
    
    if (logger) {
      logger.warn(`Error recolectando eventos del canal ${channel}: ${error.message}`);
    }
  }
}

/**
 * Procesa una entrada del Registro de Eventos desde PowerShell
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
    
    // Extraer campos del evento de PowerShell
    const eventId = eventData.Id || 0;
    const level = eventData.LevelDisplayName || 'Unknown';
    const timeCreated = eventData.TimeCreated || new Date().toISOString();
    const message = eventData.Message || `Evento ${eventId} en ${channel}`;
    const provider = eventData.ProviderName || 'Unknown';
    const computer = eventData.MachineName || 'Unknown';
    const userId = eventData.UserId || undefined;
    const properties = eventData.Properties || [];
    
    // Mapear nivel de evento a severidad
    let severity = 'info';
    if (typeof level === 'string') {
      const lowerLevel = level.toLowerCase();
      if (lowerLevel === 'error' || lowerLevel === 'critical') {
        severity = 'high';
      } else if (lowerLevel === 'warning') {
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
    
    // Crear evento normalizado
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
        provider: String(provider),
        computer: String(computer),
        userId: userId ? String(userId) : undefined,
        properties: Array.isArray(properties) ? properties : []
      }
    };
    
    // Validar evento antes de enviarlo
    if (!normalizedEvent.message || normalizedEvent.message.trim().length === 0) {
      if (logger) {
        logger.warn(`Evento con mensaje vacío ignorado para canal ${channel}`);
      }
      return;
    }
    
    // Enviar evento a través del callback
    if (eventCallback && typeof eventCallback === 'function') {
      try {
        eventCallback(normalizedEvent);
      } catch (error) {
        if (logger) {
          logger.error(`Error en callback de evento para canal ${channel}:`, error);
        }
      }
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