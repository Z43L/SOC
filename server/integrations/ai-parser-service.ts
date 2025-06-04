/**
 * Servicio de parseo inteligente de datos con IA
 * 
 * Este módulo implementa:
 * 1. Parsers asistidos por IA para normalizar datos de diversas fuentes
 * 2. Extracción de indicadores de compromiso (IoCs) de datos no estructurados
 * 3. Normalización de datos para garantizar consistencia en el almacenamiento
 */

import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { 
  InsertAlert, 
  InsertThreatIntel, 
  SeverityTypes,
  Connector
} from "@shared/schema";
import { log } from "../vite";
import { aiQueue } from "./ai-processing-queue";
import { AIModelType } from "../advanced-ai-service";

// Tipado para los datos crudos recibidos de conectores
type RawData = string | object | Buffer;

// Tipos de datos que pueden ser procesados
enum DataFormat {
  JSON = 'json',
  XML = 'xml',
  SYSLOG = 'syslog',
  CEF = 'cef',     // Common Event Format
  LEEF = 'leef',   // Log Event Extended Format  
  CSV = 'csv',
  PLAINTEXT = 'plaintext',
  STIX = 'stix',   // Structured Threat Information eXpression
  UNKNOWN = 'unknown'
}

// Tipo de dato que está siendo procesado
enum DataType {
  ALERT = 'alert',
  LOG = 'log',
  THREAT_INTEL = 'threat_intel',
  METRIC = 'metric',
  NETWORK_TRAFFIC = 'network_traffic',
  UNKNOWN = 'unknown'
}

// Configuración para cada parser
interface ParserConfig {
  // Campos obligatorios para el tipo de dato
  requiredFields?: string[];
  // Mapeo de campos del formato original a nuestros campos
  fieldMapping?: Record<string, string>;
  // Reglas de transformación
  transformRules?: Record<string, (value: any) => any>;
  // Timestamp formato
  timestampFormat?: string;
  // Prioridad del parser (0-100, mayor es más prioritario)
  priority?: number;
  // Parser específico para el origen de datos
  sourceSpecific?: string;
}

// Resultado del parseo
interface ParseResult<T> {
  success: boolean;
  data?: T;
  format?: DataFormat;
  type?: DataType;
  source?: string;
  errors?: string[];
  warnings?: string[];
  confidence: number;
  extractedIocs?: {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  };
  metadata?: Record<string, any>;
}

/**
 * Servicio principal de parseo inteligente
 */
export class AIParserService {
  private static instance: AIParserService;
  
  // OpenAI client
  private openai: OpenAI | null = null;
  
  // Anthropic client
  private anthropic: Anthropic | null = null;
  
  // Configuración del servicio
  private config = {
    // Modelo por defecto
    defaultModel: AIModelType.AUTO,
    // Uso de IA para parseo
    useAIForParsing: true,
    // Umbral de confianza para aceptar resultados de IA
    aiConfidenceThreshold: 0.7,
    // Número máximo de intentos de parseo
    maxParseAttempts: 2,
    // Timeout para parseo (ms)
    parseTimeout: 10000,
    // Longitud máxima para enviar a IA
    maxAIInputLength: 8000,
    // Cache de resultados
    enableCache: true,
    // TTL de cache (ms)
    cacheTTL: 3600000, // 1 hora
  };
  
  // Cache de resultados recientes
  private parseCache: Map<string, {
    result: any;
    timestamp: number;
  }> = new Map();
  
  // Configuraciones de parsers específicos
  private parserConfigs: Record<string, ParserConfig> = {
    // Parser para CEF (Common Event Format)
    'cef': {
      priority: 80,
      fieldMapping: {
        'src': 'sourceIp',
        'dst': 'destinationIp',
        'spt': 'sourcePort',
        'dpt': 'destinationPort',
        'suser': 'sourceUser',
        'duser': 'destinationUser',
        'shost': 'sourceHost',
        'dhost': 'destinationHost',
        'deviceVendor': 'source',
        'name': 'title',
        'msg': 'description'
      }
    },
    
    // Parser para Syslog
    'syslog': {
      priority: 70,
      timestampFormat: 'MMM DD HH:mm:ss'
    },
    
    // Parser para STIX
    'stix': {
      priority: 90,
      fieldMapping: {
        'type': 'type',
        'id': 'externalId',
        'created': 'createdAt',
        'modified': 'updatedAt',
        'name': 'title',
        'description': 'description',
        'pattern': 'iocs',
        'labels': 'tags'
      }
    },
    
    // Parser para formato JSON genérico
    'json': {
      priority: 60
    }
  };
  
  private constructor() {
    log("Servicio de parseo inteligente inicializado", "ai-parser");
    
    // Intentar inicializar clientes de IA si hay claves disponibles
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      log("Cliente OpenAI inicializado para parseo inteligente", "ai-parser");
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      log("Cliente Anthropic inicializado para parseo inteligente", "ai-parser");
    }
  }
  
  // Patrón Singleton para asegurar una única instancia
  public static getInstance(): AIParserService {
    if (!AIParserService.instance) {
      AIParserService.instance = new AIParserService();
    }
    return AIParserService.instance;
  }
  
  /**
   * Configura el servicio de parseo
   */
  public configure(config: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...config };
    log("Configuración del servicio de parseo actualizada", "ai-parser");
  }
  
  /**
   * Añade o actualiza la configuración de un parser específico
   */
  public setParserConfig(format: string, config: ParserConfig): void {
    this.parserConfigs[format] = {
      ...this.parserConfigs[format] || {},
      ...config
    };
    log(`Configuración del parser ${format} actualizada`, "ai-parser");
  }
  
  /**
   * Parsea datos crudos en un formato de alerta normalizado
   */
  public async parseToAlert(rawData: RawData, connector?: Connector): Promise<ParseResult<InsertAlert>> {
    // Resultado por defecto
    const result: ParseResult<InsertAlert> = {
      success: false,
      confidence: 0,
      format: DataFormat.UNKNOWN,
      type: DataType.ALERT,
      errors: [],
      warnings: [],
      extractedIocs: {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      }
    };
    
    try {
      // Si es un buffer, convertir a string
      if (Buffer.isBuffer(rawData)) {
        rawData = rawData.toString('utf-8');
      }
      
      // Verificar cache
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(rawData, 'alert', connector?.name);
        const cached = this.parseCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.config.cacheTTL) {
          log("Usando resultado en caché para parseo de alerta", "ai-parser");
          return cached.result;
        }
      }
      
      // Identificar formato de datos
      const format = this.identifyDataFormat(rawData);
      result.format = format;
      
      // Determinar origen de los datos
      const source = connector?.name || this.determineDataSource(rawData, format);
      result.source = source;
      
      // Intentar parsear con parsers convencionales
      let parsedData = await this.parseWithConventionalParsers(rawData, format, source, DataType.ALERT);
      
      // Si el parser convencional no tuvo éxito y IA está habilitada, intentar con IA
      if (!parsedData.success && this.config.useAIForParsing && this.hasAIClientConfigured()) {
        log("Parser convencional falló, intentando con IA", "ai-parser");
        parsedData = await this.parseWithAI(rawData, DataType.ALERT, format, source);
      }
      
      // Si ambos métodos fallaron, devolver error
      if (!parsedData.success) {
        result.errors!.push("No se pudo parsear los datos con ningún método disponible");
        return result;
      }
      
      // Extraer IoCs de los datos
      const extractedIocs = this.extractIoCs(parsedData.data);
      result.extractedIocs = extractedIocs;
      
      // Normalizar la alerta
      const normalizedAlert = this.normalizeAlert(parsedData.data, extractedIocs, source);
      
      // Validar campos requeridos
      const validationResult = this.validateAlert(normalizedAlert);
      if (!validationResult.valid) {
        result.success = false;
        result.errors!.push(...validationResult.errors);
        return result;
      }
      
      // Completar resultado exitoso
      result.success = true;
      result.data = normalizedAlert;
      result.confidence = parsedData.confidence;
      result.metadata = normalizedAlert.metadata;
      
      // Guardar en cache
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(rawData, 'alert', source);
        this.parseCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
      
      return result;
      
    } catch (error) {
      result.errors!.push(`Error durante el parseo: ${error.message}`);
      log(`Error parseando a alerta: ${error.message}`, "ai-parser");
      return result;
    }
  }
  
  /**
   * Parsea datos crudos en un formato de inteligencia de amenazas normalizado
   */
  public async parseToThreatIntel(rawData: RawData, connector?: Connector): Promise<ParseResult<InsertThreatIntel>> {
    // Resultado por defecto
    const result: ParseResult<InsertThreatIntel> = {
      success: false,
      confidence: 0,
      format: DataFormat.UNKNOWN,
      type: DataType.THREAT_INTEL,
      errors: [],
      warnings: [],
      extractedIocs: {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      }
    };
    
    try {
      // Si es un buffer, convertir a string
      if (Buffer.isBuffer(rawData)) {
        rawData = rawData.toString('utf-8');
      }
      
      // Verificar cache
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(rawData, 'threat_intel', connector?.name);
        const cached = this.parseCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.config.cacheTTL) {
          log("Usando resultado en caché para parseo de threat intel", "ai-parser");
          return cached.result;
        }
      }
      
      // Identificar formato de datos
      const format = this.identifyDataFormat(rawData);
      result.format = format;
      
      // Determinar origen de los datos
      const source = connector?.name || this.determineDataSource(rawData, format);
      result.source = source;
      
      // Intentar parsear con parsers convencionales
      let parsedData = await this.parseWithConventionalParsers(rawData, format, source, DataType.THREAT_INTEL);
      
      // Si el parser convencional no tuvo éxito y IA está habilitada, intentar con IA
      if (!parsedData.success && this.config.useAIForParsing && this.hasAIClientConfigured()) {
        log("Parser convencional falló, intentando con IA", "ai-parser");
        parsedData = await this.parseWithAI(rawData, DataType.THREAT_INTEL, format, source);
      }
      
      // Si ambos métodos fallaron, devolver error
      if (!parsedData.success) {
        result.errors!.push("No se pudo parsear los datos con ningún método disponible");
        return result;
      }
      
      // Extraer IoCs de los datos
      const extractedIocs = this.extractIoCs(parsedData.data);
      result.extractedIocs = extractedIocs;
      
      // Normalizar la inteligencia de amenazas
      const normalizedIntel = this.normalizeThreatIntel(parsedData.data, extractedIocs, source);
      
      // Validar campos requeridos
      const validationResult = this.validateThreatIntel(normalizedIntel);
      if (!validationResult.valid) {
        result.success = false;
        result.errors!.push(...validationResult.errors);
        return result;
      }
      
      // Completar resultado exitoso
      result.success = true;
      result.data = normalizedIntel;
      result.confidence = parsedData.confidence;
      result.metadata = normalizedIntel.metadata;
      
      // Guardar en cache
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(rawData, 'threat_intel', source);
        this.parseCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
      
      return result;
      
    } catch (error) {
      result.errors!.push(`Error durante el parseo: ${error.message}`);
      log(`Error parseando a threat intel: ${error.message}`, "ai-parser");
      return result;
    }
  }
  
  /**
   * Parsea logs en un formato estructurado para análisis
   */
  public async parseLogs(rawLogs: string | string[], connector?: Connector): Promise<ParseResult<any[]>> {
    // Convertir a array si es un string
    const logsArray = Array.isArray(rawLogs) ? rawLogs : [rawLogs];
    
    // Resultado por defecto
    const result: ParseResult<any[]> = {
      success: false,
      confidence: 0,
      format: DataFormat.UNKNOWN,
      type: DataType.LOG,
      errors: [],
      warnings: [],
      data: []
    };
    
    try {
      // Identificar formato de los logs (analizando el primer log)
      const format = logsArray.length > 0 ? this.identifyDataFormat(logsArray[0]) : DataFormat.UNKNOWN;
      result.format = format;
      
      // Determinar origen de los datos
      const source = connector?.name || this.determineDataSource(logsArray[0], format);
      result.source = source;
      
      // Analizar hasta 100 logs para limitar la carga de procesamiento
      const logsToProcess = logsArray.slice(0, 100);
      const parsedLogs: any[] = [];
      
      // Intentar parsear cada log
      for (const log of logsToProcess) {
        try {
          // Primero intentar con parsers convencionales
          let parsedLog = await this.parseWithConventionalParsers(log, format, source, DataType.LOG);
          
          // Si el parser convencional falló y IA está habilitada, intentar con IA
          if (!parsedLog.success && this.config.useAIForParsing && this.hasAIClientConfigured()) {
            parsedLog = await this.parseWithAI(log, DataType.LOG, format, source);
          }
          
          if (parsedLog.success && parsedLog.data) {
            parsedLogs.push(parsedLog.data);
          } else {
            // Si falló, intentar añadir el log en crudo con estructura mínima
            parsedLogs.push({
              rawLog: log,
              parsed: false,
              timestamp: new Date(),
              format,
              source
            });
            result.warnings!.push(`No se pudo parsear completamente un log: ${log.substring(0, 100)}...`);
          }
        } catch (error) {
          result.warnings!.push(`Error parseando log: ${error.message}`);
        }
      }
      
      // Si al menos se parsearon algunos logs, considerar éxito parcial
      if (parsedLogs.length > 0) {
        result.success = true;
        result.data = parsedLogs;
        result.confidence = parsedLogs.filter(l => l.parsed !== false).length / parsedLogs.length;
        
        // Si más del 50% de los logs no se pudieron parsear, es una advertencia importante
        if (result.confidence < 0.5) {
          result.warnings!.push(`Más del 50% de los logs no se pudieron parsear correctamente (${Math.round(result.confidence * 100)}% éxito)`);
        }
      } else {
        result.errors!.push("No se pudo parsear ningún log");
      }
      
      return result;
      
    } catch (error) {
      result.errors!.push(`Error durante el parseo de logs: ${error.message}`);
      log(`Error parseando logs: ${error.message}`, "ai-parser");
      return result;
    }
  }
  
  /**
   * Identifica el formato de los datos proporcionados
   */
  private identifyDataFormat(rawData: RawData): DataFormat {
    // Convertir a string para análisis, si es necesario
    const dataStr = typeof rawData === 'object' ? JSON.stringify(rawData) : String(rawData);
    
    // Intentar identificar por estructura/patrón
    
    // Verificar si es JSON
    try {
      if (typeof rawData === 'object') {
        return DataFormat.JSON;
      }
      
      JSON.parse(dataStr);
      return DataFormat.JSON;
    } catch {}
    
    // Verificar si es XML
    if (dataStr.trim().startsWith('<?xml') || 
        dataStr.trim().startsWith('<') && dataStr.includes('</')) {
      return DataFormat.XML;
    }
    
    // Verificar si es CEF (Common Event Format)
    if (dataStr.includes('CEF:') && dataStr.includes('|')) {
      return DataFormat.CEF;
    }
    
    // Verificar si es LEEF (Log Event Extended Format)
    if (dataStr.includes('LEEF:')) {
      return DataFormat.LEEF;
    }
    
    // Verificar si es Syslog
    if (dataStr.match(/^<\d+>/) || 
        dataStr.match(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/)) {
      return DataFormat.SYSLOG;
    }
    
    // Verificar si es CSV
    if (dataStr.includes(',') && 
        dataStr.split('\n')[0].split(',').length > 3 &&
        dataStr.split('\n').length > 1) {
      return DataFormat.CSV;
    }
    
    // Verificar si parece STIX
    if ((dataStr.includes('"type"') && dataStr.includes('"id"') && 
         dataStr.includes('"spec_version"')) || 
        dataStr.includes('stix') || 
        dataStr.includes('indicator--')) {
      return DataFormat.STIX;
    }
    
    // Si no se pudo identificar, asumir texto plano
    return DataFormat.PLAINTEXT;
  }
  
  /**
   * Determina la fuente de los datos basado en su contenido
   */
  private determineDataSource(rawData: RawData, format: DataFormat): string {
    const dataStr = typeof rawData === 'object' ? JSON.stringify(rawData) : String(rawData);
    
    // Buscar pistas sobre el origen en el contenido
    
    // Fuentes comunes de threat intel
    const threatIntelSources = [
      { name: 'AlienVault OTX', pattern: /alientvault|otx/i },
      { name: 'MISP', pattern: /misp/i },
      { name: 'VirusTotal', pattern: /virustotal/i },
      { name: 'AbuseIPDB', pattern: /abuseipdb/i },
      { name: 'IBM X-Force', pattern: /x-force|xforce|ibm/i },
      { name: 'CISA', pattern: /cisa/i },
      { name: 'ThreatFox', pattern: /threatfox/i }
    ];
    
    // Fuentes comunes de eventos de seguridad
    const securityEventSources = [
      { name: 'Wazuh', pattern: /wazuh/i },
      { name: 'Suricata', pattern: /suricata/i },
      { name: 'Snort', pattern: /snort/i },
      { name: 'CrowdStrike', pattern: /crowdstrike|falcon/i },
      { name: 'Microsoft Defender', pattern: /microsoft|defender|windows/i },
      { name: 'Palo Alto', pattern: /palo alto|paloalto/i },
      { name: 'Cisco', pattern: /cisco/i },
      { name: 'Fortinet', pattern: /fortinet|fortigate/i },
      { name: 'Check Point', pattern: /check\s*point|checkpoint/i },
      { name: 'Splunk', pattern: /splunk/i },
      { name: 'Elastic', pattern: /elastic|elasticsearch/i }
    ];
    
    // Primero buscar en fuentes de threat intel
    for (const source of threatIntelSources) {
      if (source.pattern.test(dataStr)) {
        return source.name;
      }
    }
    
    // Luego en fuentes de eventos de seguridad
    for (const source of securityEventSources) {
      if (source.pattern.test(dataStr)) {
        return source.name;
      }
    }
    
    // Si es CEF, intentar extraer el vendor
    if (format === DataFormat.CEF && dataStr.includes('CEF:')) {
      const parts = dataStr.split('|');
      if (parts.length > 1) {
        return parts[1].trim() || 'CEF Source';
      }
    }
    
    // Si no se pudo determinar, usar un valor genérico
    return format === DataFormat.JSON ? 'JSON API' : 
           format === DataFormat.SYSLOG ? 'Syslog' : 
           format === DataFormat.STIX ? 'STIX Feed' : 
           'Unknown Source';
  }
  
  /**
   * Intenta parsear los datos usando métodos convencionales
   */
  private async parseWithConventionalParsers(
    rawData: RawData, 
    format: DataFormat, 
    source: string,
    dataType: DataType
  ): Promise<{
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  }> {
    const result = {
      success: false,
      data: undefined,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      switch (format) {
        case DataFormat.JSON:
          return this.parseJsonData(rawData, source, dataType);
          
        case DataFormat.XML:
          return this.parseXmlData(rawData, source, dataType);
          
        case DataFormat.CEF:
          return this.parseCefData(rawData, source, dataType);
          
        case DataFormat.SYSLOG:
          return this.parseSyslogData(rawData, source, dataType);
          
        case DataFormat.STIX:
          return this.parseStixData(rawData, source, dataType);
          
        case DataFormat.CSV:
          return this.parseCsvData(rawData, source, dataType);
          
        case DataFormat.LEEF:
          return this.parseLeefData(rawData, source, dataType);
          
        default:
          result.errors.push(`No hay parser convencional disponible para el formato ${format}`);
          return result;
      }
    } catch (error) {
      result.errors.push(`Error en parser convencional: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos JSON
   */
  private parseJsonData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      // Parsear JSON si es string
      const data = typeof rawData === 'object' ? rawData : JSON.parse(String(rawData));
      
      // Configuración específica para esta fuente, si existe
      const sourceConfig = this.parserConfigs[`json_${source.toLowerCase().replace(/\s+/g, '_')}`];
      
      // Si es un array, tomar el primer elemento (para alertas/intel)
      const dataObj = Array.isArray(data) && dataType !== DataType.LOG ? data[0] : data;
      
      if (!dataObj || typeof dataObj !== 'object') {
        result.errors.push('Los datos JSON no tienen la estructura esperada');
        return result;
      }
      
      // Determinar si es un formato conocido
      let isKnownFormat = false;
      let mappedData: any = {};
      
      // Comprobar si coincide con formatos conocidos
      if (sourceConfig?.fieldMapping) {
        // Usar mapeo específico de la fuente
        for (const [srcField, destField] of Object.entries(sourceConfig.fieldMapping)) {
          if (srcField in dataObj) {
            mappedData[destField] = dataObj[srcField];
          }
        }
        
        isKnownFormat = Object.keys(mappedData).length > 0;
      } else {
        // Intentar mapear campos comunes
        const commonMappings = {
          // Alertas
          'alert_name': 'title',
          'alert_title': 'title',
          'name': 'title',
          'title': 'title',
          'message': 'description',
          'description': 'description',
          'details': 'description',
          'severity': 'severity',
          'priority': 'severity',
          'source': 'source',
          'source_ip': 'sourceIp',
          'src_ip': 'sourceIp',
          'src': 'sourceIp',
          'destination_ip': 'destinationIp',
          'dest_ip': 'destinationIp',
          'dst': 'destinationIp',
          'timestamp': 'timestamp',
          'time': 'timestamp',
          'date': 'timestamp',
          'event_time': 'timestamp',
          
          // Threat Intel
          'indicator': 'title',
          'indicator_type': 'type',
          'ioc_type': 'type',
          'ioc_value': 'value',
          'threat_type': 'type',
          'confidence': 'confidence',
          'tags': 'tags',
          'tlp': 'tlp'
        };
        
        for (const [srcField, destField] of Object.entries(commonMappings)) {
          if (srcField in dataObj) {
            mappedData[destField] = dataObj[srcField];
          }
        }
        
        // Comprobar si encontramos suficientes campos
        isKnownFormat = Object.keys(mappedData).length >= 2;
      }
      
      if (isKnownFormat) {
        // Aplicar reglas de transformación si existen
        if (sourceConfig?.transformRules) {
          for (const [field, transform] of Object.entries(sourceConfig.transformRules)) {
            if (field in mappedData) {
              mappedData[field] = transform(mappedData[field]);
            }
          }
        }
        
        // Agregar campos que faltan del original
        for (const [key, value] of Object.entries(dataObj)) {
          if (!(key in mappedData)) {
            // Usar camelCase para el nombre de la propiedad
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            mappedData[camelKey] = value;
          }
        }
        
        // Incluir metadata original
        mappedData.metadata = {
          ...mappedData.metadata || {},
          originalData: dataObj,
          parser: 'json',
          source
        };
        
        result.success = true;
        result.data = mappedData;
        result.confidence = 0.85;
      } else {
        // No se pudo mapear automáticamente, devolver datos originales
        // con estructura mínima según el tipo de datos
        
        const fallbackData: any = { 
          metadata: { 
            originalData: dataObj,
            parser: 'json',
            source
          }
        };
        
        if (dataType === DataType.ALERT) {
          fallbackData.title = dataObj.name || dataObj.title || dataObj.alert || 'Alert from ' + source;
          fallbackData.description = dataObj.description || dataObj.message || dataObj.details || JSON.stringify(dataObj);
          fallbackData.severity = dataObj.severity || dataObj.priority || 'medium';
          fallbackData.timestamp = dataObj.timestamp || dataObj.time || dataObj.date || new Date();
          fallbackData.source = source;
        } else if (dataType === DataType.THREAT_INTEL) {
          fallbackData.title = dataObj.name || dataObj.title || dataObj.indicator || 'Threat Intel from ' + source;
          fallbackData.description = dataObj.description || dataObj.details || JSON.stringify(dataObj);
          fallbackData.type = dataObj.type || dataObj.indicator_type || 'indicator';
          fallbackData.severity = dataObj.severity || dataObj.risk || 'medium';
          fallbackData.confidence = dataObj.confidence || 0.5;
          fallbackData.source = source;
        }
        
        result.success = true;
        result.data = fallbackData;
        result.confidence = 0.6; // Confianza baja porque es un fallback
      }
      
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando JSON: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos XML (implementación simplificada)
   */
  private parseXmlData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    // Esta es una implementación simplificada
    // En un entorno real necesitaríamos una librería XML como xml2js
    
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    result.errors.push('Parser XML no implementado completamente');
    
    // Datos simplificados para no bloquear el flujo
    const fallbackData: any = { 
      metadata: { 
        originalData: String(rawData).substring(0, 500),
        parser: 'xml',
        source
      }
    };
    
    if (dataType === DataType.ALERT) {
      fallbackData.title = 'Alert from ' + source;
      fallbackData.description = 'XML data: ' + String(rawData).substring(0, 200);
      fallbackData.severity = 'medium';
      fallbackData.timestamp = new Date();
      fallbackData.source = source;
    } else if (dataType === DataType.THREAT_INTEL) {
      fallbackData.title = 'Threat Intel from ' + source;
      fallbackData.description = 'XML data: ' + String(rawData).substring(0, 200);
      fallbackData.type = 'indicator';
      fallbackData.severity = 'medium';
      fallbackData.confidence = 0.5;
      fallbackData.source = source;
    }
    
    result.success = true;
    result.data = fallbackData;
    result.confidence = 0.3; // Confianza muy baja
    
    return result;
  }
  
  /**
   * Parsea datos CEF (Common Event Format)
   */
  private parseCefData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      const dataStr = String(rawData);
      
      // CEF tiene formato: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
      if (!dataStr.includes('CEF:')) {
        result.errors.push('Los datos no tienen formato CEF válido');
        return result;
      }
      
      // Extraer el header y las extensiones
      const [header, extensionsPart] = dataStr.split('CEF:')[1].split('|', 7).join('|').split('|', 7);
      const headerParts = ('CEF:' + header).split('|');
      const extensions = extensionsPart || '';
      
      if (headerParts.length < 7) {
        result.errors.push('Formato CEF incompleto');
        return result;
      }
      
      // Parsear el header
      const [_, version, deviceVendor, deviceProduct, deviceVersion, signatureId, name, severity] = headerParts;
      
      // Parsear extensiones (formato key=value)
      const extensionData: Record<string, string> = {};
      let currentKey = '';
      let currentValue = '';
      let inQuote = false;
      
      for (let i = 0; i < extensions.length; i++) {
        const char = extensions[i];
        
        if (char === '=' && !inQuote && currentKey === '') {
          // End of key
          currentKey = currentValue.trim();
          currentValue = '';
        } else if (char === ' ' && !inQuote && currentKey !== '') {
          // End of value
          extensionData[currentKey] = currentValue.trim();
          currentKey = '';
          currentValue = '';
        } else if (char === '"') {
          // Toggle quote state
          inQuote = !inQuote;
        } else {
          currentValue += char;
        }
      }
      
      // Add the last key-value pair
      if (currentKey !== '') {
        extensionData[currentKey] = currentValue.trim();
      }
      
      // Map CEF fields to our data model
      const mappedData: any = {
        title: name || 'CEF Event',
        description: `${deviceVendor} ${deviceProduct} event: ${name}`,
        severity: this.mapCefSeverity(severity),
        source: deviceVendor ? `${deviceVendor} ${deviceProduct}` : source,
        timestamp: new Date(),
        metadata: {
          cef: {
            version,
            deviceVendor,
            deviceProduct,
            deviceVersion,
            signatureId,
            name,
            severity,
            extensions: extensionData
          },
          parser: 'cef',
          source
        }
      };
      
      // Map common extension fields
      const cefMapping = this.parserConfigs['cef']?.fieldMapping || {};
      
      for (const [cefField, ourField] of Object.entries(cefMapping)) {
        if (cefField in extensionData) {
          mappedData[ourField] = extensionData[cefField];
        }
      }
      
      // Handle timestamp fields
      if (extensionData.rt) {
        // rt is epoch time in milliseconds
        mappedData.timestamp = new Date(parseInt(extensionData.rt));
      } else if (extensionData.end) {
        mappedData.timestamp = new Date(parseInt(extensionData.end));
      } else if (extensionData.start) {
        mappedData.timestamp = new Date(parseInt(extensionData.start));
      }
      
      result.success = true;
      result.data = mappedData;
      result.confidence = 0.85;
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando CEF: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos Syslog
   */
  private parseSyslogData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      const dataStr = String(rawData);
      const lines = dataStr.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        result.errors.push('Datos Syslog vacíos');
        return result;
      }
      
      // Tomar la primera línea para análisis
      const line = lines[0];
      
      // RFC3164 Syslog format: <PRI>TIMESTAMP HOSTNAME TAG: CONTENT
      // RFC5424 Syslog format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
      
      let pri = 0;
      let timestamp = new Date();
      let hostname = '';
      let appName = '';
      let message = '';
      
      // Extract PRI if present
      const priMatch = line.match(/^<(\d+)>/);
      if (priMatch) {
        pri = parseInt(priMatch[1]);
        const remainder = line.substring(priMatch[0].length);
        
        // RFC5424 format detection
        if (remainder.startsWith('1 ')) {
          // RFC5424
          const parts = remainder.substring(2).split(' ');
          if (parts.length >= 6) {
            try {
              timestamp = new Date(parts[0]);
              hostname = parts[1];
              appName = parts[2];
              
              // Extract message after STRUCTURED-DATA
              let msgIndex = remainder.indexOf(' - ');
              if (msgIndex > 0) {
                message = remainder.substring(msgIndex + 3);
              } else {
                // Fallback
                message = parts.slice(6).join(' ');
              }
            } catch (e) {
              // Parsing error, fallback to treating whole line as message
              message = line;
            }
          } else {
            message = remainder;
          }
        } else {
          // RFC3164
          const timestampMatch = remainder.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
          if (timestampMatch) {
            try {
              // Add current year since RFC3164 doesn't include it
              const currentYear = new Date().getFullYear();
              timestamp = new Date(`${timestampMatch[1]} ${currentYear}`);
              
              const afterTimestamp = remainder.substring(timestampMatch[0].length).trim();
              const hostAndRest = afterTimestamp.split(' ', 2);
              
              if (hostAndRest.length >= 2) {
                hostname = hostAndRest[0];
                message = afterTimestamp.substring(hostname.length).trim();
                
                // Extract appName from the remaining message
                const tagMatch = message.match(/^([^:]+):/);
                if (tagMatch) {
                  appName = tagMatch[1];
                  message = message.substring(tagMatch[0].length).trim();
                }
              } else {
                message = afterTimestamp;
              }
            } catch (e) {
              // Parsing error, fallback to treating whole line as message
              message = remainder;
            }
          } else {
            message = remainder;
          }
        }
      } else {
        // No PRI, try to detect other syslog formats
        const timestampMatch = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
        if (timestampMatch) {
          try {
            // Add current year since this format doesn't include it
            const currentYear = new Date().getFullYear();
            timestamp = new Date(`${timestampMatch[1]} ${currentYear}`);
            
            const afterTimestamp = line.substring(timestampMatch[0].length).trim();
            const hostAndRest = afterTimestamp.split(' ', 2);
            
            if (hostAndRest.length >= 2) {
              hostname = hostAndRest[0];
              message = afterTimestamp.substring(hostname.length).trim();
            } else {
              message = afterTimestamp;
            }
          } catch (e) {
            // Parsing error, fallback to treating whole line as message
            message = line;
          }
        } else {
          // Couldn't identify a known format, treat the whole line as message
          message = line;
        }
      }
      
      // Calculate facility and severity from PRI if present
      const facility = Math.floor(pri / 8);
      const syslogSeverity = pri % 8;
      
      // Map syslog severity to our severity format
      const severityMap = ["critical", "critical", "critical", "high", "high", "medium", "medium", "low"];
      const mappedSeverity = severityMap[syslogSeverity] || "medium";
      
      // Create mapped data
      const mappedData: any = {
        title: appName ? `${appName} event from ${hostname || source}` : `Syslog event from ${hostname || source}`,
        description: message,
        severity: mappedSeverity,
        source: appName || hostname || source,
        timestamp: timestamp,
        metadata: {
          syslog: {
            facility,
            severity: syslogSeverity,
            pri,
            hostname,
            appName
          },
          parser: 'syslog',
          originalData: line,
          source
        }
      };
      
      result.success = true;
      result.data = mappedData;
      result.confidence = hostname && appName ? 0.85 : 0.7;
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando Syslog: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos STIX (Structured Threat Information eXpression)
   */
  private parseStixData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      // Parsear datos STIX (generalmente en formato JSON)
      let data: any;
      
      if (typeof rawData === 'object') {
        data = rawData;
      } else {
        try {
          data = JSON.parse(String(rawData));
        } catch (e) {
          result.errors.push('Los datos STIX no están en formato JSON válido');
          return result;
        }
      }
      
      // Verificar si es un objeto STIX válido
      if (!data.type || !data.id || !data.spec_version) {
        // Podría ser un bundle STIX
        if (data.type === 'bundle' && Array.isArray(data.objects) && data.objects.length > 0) {
          // Tomar el primer objeto del bundle
          data = data.objects[0];
        } else {
          result.errors.push('Los datos no tienen estructura STIX válida');
          return result;
        }
      }
      
      // Mapear campos STIX a nuestro modelo
      const mappedData: any = {
        title: data.name || `${data.type} from ${source}`,
        description: data.description || JSON.stringify(data),
        type: data.type,
        source: source,
        confidence: typeof data.confidence === 'number' ? data.confidence / 100 : 0.7,
        severity: 'medium', // STIX no tiene concepto de severidad
        metadata: {
          stix: {
            id: data.id,
            type: data.type,
            spec_version: data.spec_version,
            created: data.created,
            modified: data.modified
          },
          parser: 'stix',
          originalData: data,
          source
        }
      };
      
      // Si es un indicador, extraer el patrón y mapear a iocs
      if (data.type === 'indicator' && data.pattern) {
        mappedData.iocs = {};
        
        if (data.pattern.includes('ipv4-addr')) {
          const ipMatches = data.pattern.match(/ipv4-addr:value\s*=\s*['"]([^'"]+)['"]/g);
          if (ipMatches) {
            mappedData.iocs.ips = ipMatches.map((m: string) => m.match(/['"]([^'"]+)['"]/)[1]);
          }
        }
        
        if (data.pattern.includes('domain-name')) {
          const domainMatches = data.pattern.match(/domain-name:value\s*=\s*['"]([^'"]+)['"]/g);
          if (domainMatches) {
            mappedData.iocs.domains = domainMatches.map((m: string) => m.match(/['"]([^'"]+)['"]/)[1]);
          }
        }
        
        if (data.pattern.includes('file:hashes')) {
          const hashMatches = data.pattern.match(/file:hashes\.[^=]+=\s*['"]([^'"]+)['"]/g);
          if (hashMatches) {
            mappedData.iocs.hashes = hashMatches.map((m: string) => m.match(/['"]([^'"]+)['"]/)[1]);
          }
        }
        
        if (data.pattern.includes('url')) {
          const urlMatches = data.pattern.match(/url:value\s*=\s*['"]([^'"]+)['"]/g);
          if (urlMatches) {
            mappedData.iocs.urls = urlMatches.map((m: string) => m.match(/['"]([^'"]+)['"]/)[1]);
          }
        }
        
        if (data.pattern.includes('email-addr')) {
          const emailMatches = data.pattern.match(/email-addr:value\s*=\s*['"]([^'"]+)['"]/g);
          if (emailMatches) {
            mappedData.iocs.emails = emailMatches.map((m: string) => m.match(/['"]([^'"]+)['"]/)[1]);
          }
        }
        
        // Ajustar título y descripción para indicadores
        if (Object.values(mappedData.iocs).some(arr => arr && arr.length > 0)) {
          const iocTypes = Object.keys(mappedData.iocs).filter(key => 
            Array.isArray(mappedData.iocs[key]) && mappedData.iocs[key].length > 0
          );
          
          const iocSummary = iocTypes.map(type => 
            `${mappedData.iocs[type].length} ${type}`
          ).join(', ');
          
          mappedData.title = `${data.name || 'STIX Indicator'}: ${iocSummary}`;
        }
      }
      
      // Extraer etiquetas si existen
      if (Array.isArray(data.labels)) {
        mappedData.tags = data.labels;
      }
      
      // Extraer TLP si existe
      if (data.object_marking_refs) {
        const tlpMarkings = Array.isArray(data.object_marking_refs) ? 
          data.object_marking_refs.filter((ref: string) => ref.includes('tlp')) : [];
        
        if (tlpMarkings.length > 0) {
          const tlp = tlpMarkings[0].split('marking-definition--tlp--')[1];
          if (tlp) {
            mappedData.metadata.tlp = tlp.toUpperCase();
          }
        }
      }
      
      // Establecer timestamps si existen
      if (data.created) {
        try {
          mappedData.timestamp = new Date(data.created);
        } catch (e) {
          // Ignorar error en formato de fecha
        }
      }
      
      result.success = true;
      result.data = mappedData;
      result.confidence = 0.9; // Alta confianza para STIX
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando STIX: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos CSV (implementación simplificada)
   */
  private parseCsvData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      const dataStr = String(rawData);
      const lines = dataStr.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        result.errors.push('Datos CSV insuficientes (se necesita al menos cabecera y una línea de datos)');
        return result;
      }
      
      // Parsear cabecera
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Parsear primera línea de datos
      const values = lines[1].split(',').map(v => v.trim());
      
      if (headers.length !== values.length) {
        result.errors.push('El número de valores no coincide con el número de cabeceras');
        return result;
      }
      
      // Crear objeto con los datos
      const data: Record<string, string> = {};
      headers.forEach((header, index) => {
        data[header] = values[index];
      });
      
      // Mapear a nuestro modelo según el tipo de datos
      const mappedData: any = {
        metadata: {
          csv: {
            headers,
            rawData: lines.slice(0, 5).join('\n')
          },
          parser: 'csv',
          originalData: data,
          source
        }
      };
      
      if (dataType === DataType.ALERT) {
        // Buscar campos de alerta comunes
        mappedData.title = this.findField(data, ['alert', 'title', 'name', 'event', 'message']) || 
                          `CSV Alert from ${source}`;
        mappedData.description = this.findField(data, ['description', 'details', 'message', 'info']) || 
                                JSON.stringify(data);
        mappedData.severity = this.findField(data, ['severity', 'priority', 'risk']) || 'medium';
        mappedData.source = source;
        
        // Intentar extraer IPs
        mappedData.sourceIp = this.findField(data, ['source_ip', 'src_ip', 'src', 'ip_src']);
        mappedData.destinationIp = this.findField(data, ['destination_ip', 'dest_ip', 'dst', 'ip_dst']);
        
        // Intentar extraer timestamp
        const timestamp = this.findField(data, ['timestamp', 'time', 'date', 'event_time']);
        if (timestamp) {
          try {
            mappedData.timestamp = new Date(timestamp);
          } catch (e) {
            mappedData.timestamp = new Date();
          }
        } else {
          mappedData.timestamp = new Date();
        }
      } else if (dataType === DataType.THREAT_INTEL) {
        // Buscar campos de intel comunes
        mappedData.title = this.findField(data, ['indicator', 'name', 'title', 'ioc']) || 
                          `CSV Intel from ${source}`;
        mappedData.description = this.findField(data, ['description', 'details', 'info']) || 
                                JSON.stringify(data);
        mappedData.type = this.findField(data, ['type', 'indicator_type', 'ioc_type']) || 'indicator';
        mappedData.severity = this.findField(data, ['severity', 'risk']) || 'medium';
        mappedData.confidence = parseFloat(this.findField(data, ['confidence', 'confidence_score']) || '0.5');
        mappedData.source = source;
        
        // Buscar IOCs
        mappedData.iocs = {};
        
        const ip = this.findField(data, ['ip', 'ipv4', 'ip_address']);
        if (ip) mappedData.iocs.ips = [ip];
        
        const domain = this.findField(data, ['domain', 'hostname', 'fqdn']);
        if (domain) mappedData.iocs.domains = [domain];
        
        const hash = this.findField(data, ['hash', 'md5', 'sha1', 'sha256']);
        if (hash) mappedData.iocs.hashes = [hash];
        
        const url = this.findField(data, ['url', 'uri']);
        if (url) mappedData.iocs.urls = [url];
      }
      
      result.success = true;
      result.data = mappedData;
      result.confidence = 0.7;
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando CSV: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos LEEF (Log Event Extended Format)
   */
  private parseLeefData(
    rawData: RawData, 
    source: string,
    dataType: DataType
  ): {
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  } {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      const dataStr = String(rawData);
      
      // LEEF tiene formato: LEEF:Version|Vendor|Product|Version|EventID|key1=value1\tkey2=value2
      if (!dataStr.includes('LEEF:')) {
        result.errors.push('Los datos no tienen formato LEEF válido');
        return result;
      }
      
      // Extraer el header y los atributos
      const parts = dataStr.split('LEEF:')[1].split('|');
      
      if (parts.length < 5) {
        result.errors.push('Formato LEEF incompleto');
        return result;
      }
      
      const [version, vendor, product, productVersion, eventId, ...rest] = parts;
      
      // El último elemento de parts contiene los atributos
      const attributesPart = rest.join('|');
      
      // Parsear los atributos (formato key=value separados por tabulador)
      const attributes: Record<string, string> = {};
      const attrRegex = /([^=\t]+)=([^\t]*)/g;
      let match;
      
      while ((match = attrRegex.exec(attributesPart)) !== null) {
        attributes[match[1]] = match[2];
      }
      
      // Mapear a nuestro modelo
      const mappedData: any = {
        title: attributes.devname || attributes.name || `${product} event`,
        description: attributes.msg || attributes.message || `LEEF event from ${vendor} ${product}`,
        severity: this.mapLeefSeverity(attributes.severity || attributes.sev),
        source: `${vendor} ${product}`,
        timestamp: new Date(),
        metadata: {
          leef: {
            version,
            vendor,
            product,
            productVersion,
            eventId,
            attributes
          },
          parser: 'leef',
          source
        }
      };
      
      // Extraer IPs
      mappedData.sourceIp = attributes.src || attributes.srcip || attributes.sourceip;
      mappedData.destinationIp = attributes.dst || attributes.dstip || attributes.destinationip;
      
      // Manejar timestamp
      if (attributes.devTime) {
        try {
          mappedData.timestamp = new Date(attributes.devTime);
        } catch (e) {
          // Ignorar error en formato de fecha
        }
      }
      
      result.success = true;
      result.data = mappedData;
      result.confidence = 0.85;
      return result;
      
    } catch (error) {
      result.errors.push(`Error parseando LEEF: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Parsea datos utilizando IA
   */
  private async parseWithAI(
    rawData: RawData, 
    dataType: DataType,
    format: DataFormat,
    source: string
  ): Promise<{
    success: boolean;
    data?: any;
    confidence: number;
    errors?: string[];
  }> {
    const result = {
      success: false,
      data: undefined as any,
      confidence: 0,
      errors: [] as string[]
    };
    
    try {
      // Verificar si hay algún cliente de IA configurado
      if (!this.hasAIClientConfigured()) {
        result.errors.push('No hay cliente de IA configurado para parseo asistido');
        return result;
      }
      
      // Preparar datos para envío a IA (limitar tamaño)
      const dataStr = typeof rawData === 'object' ? 
                    JSON.stringify(rawData) : String(rawData);
      
      const truncatedData = dataStr.length > this.config.maxAIInputLength ? 
                           dataStr.substring(0, this.config.maxAIInputLength) + '...' : 
                           dataStr;
      
      // Construir prompt según el tipo de datos
      let prompt = '';
      let expectedFormat = '';
      
      if (dataType === DataType.ALERT) {
        prompt = `
        Extract security alert information from this data. The data is in ${format} format from source "${source}".
        
        DATA:
        ${truncatedData}
        
        Convert the above data into a valid JSON object with the following fields:
        - title: A concise title for the alert
        - description: A detailed description of the alert
        - severity: The severity level (critical, high, medium, or low)
        - source: The source of the alert (use "${source}" if not specified)
        - sourceIp: Source IP address if present
        - destinationIp: Destination IP address if present
        - timestamp: The timestamp of the alert (ISO format)
        - additionalFields: An object with any other important fields
        
        Only include fields that can be extracted from the data. Use null for missing fields.
        Your response must be ONLY a valid JSON object.
        `;
        
        expectedFormat = `{
          "title": "Alert title",
          "description": "Alert description",
          "severity": "medium",
          "source": "${source}",
          "sourceIp": null,
          "destinationIp": null,
          "timestamp": "2023-04-01T12:00:00Z",
          "additionalFields": {}
        }`;
      } else if (dataType === DataType.THREAT_INTEL) {
        prompt = `
        Extract threat intelligence information from this data. The data is in ${format} format from source "${source}".
        
        DATA:
        ${truncatedData}
        
        Convert the above data into a valid JSON object with the following fields:
        - title: A concise title for the threat intelligence
        - description: A detailed description of the threat intelligence
        - type: The type of threat intelligence (e.g., indicator, malware, threat-actor)
        - severity: The severity level (critical, high, medium, or low)
        - confidence: A confidence score between 0 and 1
        - source: The source of the intelligence (use "${source}" if not specified)
        - iocs: An object with arrays of IoCs (ips, domains, hashes, urls, emails)
        - tlp: Traffic Light Protocol marking (if present)
        - additionalFields: An object with any other important fields
        
        Only include fields that can be extracted from the data. Use null for missing fields.
        Your response must be ONLY a valid JSON object.
        `;
        
        expectedFormat = `{
          "title": "Threat Intel title",
          "description": "Threat intel description",
          "type": "indicator",
          "severity": "medium",
          "confidence": 0.7,
          "source": "${source}",
          "iocs": {
            "ips": [],
            "domains": [],
            "hashes": [],
            "urls": [],
            "emails": []
          },
          "tlp": "AMBER",
          "additionalFields": {}
        }`;
      } else if (dataType === DataType.LOG) {
        prompt = `
        Extract structured information from this log entry. The log is in ${format} format from source "${source}".
        
        LOG ENTRY:
        ${truncatedData}
        
        Convert the above log into a valid JSON object with the following fields:
        - timestamp: The timestamp of the log (ISO format if possible)
        - level: The log level (e.g., info, warning, error)
        - source: The source of the log (use "${source}" if not specified)
        - message: The main message of the log
        - fields: An object with all parsed fields from the log
        
        Only include fields that can be extracted from the data. Use null for missing fields.
        Your response must be ONLY a valid JSON object.
        `;
        
        expectedFormat = `{
          "timestamp": "2023-04-01T12:00:00Z",
          "level": "info",
          "source": "${source}",
          "message": "Log message",
          "fields": {}
        }`;
      }
      
      // Añadir formato esperado
      prompt += `\n\nExample format:\n${expectedFormat}`;
      
      // Elegir cliente de IA
      let jsonResponse: any;
      
      if (this.openai && (this.config.defaultModel === AIModelType.OPENAI || this.config.defaultModel === AIModelType.AUTO)) {
        // Usar OpenAI
        const response = await this.openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o"
          messages: [
            {
              role: "system",
              content: "You are a data parser specialized in security events and logs. Your job is to extract structured information from various data formats."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1, // Bajo para mayor precisión
          max_tokens: 1000
        });
        
        jsonResponse = JSON.parse(response.choices[0].message.content);
      } else if (this.anthropic) {
        // Usar Anthropic
        const response = await this.anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219"
          system: "You are a data parser specialized in security events and logs. Your job is to extract structured information from various data formats. Always output well-formatted JSON objects.",
          max_tokens: 1000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        });
        
        jsonResponse = JSON.parse(response.content[0].text);
      } else {
        result.errors.push('No se pudo utilizar ningún cliente de IA');
        return result;
      }
      
      // Validar resultado
      if (!jsonResponse || typeof jsonResponse !== 'object') {
        result.errors.push('La IA no devolvió un objeto JSON válido');
        return result;
      }
      
      // Procesar según tipo de datos
      if (dataType === DataType.ALERT) {
        // Normalizar campos críticos
        if (!jsonResponse.title) {
          jsonResponse.title = `Alert from ${source}`;
        }
        
        if (!jsonResponse.description) {
          jsonResponse.description = `Parsed alert data from ${source}`;
        }
        
        if (!jsonResponse.severity || !['critical', 'high', 'medium', 'low'].includes(jsonResponse.severity.toLowerCase())) {
          jsonResponse.severity = 'medium';
        }
        
        if (!jsonResponse.timestamp) {
          jsonResponse.timestamp = new Date().toISOString();
        }
        
        // Añadir metadatos del parser
        jsonResponse.metadata = {
          ...jsonResponse.additionalFields || {},
          parser: 'ai',
          format,
          source,
          extractionTime: new Date().toISOString()
        };
        
        // Eliminar campo adicional que ya se incorporó a metadata
        delete jsonResponse.additionalFields;
      } else if (dataType === DataType.THREAT_INTEL) {
        // Normalizar campos críticos
        if (!jsonResponse.title) {
          jsonResponse.title = `Threat intel from ${source}`;
        }
        
        if (!jsonResponse.description) {
          jsonResponse.description = `Parsed threat intelligence from ${source}`;
        }
        
        if (!jsonResponse.type) {
          jsonResponse.type = 'indicator';
        }
        
        if (!jsonResponse.severity || !['critical', 'high', 'medium', 'low'].includes(jsonResponse.severity.toLowerCase())) {
          jsonResponse.severity = 'medium';
        }
        
        if (typeof jsonResponse.confidence !== 'number' || jsonResponse.confidence < 0 || jsonResponse.confidence > 1) {
          jsonResponse.confidence = 0.7;
        }
        
        // Añadir metadatos del parser
        jsonResponse.metadata = {
          ...jsonResponse.additionalFields || {},
          parser: 'ai',
          format,
          source,
          extractionTime: new Date().toISOString()
        };
        
        // Eliminar campo adicional que ya se incorporó a metadata
        delete jsonResponse.additionalFields;
      } else if (dataType === DataType.LOG) {
        // Normalizar campos críticos
        if (!jsonResponse.timestamp) {
          jsonResponse.timestamp = new Date().toISOString();
        }
        
        if (!jsonResponse.level) {
          jsonResponse.level = 'info';
        }
        
        if (!jsonResponse.message) {
          jsonResponse.message = `Parsed log from ${source}`;
        }
        
        // Añadir metadatos del parser
        jsonResponse.metadata = {
          parser: 'ai',
          format,
          source,
          extractionTime: new Date().toISOString()
        };
      }
      
      result.success = true;
      result.data = jsonResponse;
      result.confidence = 0.75; // Confianza moderada para resultados de IA
      return result;
      
    } catch (error) {
      result.errors.push(`Error en parseo con IA: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Normaliza una alerta para ajustarse a nuestro esquema
   */
  private normalizeAlert(
    data: any, 
    extractedIocs: { ips: string[]; domains: string[]; hashes: string[]; urls: string[]; emails: string[]; },
    source: string
  ): InsertAlert {
    // Asegurar que tenemos todos los campos necesarios
    const now = new Date();
    
    const alert: InsertAlert = {
      title: data.title || `Alert from ${source}`,
      description: data.description || JSON.stringify(data),
      severity: this.normalizeSeverity(data.severity || 'medium'),
      source: data.source || source,
      status: 'new',
      timestamp: data.timestamp ? new Date(data.timestamp) : now,
      sourceIp: data.sourceIp || extractedIocs.ips[0] || null,
      destinationIp: data.destinationIp || (extractedIocs.ips.length > 1 ? extractedIocs.ips[1] : null),
      metadata: {
        ...data.metadata || {},
        extractedIocs: {
          ips: extractedIocs.ips,
          domains: extractedIocs.domains,
          hashes: extractedIocs.hashes,
          urls: extractedIocs.urls,
          emails: extractedIocs.emails
        }
      }
    };
    
    return alert;
  }
  
  /**
   * Normaliza una inteligencia de amenazas para ajustarse a nuestro esquema
   */
  private normalizeThreatIntel(
    data: any, 
    extractedIocs: { ips: string[]; domains: string[]; hashes: string[]; urls: string[]; emails: string[]; },
    source: string
  ): InsertThreatIntel {
    // Asegurar que tenemos todos los campos necesarios
    const intel: InsertThreatIntel = {
      title: data.title || `Threat intel from ${source}`,
      description: data.description || JSON.stringify(data),
      type: data.type || 'indicator',
      severity: this.normalizeSeverity(data.severity || 'medium'),
      source: data.source || source,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.7,
      iocs: {
        ...data.iocs || {},
        ips: [...(data.iocs?.ips || []), ...extractedIocs.ips],
        domains: [...(data.iocs?.domains || []), ...extractedIocs.domains],
        hashes: [...(data.iocs?.hashes || []), ...extractedIocs.hashes],
        urls: [...(data.iocs?.urls || []), ...extractedIocs.urls],
        emails: [...(data.iocs?.emails || []), ...extractedIocs.emails]
      },
      metadata: {
        ...data.metadata || {},
        tlp: data.tlp || 'WHITE'
      }
    };
    
    return intel;
  }
  
  /**
   * Valida que una alerta tiene todos los campos requeridos
   */
  private validateAlert(alert: InsertAlert): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!alert.title) {
      errors.push('La alerta debe tener un título');
    }
    
    if (!alert.description) {
      errors.push('La alerta debe tener una descripción');
    }
    
    if (!['critical', 'high', 'medium', 'low'].includes(alert.severity)) {
      errors.push('La severidad debe ser critical, high, medium o low');
    }
    
    if (!alert.source) {
      errors.push('La alerta debe tener una fuente');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Valida que una intel tiene todos los campos requeridos
   */
  private validateThreatIntel(intel: InsertThreatIntel): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!intel.title) {
      errors.push('La inteligencia debe tener un título');
    }
    
    if (!intel.description) {
      errors.push('La inteligencia debe tener una descripción');
    }
    
    if (!intel.type) {
      errors.push('La inteligencia debe tener un tipo');
    }
    
    if (!['critical', 'high', 'medium', 'low'].includes(intel.severity)) {
      errors.push('La severidad debe ser critical, high, medium o low');
    }
    
    if (!intel.source) {
      errors.push('La inteligencia debe tener una fuente');
    }
    
    if (typeof intel.confidence !== 'number' || intel.confidence < 0 || intel.confidence > 1) {
      errors.push('La confianza debe ser un número entre 0 y 1');
    }
    
    // Verificar que hay al menos un IoC
    const hasIocs = intel.iocs && (
      (Array.isArray(intel.iocs.ips) && intel.iocs.ips.length > 0) ||
      (Array.isArray(intel.iocs.domains) && intel.iocs.domains.length > 0) ||
      (Array.isArray(intel.iocs.hashes) && intel.iocs.hashes.length > 0) ||
      (Array.isArray(intel.iocs.urls) && intel.iocs.urls.length > 0) ||
      (Array.isArray(intel.iocs.emails) && intel.iocs.emails.length > 0)
    );
    
    if (!hasIocs) {
      errors.push('La inteligencia debe tener al menos un IoC');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Extrae IoCs de un objeto
   */
  private extractIoCs(data: any): {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  } {
    const result = {
      ips: [] as string[],
      domains: [] as string[],
      hashes: [] as string[],
      urls: [] as string[],
      emails: [] as string[]
    };
    
    // Si no hay datos, devolver vacío
    if (!data) return result;
    
    // Convertir el objeto a string para búsqueda de patrones
    let text = '';
    
    if (typeof data === 'string') {
      text = data;
    } else if (typeof data === 'object') {
      // Extraer valores del objeto
      const extractValues = (obj: any): string[] => {
        const values: string[] = [];
        
        if (!obj || typeof obj !== 'object') return values;
        
        for (const key in obj) {
          const value = obj[key];
          
          if (typeof value === 'string') {
            values.push(value);
          } else if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string') {
                values.push(item);
              } else if (typeof item === 'object') {
                values.push(...extractValues(item));
              }
            }
          } else if (typeof value === 'object' && value !== null) {
            values.push(...extractValues(value));
          }
        }
        
        return values;
      };
      
      text = extractValues(data).join(' ');
    }
    
    // Buscar IPs
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const ips = text.match(ipRegex) || [];
    result.ips = [...new Set(ips)]; // Eliminar duplicados
    
    // Buscar dominios
    const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/gi;
    const domains = text.match(domainRegex) || [];
    result.domains = [...new Set(domains)]; // Eliminar duplicados
    
    // Filtrar dominios que son probablemente parte de URLs o emails
    result.domains = result.domains.filter(domain => 
      !domain.includes('@') && 
      !domain.match(/^\d+\.\d+$/) // Evitar que partes de IPs se detecten como dominios
    );
    
    // Buscar hashes (MD5, SHA1, SHA256)
    const md5Regex = /\b[a-f0-9]{32}\b/gi;
    const sha1Regex = /\b[a-f0-9]{40}\b/gi;
    const sha256Regex = /\b[a-f0-9]{64}\b/gi;
    
    const md5s = text.match(md5Regex) || [];
    const sha1s = text.match(sha1Regex) || [];
    const sha256s = text.match(sha256Regex) || [];
    
    result.hashes = [...new Set([...md5s, ...sha1s, ...sha256s])]; // Eliminar duplicados
    
    // Buscar URLs
    const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
    const urls = text.match(urlRegex) || [];
    result.urls = [...new Set(urls)]; // Eliminar duplicados
    
    // Buscar emails
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex) || [];
    result.emails = [...new Set(emails)]; // Eliminar duplicados
    
    return result;
  }
  
  /**
   * Busca un campo en un objeto basado en múltiples posibles nombres
   */
  private findField(data: Record<string, string>, possibleNames: string[]): string | undefined {
    for (const name of possibleNames) {
      if (name in data && data[name]) {
        return data[name];
      }
    }
    
    // Intentar con nombres insensibles a mayúsculas/minúsculas
    const lowerCaseData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      lowerCaseData[key.toLowerCase()] = value;
    }
    
    for (const name of possibleNames) {
      const lowerName = name.toLowerCase();
      if (lowerName in lowerCaseData && lowerCaseData[lowerName]) {
        return lowerCaseData[lowerName];
      }
    }
    
    return undefined;
  }
  
  /**
   * Mapea una severidad CEF a nuestro formato
   */
  private mapCefSeverity(severity: string): string {
    if (!severity) return 'medium';
    
    // Intentar parsear como número
    const numSeverity = parseInt(severity);
    if (!isNaN(numSeverity)) {
      // CEF usa 0-10, donde 10 es lo más grave
      if (numSeverity >= 9) return 'critical';
      if (numSeverity >= 7) return 'high';
      if (numSeverity >= 4) return 'medium';
      return 'low';
    }
    
    // Parsear como string
    const sevLower = severity.toLowerCase();
    
    if (sevLower.includes('critical') || sevLower.includes('fatal') || sevLower.includes('emergency')) {
      return 'critical';
    }
    
    if (sevLower.includes('high') || sevLower.includes('error') || sevLower.includes('alert')) {
      return 'high';
    }
    
    if (sevLower.includes('medium') || sevLower.includes('warn') || sevLower.includes('notification')) {
      return 'medium';
    }
    
    if (sevLower.includes('low') || sevLower.includes('info') || sevLower.includes('debug')) {
      return 'low';
    }
    
    return 'medium';
  }
  
  /**
   * Mapea una severidad LEEF a nuestro formato
   */
  private mapLeefSeverity(severity: string): string {
    if (!severity) return 'medium';
    
    // Intentar parsear como número
    const numSeverity = parseInt(severity);
    if (!isNaN(numSeverity)) {
      // LEEF puede usar distintas escalas, asumir 0-10 para compatibilidad con CEF
      if (numSeverity >= 9) return 'critical';
      if (numSeverity >= 7) return 'high';
      if (numSeverity >= 4) return 'medium';
      return 'low';
    }
    
    // Parsear como string
    const sevLower = severity.toLowerCase();
    
    if (sevLower.includes('critical') || sevLower.includes('fatal') || sevLower.includes('emergency')) {
      return 'critical';
    }
    
    if (sevLower.includes('high') || sevLower.includes('error') || sevLower.includes('alert')) {
      return 'high';
    }
    
    if (sevLower.includes('medium') || sevLower.includes('warn') || sevLower.includes('warning')) {
      return 'medium';
    }
    
    if (sevLower.includes('low') || sevLower.includes('info') || sevLower.includes('debug')) {
      return 'low';
    }
    
    return 'medium';
  }
  
  /**
   * Normaliza un valor de severidad a nuestro formato
   */
  private normalizeSeverity(severity: string): SeverityTypes {
    if (!severity) return 'medium';
    
    const sevLower = severity.toLowerCase();
    
    if (sevLower.includes('critical') || sevLower.includes('10') || 
        sevLower.includes('fatal') || sevLower.includes('emergency')) {
      return 'critical';
    }
    
    if (sevLower.includes('high') || sevLower.includes('error') || 
        sevLower.includes('alert') || sevLower.includes('8') || sevLower.includes('9')) {
      return 'high';
    }
    
    if (sevLower.includes('medium') || sevLower.includes('mod') || 
        sevLower.includes('warn') || sevLower.includes('5') || 
        sevLower.includes('6') || sevLower.includes('7')) {
      return 'medium';
    }
    
    if (sevLower.includes('low') || sevLower.includes('info') || 
        sevLower.includes('debug') || sevLower.includes('1') || 
        sevLower.includes('2') || sevLower.includes('3') || sevLower.includes('4')) {
      return 'low';
    }
    
    return 'medium';
  }
  
  /**
   * Genera una clave de caché para un conjunto de datos
   */
  private generateCacheKey(rawData: RawData, dataType: string, source?: string): string {
    // Crear un hash simple para usar como clave de caché
    const dataStr = typeof rawData === 'object' ? JSON.stringify(rawData) : String(rawData);
    
    // Calculamos un hash string simple
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    
    return `${dataType}_${source || 'unknown'}_${hash}`;
  }
  
  /**
   * Verifica si hay algún cliente de IA configurado
   */
  private hasAIClientConfigured(): boolean {
    return this.openai !== null || this.anthropic !== null;
  }
}

// Exportar una instancia única
export const aiParser = AIParserService.getInstance();