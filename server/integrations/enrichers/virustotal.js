import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load configuration
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const apiKey = cfg.virustotal.apiKey;
const timeout = cfg.timeout;
const VirusTotalEnricher = {
    id: 'virustotal',
    supports: (alert) => !!alert.fileHash,
    enrich: async (alert) => {
        if (!alert.fileHash)
            return [];
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
