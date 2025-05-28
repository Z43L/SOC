import { intelQueue } from '../queues/intelQueue';
import { virustotalProvider } from './virustotal';
import { abuseipdbProvider } from './abuseipdb';
import { otxProvider } from './otx';
import { osvProvider } from './osv';
// Regex types
const regexMap = {
    hash: /^[A-Fa-f0-9]{64}$/,
    ip: /^(?:\d{1,3}\.){3}\d{1,3}$/,
    url: /^https?:\/\//,
    cve: /^CVE-\d{4}-\d{4,7}$/i,
};
export class ThreatIntel {
    static detectType(ioc) {
        for (const [type, rx] of Object.entries(regexMap)) {
            if (rx.test(ioc))
                return type;
        }
        return null;
    }
    static async lookup(ioc) {
        const type = this.detectType(ioc);
        if (!type)
            throw new Error('Unknown IoC type');
        await intelQueue.add('lookup', { ioc, type });
    }
}
// Add overload accepting alertId
ThreatIntel.lookup = async function (ioc, alertId) {
    const type = this.detectType(ioc);
    if (!type)
        throw new Error('Unknown IoC type');
    await intelQueue.add('lookup', { ioc, type, alertId });
};
// Export providers
export { virustotalProvider, abuseipdbProvider, otxProvider, osvProvider };
