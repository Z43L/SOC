/**
 * Módulo para la gestión de autenticación JWT para agentes
 */
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { log } from '../../vite';
// Clave secreta para firmar los tokens (en producción debería ser una clave fuerte y almacenada de forma segura)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = '30d'; // Los tokens expiran en 30 días
/**
 * Middleware to verify agent JWT tokens
 */
export function verifyAgentJwt(req, res, next) {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                message: 'Authentication token required'
            });
            return;
        }
        // Extract token
        const token = authHeader.split(' ')[1];
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        // Attach user info to request
        req.user = decoded;
        // Continue
        next();
    }
    catch (error) {
        log(`JWT verification error: ${error}`, 'agent-jwt');
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
}
/**
 * Genera un token JWT para un agente
 */
export function generateAgentToken(agentId, userId, organizationId) {
    return jwt.sign({
        agentId,
        userId,
        organizationId,
        type: 'agent'
    }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
}
/**
 * Verifica un token JWT de agente
 */
export function verifyAgentToken(token, verifySignature = true) {
    if (!verifySignature) {
        const decoded = jwt.decode(token);
        if (!decoded)
            return null;
        return {
            agentId: decoded.agentId,
            userId: decoded.userId,
            organizationId: decoded.organizationId
        };
    }
    try {
        // Verificación solo con JWT_SECRET (sin rotación de claves)
        let decoded = null;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        }
        catch (error) {
            console.error('Error verifying JWT:', error);
            return null;
        }
        if (!decoded) {
            return null;
        }
        // Verificar que es un token de agente
        if (decoded.type !== 'agent' || !decoded.agentId || !decoded.userId || !decoded.organizationId) {
            return null;
        }
        return {
            agentId: decoded.agentId,
            userId: decoded.userId,
            organizationId: decoded.organizationId
        };
    }
    catch (error) {
        console.error('Error verifying agent token:', error);
        return null;
    }
}
/**
 * Genera un código de registro para un agente
 * Este código es de un solo uso y se utiliza para el registro inicial del agente
 */
export function generateRegistrationKey(userId) {
    // Crear un código único de 16 caracteres
    const randomPart = crypto.randomBytes(8).toString('hex');
    const userPart = userId.toString().padStart(6, '0');
    const timestamp = Math.floor(Date.now() / 1000).toString(36);
    // Combinar las partes
    const key = `${userPart}-${randomPart}-${timestamp}`;
    // Añadir un checksum
    const checksum = crypto.createHash('md5').update(key + JWT_SECRET).digest('hex').substring(0, 4);
    return `${key}-${checksum}`;
}
/**
 * Verifica un código de registro y extrae el ID de usuario
 */
export function verifyRegistrationKey(key) {
    try {
        // Separar las partes del código
        const parts = key.split('-');
        if (parts.length !== 4) {
            return { userId: 0, valid: false };
        }
        const [userPart, randomPart, timestamp, checksum] = parts;
        // Verificar checksum
        const keyWithoutChecksum = `${userPart}-${randomPart}-${timestamp}`;
        const calculatedChecksum = crypto.createHash('md5').update(keyWithoutChecksum + JWT_SECRET).digest('hex').substring(0, 4);
        if (calculatedChecksum !== checksum) {
            return { userId: 0, valid: false };
        }
        // Extraer ID de usuario
        const userId = parseInt(userPart, 10);
        // Verificar validez del timestamp (códigos válidos por 24 horas)
        const keyTimestamp = parseInt(timestamp, 36);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const isExpired = (currentTimestamp - keyTimestamp) > (24 * 60 * 60); // 24 horas
        return {
            userId,
            valid: !isExpired && !isNaN(userId)
        };
    }
    catch (error) {
        return { userId: 0, valid: false };
    }
}
