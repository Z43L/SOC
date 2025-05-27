/**
 * Procesador de datos robusto para conectores
 * Maneja normalización, validación y transformación de datos
 */

import { InsertAlert, InsertThreatIntel, Connector } from '@shared/schema';
import { log } from '../../vite';
import { storage } from '../../storage';
import { aiParser } from '../ai-parser-service';

export interface DataProcessingResult {
  success: boolean;
  alerts: InsertAlert[];
  threatIntel: InsertThreatIntel[];
  metrics: ProcessingMetrics;
  errors: string[];
}

export interface ProcessingMetrics {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  bytesProcessed: number;
  processingTime: number;
}

export interface DataSource {
  vendor: string;
  product: string;
  version?: string;
  format: 'json' | 'xml' | 'csv' | 'syslog' | 'binary';
}

export interface NormalizationRule {
  sourceField: string;
  targetField: string;
  transform?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

export class DataProcessor {
  private connector: Connector;
  private normalizationRules: Map<string, NormalizationRule[]>;
  private severityMapping: Map<string, string>;

  constructor(connector: Connector) {
    this.connector = connector;
    this.normalizationRules = new Map();
    this.severityMapping = new Map([
      ['0', 'low'], ['1', 'low'], ['low', 'low'],
      ['2', 'medium'], ['3', 'medium'], ['medium', 'medium'],
      ['4', 'high'], ['5', 'high'], ['high', 'high'],
      ['6', 'critical'], ['7', 'critical'], ['critical', 'critical'],
      ['8', 'critical'], ['9', 'critical'], ['10', 'critical']
    ]);
    this.initializeRules();
  }

  /**
   * Inicializa las reglas de normalización basadas en el vendor
   */
  private initializeRules(): void {
    const vendor = this.connector.vendor.toLowerCase();
    
    switch (vendor) {
      case 'virustotal':
        this.normalizationRules.set('alert', [
          { sourceField: 'attributes.names', targetField: 'title', transform: (v) => v?.[0] || 'VirusTotal Detection' },
          { sourceField: 'attributes.last_analysis_stats', targetField: 'severity', transform: this.mapVirusTotalSeverity.bind(this) },
          { sourceField: 'attributes.sha256', targetField: 'fileHash' },
          { sourceField: 'id', targetField: 'externalId' }
        ]);
        break;
      
      case 'misp':
        this.normalizationRules.set('alert', [
          { sourceField: 'Event.info', targetField: 'title' },
          { sourceField: 'Event.threat_level_id', targetField: 'severity', transform: this.mapMISPSeverity.bind(this) },
          { sourceField: 'Event.uuid', targetField: 'externalId' },
          { sourceField: 'Event.Attribute', targetField: 'metadata', transform: this.extractMISPAttributes.bind(this) }
        ]);
        break;
      
      case 'otx':
        this.normalizationRules.set('alert', [
          { sourceField: 'name', targetField: 'title' },
          { sourceField: 'tlp', targetField: 'severity', transform: this.mapOTXSeverity.bind(this) },
          { sourceField: 'id', targetField: 'externalId' },
          { sourceField: 'indicators', targetField: 'metadata' }
        ]);
        break;
      
      default:
        // Reglas genéricas
        this.normalizationRules.set('alert', [
          { sourceField: 'title', targetField: 'title', required: true },
          { sourceField: 'description', targetField: 'description' },
          { sourceField: 'severity', targetField: 'severity', transform: this.mapGenericSeverity.bind(this) },
          { sourceField: 'timestamp', targetField: 'timestamp', transform: this.parseTimestamp.bind(this) }
        ]);
    }
  }

  /**
   * Procesa datos crudos y los normaliza
   */
  public async processData(rawData: any, dataSource: DataSource): Promise<DataProcessingResult> {
    const startTime = Date.now();
    const result: DataProcessingResult = {
      success: true,
      alerts: [],
      threatIntel: [],
      metrics: {
        totalRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        bytesProcessed: JSON.stringify(rawData).length,
        processingTime: 0
      },
      errors: []
    };

    try {
      // Convertir datos a array si es necesario
      const dataArray = Array.isArray(rawData) ? rawData : [rawData];
      result.metrics.totalRecords = dataArray.length;

      // Procesar cada registro
      for (const record of dataArray) {
        try {
          await this.processRecord(record, dataSource, result);
          result.metrics.successfulRecords++;
        } catch (error) {
          result.metrics.failedRecords++;
          result.errors.push(`Error processing record: ${error instanceof Error ? error.message : String(error)}`);
          log(`Error processing record: ${error}`, 'data-processor');
        }
      }

      // Usar IA para procesamiento adicional si está disponible
      if (result.errors.length > 0 && aiParser) {
        try {
          const aiResult = await this.processWithAI(rawData, dataSource);
          if (aiResult.alerts.length > 0) {
            result.alerts.push(...aiResult.alerts);
          }
        } catch (aiError) {
          log(`AI processing failed: ${aiError}`, 'data-processor');
        }
      }

      result.metrics.processingTime = Date.now() - startTime;
      result.success = result.metrics.failedRecords < result.metrics.totalRecords;

    } catch (error) {
      result.success = false;
      result.errors.push(`Critical processing error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Procesa un registro individual
   */
  private async processRecord(record: any, dataSource: DataSource, result: DataProcessingResult): Promise<void> {
    // Determinar tipo de datos basado en la estructura
    const dataType = this.inferDataType(record);
    
    switch (dataType) {
      case 'alert':
        const alert = await this.normalizeAlert(record);
        if (alert) {
          result.alerts.push(alert);
        }
        break;
      
      case 'threatIntel':
        const threat = await this.normalizeThreatIntel(record);
        if (threat) {
          result.threatIntel.push(threat);
        }
        break;
      
      default:
        // Intentar procesar como alerta genérica
        const genericAlert = await this.normalizeGenericData(record);
        if (genericAlert) {
          result.alerts.push(genericAlert);
        }
    }
  }

  /**
   * Normaliza datos a formato de alerta
   */
  private async normalizeAlert(data: any): Promise<InsertAlert | null> {
    try {
      const rules = this.normalizationRules.get('alert') || [];
      const normalized: Partial<InsertAlert> = {
        organizationId: this.connector.organizationId
      };

      // Aplicar reglas de normalización
      for (const rule of rules) {
        const value = this.extractValue(data, rule.sourceField);
        
        if (value !== undefined) {
          const transformedValue = rule.transform ? rule.transform(value) : value;
          (normalized as any)[rule.targetField] = transformedValue;
        } else if (rule.required) {
          throw new Error(`Required field ${rule.sourceField} not found`);
        } else if (rule.defaultValue !== undefined) {
          (normalized as any)[rule.targetField] = rule.defaultValue;
        }
      }

      // Validar campos obligatorios
      if (!normalized.title) {
        normalized.title = `Alert from ${this.connector.vendor}`;
      }
      if (!normalized.description) {
        normalized.description = JSON.stringify(data);
      }
      if (!normalized.severity) {
        normalized.severity = 'medium';
      }
      if (!normalized.source) {
        normalized.source = this.connector.name;
      }
      if (!normalized.status) {
        normalized.status = 'new';
      }

      // Agregar metadatos adicionales
      normalized.metadata = {
        ...normalized.metadata,
        connector: this.connector.name,
        vendor: this.connector.vendor,
        originalData: data,
        processedAt: new Date().toISOString()
      };

      return normalized as InsertAlert;

    } catch (error) {
      log(`Error normalizing alert: ${error}`, 'data-processor');
      return null;
    }
  }

  /**
   * Normaliza datos a formato de threat intelligence
   */
  private async normalizeThreatIntel(data: any): Promise<InsertThreatIntel | null> {
    try {
      const normalized: Partial<InsertThreatIntel> = {
        organizationId: this.connector.organizationId,
        source: this.connector.name
      };

      // Mapeo específico según el vendor
      switch (this.connector.vendor.toLowerCase()) {
        case 'virustotal':
          normalized.type = 'ioc';
          normalized.title = data.attributes?.names?.[0] || 'VirusTotal IOC';
          normalized.description = `File detected by ${data.attributes?.last_analysis_stats?.malicious || 0} engines`;
          normalized.iocs = {
            fileHashes: [data.attributes?.sha256, data.attributes?.md5].filter(Boolean),
            fileNames: data.attributes?.names || []
          };
          break;
        
        case 'misp':
          normalized.type = data.Event?.info?.includes('APT') ? 'apt' : 'ioc';
          normalized.title = data.Event?.info || 'MISP Event';
          normalized.description = data.Event?.info || '';
          normalized.iocs = this.extractMISPIOCs(data.Event?.Attribute || []);
          break;
      }

      if (!normalized.severity) {
        normalized.severity = 'medium';
      }
      if (!normalized.confidence) {
        normalized.confidence = 50;
      }

      return normalized as InsertThreatIntel;

    } catch (error) {
      log(`Error normalizing threat intel: ${error}`, 'data-processor');
      return null;
    }
  }

  /**
   * Procesa datos genéricos usando IA
   */
  private async processWithAI(data: any, dataSource: DataSource): Promise<{ alerts: InsertAlert[] }> {
    if (!aiParser) {
      return { alerts: [] };
    }

    try {
      const prompt = `
        Analyze the following security data from ${dataSource.vendor} ${dataSource.product}:
        ${JSON.stringify(data, null, 2)}
        
        Extract security alerts with:
        - title: brief description
        - description: detailed explanation
        - severity: critical, high, medium, low
        - indicators: IPs, domains, hashes, etc.
        
        Format as JSON array of alerts.
      `;

      const aiResult = await aiParser.parseSecurityData(prompt);
      const alerts: InsertAlert[] = [];

      if (aiResult.alerts) {
        for (const alert of aiResult.alerts) {
          alerts.push({
            title: alert.title || 'AI-detected Alert',
            description: alert.description || '',
            severity: alert.severity || 'medium',
            source: `${this.connector.name} (AI)`,
            status: 'new',
            organizationId: this.connector.organizationId,
            metadata: {
              aiGenerated: true,
              originalData: data,
              confidence: alert.confidence || 0.7
            }
          });
        }
      }

      return { alerts };

    } catch (error) {
      log(`AI processing error: ${error}`, 'data-processor');
      return { alerts: [] };
    }
  }

  /**
   * Extrae valor usando dot notation
   */
  private extractValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Infiere el tipo de datos basado en la estructura
   */
  private inferDataType(data: any): 'alert' | 'threatIntel' | 'unknown' {
    if (data.alert || data.event_type === 'alert') return 'alert';
    if (data.indicators || data.iocs || data.threat_level) return 'threatIntel';
    if (data.severity || data.priority) return 'alert';
    return 'unknown';
  }

  /**
   * Mapea severidad de VirusTotal
   */
  private mapVirusTotalSeverity(stats: any): string {
    if (!stats) return 'low';
    const malicious = stats.malicious || 0;
    const total = Object.values(stats).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const ratio = total > 0 ? malicious / total : 0;
    
    if (ratio > 0.7) return 'critical';
    if (ratio > 0.4) return 'high';
    if (ratio > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Mapea severidad de MISP
   */
  private mapMISPSeverity(threatLevel: string | number): string {
    const level = Number(threatLevel);
    switch (level) {
      case 1: return 'critical';
      case 2: return 'high';
      case 3: return 'medium';
      case 4: return 'low';
      default: return 'medium';
    }
  }

  /**
   * Mapea severidad de OTX
   */
  private mapOTXSeverity(tlp: string): string {
    switch (tlp?.toLowerCase()) {
      case 'red': return 'critical';
      case 'amber': return 'high';
      case 'green': return 'medium';
      case 'white': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Mapea severidad genérica
   */
  private mapGenericSeverity(severity: any): string {
    const sev = String(severity).toLowerCase();
    return this.severityMapping.get(sev) || 'medium';
  }

  /**
   * Parsea timestamp a formato ISO
   */
  private parseTimestamp(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    
    try {
      return new Date(timestamp);
    } catch {
      return undefined;
    }
  }

  /**
   * Extrae atributos de MISP
   */
  private extractMISPAttributes(attributes: any[]): any {
    if (!Array.isArray(attributes)) return {};
    
    return attributes.reduce((acc, attr) => {
      if (attr.type && attr.value) {
        if (!acc[attr.type]) acc[attr.type] = [];
        acc[attr.type].push(attr.value);
      }
      return acc;
    }, {});
  }

  /**
   * Extrae IOCs de MISP
   */
  private extractMISPIOCs(attributes: any[]): any {
    const iocs: any = {};
    
    if (!Array.isArray(attributes)) return iocs;
    
    for (const attr of attributes) {
      switch (attr.type) {
        case 'ip-src':
        case 'ip-dst':
          if (!iocs.ips) iocs.ips = [];
          iocs.ips.push(attr.value);
          break;
        case 'domain':
          if (!iocs.domains) iocs.domains = [];
          iocs.domains.push(attr.value);
          break;
        case 'md5':
        case 'sha1':
        case 'sha256':
          if (!iocs.fileHashes) iocs.fileHashes = [];
          iocs.fileHashes.push(attr.value);
          break;
        case 'url':
          if (!iocs.urls) iocs.urls = [];
          iocs.urls.push(attr.value);
          break;
      }
    }
    
    return iocs;
  }

  /**
   * Normaliza datos genéricos
   */
  private async normalizeGenericData(data: any): Promise<InsertAlert | null> {
    try {
      return {
        title: data.title || data.name || data.event || 'Generic Alert',
        description: data.description || data.message || JSON.stringify(data),
        severity: this.mapGenericSeverity(data.severity || data.priority || data.level),
        source: this.connector.name,
        status: 'new',
        organizationId: this.connector.organizationId,
        metadata: {
          connector: this.connector.name,
          vendor: this.connector.vendor,
          originalData: data,
          processedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      log(`Error normalizing generic data: ${error}`, 'data-processor');
      return null;
    }
  }
}
