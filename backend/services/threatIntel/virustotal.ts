import axios from 'axios';
import { IntelReport } from './index';

type VTResponse = {
  data: {
    attributes: {
      last_analysis_stats: Record<string, number>;
      first_submission_date?: number;
      last_analysis_date?: number;
    };
    links?: { self: string };
  };
};

export const virustotalProvider = {
  async lookup(ioc: string): Promise<IntelReport> {
    const apiKey = process.env.VT_API_KEY!;
    const url = `https://www.virustotal.com/api/v3/files/${ioc}`;
    const res = await axios.get<VTResponse>(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const stats = res.data.data.attributes.last_analysis_stats;
    const malicious = stats.malicious || 0;
    const verdict = malicious > 0 ? 'malicious' : 'clean';
    const tags = Object.entries(stats)
      .filter(([, count]) => count > 0)
      .map(([engine]) => engine);
    const firstSeen = res.data.data.attributes.first_submission_date
      ? new Date(res.data.data.attributes.first_submission_date * 1000)
      : new Date();
    return {
      ioc,
      provider: 'VT',
      score: malicious,
      verdict,
      url: res.data.data.links?.self,
      tags,
      raw: res.data,
      firstSeen,
      ttl: '30 days',
    };
  },
};
