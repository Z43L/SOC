// Define normalization pipeline for raw connector events
import { db } from '../../db';
import { alerts, connectors } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { RawEvent } from './interfaces';
import { log } from '../../vite';

/**
 * Normaliza y almacena un evento crudo
 * Convierte eventos de distintos formatos a un formato unificado
 */
export async function normalizeAndStoreEvent(event: RawEvent): Promise<void> {
  try {
    // Retrieve connector to get organization
    const [connectorRec] = await db.select().from(connectors).where(eq(connectors.id, parseInt(event.connectorId, 10)));
    const orgId = connectorRec?.organizationId;
    
    // Apply normalization based on source type
    let alertRow: Partial<typeof alerts.$inferInsert> = {
      title: event.source,
      description: event.message,
      severity: mapSeverity(event.severity),
      source: event.source,
      metadata: event.rawData,
      timestamp: new Date(event.timestamp || Date.now()),
      status: 'new',
      organizationId: orgId || undefined
    };
    
    // Enrich with specific data based on event source
    if (event.source.toLowerCase().includes('syslog')) {
      // Enhance Syslog specific alerts
      const syslogData = event.rawData as any;
      if (syslogData) {
        alertRow = {
          ...alertRow,
          title: `${syslogData.appName || 'Syslog'}: ${syslogData.hostname || 'unknown'}`,
          sourceIp: syslogData.sourceIp,
          metadata: {
            ...alertRow.metadata,
            facility: syslogData.facility,
            severity: syslogData.severity,
            hostname: syslogData.hostname,
            appName: syslogData.appName,
            procId: syslogData.procId
          }
        };
      }
    } else if (event.source.toLowerCase().includes('agent')) {
      // Enhance Agent specific alerts
      const agentData = event.rawData as any;
      if (agentData) {
        alertRow = {
          ...alertRow,
          title: `${agentData.hostname || 'Agent'}: ${event.message}`,
          sourceIp: agentData.ip,
          metadata: {
            ...alertRow.metadata,
            agentId: agentData.agentId,
            hostname: agentData.hostname,
            os: agentData.os
          }
        };
      }
    } else if (event.source.toLowerCase().includes('api')) {
      // Enhance API specific alerts
      const apiData = event.rawData as any;
      if (apiData) {
        alertRow = {
          ...alertRow,
          title: `${event.source}: ${apiData.title || event.message}`,
          metadata: {
            ...alertRow.metadata,
            vendor: apiData.vendor,
            product: apiData.product
          }
        };
      }
    }
    
    // Insert the normalized alert
    await db.insert(alerts).values(alertRow);
    log(`Normalized and stored event from ${event.source}`, 'event-normalizer');
  } catch (err) {
    log(`Error normalizing event ${event.id}: ${err}`, 'event-normalizer');
  }
}

/**
 * Map different severity formats to a standard format
 */
function mapSeverity(severity: string | number): string {
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
