import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
// Load configuration
const cfg = yaml.load(fs.readFileSync('server/enrichers.yaml', 'utf-8'));
const apiKey = cfg.abuseipdb.apiKey;
const timeout = cfg.timeout;
const AbuseIPDBEnricher = {
    id: 'abuseipdb',
    supports: (alert) => !!alert.sourceIp,
    enrich: async (alert) => {
        if (!alert.sourceIp)
            return [];
        const url = 'https://api.abuseipdb.com/api/v2/check';
        const resp = await axios.get(url, {
            headers: {
                Key: apiKey,
                Accept: 'application/json'
            },
            params: {
                ipAddress: alert.sourceIp,
                maxAgeInDays: 90
            },
            timeout
        });
        const data = resp.data.data;
        return [{
                provider: 'abuseipdb',
                data: {
                    ip: data.ipAddress,
                    abuseConfidenceScore: data.abuseConfidenceScore,
                    countryCode: data.countryCode,
                    usageType: data.usageType,
                    isp: data.isp
                },
                severity: data.abuseConfidenceScore
            }];
    }
};
export default AbuseIPDBEnricher;
