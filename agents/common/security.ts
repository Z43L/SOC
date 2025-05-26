/**
 * Módulo de seguridad para los agentes
 */

import * as crypto from 'crypto';

export interface SignedMessage<T> {
  payload: T;
  signature: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Crea un par de claves RSA para firma digital
 */
export async function createKeyPair(): Promise<KeyPair> {
  return new Promise((resolve, reject) => {
    try {
      // Generar par de claves RSA de 2048 bits
      crypto.generateKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
          return;
        }
        
        resolve({ publicKey, privateKey });
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Crea una firma digital para un mensaje
 */
export async function createSignature(message: string, privateKey: string): Promise<string> {
  try {
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    sign.end();
    
    return sign.sign(privateKey, 'base64');
  } catch (error) {
    throw new Error(`Error creating signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verifica la firma digital de un mensaje
 */
export async function verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(message);
    verify.end();
    
    return verify.verify(publicKey, Buffer.from(signature, 'base64'));
  } catch (error) {
    console.error(`Error verifying signature:`, error);
    return false;
  }
}

/**
 * Implementación JWT para una autenticación alternativa o adicional
 */
export function createJWT(payload: any, secret: string, expiresIn: number = 3600): string {
  try {
    // En una implementación real, usaríamos una biblioteca como jsonwebtoken
    // Este es solo un ejemplo simulado
    
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };
    
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      exp: now + expiresIn
    };
    
    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64');
    const base64Payload = Buffer.from(JSON.stringify(claims)).toString('base64');
    
    const data = `${base64Header}.${base64Payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64');
    
    return `${data}.${signature}`;
  } catch (error) {
    throw new Error(`Error creating JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verifica un JWT
 */
export function verifyJWT(token: string, secret: string): any {
  try {
    // En una implementación real, usaríamos una biblioteca como jsonwebtoken
    // Este es solo un ejemplo simulado
    
    const [base64Header, base64Payload, signature] = token.split('.');
    
    const data = `${base64Header}.${base64Payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64');
    
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8'));
    
    // Verificar expiración
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (error) {
    throw new Error(`Error verifying JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}