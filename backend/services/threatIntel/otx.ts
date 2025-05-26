import axios from 'axios';
import dotenv from 'dotenv';
import { IntelReport } from './index';

dotenv.config();

export const otxProvider = {
  async lookup(ioc: string, type: string): Promise<IntelReport> {
    const apiKey = process.env.OTX_API_KEY!;
    const url = `https://otx.alienvault.com/api/v1/indicators/${type}/${ioc}/general`;
    const res = await axios.get(url, {
      headers: { 'X-OTX-API-KEY': apiKey }
    });
    const pulseCount = res.data.pulse_info?.count || 0;
    const threatScore = res.data.threat_score || 0;
    // use threatScore if available, else pulseCount
    const score = threatScore || pulseCount;
    let verdict: IntelReport['verdict'] = 'clean';
    if (score > 80) verdict = 'malicious';
    else if (score > 50) verdict = 'suspicious';
    return {
      ioc,
      provider: 'OTX',
      score,
      verdict,
      raw: res.data,
      ttl: '12 hours'
    };
  }
};
