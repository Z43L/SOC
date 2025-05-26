/**
 * Implementación de conectores de tipo API
 * Permite la conexión con APIs externas para obtener datos de seguridad
 */

import { Connector, InsertAlert, InsertThreatIntel } from '@shared/schema';
import { BaseConnector, ConnectorConfig, ConnectorResult, ConnectorType } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import { aiParser } from '../ai-parser-service';

/**
 * Configuración específica para conectores de tipo API
 */
export interface APIConnectorConfig extends ConnectorConfig {
  baseUrl: string;
  endpoints?: {
    [key: string]: {
      path: string;
      method: 'GET' | 'POST' | 'PUT';
      contentType?: string;
      responseType?: 'alerts' | 'threatIntel' | 'metrics';
      params?: Record<string, string>;
      bodyTemplate?: string | object;
    }
  };
  apiKeyHeader?: string;
  defaultHeaders?: Record<string, string>;
  pollingInterval: number; // en segundos
}

/**
 * Conector para APIs externas
 */
export class APIConnector extends BaseConnector {
  protected config: APIConnectorConfig;
  
  constructor(connector: Connector) {
    super(connector);
    this.config = this.connector.configuration as APIConnectorConfig;
  }
  
  /**
   * Validar la configuración del conector
   */
  public validateConfig(): boolean {
    // Verificar campos obligatorios
    if (!this.config.baseUrl) {
      log(`Conector ${this.connector.name} no tiene baseUrl configurada`, 'connector');
      return false;
    }
    
    if (!this.config.pollingInterval || this.config.pollingInterval < 60) {
      log(`Conector ${this.connector.name} tiene un pollingInterval inválido, usando 300s por defecto`, 'connector');
      this.config.pollingInterval = 300; // 5 minutos por defecto
    }
    
    // Verificar que al menos hay un endpoint
    if (!this.config.endpoints || Object.keys(this.config.endpoints).length === 0) {
      log(`Conector ${this.connector.name} no tiene endpoints configurados`, 'connector');
      return false;
    }
    
    return true;
  }
  
  /**
   * Ejecutar el conector para obtener datos
   */
  public async execute(): Promise<ConnectorResult> {
    const startTime = Date.now();
    let alerts: InsertAlert[] = [];
    let threatIntel: InsertThreatIntel[] = [];
    let totalProcessed = 0;
    
    try {
      // Validar configuración
      if (!this.validateConfig()) {
        await this.updateConnectorStatus(false, 'Configuración inválida');
        return {
          success: false,
          message: 'Configuración del conector inválida'
        };
      }
      
      log(`Ejecutando conector API ${this.connector.name}`, 'connector');
      
      // Procesar cada endpoint configurado
      for (const [endpointName, endpoint] of Object.entries(this.config.endpoints || {})) {
        try {
          log(`Procesando endpoint ${endpointName}`, 'connector');
          
          // Construir URL completa
          const url = new URL(endpoint.path, this.config.baseUrl).toString();
          
          // Preparar opciones para la solicitud
          const options: any = {
            method: endpoint.method || 'GET',
            headers: {
              ...this.config.defaultHeaders,
              'Content-Type': endpoint.contentType || 'application/json'
            }
          };
          
          // Incluir API key en header personalizado si está configurado
          if (this.config.apiKey && this.config.apiKeyHeader) {
            options.headers[this.config.apiKeyHeader] = this.config.apiKey;
          }
          
          // Añadir cuerpo para peticiones POST/PUT
          if ((endpoint.method === 'POST' || endpoint.method === 'PUT') && endpoint.bodyTemplate) {
            options.body = typeof endpoint.bodyTemplate === 'string' 
              ? endpoint.bodyTemplate 
              : JSON.stringify(endpoint.bodyTemplate);
          }
          
          // Construir URL con parámetros si existen
          let apiUrl = url;
          if (endpoint.params) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(endpoint.params)) {
              params.append(key, value);
            }
            apiUrl = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
          }
          
          // Obtener datos con soporte para paginación
          const data = await this.fetchAllPages(
            apiUrl,
            options,
            10, // máximo 10 páginas
            (responseData) => {
              // Extraer items (varía según API)
              return responseData.data || responseData.items || responseData.results || responseData;
            },
            (responseData) => {
              // Obtener token para siguiente página (varía según API)
              if (!this.config.paginate) return null;
              if (!this.config.paginationTokenPath) return null;
              
              // Navegar por la ruta para encontrar el token (ej: "pagination.next_token")
              const path = this.config.paginationTokenPath.split('.');
              let token = responseData;
              for (const key of path) {
                if (!token || typeof token !== 'object') return null;
                token = token[key];
              }
              
              return token;
            }
          );
          
          // Procesar datos según el tipo de respuesta
          log(`Procesando ${data.length} elementos de ${endpointName}`, 'connector');
          
          if (data && data.length > 0) {
            if (endpoint.responseType === 'alerts') {
              const processedAlerts = await this.processAlerts(data);
              alerts = [...alerts, ...processedAlerts];
            } else if (endpoint.responseType === 'threatIntel') {
              const processedIntel = await this.processThreatIntel(data);
              threatIntel = [...threatIntel, ...processedIntel];
            }
            
            totalProcessed += data.length;
          }
        } catch (endpointError) {
          log(`Error procesando endpoint ${endpointName}: ${endpointError instanceof Error ? endpointError.message : 'Error desconocido'}`, 'connector');
          // Continuamos con el siguiente endpoint
        }
      }
      
      // Actualizar estadísticas
      this.state.dataProcessed = totalProcessed;
      this.state.executionTime = Date.now() - startTime;
      
      // Actualizar estado del conector
      const success = alerts.length > 0 || threatIntel.length > 0;
      await this.updateConnectorStatus(success);
      
      return {
        success,
        message: `Procesados ${totalProcessed} elementos (${alerts.length} alertas, ${threatIntel.length} intel)`,
        alerts,
        threatIntel,
        metrics: {
          itemsProcessed: totalProcessed,
          bytesProcessed: this.state.bytesProcessed,
          executionTime: this.state.executionTime
        }
      };
    } catch (error) {
      log(`Error ejecutando conector API ${this.connector.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connector');
      
      // Actualizar estado
      await this.updateConnectorStatus(false, error instanceof Error ? error.message : 'Error desconocido');
      
      return {
        success: false,
        message: `Error ejecutando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }
  
  /**
   * Procesa los datos crudos y los convierte en alertas
   */
  private async processAlerts(data: any[]): Promise<InsertAlert[]> {
    const alerts: InsertAlert[] = [];
    for (const item of data) {
      try {
        let alert: InsertAlert | null = null;
        switch (this.connector.vendor.toLowerCase()) {
          case 'palo alto networks':
            alert = this.processPaloAltoAlert(item);
            break;
          case 'crowdstrike':
            alert = this.processCrowdStrikeAlert(item);
            break;
          case 'microsoft':
            alert = this.processMicrosoftAlert(item);
            break;
          default:
            alert = this.processGenericAlert(item);
        }
        // Fallback IA si el parser convencional no extrae datos relevantes
        if (!alert) {
          const aiResult = await aiParser.parseToAlert(item, this.connector);
          if (aiResult.success && aiResult.data) {
            alert = aiResult.data;
            alert.metadata = { ...alert.metadata, parser: 'ai' };
          }
        }
        if (alert) {
          await storage.createAlert(alert);
          alerts.push(alert);
        }
      } catch (itemError) {
        log(`Error procesando item: ${itemError instanceof Error ? itemError.message : 'Error desconocido'}`, 'connector');
      }
    }
    return alerts;
  }
  
  /**
   * Procesa los datos crudos y los convierte en inteligencia de amenazas
   * Este método puede ser sobrescrito por las clases hijas
   */
  protected async processThreatIntel(data: any[]): Promise<InsertThreatIntel[]> {
    const intel: InsertThreatIntel[] = [];
    for (const item of data) {
      try {
        let threatIntel: InsertThreatIntel | null = null;
        switch (this.connector.vendor.toLowerCase()) {
          case 'alienvault':
          case 'otx':
            threatIntel = this.processOTXIntel(item);
            break;
          case 'virustotal':
            threatIntel = this.processVirusTotalIntel(item);
            break;
          case 'misp':
            threatIntel = this.processMISPIntel(item);
            break;
          default:
            threatIntel = this.processGenericIntel(item);
        }
        // Fallback IA si el parser convencional no extrae datos relevantes
        if (!threatIntel) {
          const aiResult = await aiParser.parseToThreatIntel(item, this.connector);
          if (aiResult.success && aiResult.data) {
            threatIntel = aiResult.data;
            threatIntel.metadata = { ...threatIntel.metadata, parser: 'ai' };
          }
        }
        if (threatIntel) {
          await storage.createThreatIntel(threatIntel);
          intel.push(threatIntel);
        }
      } catch (itemError) {
        log(`Error procesando item de inteligencia: ${itemError instanceof Error ? itemError.message : 'Error desconocido'}`, 'connector');
      }
    }
    return intel;
  }
  
  // Métodos específicos para cada vendor
  
  private processPaloAltoAlert(item: any): InsertAlert {
    return {
      title: item.alert_name || 'Palo Alto Alert',
      description: item.description || `Alert from ${this.connector.name}`,
      severity: this.mapSeverity(item.severity),
      source: this.connector.name,
      sourceIp: item.source_ip || null,
      destinationIp: item.destination_ip || null,
      status: 'new',
      metadata: {
        vendor: 'Palo Alto Networks',
        rule_id: item.rule_id,
        action: item.action,
        app: item.app,
        category: item.category,
        timestamp: item.time_generated
      }
    };
  }
  
  private processCrowdStrikeAlert(item: any): InsertAlert {
    return {
      title: item.detect_name || 'CrowdStrike Detection',
      description: item.detect_description || `Alert from ${this.connector.name}`,
      severity: this.mapSeverity(item.max_severity_displayname || item.max_severity),
      source: this.connector.name,
      sourceIp: item.device_ip || null,
      destinationIp: null,
      status: 'new',
      metadata: {
        vendor: 'CrowdStrike',
        detect_id: item.detect_id,
        tactic: item.tactic,
        technique: item.technique,
        timestamp: item.created_timestamp,
        host: item.device_hostname || item.hostname,
        user: item.user_name
      }
    };
  }
  
  private processMicrosoftAlert(item: any): InsertAlert {
    return {
      title: item.title || item.alertName || 'Microsoft Security Alert',
      description: item.description || `Alert from ${this.connector.name}`,
      severity: this.mapSeverity(item.severity),
      source: this.connector.name,
      sourceIp: item.sourceIpAddress || item.source?.address,
      destinationIp: item.destinationIpAddress || item.destination?.address,
      status: 'new',
      metadata: {
        vendor: 'Microsoft',
        alert_id: item.id || item.alertId,
        category: item.category,
        provider: item.provider,
        timestamp: item.createdDateTime || item.timeGenerated,
        mitreTactics: item.mitreTactics || [],
        mitreTechniques: item.mitreTechniques || []
      }
    };
  }
  
  private processGenericAlert(item: any): InsertAlert | null {
    // Si no tenemos un título o una forma de identificar el alerta, ignoramos
    if (!item.title && !item.name && !item.alert_name && !item.message) {
      return null;
    }
    
    return {
      title: item.title || item.name || item.alert_name || item.message || 'Security Alert',
      description: item.description || item.details || item.message || `Alert from ${this.connector.name}`,
      severity: this.mapSeverity(item.severity || item.priority || item.risk_level),
      source: this.connector.name,
      sourceIp: item.source_ip || item.src_ip || item.from_ip || item.source?.ip || null,
      destinationIp: item.dest_ip || item.destination_ip || item.to_ip || item.destination?.ip || null,
      status: 'new',
      metadata: {
        raw: item,
        vendor: this.connector.vendor,
        timestamp: item.timestamp || item.time || item.created_at || item.detection_time
      }
    };
  }
  
  private processOTXIntel(item: any): InsertThreatIntel {
    const iocs: any = {};
    
    // Extraer IOCs
    if (item.indicators) {
      const ips = item.indicators
        .filter((i: any) => i.type === 'IPv4' || i.type === 'IPv6')
        .map((i: any) => i.indicator);
        
      const domains = item.indicators
        .filter((i: any) => i.type === 'domain' || i.type === 'hostname')
        .map((i: any) => i.indicator);
        
      const hashes = item.indicators
        .filter((i: any) => ['FileHash-MD5', 'FileHash-SHA1', 'FileHash-SHA256'].includes(i.type))
        .map((i: any) => i.indicator);
        
      const urls = item.indicators
        .filter((i: any) => i.type === 'URL')
        .map((i: any) => i.indicator);
      
      if (ips.length > 0) iocs.ips = ips;
      if (domains.length > 0) iocs.domains = domains;
      if (hashes.length > 0) iocs.hashes = hashes;
      if (urls.length > 0) iocs.urls = urls;
    }
    
    return {
      type: (item.tags && item.tags[0]) || 'malware',
      title: item.name || 'OTX Intel',
      description: item.description || `Intel from ${this.connector.name}`,
      source: 'OTX AlienVault',
      severity: this.mapSeverity(item.TLP),
      confidence: item.TLP === 'RED' ? 90 : (item.TLP === 'AMBER' ? 75 : 60),
      iocs,
      relevance: 'high',
    };
  }
  
  private processVirusTotalIntel(item: any): InsertThreatIntel {
    const attributes = item.attributes || {};
    const stats = attributes.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0);
    
    // Calcular confianza basada en los resultados de detección
    const detectionRatio = (malicious + suspicious) / total;
    const confidence = Math.round(detectionRatio * 100);
    
    return {
      type: 'malware',
      title: attributes.meaningful_name || `${item.type} Intel`,
      description: `${item.type} detectado por ${malicious} motores en VirusTotal`,
      source: 'VirusTotal',
      severity: malicious > 10 ? 'critical' : malicious > 5 ? 'high' : 'medium',
      confidence,
      iocs: item.type === 'file' ? {
        hashes: [
          attributes.md5,
          attributes.sha1,
          attributes.sha256
        ].filter(Boolean)
      } : item.type === 'domain' ? {
        domains: [attributes.id]
      } : item.type === 'ip_address' ? {
        ips: [attributes.id]
      } : {},
      relevance: confidence > 75 ? 'high' : confidence > 50 ? 'medium' : 'low',
    };
  }
  
  private processMISPIntel(item: any): InsertThreatIntel {
    // Extraer IOCs
    const iocs: any = {};
    
    if (item.Attribute) {
      const ips = item.Attribute
        .filter((a: any) => ['ip-src', 'ip-dst'].includes(a.type))
        .map((a: any) => a.value);
        
      const domains = item.Attribute
        .filter((a: any) => ['domain', 'hostname'].includes(a.type))
        .map((a: any) => a.value);
        
      const hashes = item.Attribute
        .filter((a: any) => ['md5', 'sha1', 'sha256'].includes(a.type))
        .map((a: any) => a.value);
        
      const urls = item.Attribute
        .filter((a: any) => ['url'].includes(a.type))
        .map((a: any) => a.value);
      
      if (ips.length > 0) iocs.ips = ips;
      if (domains.length > 0) iocs.domains = domains;
      if (hashes.length > 0) iocs.hashes = hashes;
      if (urls.length > 0) iocs.urls = urls;
    }
    
    return {
      type: 'apt',
      title: item.Event?.info || 'MISP Event',
      description: item.Event?.info || `Intel from ${this.connector.name}`,
      source: 'MISP',
      severity: this.mapSeverity(item.Event?.threat_level_id),
      confidence: 80,
      iocs,
      relevance: 'high',
    };
  }
  
  private processGenericIntel(item: any): InsertThreatIntel | null {
    // Si no tenemos información básica, ignoramos
    if (!item.title && !item.name && !item.id) {
      return null;
    }
    
    return {
      type: item.type || 'general',
      title: item.title || item.name || `Intel from ${this.connector.name}`,
      description: item.description || item.summary || `Intel from ${this.connector.name}`,
      source: this.connector.name,
      severity: this.mapSeverity(item.severity || item.risk || item.threat_level),
      confidence: item.confidence || 70,
      iocs: item.iocs || item.indicators || {},
      relevance: item.relevance || 'medium',
    };
  }
  
  /**
   * Mapea diferentes formatos de severidad a nuestro formato estándar
   */
  private mapSeverity(severity: any): string {
    if (!severity) return 'medium';
    
    if (typeof severity === 'number') {
      if (severity >= 9) return 'critical';
      if (severity >= 7) return 'high';
      if (severity >= 4) return 'medium';
      return 'low';
    }
    
    const sevStr = String(severity).toLowerCase();
    
    if (['critical', 'fatal', 'emergency', 'severe'].includes(sevStr)) return 'critical';
    if (['high', 'important', 'error', 'danger', 'red', 'major'].includes(sevStr)) return 'high';
    if (['medium', 'moderate', 'warning', 'amber', 'yellow'].includes(sevStr)) return 'medium';
    if (['low', 'minor', 'info', 'informational', 'green'].includes(sevStr)) return 'low';
    
    return 'medium';
  }
}