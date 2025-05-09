/**
 * Módulo de Enriquecimiento de Alertas con Threat Intelligence
 * 
 * Este módulo proporciona funcionalidades para enriquecer automáticamente las alertas
 * con contexto de inteligencia de amenazas. Realiza correlaciones entre las alertas entrantes
 * y los datos de inteligencia existentes en el sistema, agregando contexto adicional
 * para mejorar el análisis y la respuesta a incidentes.
 */

import { storage } from '../storage';
import { log } from '../vite';
import { Alert, ThreatIntel, InsertAlert } from '@shared/schema';

/**
 * Extrae posibles indicadores de compromiso (IOCs) de una alerta
 */
function extractIOCsFromAlert(alert: Alert): { 
  ips: string[],
  domains: string[],
  hashes: string[],
  urls: string[]
} {
  const result = {
    ips: [] as string[],
    domains: [] as string[],
    hashes: [] as string[],
    urls: [] as string[]
  };
  
  // Extraer dirección IP de origen y destino si existen
  if (alert.sourceIp) {
    result.ips.push(alert.sourceIp);
  }
  
  if (alert.destinationIp) {
    result.ips.push(alert.destinationIp);
  }
  
  // Extraer información de los metadatos
  if (alert.metadata) {
    // Intentar extraer URLs
    const urlRegex = /(https?:\/\/[^\s'"]+)/gi;
    const metadataStr = typeof alert.metadata === 'string' 
      ? alert.metadata 
      : JSON.stringify(alert.metadata);
    
    const urls = metadataStr.match(urlRegex);
    if (urls) {
      result.urls.push(...urls);
    }
    
    // Extraer dominios
    const domainRegex = /\b((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}\b/gi;
    const domains = metadataStr.match(domainRegex);
    if (domains) {
      result.domains.push(...domains);
    }
    
    // Extraer hashes (MD5, SHA1, SHA256)
    const md5Regex = /\b[a-f0-9]{32}\b/gi;
    const sha1Regex = /\b[a-f0-9]{40}\b/gi;
    const sha256Regex = /\b[a-f0-9]{64}\b/gi;
    
    const md5s = metadataStr.match(md5Regex);
    const sha1s = metadataStr.match(sha1Regex);
    const sha256s = metadataStr.match(sha256Regex);
    
    if (md5s) result.hashes.push(...md5s);
    if (sha1s) result.hashes.push(...sha1s);
    if (sha256s) result.hashes.push(...sha256s);
    
    // Si los metadatos son un objeto, buscar campos comunes que podrían contener IOCs
    if (typeof alert.metadata === 'object' && alert.metadata !== null) {
      const metadata = alert.metadata as Record<string, any>;
      
      // Buscar IPs en campos comunes
      ['ip', 'ipAddress', 'srcIp', 'dstIp', 'clientIp', 'serverIp'].forEach(field => {
        if (typeof metadata[field] === 'string' && metadata[field].match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
          result.ips.push(metadata[field]);
        }
      });
      
      // Buscar dominios en campos comunes
      ['domain', 'hostname', 'host', 'server', 'target'].forEach(field => {
        if (typeof metadata[field] === 'string' && metadata[field].match(domainRegex)) {
          result.domains.push(metadata[field]);
        }
      });
      
      // Buscar hashes en campos comunes
      ['hash', 'fileHash', 'md5', 'sha1', 'sha256'].forEach(field => {
        if (typeof metadata[field] === 'string') {
          if (metadata[field].match(md5Regex) || 
              metadata[field].match(sha1Regex) || 
              metadata[field].match(sha256Regex)) {
            result.hashes.push(metadata[field]);
          }
        }
      });
    }
  }
  
  // Eliminar duplicados
  return {
    ips: [...new Set(result.ips)],
    domains: [...new Set(result.domains)],
    hashes: [...new Set(result.hashes)],
    urls: [...new Set(result.urls)]
  };
}

/**
 * Busca inteligencia de amenazas relacionada con los IOCs de una alerta
 */
async function findRelatedThreatIntel(iocs: { 
  ips: string[],
  domains: string[],
  hashes: string[],
  urls: string[]
}): Promise<ThreatIntel[]> {
  // Obtenemos todas las entradas de inteligencia de amenazas
  // En producción se debería usar filtros de búsqueda para optimizar
  const allIntel = await storage.listThreatIntel();
  const matchingIntel: ThreatIntel[] = [];
  
  // Iteramos sobre cada entrada de inteligencia para encontrar coincidencias
  for (const intel of allIntel) {
    let matches = false;
    
    // Asegurar que los iocs de la inteligencia son un objeto
    const intelIOCs = intel.iocs && typeof intel.iocs === 'object' ? intel.iocs : {};
    
    // Verificar coincidencias de IPs
    if (iocs.ips.length > 0 && intelIOCs && 'ips' in intelIOCs) {
      const intelIPs = (intelIOCs as any).ips;
      if (Array.isArray(intelIPs) && iocs.ips.some(ip => intelIPs.includes(ip))) {
        matches = true;
      }
    }
    
    // Verificar coincidencias de dominios
    if (!matches && iocs.domains.length > 0 && intelIOCs && 'domains' in intelIOCs) {
      const intelDomains = (intelIOCs as any).domains;
      if (Array.isArray(intelDomains) && iocs.domains.some(domain => intelDomains.includes(domain))) {
        matches = true;
      }
    }
    
    // Verificar coincidencias de hashes
    if (!matches && iocs.hashes.length > 0 && intelIOCs && 'hashes' in intelIOCs) {
      const intelHashes = (intelIOCs as any).hashes;
      if (Array.isArray(intelHashes) && iocs.hashes.some(hash => intelHashes.includes(hash))) {
        matches = true;
      }
    }
    
    // Verificar coincidencias de URLs
    if (!matches && iocs.urls.length > 0 && intelIOCs && 'urls' in intelIOCs) {
      const intelURLs = (intelIOCs as any).urls;
      if (Array.isArray(intelURLs) && iocs.urls.some(url => intelURLs.includes(url))) {
        matches = true;
      }
    }
    
    if (matches) {
      matchingIntel.push(intel);
    }
  }
  
  return matchingIntel;
}

/**
 * Enriquece una alerta con contexto de inteligencia de amenazas
 */
export async function enrichAlertWithThreatIntel(alert: Alert): Promise<{
  enriched: boolean,
  alert: Alert,
  matchedIntel: ThreatIntel[]
}> {
  try {
    // Extraer posibles IOCs de la alerta
    const iocs = extractIOCsFromAlert(alert);
    const hasIOCs = Object.values(iocs).some(arr => arr.length > 0);
    
    if (!hasIOCs) {
      return {
        enriched: false,
        alert,
        matchedIntel: []
      };
    }
    
    log(`Buscando enriquecimiento de TI para alerta #${alert.id}. IOCs encontrados: ${JSON.stringify(iocs)}`, 'alertEnrichment');
    
    // Buscar inteligencia relacionada
    const matchedIntel = await findRelatedThreatIntel(iocs);
    
    if (matchedIntel.length === 0) {
      return {
        enriched: false,
        alert,
        matchedIntel: []
      };
    }
    
    // Enriquecer los metadatos de la alerta con la información encontrada
    const metadata = alert.metadata || {};
    
    // Si aún no existe, inicializar el campo de enriquecimiento TI
    if (typeof metadata === 'object') {
      (metadata as any).threatIntel = (metadata as any).threatIntel || {
        matchedEntries: [],
        iocs: iocs,
        enrichmentTime: new Date().toISOString()
      };
      
      const tiMetadata = (metadata as any).threatIntel;
      
      // Agregar información resumida de cada coincidencia
      matchedIntel.forEach(intel => {
        tiMetadata.matchedEntries.push({
          id: intel.id,
          type: intel.type,
          title: intel.title,
          source: intel.source,
          severity: intel.severity,
          confidence: intel.confidence
        });
      });
      
      // Aumentar la severidad de la alerta si hay coincidencias con severidad critical o high
      let shouldEscalate = false;
      const criticalThreats = matchedIntel.filter(
        intel => intel.severity === 'critical' || 
                (intel.severity === 'high' && intel.confidence && intel.confidence > 80)
      );
      
      if (criticalThreats.length > 0) {
        shouldEscalate = true;
        tiMetadata.recommendation = "Posible amenaza severa detectada. Revisar urgentemente.";
      }
      
      // Actualizar la alerta con los nuevos metadatos
      const updatedAlert = await storage.updateAlert(alert.id, {
        metadata,
        severity: shouldEscalate && alert.severity !== 'critical' ? 'high' : alert.severity
      });
      
      if (!updatedAlert) {
        throw new Error(`No se pudo actualizar la alerta #${alert.id}`);
      }
      
      log(`Alerta #${alert.id} enriquecida con ${matchedIntel.length} entradas de inteligencia`, 'alertEnrichment');
      
      return {
        enriched: true,
        alert: updatedAlert,
        matchedIntel
      };
    }
    
    return {
      enriched: false,
      alert,
      matchedIntel
    };
  } catch (error) {
    log(`Error al enriquecer alerta #${alert.id}: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'alertEnrichment');
    return {
      enriched: false,
      alert,
      matchedIntel: []
    };
  }
}

/**
 * Procesa una nueva alerta aplicando enriquecimiento automático con threat intel
 */
export async function processNewAlertWithEnrichment(alert: InsertAlert): Promise<Alert> {
  // Crear la alerta básica primero
  const createdAlert = await storage.createAlert(alert);
  
  // Intentar enriquecerla con threat intel
  await enrichAlertWithThreatIntel(createdAlert);
  
  // Devolver la alerta más reciente después del procesamiento
  return (await storage.getAlert(createdAlert.id)) || createdAlert;
}