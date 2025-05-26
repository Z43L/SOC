/**
 * Módulo principal de conectores
 * Proporciona funciones para gestionar y utilizar los diferentes tipos de conectores
 */

import { Connector } from '@shared/schema';
import { storage } from '../../storage';
import { log } from '../../vite';
import { BaseConnector, ConnectorType, ConnectorConfig } from './base';
import type { ConnectorResult } from './base';
import { APIConnector } from './api';
import { SyslogConnector } from './syslog';
import { AgentConnector } from './agent';
import { VirusTotalConnector, OTXConnector, MISPConnector } from './implementations';
import express from 'express';

// Exportar tipos y clases
export { 
  ConnectorType, 
  ConnectorResult,
  BaseConnector, 
  APIConnector, 
  SyslogConnector, 
  AgentConnector,
  VirusTotalConnector,
  OTXConnector,
  MISPConnector
 };

// Mapa de conectores activos
const activeConnectors: Map<number, BaseConnector> = new Map();

// Mapa de intervalos de polling
const pollingIntervals: Map<number, NodeJS.Timeout> = new Map();

/**
 * Inicializa todos los conectores en el sistema
 */
export async function initializeConnectors(app: express.Express): Promise<void> {
  try {
    log('Inicializando conectores...', 'connectors');
    
    // Obtener todos los conectores de la base de datos
    const connectors = await storage.listConnectors();
    
    log(`Se encontraron ${connectors.length} conectores configurados`, 'connectors');
    
    // Inicializar cada conector activo
    for (const connector of connectors) {
      if (connector.isActive) {
        await initializeConnector(connector, app);
      }
    }
    
    log('Inicialización de conectores completada', 'connectors');
  } catch (error) {
    log(`Error inicializando conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
  }
}

/**
 * Inicializa un conector específico
 */
export async function initializeConnector(connector: Connector, app: express.Express): Promise<BaseConnector | null> {
  try {
    log(`Inicializando conector ${connector.name} (ID: ${connector.id})`, 'connectors');
    
    // Detener si ya existe un conector activo con el mismo ID
    if (activeConnectors.has(connector.id)) {
      shutdownConnector(connector.id);
    }
    
    // Crear instancia del conector según su tipo
    let connectorInstance: BaseConnector | null = null;
    
    // Leer y tipar configuración
    const config = connector.configuration as ConnectorConfig;
    const connectorType = config.connectionMethod?.toLowerCase() || 'api';
    
    // Primero intentamos detectar proveedores específicos
    const vendor = connector.vendor.toLowerCase();
    
    if (connectorType === 'api') {
      // Usar conectores específicos para proveedores conocidos
      if (vendor === 'virustotal') {
        log(`Inicializando conector específico de VirusTotal para ${connector.name}`, 'connectors');
        connectorInstance = new VirusTotalConnector(connector);
      } else if (vendor === 'otx' || vendor === 'alienvault' || vendor === 'alienvault otx') {
        log(`Inicializando conector específico de OTX AlienVault para ${connector.name}`, 'connectors');
        connectorInstance = new OTXConnector(connector);
      } else if (vendor === 'misp') {
        log(`Inicializando conector específico de MISP para ${connector.name}`, 'connectors');
        connectorInstance = new MISPConnector(connector);
      } else {
        log(`Inicializando conector API genérico para ${connector.name}`, 'connectors');
        connectorInstance = new APIConnector(connector);
      }
    } else {
      // Para otros tipos de conectores
      switch (connectorType) {
        case 'syslog':
          connectorInstance = new SyslogConnector(connector);
          break;
        case 'agent':
          const agentConnector = new AgentConnector(connector);
          
          // Registrar endpoints en Express para los agentes
          app.use(agentConnector.getRouter());
          
          connectorInstance = agentConnector;
          break;
        default:
          log(`Tipo de conector no soportado: ${connectorType}`, 'connectors');
          return null;
      }
    }
    
    // Configuración válida
    if (!connectorInstance.validateConfig()) {
      log(`Configuración inválida para conector ${connector.name}`, 'connectors');
      return null;
    }
    
    // Ejecutar el conector por primera vez
    const result = await connectorInstance.execute();
    
    if (result.success) {
      log(`Conector ${connector.name} inicializado correctamente`, 'connectors');
      
      // Guardar en mapa de conectores activos
      activeConnectors.set(connector.id, connectorInstance);
      
      // Configurar polling periódico si es un conector API
      if (connectorType === 'api') {
        const apiConfig = config as any;
        const pollingInterval = apiConfig.pollingInterval || 300; // 5 minutos por defecto
        
        log(`Configurando polling para ${connector.name} cada ${pollingInterval} segundos`, 'connectors');
        
        const intervalId = setInterval(async () => {
          try {
            log(`Ejecutando polling para ${connector.name}`, 'connectors');
            const pollResult = await connectorInstance!.execute();
            log(`Resultado de polling para ${connector.name}: ${pollResult.success ? 'Éxito' : 'Error'} - ${pollResult.message}`, 'connectors');
          } catch (error) {
            log(`Error en polling para ${connector.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
          }
        }, pollingInterval * 1000);
        
        // Guardar referencia al intervalo
        pollingIntervals.set(connector.id, intervalId);
      }
      
      return connectorInstance;
    } else {
      log(`Error inicializando conector ${connector.name}: ${result.message}`, 'connectors');
      return null;
    }
  } catch (error) {
    log(`Error inicializando conector ${connector.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
    return null;
  }
}

/**
 * Detiene y elimina un conector activo
 */
export function shutdownConnector(connectorId: number): void {
  // Detener intervalo de polling si existe
  if (pollingIntervals.has(connectorId)) {
    clearInterval(pollingIntervals.get(connectorId)!);
    pollingIntervals.delete(connectorId);
    log(`Polling detenido para conector ID ${connectorId}`, 'connectors');
  }
  
  // Eliminar del mapa de conectores activos
  if (activeConnectors.has(connectorId)) {
    activeConnectors.delete(connectorId);
    log(`Conector ID ${connectorId} apagado`, 'connectors');
  }
}

/**
 * Ejecuta un conector específico manualmente
 */
export async function executeConnector(connectorId: number): Promise<ConnectorResult> {
  try {
    // Verificar si el conector está activo
    if (!activeConnectors.has(connectorId)) {
      // Intentar cargar desde la base de datos
      const connector = await storage.getConnector(connectorId);
      
      if (!connector) {
        return {
          success: false,
          message: `Conector ID ${connectorId} no encontrado`
        };
      }
      
      // No inicializar, solo crear una instancia temporal
      let connectorInstance: BaseConnector;
      
      // Leer y tipar configuración
      const config = connector.configuration as ConnectorConfig;
      const connectorType = config.connectionMethod?.toLowerCase() || 'api';
      
      // Detectar el vendor para conectores específicos
      const vendor = connector.vendor.toLowerCase();
      
      if (connectorType === 'api') {
        // Usar conectores específicos para proveedores conocidos
        if (vendor === 'virustotal') {
          log(`Utilizando conector específico de VirusTotal para ejecución manual`, 'connectors');
          connectorInstance = new VirusTotalConnector(connector);
        } else if (vendor === 'otx' || vendor === 'alienvault' || vendor === 'alienvault otx') {
          log(`Utilizando conector específico de OTX AlienVault para ejecución manual`, 'connectors');
          connectorInstance = new OTXConnector(connector);
        } else if (vendor === 'misp') {
          log(`Utilizando conector específico de MISP para ejecución manual`, 'connectors');
          connectorInstance = new MISPConnector(connector);
        } else {
          log(`Utilizando conector API genérico para ejecución manual`, 'connectors');
          connectorInstance = new APIConnector(connector);
        }
      } else {
        switch (connectorType) {
          case 'syslog':
            connectorInstance = new SyslogConnector(connector);
            break;
          case 'agent':
            connectorInstance = new AgentConnector(connector);
            break;
          default:
            return {
              success: false,
              message: `Tipo de conector no soportado: ${connectorType}`
            };
        }
      }
      
      // Ejecutar
      return await connectorInstance.execute();
    }
    
    // Usar el conector activo existente
    const connectorInstance = activeConnectors.get(connectorId)!;
    return await connectorInstance.execute();
  } catch (error) {
    log(`Error ejecutando conector ID ${connectorId}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
    return {
      success: false,
      message: `Error ejecutando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
    };
  }
}

/**
 * Obtiene el estado de todos los conectores activos
 */
export function getActiveConnectors(): { id: number, name: string, type: string }[] {
  return Array.from(activeConnectors.entries()).map(([id, connector]) => ({
    id,
    name: connector.getConnector().name,
    type: connector.getConnector().type
  }));
}

/**
 * Actualiza el estado de activación de un conector
 */
export async function toggleConnector(connectorId: number, active: boolean): Promise<boolean> {
  try {
    // Obtener conector de la base de datos
    const connector = await storage.getConnector(connectorId);
    
    if (!connector) {
      log(`Conector ID ${connectorId} no encontrado`, 'connectors');
      return false;
    }
    
    if (active) {
      // Activar conector
      if (!activeConnectors.has(connectorId)) {
        const app = (global as any).expressApp as express.Express;
        const result = await initializeConnector(connector, app);
        return !!result;
      }
      return true;
    } else {
      // Desactivar conector
      shutdownConnector(connectorId);
      return true;
    }
  } catch (error) {
    log(`Error en toggleConnector para ID ${connectorId}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
    return false;
  }
}