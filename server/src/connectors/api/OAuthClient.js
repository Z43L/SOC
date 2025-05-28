import axios from 'axios';
import qs from 'qs';
import { CredentialsService } from './credentials.service';
export class OAuthClient {
    cfg;
    creds;
    cacheKey;
    constructor(cfg) {
        this.cfg = cfg;
        this.creds = new CredentialsService(cfg.orgSecretKey);
        this.cacheKey = `oauth:${cfg.clientId}`;
    }
    async fetchToken() {
        // try existing
        const cached = await this.creds.getToken(this.cacheKey);
        if (cached) {
            return { accessToken: cached, expiresAt: 0 };
        }
        // decrypt secret
        const secret = this.creds.decryptSecret(this.cfg.clientSecret);
        const res = await axios.post(this.cfg.tokenUrl, qs.stringify({
            grant_type: 'client_credentials',
            client_id: this.cfg.clientId,
            client_secret: secret,
            scope: this.cfg.scopes.join(' '),
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const token = res.data.access_token;
        const expiresIn = res.data.expires_in;
        // cache 60s before expiry
        await this.creds.cacheToken(this.cacheKey, token, expiresIn - 60);
        return { accessToken: token, expiresAt: Date.now() + expiresIn * 1000 };
    }
}
