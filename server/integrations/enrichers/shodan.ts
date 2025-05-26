import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { AlertEnricher, AlertRecord, Enrich } from './alert-enricher';

// Load config
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8')) as any;
const apiKey = cfg.shodan.apiKey;
const timeout = cfg.timeout;

const ShodanEnricher: AlertEnricher = {
  id: 'shodan',
  supports: (alert: AlertRecord) => Boolean(alert.destinationIp),
  enrich: async (alert: AlertRecord): Promise<Enrich[]> => {
    if (!alert.destinationIp) return [];
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
        banners: data.data.map((d: any) => d.banner),
        vulnerabilities: data.vulns
      }
    }];
  }
};

export default ShodanEnricher;
