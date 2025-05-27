/**
 * Implementación de conectores de tipo API
 * Permite la conexión con APIs externas para obtener datos de seguridad
 */

import { Connector, InsertAlert, InsertThreatIntel } from '@shared/schema';
import { BaseConnector, ConnectorConfig, ConnectorResult, ConnectorType } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import { aiParser } from '../ai-parser-service';
import { DataProcessor, DataSource } from './data-processor';
import { connectorQueue } from './queue-processor';
import { CredentialsManager } from './credentials-manager';
import fetch from 'node-fetch';
import https from 'https';

/**
 * Configuración específica para conectores de tipo API
 */
export interface APIConnectorConfig extends ConnectorConfig {
  baseUrl: string;
  endpoints?: {
    [key: string]: {
      path: string;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      contentType?: string;
      responseType?: 'alerts' | 'threatIntel' | 'metrics' | 'logs';
      params?: Record<string, string>;
      bodyTemplate?: string | object;
      rateLimit?: {
        requests: number;
        window: number; // en millisegundos
      };
      pagination?: {
        enabled: boolean;
        limitParam?: string;
        offsetParam?: string;
        pageParam?: string;
        maxPages?: number;
      };
    }
  };
  apiKeyHeader?: string;
  defaultHeaders?: Record<string, string>;
  pollingInterval: number; // en segundos
  retryConfig?: {
    maxRetries: number;
    backoffFactor: number;
    retryableStatuses: number[];
  };
  tlsConfig?: {
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
  };
}

/**
 * Conector para APIs externas con capacidades avanzadas
 */
export class APIConnector extends BaseConnector {
  protected config: APIConnectorConfig;
  private credentialsManager: CredentialsManager;
  private dataProcessor: DataProcessor;
  private requestCount: Map<string, { count: number; resetTime: number }> = new Map();
  private circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed';
  private circuitBreakerFailures: number = 0;
  private circuitBreakerLastFailure: number = 0;
  
  constructor(connector: Connector) {
    super(connector);
    this.config = this.connector.configuration as APIConnectorConfig;
    this.credentialsManager = CredentialsManager.getInstance();
    this.dataProcessor = new DataProcessor(connector);
    this.initializeRetryConfig();
  }
  
  /**
   * Inicializa configuración de reintentos por defecto
   */
  private initializeRetryConfig(): void {
    if (!this.config.retryConfig) {
      this.config.retryConfig = {
        maxRetries: 3,
        backoffFactor: 2,
        retryableStatuses: [429, 500, 502, 503, 504]
      };
    }
    
    if (!this.config.circuitBreaker) {
      this.config.circuitBreaker = {
        failureThreshold: 5,
        resetTimeout: 60000 // 1 minuto
      };
    }
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
   * Ejecutar el conector para obtener datos con manejo robusto de errores
   */
  public async execute(): Promise<ConnectorResult> {
    const startTime = Date.now();
    
    try {
      // Verificar circuit breaker
      if (this.circuitBreakerState === 'open') {
        const now = Date.now();
        if (now - this.circuitBreakerLastFailure < this.config.circuitBreaker!.resetTimeout) {
          return {
            success: false,
            message: 'Circuit breaker is open, skipping execution'
          };
        } else {
          this.circuitBreakerState = 'half-open';
          log(`Circuit breaker entering half-open state for ${this.connector.name}`, 'connector');
        }
      }

      // Validar configuración
      if (!this.validateConfig()) {
        await this.updateConnectorStatus(false, 'Configuración inválida');
        return {
          success: false,
          message: 'Configuración del conector inválida'
        };
      }
      
      log(`Ejecutando conector API ${this.connector.name}`, 'connector');
      
      const results = await this.processAllEndpoints();
      
      // Éxito - resetear circuit breaker
      if (this.circuitBreakerState === 'half-open') {
        this.circuitBreakerState = 'closed';
        this.circuitBreakerFailures = 0;
        log(`Circuit breaker closed for ${this.connector.name}`, 'connector');
      }
      
      const executionTime = Date.now() - startTime;
      await this.updateConnectorStatus(true, `Processed ${results.totalRecords} records`);
      
      return {
        success: true,
        message: `Procesados ${results.totalRecords} registros exitosamente`,
        alerts: results.alerts,
        threatIntel: results.threatIntel,
        metrics: {
          itemsProcessed: results.totalRecords,
          bytesProcessed: results.bytesProcessed,
          executionTime
        }
      };
      
    } catch (error) {
      // Manejar falla del circuit breaker
      this.handleCircuitBreakerFailure();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Error en conector ${this.connector.name}: ${errorMessage}`, 'connector');
      
      await this.updateConnectorStatus(false, errorMessage);
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Procesa todos los endpoints configurados
   */
  private async processAllEndpoints(): Promise<{
    alerts: InsertAlert[];
    threatIntel: InsertThreatIntel[];
    totalRecords: number;
    bytesProcessed: number;
  }> {
    const results = {
      alerts: [] as InsertAlert[],
      threatIntel: [] as InsertThreatIntel[],
      totalRecords: 0,
      bytesProcessed: 0
    };

    // Procesar cada endpoint configurado
    for (const [endpointName, endpoint] of Object.entries(this.config.endpoints || {})) {
      try {
        log(`Procesando endpoint ${endpointName}`, 'connector');
        
        const endpointData = await this.fetchEndpointData(endpointName, endpoint);
        
        if (endpointData && endpointData.length > 0) {
          // Procesar usando cola para alto volumen
          const dataSource: DataSource = {
            vendor: this.connector.vendor,
            product: this.connector.name,
            format: 'json'
          };
          
          // Para volúmenes pequeños, procesar directamente
          if (endpointData.length <= 100) {
            const processingResult = await this.dataProcessor.processData(endpointData, dataSource);
            results.alerts.push(...processingResult.alerts);
            results.threatIntel.push(...processingResult.threatIntel);
            results.totalRecords += processingResult.metrics.successfulRecords;
            results.bytesProcessed += processingResult.metrics.bytesProcessed;
          } else {
            // Para volúmenes grandes, usar cola
            await connectorQueue.enqueue(
              this.connector.id,
              endpointData,
              dataSource,
              this.determinePriority(endpoint.responseType)
            );
            results.totalRecords += endpointData.length;
            results.bytesProcessed += JSON.stringify(endpointData).length;
          }
        }
        
      } catch (endpointError) {
        log(`Error procesando endpoint ${endpointName}: ${endpointError}`, 'connector');
        // Continuar con otros endpoints
      }
    }

    return results;
  }
          
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

  /**
   * Obtiene datos de un endpoint específico con reintentos y paginación
   */
  private async fetchEndpointData(endpointName: string, endpoint: any): Promise<any[]> {
    const allData: any[] = [];
    let currentPage = 0;
    let hasMoreData = true;
    
    while (hasMoreData && (!endpoint.pagination?.maxPages || currentPage < endpoint.pagination.maxPages)) {
      try {
        // Verificar rate limiting
        await this.checkRateLimit(endpointName, endpoint.rateLimit);
        
        const url = this.buildUrl(endpoint, currentPage);
        const options = await this.buildRequestOptions(endpoint);
        
        const data = await this.makeHttpRequest(url, options);
        
        if (data && Array.isArray(data)) {
          allData.push(...data);
          
          // Verificar si hay más páginas
          if (endpoint.pagination?.enabled) {
            hasMoreData = data.length > 0 && 
              (!endpoint.pagination.limitParam || data.length >= parseInt(endpoint.params?.[endpoint.pagination.limitParam] || '100'));
            currentPage++;
          } else {
            hasMoreData = false;
          }
        } else if (data) {
          allData.push(data);
          hasMoreData = false;
        } else {
          hasMoreData = false;
        }
        
      } catch (error) {
        log(`Error fetching page ${currentPage} from ${endpointName}: ${error}`, 'connector');
        throw error;
      }
    }
    
    return allData;
  }

  /**
   * Construye la URL con parámetros y paginación
   */
  private buildUrl(endpoint: any, page: number = 0): string {
    let url = this.config.baseUrl;
    if (!url.endsWith('/') && !endpoint.path.startsWith('/')) {
      url += '/';
    }
    url += endpoint.path;
    
    const params = new URLSearchParams();
    
    // Añadir parámetros base
    if (endpoint.params) {
      Object.entries(endpoint.params).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }
    
    // Añadir parámetros de paginación
    if (endpoint.pagination?.enabled && page > 0) {
      if (endpoint.pagination.pageParam) {
        params.append(endpoint.pagination.pageParam, String(page));
      }
      if (endpoint.pagination.offsetParam && endpoint.pagination.limitParam) {
        const limit = parseInt(endpoint.params?.[endpoint.pagination.limitParam] || '100');
        params.append(endpoint.pagination.offsetParam, String(page * limit));
      }
    }
    
    const queryString = params.toString();
    if (queryString) {
      url += '?' + queryString;
    }
    
    return url;
  }

  /**
   * Construye las opciones de la petición HTTP
   */
  private async buildRequestOptions(endpoint: any): Promise<any> {
    const options: any = {
      method: endpoint.method || 'GET',
      headers: {
        'Content-Type': endpoint.contentType || 'application/json',
        'User-Agent': `SOC-Connector/${this.connector.name}`,
        ...this.config.defaultHeaders
      }
    };

    // Configurar TLS si es necesario
    if (this.config.tlsConfig) {
      const agent = new https.Agent({
        rejectUnauthorized: this.config.tlsConfig.rejectUnauthorized !== false,
        ca: this.config.tlsConfig.ca,
        cert: this.config.tlsConfig.cert,
        key: this.config.tlsConfig.key
      });
      options.agent = agent;
    }

    // Obtener credenciales y configurar autenticación
    try {
      const credentials = this.credentialsManager.getCredentials(this.connector.id);
      
      if (credentials.apiKey) {
        const headerName = this.config.apiKeyHeader || 'X-API-Key';
        options.headers[headerName] = credentials.apiKey;
      }
      
      if (credentials.token) {
        options.headers['Authorization'] = `Bearer ${credentials.token}`;
      }
      
      if (credentials.username && credentials.password) {
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        options.headers['Authorization'] = `Basic ${auth}`;
      }
    } catch (credError) {
      log(`Warning: Could not load credentials for ${this.connector.name}: ${credError}`, 'connector');
    }

    // Configurar body para métodos POST/PUT
    if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
      if (endpoint.bodyTemplate) {
        if (typeof endpoint.bodyTemplate === 'string') {
          options.body = endpoint.bodyTemplate;
        } else {
          options.body = JSON.stringify(endpoint.bodyTemplate);
        }
      }
    }

    return options;
  }

  /**
   * Realiza petición HTTP con reintentos
   */
  private async makeHttpRequest(url: string, options: any): Promise<any> {
    let lastError: Error | null = null;
    const maxRetries = this.config.retryConfig?.maxRetries || 3;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        log(`Making HTTP request to ${url} (attempt ${attempt + 1})`, 'connector');
        
        const response = await fetch(url, {
          ...options,
          timeout: this.config.timeout || 30000
        });
        
        // Verificar si el status es reintentable
        if (!response.ok) {
          const isRetryable = this.config.retryConfig?.retryableStatuses?.includes(response.status) || false;
          
          if (attempt < maxRetries && isRetryable) {
            const delay = this.calculateBackoffDelay(attempt);
            log(`HTTP ${response.status} received, retrying in ${delay}ms`, 'connector');
            await this.sleep(delay);
            continue;
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        }
        
        const contentType = response.headers.get('content-type');
        let data: any;
        
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else if (contentType?.includes('text/')) {
          data = await response.text();
        } else {
          data = await response.buffer();
        }
        
        log(`Successfully fetched data from ${url}`, 'connector');
        return data;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log(`Request failed (attempt ${attempt + 1}): ${lastError.message}`, 'connector');
        
        if (attempt < maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError || new Error('Maximum retries exceeded');
  }

  /**
   * Verifica y aplica rate limiting
   */
  private async checkRateLimit(endpointName: string, rateLimit?: { requests: number; window: number }): Promise<void> {
    if (!rateLimit) return;
    
    const now = Date.now();
    const key = `${this.connector.id}_${endpointName}`;
    const current = this.requestCount.get(key);
    
    if (!current || now > current.resetTime) {
      // Reiniciar ventana
      this.requestCount.set(key, {
        count: 1,
        resetTime: now + rateLimit.window
      });
    } else if (current.count >= rateLimit.requests) {
      // Rate limit excedido, esperar
      const waitTime = current.resetTime - now;
      log(`Rate limit exceeded for ${endpointName}, waiting ${waitTime}ms`, 'connector');
      await this.sleep(waitTime);
      
      // Reiniciar después de esperar
      this.requestCount.set(key, {
        count: 1,
        resetTime: now + rateLimit.window
      });
    } else {
      // Incrementar contador
      current.count++;
    }
  }

  /**
   * Calcula el delay de backoff exponencial
   */
  private calculateBackoffDelay(attempt: number): number {
    const backoffFactor = this.config.retryConfig?.backoffFactor || 2;
    const baseDelay = 1000; // 1 segundo base
    return Math.min(baseDelay * Math.pow(backoffFactor, attempt), 30000); // Máximo 30 segundos
  }

  /**
   * Determina la prioridad basada en el tipo de respuesta
   */
  private determinePriority(responseType?: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (responseType) {
      case 'alerts': return 'high';
      case 'threatIntel': return 'medium';
      case 'logs': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Maneja fallos del circuit breaker
   */
  private handleCircuitBreakerFailure(): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = Date.now();
    
    if (this.circuitBreakerFailures >= this.config.circuitBreaker!.failureThreshold) {
      this.circuitBreakerState = 'open';
      log(`Circuit breaker opened for ${this.connector.name} after ${this.circuitBreakerFailures} failures`, 'connector');
    }
  }

  /**
   * Función de espera
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}