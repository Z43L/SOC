import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const apiKey = cfg.shodan.apiKey;
const timeout = cfg.timeout;
const ShodanEnricher = {
    id: 'shodan',
    supports: (alert) => Boolean(alert.destinationIp),
    enrich: async (alert) => {
        if (!alert.destinationIp)
            return [];
        const url = `https://api.shodan.io/shodan/host/${alert.destinationIp}?key=${apiKey}`;
        const resp = await axios.get(url, { timeout });
        const data = resp.data;
        return [{
                provider: 'shodan',
                data: {
                    ip: data.ip_str,
                    org: data.org,
                    os: data.os,
                    openPorts: data.ports,
                    banners: data.data.map((d) => d.banner),
                    vulnerabilities: data.vulns
                }
            }];
    }
};
export default ShodanEnricher;
