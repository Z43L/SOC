import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const timeout = cfg.timeout;
const OsVEnricher = {
    id: 'osv',
    supports: (alert) => Boolean(alert.packageName && alert.packageVersion),
    enrich: async (alert) => {
        if (!alert.packageName || !alert.packageVersion)
            return [];
        const url = `https://api.osv.dev/v1/query`;
        const resp = await axios.post(url, { package: { name: alert.packageName }, version: alert.packageVersion }, { timeout });
        const vulns = resp.data.vulns || [];
        return vulns.map((v) => ({
            provider: 'osv',
            data: {
                id: v.id,
                summary: v.summary,
                affected: v.ranges,
                fixedIn: v.affected.find((r) => r.type === 'GIT')?.events?.find((e) => e.fixed)?.fixed
            }
        }));
    }
};
export default OsVEnricher;
