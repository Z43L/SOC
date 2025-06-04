import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { AlertEnricher, AlertRecord, Enrich } from './alert-enricher';

// Load configuration
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8')) as any;
const apiKey = cfg.virustotal.apiKey;
const timeout = cfg.timeout;

const VirusTotalEnricher: AlertEnricher = {
  id: 'virustotal',
  supports: (alert: AlertRecord) => !!alert.fileHash,
  enrich: async (alert: AlertRecord): Promise<Enrich[]> => {
    if (!alert.fileHash) return [];
    const url = `https://www.virustotal.com/api/v3/files/${alert.fileHash}`;
    const resp = await axios.get(url, {
      headers: { 'x-apikey': apiKey },
      timeout
    });
    const attrs = resp.data.data.attributes;
    return [{
      provider: 'virustotal',
      data: {
        family: attrs.meaningful_name || null,
        lastAnalysis: attrs.last_analysis_stats,
        maliciousVotes: attrs.last_analysis_stats.malicious
      },
      severity: attrs.last_analysis_stats.malicious
    }];
  }
};

export default VirusTotalEnricher;
