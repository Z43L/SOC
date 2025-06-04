import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { AlertEnricher, AlertRecord, Enrich } from './alert-enricher';

// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8')) as any;
const timeout = cfg.timeout;

const OsVEnricher: AlertEnricher = {
  id: 'osv',
  supports: (alert: AlertRecord) => Boolean(alert.packageName && alert.packageVersion),
  enrich: async (alert: AlertRecord): Promise<Enrich[]> => {
    if (!alert.packageName || !alert.packageVersion) return [];
    const url = `https://api.osv.dev/v1/query`; 
    const resp = await axios.post(url,
      { package: { name: alert.packageName }, version: alert.packageVersion },
      { timeout }
    );
    const vulns = resp.data.vulns || [];
    return vulns.map((v: any) => ({
      provider: 'osv',
      data: {
        id: v.id,
        summary: v.summary,
        affected: v.ranges,
        fixedIn: v.affected.find((r: any) => r.type === 'GIT')?.events?.find((e: any) => e.fixed)?.fixed
      }
    }));
  }
};

export default OsVEnricher;
