/**
 * Implementaciones específicas de conectores para proveedores de inteligencia de amenazas
 * Este archivo contiene conectores de API para servicios populares como VirusTotal, OTX y MISP
 */

import { InsertAlert, InsertThreatIntel } from '@shared/schema';
import { log } from '../../vite';
import { APIConnector, APIConnectorConfig } from './api';
import { BaseConnector, ConnectorConfig, ConnectorResult, ConnectorType } from './base';

/**
 * Conector para VirusTotal
 * Permite obtener información de inteligencia de amenazas desde la API de VirusTotal
 */
export class VirusTotalConnector extends APIConnector {
  constructor(connector: any) {
    super(connector);
    
    // Asegurar configuración predeterminada para VirusTotal
    const config = this.connector.configuration as APIConnectorConfig;
    
    // Establecer valores predeterminados si no están configurados
    if (!config.baseUrl) {
      config.baseUrl = 'https://www.virustotal.com/api/v3';
    }
    
    if (!config.apiKeyHeader) {
      config.apiKeyHeader = 'x-apikey';
    }
    
    if (!config.endpoints) {
      config.endpoints = {
        recentFiles: {
          path: '/search',
          method: 'GET',
          responseType: 'threatIntel',
          params: {
            query: 'type:file positives:5+ ls:7d',
            limit: '10'
          }
        },
        recentUrls: {
          path: '/search',
          method: 'GET',
          responseType: 'threatIntel',
          params: {
            query: 'type:url positives:5+ ls:7d',
            limit: '10'
          }
        },
        recentDomains: {
          path: '/search',
          method: 'GET',
          responseType: 'threatIntel',
          params: {
            query: 'type:domain ls:7d',
            limit: '10'
          }
        }
      };
    }
    
    // Utilizar API key del environment si no está configurada
    if (!config.apiKey && process.env.VT_API_KEY) {
      config.apiKey = process.env.VT_API_KEY;
      log('Usando API key de VirusTotal desde variables de entorno', 'connector');
    }
    
    // Actualizar la configuración
    this.connector.configuration = config;
  }
  
  /**
   * Procesa datos recibidos de VirusTotal y los convierte al formato de inteligencia
   * @override
   */
  protected async processThreatIntel(data: any[]): Promise<InsertThreatIntel[]> {
    const intel: InsertThreatIntel[] = [];
    
    for (const item of data) {
      try {
        const attributes = item.attributes || {};
        const stats = attributes.last_analysis_stats || {};
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0) || 1;
        
        // Calcular confianza basada en los resultados de detección
        const detectionRatio = (malicious + suspicious) / total;
        const confidence = Math.round(detectionRatio * 100);
        
        // Solo procesamos items con suficiente nivel de detección
        if (malicious < 3 && confidence < 30) {
          continue;
        }
        
        const threatIntel: InsertThreatIntel = {
          type: 'malware',
          title: attributes.meaningful_name || `${item.type} detectado en VirusTotal`,
          description: `${item.type} detectado por ${malicious} motores en VirusTotal con ratio de detección de ${(detectionRatio * 100).toFixed(1)}%`,
          source: 'VirusTotal',
          severity: malicious > 10 ? 'critical' : malicious > 5 ? 'high' : 'medium',
          confidence,
          iocs: {},
          relevance: confidence > 75 ? 'high' : confidence > 50 ? 'medium' : 'low'
        };
        
        // Agregar IOCs según el tipo
        if (item.type === 'file') {
          if (attributes.md5 || attributes.sha1 || attributes.sha256) {
            threatIntel.iocs.hashes = [
              attributes.md5,
              attributes.sha1,
              attributes.sha256
            ].filter(Boolean);
          }
        } else if (item.type === 'domain') {
          threatIntel.iocs.domains = [attributes.id || attributes.domain];
          
          // Agregar IPs relacionadas si existen
          if (attributes.last_dns_records && Array.isArray(attributes.last_dns_records)) {
            const ips = attributes.last_dns_records
              .filter((rec: any) => rec.type === 'A' || rec.type === 'AAAA')
              .map((rec: any) => rec.value);
              
            if (ips.length > 0) {
              threatIntel.iocs.ips = ips;
            }
          }
        } else if (item.type === 'ip_address') {
          threatIntel.iocs.ips = [attributes.id || attributes.ip_address];
        } else if (item.type === 'url') {
          threatIntel.iocs.urls = [attributes.url];
        }
        
        intel.push(threatIntel);
      } catch (itemError) {
        log(`Error procesando item de VirusTotal: ${itemError instanceof Error ? itemError.message : 'Error desconocido'}`, 'connector');
      }
    }
    
    return intel;
  }
}

/**
 * Conector para MISP
 * Permite obtener información de inteligencia de amenazas desde la API de MISP
 */
export class MISPConnector extends APIConnector {
  constructor(connector: any) {
    super(connector);
    
    // Asegurar configuración predeterminada para MISP
    const config = this.connector.configuration as APIConnectorConfig;
    
    // Establecer valores predeterminados si no están configurados
    if (!config.baseUrl) {
      config.baseUrl = process.env.MISP_URL || 'https://misp.example.org';
    }
    
    if (!config.apiKeyHeader) {
      config.apiKeyHeader = 'Authorization';
    }
    
    if (!config.endpoints) {
      config.endpoints = {
        recentEvents: {
          path: '/events/restSearch',
          method: 'POST',
          responseType: 'threatIntel',
          contentType: 'application/json',
          bodyTemplate: {
            returnFormat: 'json',
            limit: 20,
            published: true,
            threat_level_id: [1, 2], // Critical y High
            to_ids: true
          }
        },
        attributes: {
          path: '/attributes/restSearch',
          method: 'POST',
          responseType: 'threatIntel',
          contentType: 'application/json',
          bodyTemplate: {
            returnFormat: 'json',
            limit: 20,
            type: ['ip-src', 'ip-dst', 'domain', 'hostname', 'md5', 'sha1', 'sha256', 'url'],
            to_ids: true
          }
        }
      };
    }
    
    // Utilizar API key del environment si no está configurada
    if (!config.apiKey && process.env.MISP_API_KEY) {
      config.apiKey = process.env.MISP_API_KEY;
      log('Usando API key de MISP desde variables de entorno', 'connector');
    }
    
    // Configurar headers por defecto
    config.defaultHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // Actualizar la configuración
    this.connector.configuration = config;
  }
  
  /**
   * Procesa datos recibidos de MISP y los convierte al formato de inteligencia
   * @override
   */
  protected async processThreatIntel(data: any[]): Promise<InsertThreatIntel[]> {
    const intel: InsertThreatIntel[] = [];
    
    if (!data || !Array.isArray(data)) {
      if (data?.response && Array.isArray(data.response)) {
        data = data.response;
      } else {
        log('Respuesta de MISP no contiene eventos en formato esperado', 'connector');
        return [];
      }
    }
    
    for (const event of data) {
      try {
        // Extraer IOCs de los atributos
        const iocs: any = {
          ips: [],
          domains: [],
          hashes: [],
          urls: []
        };
        
        // Si hay atributos, procesarlos
        if (event.Attribute && Array.isArray(event.Attribute)) {
          event.Attribute.forEach((attr: any) => {
            if (attr.type === 'ip-src' || attr.type === 'ip-dst') {
              iocs.ips.push(attr.value);
            } else if (attr.type === 'domain' || attr.type === 'hostname') {
              iocs.domains.push(attr.value);
            } else if (attr.type.startsWith('hash') || attr.type === 'md5' || attr.type === 'sha1' || attr.type === 'sha256') {
              iocs.hashes.push(attr.value);
            } else if (attr.type === 'url' || attr.type === 'uri') {
              iocs.urls.push(attr.value);
            }
          });
        }
        
        // Filtrar las listas vacías
        Object.keys(iocs).forEach(key => {
          if (iocs[key].length === 0) {
            delete iocs[key];
          }
        });
        
        // Solo continuar si hay IOCs válidos
        if (Object.keys(iocs).length === 0) {
          continue;
        }
        
        // Determinar el tipo basado en etiquetas
        let threatType = 'malware';
        if (event.Tag && Array.isArray(event.Tag)) {
          const tags = event.Tag.map((t: any) => t.name.toLowerCase());
          if (tags.some(t => t.includes('apt'))) {
            threatType = 'apt';
          } else if (tags.some(t => t.includes('ransomware'))) {
            threatType = 'ransomware';
          } else if (tags.some(t => t.includes('phishing'))) {
            threatType = 'phishing';
          }
        }
        
        // Determinar severidad basada en el nivel de amenaza
        let severity = 'medium';
        if (event.threat_level_id === '1' || event.threat_level_id === 1) {
          severity = 'critical';
        } else if (event.threat_level_id === '2' || event.threat_level_id === 2) {
          severity = 'high';
        } else if (event.threat_level_id === '4' || event.threat_level_id === 4) {
          severity = 'low';
        }
        
        const threatIntel: InsertThreatIntel = {
          type: threatType,
          title: event.info || event.Event?.info || `Evento MISP ${event.id || event.Event?.id}`,
          description: event.Event?.description || event.info || event.Event?.info || `Evento de inteligencia de amenazas desde MISP`,
          source: 'MISP',
          severity,
          confidence: 85, // MISP es de alta confianza como plataforma
          iocs,
          relevance: 'high'
        };
        
        // Establecer fecha de creación si existe
        const dateStr = event.date || event.Event?.date;
        if (dateStr) {
          threatIntel.createdAt = new Date(dateStr);
        }
        
        intel.push(threatIntel);
      } catch (itemError) {
        log(`Error procesando evento MISP: ${itemError instanceof Error ? itemError.message : 'Error desconocido'}`, 'connector');
      }
    }
    
    return intel;
  }
}