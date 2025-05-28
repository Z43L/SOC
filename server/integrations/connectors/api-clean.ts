/**
 * API Connector Implementation
 * Handles REST API data source connections
 */

import { BaseConnectorImplementation } from './base-connector';
import { ConnectorConfig, ConnectorResult, InsertAlert } from './interfaces';
import { log } from '../../vite';

export class ApiConnector extends BaseConnectorImplementation {
  private baseUrl: string;
  private apiKey?: string;
  private headers: Record<string, string>;

  constructor(config: ConnectorConfig) {
    super(config);
    this.baseUrl = config.endpoint || '';
    this.apiKey = config.apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'SOC-Platform/1.0',
      ...config.defaultHeaders
    };

    if (this.apiKey && config.apiKeyHeader) {
      this.headers[config.apiKeyHeader] = this.apiKey;
    }
  }

  async execute(): Promise<ConnectorResult> {
    try {
      log(`Ejecutando conector API: ${this.config.name}`, 'connector');
      
      await this.updateConnectorStatus(true, 'Iniciando ejecución');
      
      const totalProcessed = await this.processEndpoints();
      
      await this.updateConnectorStatus(true, `Procesados ${totalProcessed} registros`);
      
      return {
        success: true,
        message: `Conector API ejecutado exitosamente. ${totalProcessed} registros procesados.`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      log(`Error ejecutando conector API ${this.config.name}: ${errorMessage}`, 'connector');
      
      await this.updateConnectorStatus(false, errorMessage);
      
      return {
        success: false,
        message: `Error ejecutando conector: ${errorMessage}`
      };
    }
  }

  private async processEndpoints(): Promise<number> {
    let totalProcessed = 0;
    
    if (!this.config.endpoints || Object.keys(this.config.endpoints).length === 0) {
      log('No hay endpoints configurados para el conector API', 'connector');
      return 0;
    }

    for (const [endpointName, endpoint] of Object.entries(this.config.endpoints)) {
      try {
        log(`Procesando endpoint: ${endpointName}`, 'connector');
        
        const data = await this.fetchEndpointData(endpoint);
        if (data && Array.isArray(data) && data.length > 0) {
          totalProcessed += data.length;
        }
        
      } catch (endpointError) {
        log(`Error procesando endpoint ${endpointName}: ${endpointError instanceof Error ? endpointError.message : 'Error desconocido'}`, 'connector');
        // Continue with next endpoint
      }
    }
    
    return totalProcessed;
  }

  private async fetchEndpointData(endpoint: any): Promise<any[]> {
    const url = new URL(endpoint.path || '', this.baseUrl).toString();
    
    const options: RequestInit = {
      method: endpoint.method || 'GET',
      headers: this.headers
    };

    if ((endpoint.method === 'POST' || endpoint.method === 'PUT') && endpoint.bodyTemplate) {
      options.body = typeof endpoint.bodyTemplate === 'string' 
        ? endpoint.bodyTemplate 
        : JSON.stringify(endpoint.bodyTemplate);
    }

    log(`Realizando petición ${endpoint.method || 'GET'} a: ${url}`, 'connector');
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data;
    } else if (data && typeof data === 'object' && data.data && Array.isArray(data.data)) {
      return data.data;
    } else if (data && typeof data === 'object') {
      return [data];
    }
    
    return [];
  }

  async processAlerts(data: any[]): Promise<InsertAlert[]> {
    const alerts: InsertAlert[] = [];
    
    for (const item of data) {
      try {
        let alert: InsertAlert | null = null;
        
        switch (this.config.vendor?.toLowerCase()) {
          case 'custom':
            alert = this.parseCustomAlert(item);
            break;
          case 'generic':
          default:
            alert = this.parseGenericAlert(item);
            break;
        }
        
        if (alert) {
          alerts.push(alert);
        }
      } catch (error) {
        log(`Error procesando alerta: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      }
    }
    
    return alerts;
  }

  private parseCustomAlert(item: any): InsertAlert | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    return {
      title: item.title || item.name || 'API Alert',
      description: item.description || item.message || JSON.stringify(item),
      severity: this.mapSeverity(item.severity || item.level || 'medium'),
      source: this.config.name,
      sourceIp: item.sourceIp || item.source_ip || null,
      destinationIp: item.destinationIp || item.destination_ip || null,
      timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      metadata: {
        originalData: item,
        connector: this.config.name,
        vendor: this.config.vendor
      }
    };
  }

  private parseGenericAlert(item: any): InsertAlert | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    return {
      title: `API Event: ${this.config.name}`,
      description: JSON.stringify(item, null, 2),
      severity: 'medium',
      source: this.config.name,
      sourceIp: null,
      destinationIp: null,
      timestamp: new Date(),
      metadata: {
        originalData: item,
        connector: this.config.name,
        vendor: this.config.vendor || 'unknown'
      }
    };
  }

  private mapSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      'critical': 'critical',
      'high': 'high', 
      'medium': 'medium',
      'low': 'low',
      'error': 'high',
      'warning': 'medium',
      'info': 'low',
      'debug': 'low'
    };

    return severityMap[severity.toLowerCase()] || 'medium';
  }

  async stop(): Promise<void> {
    log(`Deteniendo conector API: ${this.config.name}`, 'connector');
    await this.updateConnectorStatus(false, 'Conector detenido');
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.baseUrl) {
        return { healthy: false, message: 'URL base no configurada' };
      }

      // Simple health check - try to reach the base URL
      const response = await fetch(this.baseUrl, { 
        method: 'HEAD',
        headers: this.headers,
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      return { 
        healthy: response.ok, 
        message: response.ok ? 'Conexión exitosa' : `HTTP ${response.status}` 
      };
    } catch (error) {
      return { 
        healthy: false, 
        message: error instanceof Error ? error.message : 'Error de conexión' 
      };
    }
  }
}