import { Queue } from 'bullmq';
import { intelQueue } from '../queues/intelQueue';
import { SeverityTypes } from '../../../shared/schema';
import { virustotalProvider } from './virustotal';
import { abuseipdbProvider } from './abuseipdb';
import { otxProvider } from './otx';
import { osvProvider } from './osv';

// Regex types
const regexMap: Record<string, RegExp> = {
  hash: /^[A-Fa-f0-9]{64}$/,
  ip: /^(?:\d{1,3}\.){3}\d{1,3}$/,
  url: /^https?:\/\//,
  cve: /^CVE-\d{4}-\d{4,7}$/i,
};

type IoCType = 'hash' | 'ip' | 'url' | 'cve';

export interface IntelReport {
  ioc: string;
  provider: 'VT' | 'AbuseIPDB' | 'OTX' | 'OSV';
  score: number;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'vulnerable';
  url?: string;
  tags?: string[];
  raw: any;
  firstSeen?: Date;
  ttl: string;
}

export class ThreatIntel {
  static detectType(ioc: string): IoCType | null {
    for (const [type, rx] of Object.entries(regexMap)) {
      if (rx.test(ioc)) return type as IoCType;
    }
    return null;
  }

  static async lookup(ioc: string) {
    const type = this.detectType(ioc);
    if (!type) throw new Error('Unknown IoC type');
    await intelQueue.add('lookup', { ioc, type });
  }
}

// Add overload accepting alertId
ThreatIntel.lookup = async function(ioc: string, alertId?: number) {
  const type = this.detectType(ioc);
  if (!type) throw new Error('Unknown IoC type');
  await intelQueue.add('lookup', { ioc, type, alertId });
};

// Export providers
export { virustotalProvider, abuseipdbProvider, otxProvider, osvProvider };
