import crypto from 'crypto';
import Redis from 'ioredis';
export class CredentialsService {
    redis = new Redis({
        maxRetriesPerRequest: null,
    });
    orgSecretKey;
    constructor(orgSecretKey) {
        this.orgSecretKey = orgSecretKey;
    }
    // Encrypt clientSecret using org-specific key
    encryptSecret(secret) {
        const cipher = crypto.createCipher('aes-256-cbc', this.orgSecretKey);
        let encrypted = cipher.update(secret, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    // Decrypt stored secret
    decryptSecret(encrypted) {
        const decipher = crypto.createDecipher('aes-256-cbc', this.orgSecretKey);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    // Cache token in Redis
    async cacheToken(key, token, expiresInSec) {
        await this.redis.set(key, token, 'EX', expiresInSec);
    }
    async getToken(key) {
        return this.redis.get(key);
    }
}
