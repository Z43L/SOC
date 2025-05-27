// Define normalization pipeline for raw connector events
import { db } from '../../db';
import { alerts, connectors } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { RawEvent } from './interfaces';
import { log } from '../../vite';

export async function normalizeAndStoreEvent(event: RawEvent): Promise<void> {
  try {
    // Retrieve connector to get organization
    const [connectorRec] = await db.select().from(connectors).where(eq(connectors.id, parseInt(event.connectorId, 10)));
    const orgId = connectorRec?.organizationId;
    
    // Map raw event to alert schema
    const alertRow = {
      title: event.source,
      description: event.message,
      severity: event.severity,
      source: event.source,
      metadata: event.rawData,
      timestamp: event.timestamp,
      status: 'new',
      organizationId: orgId || undefined
    };
    
    await db.insert(alerts).values(alertRow);
  } catch (err) {
    log(`Error normalizing event ${event.id}: ${err}`, 'event-normalizer');
  }
}
