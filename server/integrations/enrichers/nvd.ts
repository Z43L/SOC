import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { AlertEnricher, AlertRecord, Enrich } from './alert-enricher';

// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8')) as any;
const apiKey = cfg.nvd.apiKey;
const timeout = cfg.timeout;

const NvdEnricher: AlertEnricher = {
  id: 'nvd',
  supports: (alert: AlertRecord) => Boolean(alert.cveId),
  enrich: async (alert: AlertRecord): Promise<Enrich[]> => {
    if (!alert.cveId) return [];
    const url = `https://services.nvd.nist.gov/rest/json/cve/1.0/${alert.cveId}`;
    const resp = await axios.get(url, { headers: { 'apiKey': apiKey }, timeout });
    const item = resp.data.result.CVE_Items?.[0];
    if (!item) return [];
    const metric = item.impact?.baseMetricV3?.cvssV3;
    return [{
      provider: 'nvd',
      data: {
        cvssScore: metric?.baseScore,
        vector: metric?.vectorString,
        references: item.cve.references.reference_data.map((r: any) => r.url)
      },
      severity: metric?.baseScore
    }];
  }
};

export default NvdEnricher;
