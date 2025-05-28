import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const apiKey = cfg.ipinfo.apiKey;
const timeout = cfg.timeout;
const IpInfoEnricher = {
    id: 'ipinfo',
    supports: (alert) => Boolean(alert.sourceIp),
    enrich: async (alert) => {
        if (!alert.sourceIp)
            return [];
        const url = `https://ipinfo.io/${alert.sourceIp}/json`;
        const resp = await axios.get(url, {
            params: { token: apiKey },
            timeout
        });
        const data = resp.data;
        return [{
                provider: 'ipinfo',
                data: {
                    country: data.country,
                    region: data.region,
                    city: data.city,
                    org: data.org,
                    loc: data.loc
                }
            }];
    }
};
export default IpInfoEnricher;
