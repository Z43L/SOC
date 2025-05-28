import axios from 'axios';
export const osvProvider = {
    async lookup(ioc) {
        // Query OSV for vulnerability by CVE ID
        const url = `https://api.osv.dev/v1/vulns/${ioc}`;
        try {
            const res = await axios.get(url);
            const vulns = res.data.vulns || [];
            const score = vulns.length;
            const verdict = score > 0 ? 'vulnerable' : 'clean';
            return {
                ioc,
                provider: 'OSV',
                score,
                verdict,
                raw: res.data,
                ttl: '90 days'
            };
        }
        catch (err) {
            return {
                ioc,
                provider: 'OSV',
                score: 0,
                verdict: 'clean',
                raw: err.response?.data || err,
                ttl: '90 days'
            };
        }
    }
};
