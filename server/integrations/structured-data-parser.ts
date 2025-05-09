/**
 * Parser especializado para datos estructurados y semi-estructurados
 * 
 * Este módulo implementa parsers avanzados para diversos formatos comunes en
 * ciberseguridad, permitiendo una mejor extracción de información relevante
 * y una normalización consistente de datos de distintas fuentes.
 */

import { log } from '../vite';
import { aiParser } from './ai-parser-service';

// Tipos de entrada de datos
export enum DataFormat {
  STIX = 'stix',         // Structured Threat Information eXpression
  TAXII = 'taxii',       // Trusted Automated Exchange of Indicator Information
  CEF = 'cef',           // Common Event Format (ArcSight)
  LEEF = 'leef',         // Log Event Extended Format (QRadar)
  ECS = 'ecs',           // Elastic Common Schema
  WINDOWS_EVENT = 'wef', // Windows Event Format (XML)
  SYSLOG = 'syslog',     // Syslog
  JSON = 'json',         // JSON genérico
  CSV = 'csv',           // CSV
  XML = 'xml',           // XML genérico
  PLAINTEXT = 'text',    // Texto plano
  UNKNOWN = 'unknown'    // Desconocido
}

// Formato de salida normalizado para datos estructurados
export interface ParsedData {
  // Información principal del evento
  title?: string;
  type?: string;
  source?: string;
  severity?: string;
  timestamp?: Date | string;
  
  // Clasificación del evento
  category?: string;
  action?: string;
  outcome?: string;
  
  // Información de red
  source_ip?: string;
  source_port?: number;
  source_geo?: {
    country_name?: string;
    region_name?: string;
    city_name?: string;
    location?: {
      lat?: number;
      lon?: number;
    };
  };
  destination_ip?: string;
  destination_port?: number;
  destination_geo?: {
    country_name?: string;
    region_name?: string;
    city_name?: string;
    location?: {
      lat?: number;
      lon?: number;
    };
  };
  network_protocol?: string;
  network_direction?: string;
  
  // Información de host
  host_name?: string;
  host_ip?: string;
  host_os?: string;
  host_mac?: string;
  
  // Información de usuario
  user_name?: string;
  user_domain?: string;
  user_email?: string;
  user_id?: string;
  
  // Información de proceso
  process_name?: string;
  process_id?: string;
  process_path?: string;
  process_command_line?: string;
  process_hash?: string;
  parent_process_name?: string;
  parent_process_id?: string;
  
  // Información de archivos
  file_name?: string;
  file_path?: string;
  file_hash_md5?: string;
  file_hash_sha1?: string;
  file_hash_sha256?: string;
  file_size?: number;
  file_type?: string;
  
  // Información de URL/dominio
  url?: string;
  domain?: string;
  http_method?: string;
  http_status_code?: number;
  http_user_agent?: string;
  
  // Extracto de IoCs
  iocs?: {
    ips?: string[];
    domains?: string[];
    hashes?: string[];
    urls?: string[];
    emails?: string[];
  };
  
  // Datos adicionales específicos del formato
  raw_data?: string;
  parsed_data?: any;
  format?: DataFormat;
  confidence?: number;
}

/**
 * Parser principal para datos estructurados
 */
export class StructuredDataParser {
  /**
   * Detecta automáticamente el formato de los datos de entrada
   */
  detectFormat(data: string | object): DataFormat {
    if (typeof data === 'object') {
      // Si ya es un objeto, asumimos que es JSON
      return DataFormat.JSON;
    }
    
    const dataStr = String(data).trim();
    
    // Detectar formatos basados en patrones de texto
    
    // STIX 2.x generalmente tiene tipo, id, y spec_version
    if (dataStr.includes('"type"') && dataStr.includes('"id"') && dataStr.includes('"spec_version"')) {
      return DataFormat.STIX;
    }
    
    // CEF tiene un encabezado específico
    if (dataStr.startsWith('CEF:') || dataStr.includes('|CEF:')) {
      return DataFormat.CEF;
    }
    
    // LEEF tiene su propio encabezado
    if (dataStr.startsWith('LEEF:')) {
      return DataFormat.LEEF;
    }
    
    // Eventos de Windows generalmente están en XML con estructura específica
    if ((dataStr.includes('<Event xmlns=') || dataStr.includes('<Event>')) && 
        (dataStr.includes('<System>') || dataStr.includes('<EventData>'))) {
      return DataFormat.WINDOWS_EVENT;
    }
    
    // Syslog tiene patrones específicos
    if (dataStr.match(/^<\d+>/) || 
        dataStr.match(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/)) {
      return DataFormat.SYSLOG;
    }
    
    // Elastic Common Schema (es JSON con campos específicos)
    if (dataStr.includes('"@timestamp"') && 
        (dataStr.includes('"ecs.version"') || dataStr.includes('"event.kind"'))) {
      return DataFormat.ECS;
    }
    
    // Formatos genéricos
    
    // JSON genérico
    if ((dataStr.startsWith('{') && dataStr.endsWith('}')) || 
        (dataStr.startsWith('[') && dataStr.endsWith(']'))) {
      try {
        JSON.parse(dataStr);
        return DataFormat.JSON;
      } catch {
        // Si no se puede parsear, no es JSON
      }
    }
    
    // XML genérico
    if ((dataStr.startsWith('<?xml') || dataStr.startsWith('<')) && 
        (dataStr.includes('</') || dataStr.includes('/>'))) {
      return DataFormat.XML;
    }
    
    // CSV - comprobamos si tiene multiples campos separados por comas
    const csvLines = dataStr.split('\n');
    if (csvLines.length > 1 && 
        csvLines[0].split(',').length > 2 && 
        csvLines[1].split(',').length === csvLines[0].split(',').length) {
      return DataFormat.CSV;
    }
    
    // Si no podemos identificar el formato, es texto plano
    return DataFormat.PLAINTEXT;
  }
  
  /**
   * Parsea datos en un formato detectado automáticamente
   */
  async parse(data: string | object, options: {
    format?: DataFormat;
    useAI?: boolean;
  } = {}): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      // Detectar formato si no se especifica
      const format = options.format || this.detectFormat(data);
      
      log(`Parseando datos en formato ${format}`, 'structured-parser');
      
      // Resultado por defecto
      const result = {
        success: false,
        format,
        errors: [] as string[]
      };
      
      // Intentar parsear según el formato
      switch (format) {
        case DataFormat.STIX:
          return await this.parseStix(data);
        
        case DataFormat.CEF:
          return await this.parseCef(data);
        
        case DataFormat.LEEF:
          return await this.parseLeef(data);
        
        case DataFormat.WINDOWS_EVENT:
          return await this.parseWindowsEvent(data);
        
        case DataFormat.SYSLOG:
          return await this.parseSyslog(data);
        
        case DataFormat.ECS:
          return await this.parseEcs(data);
        
        case DataFormat.JSON:
          return await this.parseJson(data);
        
        case DataFormat.XML:
          return await this.parseXml(data);
        
        case DataFormat.CSV:
          return await this.parseCsv(data);
        
        default:
          // Si llegamos aquí y useAI está activado, intentamos con IA
          if (options.useAI) {
            return await this.parseWithAI(data, format);
          }
          
          result.errors.push(`Formato no soportado: ${format}`);
          return result;
      }
    } catch (error) {
      return {
        success: false,
        format: DataFormat.UNKNOWN,
        errors: [`Error al parsear datos: ${error.message}`]
      };
    }
  }
  
  /**
   * Parsea datos en formato STIX
   */
  private async parseStix(data: string | object): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      // Convertir a objeto si es string
      const stixObj = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Verificar si es un objeto STIX válido
      if (!stixObj.type || !stixObj.id || !stixObj.spec_version) {
        // Podría ser un bundle STIX
        if (stixObj.type === 'bundle' && Array.isArray(stixObj.objects) && stixObj.objects.length > 0) {
          // Tomar el primer objeto del bundle
          return this.parseStix(stixObj.objects[0]);
        }
        
        return {
          success: false,
          format: DataFormat.STIX,
          errors: ['No es un objeto STIX válido']
        };
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: stixObj.name || `STIX ${stixObj.type}`,
        type: stixObj.type,
        source: this.extractStixSource(stixObj),
        severity: this.extractStixSeverity(stixObj),
        timestamp: stixObj.created || stixObj.modified || new Date().toISOString(),
        format: DataFormat.STIX,
        confidence: 0.9,
        raw_data: typeof data === 'string' ? data : JSON.stringify(stixObj),
        parsed_data: stixObj
      };
      
      // Extraer IoCs según el tipo de objeto STIX
      parsedData.iocs = {};
      
      if (stixObj.type === 'indicator' && stixObj.pattern) {
        parsedData.iocs = this.extractIocsFromStixPattern(stixObj.pattern);
      } else if (stixObj.type === 'malware' || stixObj.type === 'tool') {
        // Extraer IoCs de las propiedades específicas
        if (stixObj.x_observable_properties) {
          parsedData.iocs = this.extractIocsFromStixObservable(stixObj.x_observable_properties);
        }
      }
      
      // Extraer IPs si están disponibles
      if (parsedData.iocs?.ips && parsedData.iocs.ips.length > 0) {
        parsedData.source_ip = parsedData.iocs.ips[0];
        if (parsedData.iocs.ips.length > 1) {
          parsedData.destination_ip = parsedData.iocs.ips[1];
        }
      }
      
      // Extraer dominios/URLs
      if (parsedData.iocs?.domains && parsedData.iocs.domains.length > 0) {
        parsedData.domain = parsedData.iocs.domains[0];
      }
      
      if (parsedData.iocs?.urls && parsedData.iocs.urls.length > 0) {
        parsedData.url = parsedData.iocs.urls[0];
      }
      
      // Extraer hashes de archivos
      if (parsedData.iocs?.hashes && parsedData.iocs.hashes.length > 0) {
        // Intentar distinguir tipos de hash por longitud
        for (const hash of parsedData.iocs.hashes) {
          if (hash.length === 32) {
            parsedData.file_hash_md5 = hash;
          } else if (hash.length === 40) {
            parsedData.file_hash_sha1 = hash;
          } else if (hash.length === 64) {
            parsedData.file_hash_sha256 = hash;
          }
        }
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.STIX
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.STIX,
        errors: [`Error al parsear STIX: ${error.message}`]
      };
    }
  }
  
  /**
   * Extrae la fuente de un objeto STIX
   */
  private extractStixSource(stixObj: any): string {
    // Intentar obtener la fuente de referencias externas
    if (stixObj.external_references && stixObj.external_references.length > 0) {
      return stixObj.external_references[0].source_name;
    }
    
    // Extraer del ID (generalmente contiene un identificador del creador)
    if (stixObj.id && stixObj.id.includes('--')) {
      const parts = stixObj.id.split('--')[0];
      return parts;
    }
    
    // Valor predeterminado
    return 'STIX Source';
  }
  
  /**
   * Extrae la severidad de un objeto STIX
   */
  private extractStixSeverity(stixObj: any): string {
    // Verificar etiquetas para indicaciones de severidad
    if (stixObj.labels && Array.isArray(stixObj.labels)) {
      if (stixObj.labels.some((label: string) => 
          label.toLowerCase().includes('critical') || 
          label.toLowerCase().includes('severe'))) {
        return 'critical';
      }
      
      if (stixObj.labels.some((label: string) => 
          label.toLowerCase().includes('high'))) {
        return 'high';
      }
      
      if (stixObj.labels.some((label: string) => 
          label.toLowerCase().includes('medium') || 
          label.toLowerCase().includes('moderate'))) {
        return 'medium';
      }
      
      if (stixObj.labels.some((label: string) => 
          label.toLowerCase().includes('low'))) {
        return 'low';
      }
    }
    
    // Extraer de nivel de confianza si existe
    if (typeof stixObj.confidence === 'number') {
      if (stixObj.confidence >= 85) return 'high';
      if (stixObj.confidence >= 60) return 'medium';
      return 'low';
    }
    
    // Valor predeterminado
    return 'medium';
  }
  
  /**
   * Extrae IoCs de un patrón STIX
   */
  private extractIocsFromStixPattern(pattern: string): {
    ips?: string[];
    domains?: string[];
    hashes?: string[];
    urls?: string[];
    emails?: string[];
  } {
    const iocs: {
      ips?: string[];
      domains?: string[];
      hashes?: string[];
      urls?: string[];
      emails?: string[];
    } = {
      ips: [],
      domains: [],
      hashes: [],
      urls: [],
      emails: []
    };
    
    // Extraer IPs
    const ipv4Regex = /ipv4-addr:value\s*=\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = ipv4Regex.exec(pattern)) !== null) {
      iocs.ips!.push(match[1]);
    }
    
    // Extraer dominios
    const domainRegex = /domain-name:value\s*=\s*['"]([^'"]+)['"]/g;
    while ((match = domainRegex.exec(pattern)) !== null) {
      iocs.domains!.push(match[1]);
    }
    
    // Extraer URLs
    const urlRegex = /url:value\s*=\s*['"]([^'"]+)['"]/g;
    while ((match = urlRegex.exec(pattern)) !== null) {
      iocs.urls!.push(match[1]);
    }
    
    // Extraer emails
    const emailRegex = /email-addr:value\s*=\s*['"]([^'"]+)['"]/g;
    while ((match = emailRegex.exec(pattern)) !== null) {
      iocs.emails!.push(match[1]);
    }
    
    // Extraer hashes
    const hashRegex = /file:hashes\.[^=]+=\s*['"]([^'"]+)['"]/g;
    while ((match = hashRegex.exec(pattern)) !== null) {
      iocs.hashes!.push(match[1]);
    }
    
    return iocs;
  }
  
  /**
   * Extrae IoCs de propiedades observables STIX
   */
  private extractIocsFromStixObservable(observable: any): {
    ips?: string[];
    domains?: string[];
    hashes?: string[];
    urls?: string[];
    emails?: string[];
  } {
    const iocs: {
      ips?: string[];
      domains?: string[];
      hashes?: string[];
      urls?: string[];
      emails?: string[];
    } = {
      ips: [],
      domains: [],
      hashes: [],
      urls: [],
      emails: []
    };
    
    // Extraer IPs
    if (observable.ipv4_addrs && Array.isArray(observable.ipv4_addrs)) {
      iocs.ips = observable.ipv4_addrs;
    }
    
    // Extraer dominios
    if (observable.domain_names && Array.isArray(observable.domain_names)) {
      iocs.domains = observable.domain_names;
    }
    
    // Extraer URLs
    if (observable.urls && Array.isArray(observable.urls)) {
      iocs.urls = observable.urls;
    }
    
    // Extraer hashes
    if (observable.hashes) {
      iocs.hashes = [];
      
      if (observable.hashes.MD5) {
        iocs.hashes.push(observable.hashes.MD5);
      }
      
      if (observable.hashes['SHA-1']) {
        iocs.hashes.push(observable.hashes['SHA-1']);
      }
      
      if (observable.hashes['SHA-256']) {
        iocs.hashes.push(observable.hashes['SHA-256']);
      }
    }
    
    // Extraer emails
    if (observable.email_addrs && Array.isArray(observable.email_addrs)) {
      iocs.emails = observable.email_addrs;
    }
    
    return iocs;
  }
  
  /**
   * Parsea datos en formato CEF (Common Event Format)
   */
  private async parseCef(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      if (!data.includes('CEF:')) {
        return {
          success: false,
          format: DataFormat.CEF,
          errors: ['No es un evento CEF válido']
        };
      }
      
      // Dividir el encabezado y las extensiones
      const cefParts = data.split('CEF:')[1];
      const [cefHeader, ...extensionsParts] = cefParts.split('|', 7);
      
      // Recrear el header completo y unir las partes correctamente
      const header = 'CEF:' + cefHeader;
      const headerParts = header.split('|');
      
      // Las extensiones son todo lo que viene después del séptimo pipe
      const extensionsString = extensionsParts.length === 6 
        ? data.split(extensionsParts[5] + '|')[1] || ''
        : '';
      
      // Verificar que tenemos suficientes partes
      if (headerParts.length < 7) {
        return {
          success: false,
          format: DataFormat.CEF,
          errors: ['Formato CEF inválido: faltan campos en el encabezado']
        };
      }
      
      // Extraer campos del encabezado
      const [_, version, deviceVendor, deviceProduct, deviceVersion, signatureId, name, severity] = headerParts;
      
      // Parsear extensiones (formato de pares clave=valor)
      const extensions: Record<string, string> = {};
      
      // Función auxiliar para manejar la división en pares clave=valor
      const parseExtensions = (extText: string) => {
        let currentKey = '';
        let currentValue = '';
        let inQuote = false;
        
        for (let i = 0; i < extText.length; i++) {
          const char = extText[i];
          
          if (char === '=' && !inQuote && currentKey === '') {
            // Fin de una clave
            currentKey = currentValue.trim();
            currentValue = '';
          } else if (char === ' ' && !inQuote && currentKey !== '') {
            // Fin de un valor
            extensions[currentKey] = currentValue.trim();
            currentKey = '';
            currentValue = '';
          } else if (char === '"') {
            // Alternar estado de comillas
            inQuote = !inQuote;
          } else {
            currentValue += char;
          }
        }
        
        // Añadir el último par si existe
        if (currentKey !== '') {
          extensions[currentKey] = currentValue.trim();
        }
      };
      
      // Parsear las extensiones
      parseExtensions(extensionsString);
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: name || `${deviceVendor} ${deviceProduct} Event`,
        type: signatureId || 'unknown',
        source: `${deviceVendor} ${deviceProduct}`,
        severity: this.mapCefSeverity(severity),
        format: DataFormat.CEF,
        confidence: 0.9,
        raw_data: data,
        parsed_data: {
          header: {
            version,
            deviceVendor,
            deviceProduct,
            deviceVersion,
            signatureId,
            name,
            severity
          },
          extensions
        }
      };
      
      // Mapear campos CEF comunes a nuestro formato
      if (extensions.rt) {
        // rt es el timestamp en milisegundos desde epoch
        parsedData.timestamp = new Date(parseInt(extensions.rt));
      } else if (extensions.end) {
        parsedData.timestamp = new Date(parseInt(extensions.end));
      } else if (extensions.start) {
        parsedData.timestamp = new Date(parseInt(extensions.start));
      }
      
      // Extraer IPs
      parsedData.source_ip = extensions.src || extensions.sourceAddress;
      parsedData.destination_ip = extensions.dst || extensions.destinationAddress;
      
      // Extraer puertos
      if (extensions.spt || extensions.sourcePort) {
        parsedData.source_port = parseInt(extensions.spt || extensions.sourcePort);
      }
      
      if (extensions.dpt || extensions.destinationPort) {
        parsedData.destination_port = parseInt(extensions.dpt || extensions.destinationPort);
      }
      
      // Extraer información de host
      parsedData.host_name = extensions.dvc || extensions.deviceHostName;
      
      // Extraer información de usuario
      parsedData.user_name = extensions.suser || extensions.sourceUserName;
      
      // Extraer información de proceso
      parsedData.process_name = extensions.sproc || extensions.sourceProcessName;
      parsedData.process_id = extensions.spid || extensions.sourceProcessId;
      
      // Extraer información de archivo
      parsedData.file_name = extensions.fname || extensions.fileName;
      parsedData.file_path = extensions.filePath;
      
      // Extraer información de red
      parsedData.network_protocol = extensions.proto || extensions.transportProtocol;
      
      // Extraer información adicional
      parsedData.action = extensions.act || extensions.deviceAction;
      parsedData.outcome = extensions.outcome;
      
      // Extraer IoCs
      parsedData.iocs = {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      };
      
      // Añadir IPs si existen
      if (parsedData.source_ip) {
        parsedData.iocs.ips!.push(parsedData.source_ip);
      }
      
      if (parsedData.destination_ip) {
        parsedData.iocs.ips!.push(parsedData.destination_ip);
      }
      
      // Añadir dominios
      if (extensions.sourceDnsDomain) {
        parsedData.iocs.domains!.push(extensions.sourceDnsDomain);
      }
      
      if (extensions.destinationDnsDomain) {
        parsedData.iocs.domains!.push(extensions.destinationDnsDomain);
      }
      
      // Extraer URLs
      if (extensions.request) {
        parsedData.url = extensions.request;
        parsedData.iocs.urls!.push(extensions.request);
      }
      
      // Extraer hashes
      if (extensions.fileHash) {
        parsedData.iocs.hashes!.push(extensions.fileHash);
        
        // Intentar identificar tipo de hash por longitud
        if (extensions.fileHash.length === 32) {
          parsedData.file_hash_md5 = extensions.fileHash;
        } else if (extensions.fileHash.length === 40) {
          parsedData.file_hash_sha1 = extensions.fileHash;
        } else if (extensions.fileHash.length === 64) {
          parsedData.file_hash_sha256 = extensions.fileHash;
        }
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.CEF
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.CEF,
        errors: [`Error al parsear CEF: ${error.message}`]
      };
    }
  }
  
  /**
   * Mapea valores de severidad CEF a nuestro formato estándar
   */
  private mapCefSeverity(severity: string): string {
    if (!severity) return 'medium';
    
    // Severidad CEF es un valor del 0 al 10
    const numSeverity = parseInt(severity);
    if (!isNaN(numSeverity)) {
      if (numSeverity >= 9) return 'critical';
      if (numSeverity >= 7) return 'high';
      if (numSeverity >= 4) return 'medium';
      return 'low';
    }
    
    // También podría ser un string
    const sevLower = severity.toLowerCase();
    if (sevLower.includes('critical')) return 'critical';
    if (sevLower.includes('high')) return 'high';
    if (sevLower.includes('medium')) return 'medium';
    if (sevLower.includes('low')) return 'low';
    
    return 'medium';
  }
  
  /**
   * Parsea datos en formato LEEF (Log Event Extended Format)
   */
  private async parseLeef(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      if (!data.includes('LEEF:')) {
        return {
          success: false,
          format: DataFormat.LEEF,
          errors: ['No es un evento LEEF válido']
        };
      }
      
      // Dividir el encabezado y los atributos
      const parts = data.split('LEEF:')[1].split('|');
      
      if (parts.length < 5) {
        return {
          success: false,
          format: DataFormat.LEEF,
          errors: ['Formato LEEF inválido: faltan campos en el encabezado']
        };
      }
      
      // Extraer campos del encabezado
      const [version, vendor, product, productVersion, eventId, ...rest] = parts;
      
      // El último elemento contiene los atributos (pueden estar separados por tabs o espacios)
      const attributes: Record<string, string> = {};
      const attributesPart = rest.join('|');
      
      // Extraer atributos separados por tabulador
      const attrPairs = attributesPart.split(/\t|\s{2,}/);
      
      for (const pair of attrPairs) {
        const equalPos = pair.indexOf('=');
        if (equalPos > 0) {
          const key = pair.substring(0, equalPos).trim();
          const value = pair.substring(equalPos + 1).trim();
          if (key) {
            attributes[key] = value;
          }
        }
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: attributes.devname || attributes.name || `${vendor} ${product} Event`,
        type: eventId || 'unknown',
        source: `${vendor} ${product}`,
        severity: this.mapLeefSeverity(attributes.severity || attributes.sev),
        format: DataFormat.LEEF,
        confidence: 0.9,
        raw_data: data,
        parsed_data: {
          header: {
            version,
            vendor,
            product,
            productVersion,
            eventId
          },
          attributes
        }
      };
      
      // Mapear campos LEEF comunes a nuestro formato
      if (attributes.devTime) {
        try {
          parsedData.timestamp = new Date(attributes.devTime);
        } catch (e) {
          // Si falla, intentar otros formatos comunes
          if (attributes.devTime.match(/^\d+$/)) {
            // Es un timestamp numérico
            parsedData.timestamp = new Date(parseInt(attributes.devTime));
          }
        }
      }
      
      // Extraer IPs
      parsedData.source_ip = attributes.src || attributes.srcip || attributes.sourceip;
      parsedData.destination_ip = attributes.dst || attributes.dstip || attributes.destinationip;
      
      // Extraer puertos
      if (attributes.srcport) {
        parsedData.source_port = parseInt(attributes.srcport);
      }
      
      if (attributes.dstport) {
        parsedData.destination_port = parseInt(attributes.dstport);
      }
      
      // Extraer información de host
      parsedData.host_name = attributes.hostname || attributes.identHostName;
      
      // Extraer información de usuario
      parsedData.user_name = attributes.usrName || attributes.username;
      
      // Extraer información de proceso
      parsedData.process_name = attributes.process || attributes.procname;
      parsedData.process_id = attributes.pid;
      
      // Extraer información de archivo
      parsedData.file_name = attributes.fileName;
      parsedData.file_path = attributes.filePath;
      
      // Extraer información de red
      parsedData.network_protocol = attributes.proto || attributes.protocol;
      
      // Extraer acción y resultado
      parsedData.action = attributes.action;
      parsedData.outcome = attributes.outcome || attributes.result;
      
      // Extraer IoCs
      parsedData.iocs = {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      };
      
      // Añadir IPs si existen
      if (parsedData.source_ip) {
        parsedData.iocs.ips!.push(parsedData.source_ip);
      }
      
      if (parsedData.destination_ip) {
        parsedData.iocs.ips!.push(parsedData.destination_ip);
      }
      
      // Extraer dominios
      if (attributes.domain) {
        parsedData.domain = attributes.domain;
        parsedData.iocs.domains!.push(attributes.domain);
      }
      
      // Extraer URLs
      if (attributes.url) {
        parsedData.url = attributes.url;
        parsedData.iocs.urls!.push(attributes.url);
      }
      
      // Extraer hashes
      if (attributes.md5) {
        parsedData.file_hash_md5 = attributes.md5;
        parsedData.iocs.hashes!.push(attributes.md5);
      }
      
      if (attributes.sha1) {
        parsedData.file_hash_sha1 = attributes.sha1;
        parsedData.iocs.hashes!.push(attributes.sha1);
      }
      
      if (attributes.sha256) {
        parsedData.file_hash_sha256 = attributes.sha256;
        parsedData.iocs.hashes!.push(attributes.sha256);
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.LEEF
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.LEEF,
        errors: [`Error al parsear LEEF: ${error.message}`]
      };
    }
  }
  
  /**
   * Mapea valores de severidad LEEF a nuestro formato estándar
   */
  private mapLeefSeverity(severity?: string): string {
    if (!severity) return 'medium';
    
    // Severidad LEEF normalmente es un valor del 1 al 10
    const numSeverity = parseInt(severity);
    if (!isNaN(numSeverity)) {
      if (numSeverity >= 9) return 'critical';
      if (numSeverity >= 7) return 'high';
      if (numSeverity >= 4) return 'medium';
      return 'low';
    }
    
    // También podría ser un string
    const sevLower = severity.toLowerCase();
    if (sevLower.includes('critical')) return 'critical';
    if (sevLower.includes('high')) return 'high';
    if (sevLower.includes('medium')) return 'medium';
    if (sevLower.includes('low')) return 'low';
    
    return 'medium';
  }
  
  /**
   * Parsea eventos de Windows (XML)
   */
  private async parseWindowsEvent(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    // Para un parser XML completo, se necesitaría una biblioteca
    // Esta es una implementación simplificada usando regex
    try {
      // Verificar que parece un evento de Windows
      if (!data.includes('<Event') || (!data.includes('<System>') && !data.includes('<EventData>'))) {
        return {
          success: false,
          format: DataFormat.WINDOWS_EVENT,
          errors: ['No es un evento de Windows válido']
        };
      }
      
      // Extraer el ID del evento
      const eventIdMatch = data.match(/<EventID[^>]*>(\d+)<\/EventID>/);
      const eventId = eventIdMatch ? eventIdMatch[1] : 'unknown';
      
      // Extraer origen del evento
      const providerMatch = data.match(/<Provider[^>]*Name="([^"]+)"/);
      const provider = providerMatch ? providerMatch[1] : 'Windows';
      
      // Extraer timestamp
      const timeMatch = data.match(/<TimeCreated[^>]*SystemTime="([^"]+)"/);
      const timestamp = timeMatch ? new Date(timeMatch[1]) : new Date();
      
      // Extraer nivel (severidad)
      const levelMatch = data.match(/<Level>(\d+)<\/Level>/);
      const level = levelMatch ? parseInt(levelMatch[1]) : 4; // 4 es Information
      
      // Mapear nivel a severidad
      let severity = 'medium';
      if (level === 1) severity = 'critical';      // Error crítico
      else if (level === 2) severity = 'high';     // Error
      else if (level === 3) severity = 'high';     // Advertencia
      else if (level === 4) severity = 'medium';   // Información
      else if (level === 5) severity = 'low';      // Detalle
      
      // Extraer datos de usuario si existen
      const userIdMatch = data.match(/<Security[^>]*UserID="([^"]+)"/);
      const userId = userIdMatch ? userIdMatch[1] : undefined;
      
      // Extraer datos del evento
      const eventData: Record<string, string> = {};
      
      // Buscar todas las entradas de datos
      const dataMatches = data.matchAll(/<Data Name="([^"]+)">([^<]+)<\/Data>/g);
      for (const match of dataMatches) {
        eventData[match[1]] = match[2];
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: `Windows Event ${eventId} from ${provider}`,
        type: `windows_event_${eventId}`,
        source: provider,
        severity,
        timestamp,
        format: DataFormat.WINDOWS_EVENT,
        confidence: 0.85,
        raw_data: data,
        parsed_data: {
          eventId,
          provider,
          level,
          eventData
        }
      };
      
      // Extraer información de proceso si existe
      if (eventData.ProcessName) {
        parsedData.process_name = eventData.ProcessName;
      }
      
      if (eventData.ProcessId) {
        parsedData.process_id = eventData.ProcessId;
      }
      
      // Extraer información de usuario
      if (eventData.SubjectUserName) {
        parsedData.user_name = eventData.SubjectUserName;
      }
      
      if (eventData.SubjectDomainName) {
        parsedData.user_domain = eventData.SubjectDomainName;
      }
      
      if (userId) {
        parsedData.user_id = userId;
      }
      
      // Extraer información de host
      if (eventData.Computer) {
        parsedData.host_name = eventData.Computer;
      }
      
      // Extraer información de archivo
      if (eventData.TargetFilename) {
        parsedData.file_name = eventData.TargetFilename.split('\\').pop();
        parsedData.file_path = eventData.TargetFilename;
      }
      
      // Extraer línea de comando
      if (eventData.CommandLine) {
        parsedData.process_command_line = eventData.CommandLine;
      }
      
      // Extraer hashes si existen
      if (eventData.Hashes) {
        const hashes = eventData.Hashes.split(',');
        
        for (const hash of hashes) {
          if (hash.includes('MD5=')) {
            const md5 = hash.split('=')[1];
            parsedData.file_hash_md5 = md5;
            if (!parsedData.iocs) parsedData.iocs = {};
            if (!parsedData.iocs.hashes) parsedData.iocs.hashes = [];
            parsedData.iocs.hashes.push(md5);
          } else if (hash.includes('SHA1=')) {
            const sha1 = hash.split('=')[1];
            parsedData.file_hash_sha1 = sha1;
            if (!parsedData.iocs) parsedData.iocs = {};
            if (!parsedData.iocs.hashes) parsedData.iocs.hashes = [];
            parsedData.iocs.hashes.push(sha1);
          } else if (hash.includes('SHA256=')) {
            const sha256 = hash.split('=')[1];
            parsedData.file_hash_sha256 = sha256;
            if (!parsedData.iocs) parsedData.iocs = {};
            if (!parsedData.iocs.hashes) parsedData.iocs.hashes = [];
            parsedData.iocs.hashes.push(sha256);
          }
        }
      }
      
      // Extraer IPs
      if (eventData.SourceAddress) {
        parsedData.source_ip = eventData.SourceAddress;
        if (!parsedData.iocs) parsedData.iocs = {};
        if (!parsedData.iocs.ips) parsedData.iocs.ips = [];
        parsedData.iocs.ips.push(eventData.SourceAddress);
      }
      
      if (eventData.DestAddress) {
        parsedData.destination_ip = eventData.DestAddress;
        if (!parsedData.iocs) parsedData.iocs = {};
        if (!parsedData.iocs.ips) parsedData.iocs.ips = [];
        parsedData.iocs.ips.push(eventData.DestAddress);
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.WINDOWS_EVENT
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.WINDOWS_EVENT,
        errors: [`Error al parsear evento de Windows: ${error.message}`]
      };
    }
  }
  
  /**
   * Parsea datos Syslog
   */
  private async parseSyslog(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      // Versiones comunes de Syslog:
      // - RFC3164 (legacy): <PRI>Mmm dd hh:mm:ss HOSTNAME TAG: CONTENT
      // - RFC5424 (newer): <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
      
      // Verificar si hay un PRI
      let pri = 0;
      let content = data;
      let priMatch = data.match(/^<(\d+)>/);
      
      if (priMatch) {
        pri = parseInt(priMatch[1]);
        content = data.substring(priMatch[0].length);
      }
      
      // Calcular facility y severity a partir del PRI
      const facility = Math.floor(pri / 8);
      const sevCode = pri % 8;
      
      // Mapear severity de Syslog a nuestro formato
      const severityMap = ["critical", "critical", "critical", "high", "high", "medium", "medium", "low"];
      const severity = severityMap[sevCode] || "medium";
      
      // Intentar identificar formato RFC5424 vs RFC3164
      let isRfc5424 = content.startsWith('1 ');
      let timestamp = new Date();
      let hostname = '';
      let appName = '';
      let message = '';
      
      if (isRfc5424) {
        // RFC5424: VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
        const parts = content.substring(2).split(' ');
        
        if (parts.length >= 6) {
          try {
            timestamp = new Date(parts[0]);
            hostname = parts[1];
            appName = parts[2];
            
            // Extract message after STRUCTURED-DATA which is marked by ' - '
            const msgIdx = content.indexOf(' - ');
            if (msgIdx > 0) {
              message = content.substring(msgIdx + 3);
            } else {
              // Fallback
              message = parts.slice(6).join(' ');
            }
          } catch (e) {
            // Si falla, usar defaults
            message = content;
          }
        } else {
          message = content;
        }
      } else {
        // RFC3164: Mmm dd hh:mm:ss HOSTNAME TAG: CONTENT
        const timestampMatch = content.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
        
        if (timestampMatch) {
          try {
            // RFC3164 no incluye el año, así que usamos el actual
            const currentYear = new Date().getFullYear();
            timestamp = new Date(`${timestampMatch[1]} ${currentYear}`);
            
            const afterTimestamp = content.substring(timestampMatch[0].length).trim();
            const hostAndRest = afterTimestamp.split(' ', 2);
            
            if (hostAndRest.length >= 2) {
              hostname = hostAndRest[0];
              const restOfMessage = afterTimestamp.substring(hostname.length).trim();
              
              // El TAG a menudo termina con un colon
              const tagMatch = restOfMessage.match(/^([^:]+):/);
              if (tagMatch) {
                appName = tagMatch[1];
                message = restOfMessage.substring(tagMatch[0].length).trim();
              } else {
                message = restOfMessage;
              }
            } else {
              message = afterTimestamp;
            }
          } catch (e) {
            // Si falla, usar defaults
            message = content;
          }
        } else {
          message = content;
        }
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: `${appName || "Syslog"} event from ${hostname || "unknown host"}`,
        type: "syslog",
        source: appName || hostname || "syslog",
        severity,
        timestamp,
        format: DataFormat.SYSLOG,
        confidence: 0.8,
        raw_data: data,
        parsed_data: {
          facility,
          severity: sevCode,
          pri,
          hostname,
          appName,
          message
        }
      };
      
      // Extraer información de host
      parsedData.host_name = hostname;
      
      // Extraer posibles IoCs del mensaje
      const iocs = this.extractIoCsFromText(message);
      if (Object.values(iocs).some(arr => arr.length > 0)) {
        parsedData.iocs = iocs;
      }
      
      // Si hay IPs, asignarlas a source/destination
      if (iocs.ips && iocs.ips.length > 0) {
        parsedData.source_ip = iocs.ips[0];
        if (iocs.ips.length > 1) {
          parsedData.destination_ip = iocs.ips[1];
        }
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.SYSLOG
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.SYSLOG,
        errors: [`Error al parsear Syslog: ${error.message}`]
      };
    }
  }
  
  /**
   * Parsea datos en formato Elastic Common Schema (ECS)
   */
  private async parseEcs(data: string | object): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      // Convertir a objeto si es string
      const ecsData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Verificar si parece un documento ECS
      if (!ecsData['@timestamp'] && !ecsData.event) {
        return {
          success: false,
          format: DataFormat.ECS,
          errors: ['No parece ser un documento ECS válido']
        };
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: ecsData.message || 'ECS Event',
        type: ecsData.event?.kind || ecsData.event?.category || 'unknown',
        source: ecsData.event?.provider || ecsData.agent?.name || ecsData.observer?.name || 'ECS Source',
        severity: this.mapEcsSeverity(ecsData.event?.severity),
        timestamp: ecsData['@timestamp'] ? new Date(ecsData['@timestamp']) : new Date(),
        format: DataFormat.ECS,
        confidence: 0.95,
        raw_data: typeof data === 'string' ? data : JSON.stringify(ecsData),
        parsed_data: ecsData
      };
      
      // Mapear campos ECS comunes a nuestro formato
      
      // Extraer información de red
      if (ecsData.source) {
        parsedData.source_ip = ecsData.source.ip;
        if (ecsData.source.port) {
          parsedData.source_port = ecsData.source.port;
        }
        
        if (ecsData.source.geo) {
          parsedData.source_geo = {
            country_name: ecsData.source.geo.country_name,
            region_name: ecsData.source.geo.region_name,
            city_name: ecsData.source.geo.city_name,
            location: ecsData.source.geo.location
          };
        }
      }
      
      if (ecsData.destination) {
        parsedData.destination_ip = ecsData.destination.ip;
        if (ecsData.destination.port) {
          parsedData.destination_port = ecsData.destination.port;
        }
        
        if (ecsData.destination.geo) {
          parsedData.destination_geo = {
            country_name: ecsData.destination.geo.country_name,
            region_name: ecsData.destination.geo.region_name,
            city_name: ecsData.destination.geo.city_name,
            location: ecsData.destination.geo.location
          };
        }
      }
      
      if (ecsData.network) {
        parsedData.network_protocol = ecsData.network.protocol;
        parsedData.network_direction = ecsData.network.direction;
      }
      
      // Extraer información de host
      if (ecsData.host) {
        parsedData.host_name = ecsData.host.name;
        parsedData.host_ip = ecsData.host.ip ? 
          (Array.isArray(ecsData.host.ip) ? ecsData.host.ip[0] : ecsData.host.ip) : 
          undefined;
        parsedData.host_os = ecsData.host.os?.name;
        parsedData.host_mac = ecsData.host.mac ? 
          (Array.isArray(ecsData.host.mac) ? ecsData.host.mac[0] : ecsData.host.mac) : 
          undefined;
      }
      
      // Extraer información de usuario
      if (ecsData.user) {
        parsedData.user_name = ecsData.user.name;
        parsedData.user_id = ecsData.user.id;
        parsedData.user_domain = ecsData.user.domain;
        parsedData.user_email = ecsData.user.email;
      }
      
      // Extraer información de proceso
      if (ecsData.process) {
        parsedData.process_name = ecsData.process.name;
        parsedData.process_id = ecsData.process.pid;
        parsedData.process_path = ecsData.process.executable;
        parsedData.process_command_line = ecsData.process.command_line;
        parsedData.process_hash = ecsData.process.hash?.md5 || 
                                ecsData.process.hash?.sha1 || 
                                ecsData.process.hash?.sha256;
        
        if (ecsData.process.parent) {
          parsedData.parent_process_name = ecsData.process.parent.name;
          parsedData.parent_process_id = ecsData.process.parent.pid;
        }
      }
      
      // Extraer información de archivo
      if (ecsData.file) {
        parsedData.file_name = ecsData.file.name;
        parsedData.file_path = ecsData.file.path;
        parsedData.file_size = ecsData.file.size;
        parsedData.file_type = ecsData.file.type;
        
        if (ecsData.file.hash) {
          parsedData.file_hash_md5 = ecsData.file.hash.md5;
          parsedData.file_hash_sha1 = ecsData.file.hash.sha1;
          parsedData.file_hash_sha256 = ecsData.file.hash.sha256;
        }
      }
      
      // Extraer información HTTP
      if (ecsData.url) {
        parsedData.url = ecsData.url.original || ecsData.url.full;
        parsedData.domain = ecsData.url.domain;
      }
      
      if (ecsData.http) {
        parsedData.http_method = ecsData.http.request?.method;
        parsedData.http_status_code = ecsData.http.response?.status_code;
        parsedData.http_user_agent = ecsData.user_agent?.original;
      }
      
      // Información de acción/resultado
      if (ecsData.event) {
        parsedData.action = ecsData.event.action;
        parsedData.outcome = ecsData.event.outcome;
        parsedData.category = ecsData.event.category;
      }
      
      // Extraer IoCs
      parsedData.iocs = {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      };
      
      // IPs
      if (parsedData.source_ip) {
        parsedData.iocs.ips!.push(parsedData.source_ip);
      }
      
      if (parsedData.destination_ip) {
        parsedData.iocs.ips!.push(parsedData.destination_ip);
      }
      
      if (parsedData.host_ip) {
        parsedData.iocs.ips!.push(parsedData.host_ip);
      }
      
      // Dominios
      if (parsedData.domain) {
        parsedData.iocs.domains!.push(parsedData.domain);
      }
      
      // URLs
      if (parsedData.url) {
        parsedData.iocs.urls!.push(parsedData.url);
      }
      
      // Hashes
      if (parsedData.file_hash_md5) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_md5);
      }
      
      if (parsedData.file_hash_sha1) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_sha1);
      }
      
      if (parsedData.file_hash_sha256) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_sha256);
      }
      
      // Email
      if (parsedData.user_email) {
        parsedData.iocs.emails!.push(parsedData.user_email);
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.ECS
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.ECS,
        errors: [`Error al parsear ECS: ${error.message}`]
      };
    }
  }
  
  /**
   * Mapea severidad ECS a nuestro formato
   */
  private mapEcsSeverity(severity?: number | string): string {
    if (severity === undefined) return 'medium';
    
    // ECS usa valores numéricos o strings
    if (typeof severity === 'number') {
      if (severity > 70) return 'critical';
      if (severity > 50) return 'high';
      if (severity > 30) return 'medium';
      return 'low';
    }
    
    // Strings
    const sev = severity.toLowerCase();
    if (sev.includes('critical')) return 'critical';
    if (sev.includes('high')) return 'high';
    if (sev.includes('medium')) return 'medium';
    if (sev.includes('low')) return 'low';
    
    return 'medium';
  }
  
  /**
   * Parsea JSON genérico
   */
  private async parseJson(data: string | object): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      // Convertir a objeto si es string
      const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Intentar extraer campos comunes usando heurísticas
      const parsedData: ParsedData = {
        title: this.extractField(jsonData, ['message', 'title', 'name', 'alert', 'event', 'subject']) || 'JSON Event',
        type: this.extractField(jsonData, ['type', 'category', 'eventType', 'event_type', 'eventCategory']) || 'json',
        source: this.extractField(jsonData, ['source', 'src', 'from', 'origin', 'vendor', 'device']) || 'JSON Source',
        severity: this.normalizeSeverity(this.extractField(jsonData, ['severity', 'level', 'priority', 'impact', 'criticality'])),
        format: DataFormat.JSON,
        confidence: 0.7, // Confianza menor porque es genérico
        raw_data: typeof data === 'string' ? data : JSON.stringify(jsonData),
        parsed_data: jsonData
      };
      
      // Extraer timestamp
      const timestampValue = this.extractField(jsonData, ['timestamp', 'time', 'date', 'eventTime', '@timestamp', 'created']);
      if (timestampValue) {
        try {
          parsedData.timestamp = new Date(timestampValue);
        } catch (e) {
          // Ignorar errores de parseo de fecha
        }
      }
      
      // Extraer IPs
      parsedData.source_ip = this.extractField(jsonData, ['src_ip', 'source_ip', 'sourceIP', 'srcip', 'sourceAddress', 'src']);
      parsedData.destination_ip = this.extractField(jsonData, ['dst_ip', 'destination_ip', 'destinationIP', 'dstip', 'destinationAddress', 'dst']);
      
      // Extraer puertos
      const srcPort = this.extractField(jsonData, ['src_port', 'source_port', 'sourcePort', 'srcport']);
      if (srcPort) {
        parsedData.source_port = parseInt(srcPort);
      }
      
      const dstPort = this.extractField(jsonData, ['dst_port', 'destination_port', 'destinationPort', 'dstport']);
      if (dstPort) {
        parsedData.destination_port = parseInt(dstPort);
      }
      
      // Extraer información de host
      parsedData.host_name = this.extractField(jsonData, ['host', 'hostname', 'computer', 'device', 'system']);
      
      // Extraer información de usuario
      parsedData.user_name = this.extractField(jsonData, ['user', 'username', 'userId', 'subject', 'actor']);
      
      // Extraer información de proceso
      parsedData.process_name = this.extractField(jsonData, ['process', 'processName', 'application', 'app']);
      parsedData.process_id = this.extractField(jsonData, ['pid', 'processId', 'process_id']);
      
      // Extraer información de archivo
      parsedData.file_name = this.extractField(jsonData, ['file', 'filename', 'fileName']);
      parsedData.file_path = this.extractField(jsonData, ['path', 'filePath', 'file_path']);
      
      // Extraer hashes
      parsedData.file_hash_md5 = this.extractField(jsonData, ['md5', 'hash_md5', 'fileMd5']);
      parsedData.file_hash_sha1 = this.extractField(jsonData, ['sha1', 'hash_sha1', 'fileSha1']);
      parsedData.file_hash_sha256 = this.extractField(jsonData, ['sha256', 'hash_sha256', 'fileSha256']);
      
      // Extraer URL/dominio
      parsedData.url = this.extractField(jsonData, ['url', 'uri', 'link']);
      parsedData.domain = this.extractField(jsonData, ['domain', 'hostname', 'host', 'site']);
      
      // Extraer acción/resultado
      parsedData.action = this.extractField(jsonData, ['action', 'activity', 'operation', 'command']);
      parsedData.outcome = this.extractField(jsonData, ['outcome', 'result', 'status', 'response']);
      
      // Extraer IoCs
      const iocs = this.extractIoCsFromObject(jsonData);
      if (Object.values(iocs).some(arr => arr.length > 0)) {
        parsedData.iocs = iocs;
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.JSON
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.JSON,
        errors: [`Error al parsear JSON: ${error.message}`]
      };
    }
  }
  
  /**
   * Busca un campo en un objeto basado en posibles nombres
   */
  private extractField(obj: any, possibleNames: string[]): string | undefined {
    for (const name of possibleNames) {
      if (obj[name] !== undefined && obj[name] !== null) {
        return String(obj[name]);
      }
    }
    
    // También buscar en propiedades anidadas un nivel
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        for (const name of possibleNames) {
          if (obj[key][name] !== undefined && obj[key][name] !== null) {
            return String(obj[key][name]);
          }
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Parsea XML genérico
   */
  private async parseXml(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    // XML parsing requiere una biblioteca dedicada
    // Esta es una implementación simplificada con regex
    try {
      // Extraer root element
      const rootMatch = data.match(/<([^/?!][^ />]*)/);
      const rootElement = rootMatch ? rootMatch[1] : 'unknown';
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: `XML ${rootElement} Event`,
        type: rootElement,
        source: 'XML Source',
        severity: 'medium', // Default
        format: DataFormat.XML,
        confidence: 0.5, // Baja confianza por ser genérico
        raw_data: data
      };
      
      // Extraer algunos campos comunes usando regex simples
      const patterns = [
        { field: 'title', regex: /<title[^>]*>([^<]+)<\/title>/ },
        { field: 'description', regex: /<description[^>]*>([^<]+)<\/description>/ },
        { field: 'severity', regex: /<severity[^>]*>([^<]+)<\/severity>/ },
        { field: 'timestamp', regex: /<timestamp[^>]*>([^<]+)<\/timestamp>/ },
        { field: 'source', regex: /<source[^>]*>([^<]+)<\/source>/ },
        { field: 'ip', regex: /<ip[^>]*>([^<]+)<\/ip>/ },
        { field: 'user', regex: /<user[^>]*>([^<]+)<\/user>/ }
      ];
      
      for (const pattern of patterns) {
        const match = data.match(pattern.regex);
        if (match) {
          switch (pattern.field) {
            case 'title':
              parsedData.title = match[1];
              break;
            case 'severity':
              parsedData.severity = this.normalizeSeverity(match[1]);
              break;
            case 'timestamp':
              try {
                parsedData.timestamp = new Date(match[1]);
              } catch (e) {
                // Ignorar errores
              }
              break;
            case 'source':
              parsedData.source = match[1];
              break;
            case 'ip':
              parsedData.source_ip = match[1];
              break;
            case 'user':
              parsedData.user_name = match[1];
              break;
          }
        }
      }
      
      // Extraer posibles IoCs del texto
      const iocs = this.extractIoCsFromText(data);
      if (Object.values(iocs).some(arr => arr.length > 0)) {
        parsedData.iocs = iocs;
      }
      
      // Si hay IPs, asignarlas a source/destination
      if (iocs.ips && iocs.ips.length > 0) {
        parsedData.source_ip = parsedData.source_ip || iocs.ips[0];
        if (iocs.ips.length > 1) {
          parsedData.destination_ip = iocs.ips[1];
        }
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.XML
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.XML,
        errors: [`Error al parsear XML: ${error.message}`]
      };
    }
  }
  
  /**
   * Parsea CSV genérico
   */
  private async parseCsv(data: string): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    try {
      const lines = data.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        return {
          success: false,
          format: DataFormat.CSV,
          errors: ['CSV no contiene suficientes líneas (header + data)']
        };
      }
      
      // Extraer cabeceras y primera línea de datos
      const headers = lines[0].split(',').map(h => h.trim());
      const values = lines[1].split(',').map(v => v.trim());
      
      if (headers.length !== values.length) {
        return {
          success: false,
          format: DataFormat.CSV,
          errors: ['La cantidad de valores no coincide con las cabeceras']
        };
      }
      
      // Crear un objeto con los datos
      const csvObj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        csvObj[headers[i]] = values[i];
      }
      
      // Crear objeto ParsedData
      const parsedData: ParsedData = {
        title: 'CSV Event',
        type: 'csv',
        source: 'CSV Source',
        severity: 'medium',
        format: DataFormat.CSV,
        confidence: 0.6,
        raw_data: data,
        parsed_data: csvObj
      };
      
      // Intentar extraer campos comunes
      for (const [header, value] of Object.entries(csvObj)) {
        const headerLower = header.toLowerCase();
        
        // Título/mensaje
        if (headerLower.includes('title') || headerLower.includes('message') || 
            headerLower.includes('alert') || headerLower.includes('event')) {
          parsedData.title = value;
        }
        
        // Severidad
        if (headerLower.includes('severity') || headerLower.includes('priority') || 
            headerLower.includes('level')) {
          parsedData.severity = this.normalizeSeverity(value);
        }
        
        // Fuente
        if (headerLower.includes('source') || headerLower.includes('origin') || 
            headerLower.includes('from')) {
          parsedData.source = value;
        }
        
        // Timestamp
        if (headerLower.includes('time') || headerLower.includes('date') || 
            headerLower.includes('timestamp')) {
          try {
            parsedData.timestamp = new Date(value);
          } catch (e) {
            // Ignorar errores
          }
        }
        
        // IPs
        if (headerLower.includes('src_ip') || headerLower.includes('source_ip') || 
            headerLower.includes('srcip')) {
          parsedData.source_ip = value;
        }
        
        if (headerLower.includes('dst_ip') || headerLower.includes('destination_ip') || 
            headerLower.includes('dstip')) {
          parsedData.destination_ip = value;
        }
        
        // Puertos
        if (headerLower.includes('src_port') || headerLower.includes('source_port')) {
          parsedData.source_port = parseInt(value);
        }
        
        if (headerLower.includes('dst_port') || headerLower.includes('destination_port')) {
          parsedData.destination_port = parseInt(value);
        }
        
        // Host
        if (headerLower.includes('host') || headerLower.includes('computer') || 
            headerLower.includes('system')) {
          parsedData.host_name = value;
        }
        
        // Usuario
        if (headerLower.includes('user') || headerLower.includes('username') || 
            headerLower.includes('account')) {
          parsedData.user_name = value;
        }
        
        // Proceso
        if (headerLower.includes('process') || headerLower.includes('application')) {
          parsedData.process_name = value;
        }
        
        // URL/dominio
        if (headerLower.includes('url') || headerLower.includes('uri')) {
          parsedData.url = value;
        }
        
        if (headerLower.includes('domain')) {
          parsedData.domain = value;
        }
        
        // Hashes
        if (headerLower.includes('md5')) {
          parsedData.file_hash_md5 = value;
        }
        
        if (headerLower.includes('sha1')) {
          parsedData.file_hash_sha1 = value;
        }
        
        if (headerLower.includes('sha256')) {
          parsedData.file_hash_sha256 = value;
        }
        
        // Acción
        if (headerLower.includes('action') || headerLower.includes('activity')) {
          parsedData.action = value;
        }
        
        // Resultado
        if (headerLower.includes('result') || headerLower.includes('outcome') || 
            headerLower.includes('status')) {
          parsedData.outcome = value;
        }
      }
      
      // Extraer IoCs
      parsedData.iocs = {
        ips: [],
        domains: [],
        hashes: [],
        urls: [],
        emails: []
      };
      
      // Añadir IPs
      if (parsedData.source_ip) {
        parsedData.iocs.ips!.push(parsedData.source_ip);
      }
      
      if (parsedData.destination_ip) {
        parsedData.iocs.ips!.push(parsedData.destination_ip);
      }
      
      // Añadir URL/dominio
      if (parsedData.url) {
        parsedData.iocs.urls!.push(parsedData.url);
      }
      
      if (parsedData.domain) {
        parsedData.iocs.domains!.push(parsedData.domain);
      }
      
      // Añadir hashes
      if (parsedData.file_hash_md5) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_md5);
      }
      
      if (parsedData.file_hash_sha1) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_sha1);
      }
      
      if (parsedData.file_hash_sha256) {
        parsedData.iocs.hashes!.push(parsedData.file_hash_sha256);
      }
      
      return {
        success: true,
        data: parsedData,
        format: DataFormat.CSV
      };
    } catch (error) {
      return {
        success: false,
        format: DataFormat.CSV,
        errors: [`Error al parsear CSV: ${error.message}`]
      };
    }
  }
  
  /**
   * Parsea datos usando IA
   */
  private async parseWithAI(data: string | object, format: DataFormat): Promise<{
    success: boolean;
    data?: ParsedData;
    format: DataFormat;
    errors?: string[];
  }> {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Usar el aiParser para procesar con IA
    try {
      // Crear un conector mock para pasar al parser
      const mockConnector = {
        id: 0,
        name: 'AI Parser',
        type: format.toString(),
        vendor: 'Internal',
        isActive: true,
        status: 'active',
        configuration: {},
        dataVolume: '1'
      };
      
      // Usar el tipo adecuado según el formato
      if (format === DataFormat.STIX) {
        const result = await aiParser.parseToThreatIntel(dataStr, mockConnector);
        
        if (result.success && result.data) {
          // Convertir a formato ParsedData
          return {
            success: true,
            data: {
              title: result.data.title,
              type: result.data.type,
              source: result.data.source,
              severity: result.data.severity,
              timestamp: new Date(),
              format,
              confidence: result.confidence,
              iocs: result.data.iocs,
              raw_data: dataStr,
              parsed_data: result.data
            },
            format
          };
        }
      } else {
        // Para cualquier otro formato, intentar como alerta
        const result = await aiParser.parseToAlert(dataStr, mockConnector);
        
        if (result.success && result.data) {
          // Convertir a formato ParsedData
          return {
            success: true,
            data: {
              title: result.data.title,
              type: 'alert',
              source: result.data.source,
              severity: result.data.severity,
              timestamp: result.data.timestamp || new Date(),
              source_ip: result.data.sourceIp,
              destination_ip: result.data.destinationIp,
              format,
              confidence: result.confidence,
              iocs: result.extractedIocs,
              raw_data: dataStr,
              parsed_data: result.data
            },
            format
          };
        }
      }
      
      return {
        success: false,
        format,
        errors: ['La IA no pudo parsear los datos correctamente']
      };
    } catch (error) {
      return {
        success: false,
        format,
        errors: [`Error al parsear con IA: ${error.message}`]
      };
    }
  }
  
  /**
   * Normaliza un valor de severidad a nuestro formato estándar
   */
  private normalizeSeverity(severity?: string): string {
    if (!severity) return 'medium';
    
    const sevLower = severity.toLowerCase();
    
    if (sevLower.includes('critical') || sevLower.includes('fatal') || 
        sevLower.includes('emergency') || sevLower === '1' || 
        sevLower === 'severe') {
      return 'critical';
    }
    
    if (sevLower.includes('high') || sevLower.includes('important') || 
        sevLower.includes('error') || sevLower === '2' || 
        sevLower === 'err') {
      return 'high';
    }
    
    if (sevLower.includes('medium') || sevLower.includes('moderate') || 
        sevLower.includes('warning') || sevLower.includes('warn') || 
        sevLower === '3' || sevLower === '4') {
      return 'medium';
    }
    
    if (sevLower.includes('low') || sevLower.includes('minor') || 
        sevLower.includes('info') || sevLower.includes('information') || 
        sevLower.includes('notice') || sevLower === '5' || 
        sevLower === '0' || sevLower === 'debug') {
      return 'low';
    }
    
    // Tratar de parsear como número
    const sevNum = parseInt(severity);
    if (!isNaN(sevNum)) {
      // Diferentes escalas
      if (sevNum >= 9 && sevNum <= 10) return 'critical';
      if (sevNum >= 7 && sevNum <= 8) return 'high';
      if (sevNum >= 4 && sevNum <= 6) return 'medium';
      if (sevNum >= 0 && sevNum <= 3) return 'low';
      
      // Otra escala posible (0-100)
      if (sevNum >= 90) return 'critical';
      if (sevNum >= 70) return 'high';
      if (sevNum >= 40) return 'medium';
      return 'low';
    }
    
    return 'medium';
  }
  
  /**
   * Extrae IoCs de texto plano
   */
  private extractIoCsFromText(text: string): {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  } {
    const iocs = {
      ips: [] as string[],
      domains: [] as string[],
      hashes: [] as string[],
      urls: [] as string[],
      emails: [] as string[]
    };
    
    // Extraer IPs
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const ips = text.match(ipRegex) || [];
    iocs.ips = [...new Set(ips)];
    
    // Extraer dominios
    const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/gi;
    const domains = text.match(domainRegex) || [];
    // Filtrar dominios que podrían ser parte de IPs o timestamps
    iocs.domains = [...new Set(domains.filter(d => 
      !d.match(/^\d+\.\d+$/) && 
      !d.match(/^\d+\.\d+\.\d+$/) && 
      !d.includes('@')
    ))];
    
    // Extraer URLs
    const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
    const urls = text.match(urlRegex) || [];
    iocs.urls = [...new Set(urls)];
    
    // Extraer emails
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex) || [];
    iocs.emails = [...new Set(emails)];
    
    // Extraer hashes
    // MD5
    const md5Regex = /\b[a-fA-F0-9]{32}\b/g;
    const md5s = text.match(md5Regex) || [];
    
    // SHA1
    const sha1Regex = /\b[a-fA-F0-9]{40}\b/g;
    const sha1s = text.match(sha1Regex) || [];
    
    // SHA256
    const sha256Regex = /\b[a-fA-F0-9]{64}\b/g;
    const sha256s = text.match(sha256Regex) || [];
    
    iocs.hashes = [...new Set([...md5s, ...sha1s, ...sha256s])];
    
    return iocs;
  }
  
  /**
   * Extrae IoCs de un objeto
   */
  private extractIoCsFromObject(obj: any): {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  } {
    // Convertir objeto a string para búsqueda de patrones
    const text = JSON.stringify(obj);
    return this.extractIoCsFromText(text);
  }
}

// Exportar instancia del parser
export const structuredDataParser = new StructuredDataParser();