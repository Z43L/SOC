import axios from 'axios';
export const virustotalProvider = {
    async lookup(ioc) {
        const apiKey = process.env.VT_API_KEY;
        const url = `https://www.virustotal.com/api/v3/files/${ioc}`;
        const res = await axios.get(url, {
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
