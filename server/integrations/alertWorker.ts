import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import PQueue from 'p-queue';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { db } from '../db';
import * as schema from '@shared/schema';
import { insertEnrichmentSchema, enrichments, alerts } from '@shared/schema';
import { AlertEnricher, AlertRecord, Enrich } from './enrichers/alert-enricher';
import { getIo } from '../socket';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const isProduction = process.env.NODE_ENV === 'production';
const CONFIG_PATH = isProduction 
  ? path.join(process.cwd(), 'dist', 'server', 'enrichers.yaml')
  : path.join(process.cwd(), 'server', 'enrichers.yaml');
const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as any;

// Dynamically load all enricher modules from folder
const enrichers: AlertEnricher[] = [];
async function loadEnrichers() {
  // In production, look in dist directory for compiled JS files
  // In development, look in source directory for TS files
  const isProduction = process.env.NODE_ENV === 'production';
  const dir = isProduction 
    ? path.join(process.cwd(), 'dist', 'server', 'integrations', 'enrichers')
    : path.join(process.cwd(), 'server', 'integrations', 'enrichers');
  const extension = isProduction ? '.js' : '.ts';
  
  if (!fs.existsSync(dir)) {
    console.warn(`Enrichers directory not found: ${dir}`);
    return;
  }
  
  const files = fs.readdirSync(dir).filter((f): f is string => f.endsWith(extension));
  console.log(`Loading ${files.length} enricher files from ${dir}`);
  
  for (const file of files) {
    try {
      const mod = await import(path.join(dir, file));
      if (mod.default) {
        enrichers.push(mod.default as AlertEnricher);
        console.log(`Loaded enricher: ${file}`);
      }
    } catch (error) {
      console.error(`Failed to load enricher ${file}:`, error);
    }
  }
}

const queue = new PQueue({ concurrency: config.maxConcurrency || 5 });

export async function processAlerts() {
  // Load enrichers on first run
  if (enrichers.length === 0) {
    await loadEnrichers();
  }
  // Fetch raw alerts
  const rawAlerts = await db.select().from(alerts)
    .where(alerts.status.eq('raw'), alerts.retryCount.lt(config.maxRetries || 3));

  for (const alert of rawAlerts) {
    queue.add(() => handleAlert(alert as AlertRecord));
  }

  await queue.onIdle();
}

async function handleAlert(alert: AlertRecord) {
  let anyEnriched = false;

  for (const enricher of enrichers) {
    if (!enricher.supports(alert)) continue;
    try {
      const results: Enrich[] = await Promise.race([
        enricher.enrich(alert),
        new Promise<Enrich[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), config.timeout))
      ]);

      for (const res of results) {
        await db.insert(enrichments)
          .values({ alertId: alert.id, provider: res.provider, data: res.data, severity: res.severity })
          .returning();
        anyEnriched = true;
      }
    } catch (err: any) {
      if (err.message.includes('rate limit')) {
        // schedule retry
      }
    }
  }

  // Update alert
  await db.update(alerts)
    .set({ status: anyEnriched ? 'enriched' : 'raw', retryCount: alert.retryCount + 1 })
    .where(alerts.id.eq(alert.id))
    .returning();
  
  // Emit WebSocket event with enriched data
  const [updatedAlert] = await db.select().from(alerts).where(alerts.id.eq(alert.id));
  const enrichmentRows = await db.select().from(enrichments).where(enrichments.alertId.eq(alert.id));
  getIo().emit('alertEnriched', { alert: updatedAlert, enrichments: enrichmentRows });
   
  return;
}
