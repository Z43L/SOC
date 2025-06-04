import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
export const abuseipdbProvider = {
    async lookup(ioc) {
        const apiKey = process.env.ABUSEIPDB_API_KEY;
        const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ioc}&maxAgeInDays=90`;
        const res = await axios.get(url, {
            headers: {
                'Key': apiKey,
                'Accept': 'application/json'
            }
        });
        const data = res.data.data;
        const score = data.abuseConfidenceScore;
        let verdict = 'clean';
        if (score > 80)
            verdict = 'malicious';
        else if (score > 50)
            verdict = 'suspicious';
        return {
            ioc,
            provider: 'AbuseIPDB',
            score,
            verdict,
            raw: res.data,
            ttl: '12 hours'
        };
    }
};
