import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const apiKey = cfg.nvd.apiKey;
const timeout = cfg.timeout;
const NvdEnricher = {
    id: 'nvd',
    supports: (alert) => Boolean(alert.cveId),
    enrich: async (alert) => {
        if (!alert.cveId)
            return [];
        const url = `https://services.nvd.nist.gov/rest/json/cve/1.0/${alert.cveId}`;
        const resp = await axios.get(url, { headers: { 'apiKey': apiKey }, timeout });
        const item = resp.data.result.CVE_Items?.[0];
        if (!item)
            return [];
        const metric = item.impact?.baseMetricV3?.cvssV3;
        return [{
                provider: 'nvd',
                data: {
                    cvssScore: metric?.baseScore,
                    vector: metric?.vectorString,
                    references: item.cve.references.reference_data.map((r) => r.url)
                },
                severity: metric?.baseScore
            }];
    }
};
export default NvdEnricher;
