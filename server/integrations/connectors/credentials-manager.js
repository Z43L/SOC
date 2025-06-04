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
export class CredentialsManager {
    static instance;
    masterKey;
    constructor() {
        // Obtener o generar clave maestra
        this.masterKey = this.getMasterKey();
    }
    static getInstance() {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }
    /**
     * Obtiene o genera la clave maestra para cifrado
     */
    getMasterKey() {
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
    encryptCredentials(credentials) {
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
        }
        catch (error) {
            log(`Error cifrando credenciales: ${error}`, 'credentials');
            throw new Error('Error al cifrar credenciales');
        }
    }
    /**
     * Descifra las credenciales de un conector
     */
    decryptCredentials(encryptedData) {
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
            return JSON.parse(decrypted);
        }
        catch (error) {
            log(`Error descifrando credenciales: ${error}`, 'credentials');
            throw new Error('Error al descifrar credenciales');
        }
    }
    /**
     * Valida que las credenciales estén completas para un tipo de conector
     */
    validateCredentials(credentials, connectorType) {
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
     * Obtiene las credenciales de un conector específico
     * Si no están en caché, las obtiene de la base de datos y las descifra
     */
    getCredentials(connectorId) {
        try {
            // Esta implementación es un placeholder. En una implementación real,
            // obtendría las credenciales cifradas de la base de datos y las descifraría.
            // En producción, usar algo como:
            // const encryptedCreds = await db.query('SELECT encrypted_credentials FROM connectors WHERE id = ?', [connectorId]);
            // return this.decryptCredentials(encryptedCreds);
            // Por ahora, devolver un objeto vacío para cumplir con la interfaz
            return {};
        }
        catch (error) {
            log(`Error obteniendo credenciales para el conector ${connectorId}: ${error}`, 'credentials');
            return {};
        }
    }
    /**
     * Genera un token de autenticación para agentes
     */
    generateAgentToken(agentId, organizationId) {
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
    validateAgentToken(tokenData) {
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
        }
        catch (error) {
            return { valid: false };
        }
    }
    /**
     * Limpia credenciales de memoria (para logs seguros)
     */
    sanitizeForLogging(credentials) {
        const sanitized = {};
        Object.keys(credentials).forEach(key => {
            const value = credentials[key];
            if (typeof value === 'string') {
                if (value.length <= 4) {
                    sanitized[key] = '****';
                }
                else {
                    sanitized[key] = value.substring(0, 4) + '****';
                }
            }
            else if (typeof value === 'object') {
                sanitized[key] = '[OBJECT]';
            }
        });
        return sanitized;
    }
}
// Export singleton instance
export const credentialsManager = CredentialsManager.getInstance();
