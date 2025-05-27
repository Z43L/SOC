/**
 * Gestor de credenciales seguro para conectores
 * Maneja el cifrado, descifrado y almacenamiento seguro de credenciales
 */

import crypto from 'crypto';
import { log } from '../../vite';

// Algoritmo de cifrado
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Estructura para credenciales cifradas
 */
export interface EncryptedCredentials {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

/**
 * Tipos de credenciales soportadas
 */
export interface ConnectorCredentials {
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  password?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  privateKey?: string;
  certificate?: string;
  customFields?: Record<string, string>;
}

export class CredentialsManager {
  private static instance: CredentialsManager;
  private masterKey: Buffer;

  private constructor() {
    // Obtener o generar clave maestra
    this.masterKey = this.getMasterKey();
  }

  public static getInstance(): CredentialsManager {
    if (!CredentialsManager.instance) {
      CredentialsManager.instance = new CredentialsManager();
    }
    return CredentialsManager.instance;
  }

  /**
   * Obtiene o genera la clave maestra para cifrado
   */
  private getMasterKey(): Buffer {
    const keyFromEnv = process.env.CONNECTOR_ENCRYPTION_KEY;
    
    if (keyFromEnv) {
      // Usar clave del entorno si está disponible
      return crypto.scryptSync(keyFromEnv, 'salt', KEY_LENGTH);
    }
    
    // En producción, esto debería venir de un gestor de secretos
    // Por ahora, usar una clave derivada del entorno
    const fallbackSeed = process.env.DATABASE_URL || 'fallback-seed-not-secure';
    const key = crypto.scryptSync(fallbackSeed, 'connector-salt', KEY_LENGTH);
    
    log('Usando clave de cifrado derivada del entorno. En producción, use CONNECTOR_ENCRYPTION_KEY', 'credentials');
    return key;
  }

  /**
   * Cifra las credenciales de un conector
   */
  public encryptCredentials(credentials: ConnectorCredentials): EncryptedCredentials {
    try {
      // Generar salt e IV únicos
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(IV_LENGTH);
      
      // Derivar clave específica usando el salt
      const key = crypto.scryptSync(this.masterKey, salt, KEY_LENGTH);
      
      // Cifrar las credenciales
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
      const credentialsJson = JSON.stringify(credentials);
      
      let encrypted = cipher.update(credentialsJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt.toString('hex')
      };
    } catch (error) {
      log(`Error cifrando credenciales: ${error}`, 'credentials');
      throw new Error('Error al cifrar credenciales');
    }
  }

  /**
   * Descifra las credenciales de un conector
   */
  public decryptCredentials(encryptedData: EncryptedCredentials): ConnectorCredentials {
    try {
      // Reconstruir buffers desde hex
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      // Derivar la misma clave usando el salt
      const key = crypto.scryptSync(this.masterKey, salt, KEY_LENGTH);
      
      // Descifrar
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted) as ConnectorCredentials;
    } catch (error) {
      log(`Error descifrando credenciales: ${error}`, 'credentials');
      throw new Error('Error al descifrar credenciales');
    }
  }

  /**
   * Valida que las credenciales estén completas para un tipo de conector
   */
  public validateCredentials(credentials: ConnectorCredentials, connectorType: string): boolean {
    switch (connectorType.toLowerCase()) {
      case 'api':
        return !!(credentials.apiKey || credentials.token || 
                 (credentials.username && credentials.password));
      
      case 'oauth':
        return !!(credentials.accessToken || 
                 (credentials.apiKey && credentials.apiSecret));
      
      case 'database':
        return !!(credentials.username && credentials.password);
      
      case 'syslog':
        // Syslog puede no requerir credenciales si es solo UDP
        return true;
      
      case 'agent':
        return !!(credentials.token || credentials.certificate);
      
      default:
        return true; // Para tipos personalizados, asumir válido
    }
  }

  /**
   * Genera un token de autenticación para agentes
   */
  public generateAgentToken(agentId: string, organizationId: number): string {
    const payload = {
      agentId,
      organizationId,
      timestamp: Date.now(),
      type: 'agent-auth'
    };
    
    const token = crypto.createHmac('sha256', this.masterKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    // Combinar payload y token en formato base64
    const tokenData = Buffer.from(JSON.stringify({ ...payload, token })).toString('base64');
    return tokenData;
  }

  /**
   * Valida un token de agente
   */
  public validateAgentToken(tokenData: string): { valid: boolean; agentId?: string; organizationId?: number } {
    try {
      const payload = JSON.parse(Buffer.from(tokenData, 'base64').toString('utf8'));
      
      // Verificar que no haya expirado (24 horas)
      const tokenAge = Date.now() - payload.timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return { valid: false };
      }
      
      // Recalcular token para verificar
      const expectedPayload = {
        agentId: payload.agentId,
        organizationId: payload.organizationId,
        timestamp: payload.timestamp,
        type: payload.type
      };
      
      const expectedToken = crypto.createHmac('sha256', this.masterKey)
        .update(JSON.stringify(expectedPayload))
        .digest('hex');
      
      if (expectedToken !== payload.token) {
        return { valid: false };
      }
      
      return {
        valid: true,
        agentId: payload.agentId,
        organizationId: payload.organizationId
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Limpia credenciales de memoria (para logs seguros)
   */
  public sanitizeForLogging(credentials: ConnectorCredentials): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    Object.keys(credentials).forEach(key => {
      const value = credentials[key as keyof ConnectorCredentials];
      if (typeof value === 'string') {
        if (value.length <= 4) {
          sanitized[key] = '****';
        } else {
          sanitized[key] = value.substring(0, 4) + '****';
        }
      } else if (typeof value === 'object') {
        sanitized[key] = '[OBJECT]';
      }
    });
    
    return sanitized;
  }
}

// Export singleton instance
export const credentialsManager = CredentialsManager.getInstance();
