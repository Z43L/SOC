import crypto from 'crypto';
import Redis from 'ioredis';

interface CredentialConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes: string[];
  orgSecretKey: string;
}

export class CredentialsService {
  private redis = new Redis({
    maxRetriesPerRequest: null,
  });
  private orgSecretKey: string;

  constructor(orgSecretKey: string) {
    this.orgSecretKey = orgSecretKey;
  }

  // Encrypt clientSecret using org-specific key
  encryptSecret(secret: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.orgSecretKey);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt stored secret
  decryptSecret(encrypted: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.orgSecretKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Cache token in Redis
  async cacheToken(key: string, token: string, expiresInSec: number) {
    await this.redis.set(key, token, 'EX', expiresInSec);
  }

  async getToken(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
}
