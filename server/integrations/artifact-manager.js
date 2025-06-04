/**
 * Sistema de gestión de artefactos para descargas seguras de agentes
 * 
 * Proporciona URLs temporales y autenticadas para descargar binarios de agentes
 * compilados, con controles de acceso y limpieza automática
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage.js';

/**
 * Clase para gestionar artefactos de construcción
 */
export class ArtifactManager {
    constructor() {
        this.downloadTokens = new Map(); // token -> download info
        this.artifactDir = path.join(process.cwd(), 'dist', 'public', 'downloads');
        this.tokenValidityHours = 24; // Los tokens expiran en 24 horas
        
        // Asegurar que el directorio existe
        this.ensureArtifactDirectory();
        
        // Limpieza automática cada hora
        setInterval(() => this.cleanupExpiredTokens(), 60 * 60 * 1000);
    }

    /**
     * Asegura que el directorio de artefactos existe
     */
    async ensureArtifactDirectory() {
        try {
            if (!fs.existsSync(this.artifactDir)) {
                fs.mkdirSync(this.artifactDir, { recursive: true });
            }
            console.log(`Artifact directory ready: ${this.artifactDir}`);
        } catch (error) {
            console.error('Error creating artifact directory:', error);
        }
    }

    /**
     * Registra un artefacto y genera un token de descarga seguro
     */
    generateSecureDownloadToken(userId, filePath, metadata = {}) {
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            throw new Error(`Artifact file not found: ${filePath}`);
        }

        // Generar token único
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (this.tokenValidityHours * 60 * 60 * 1000));

        // Obtener estadísticas del archivo
        const stats = fs.statSync(filePath);
        
        const downloadInfo = {
            token,
            userId,
            filePath,
            fileName: path.basename(filePath),
            fileSize: stats.size,
            createdAt: new Date(),
            expiresAt,
            downloadCount: 0,
            maxDownloads: 10, // Máximo 10 descargas por token
            metadata: {
                platform: metadata.platform,
                architecture: metadata.architecture,
                buildId: metadata.buildId,
                agentId: metadata.agentId,
                ...metadata
            }
        };

        this.downloadTokens.set(token, downloadInfo);
        
        console.log(`Generated secure download token: ${token} for user ${userId}`);
        return {
            token,
            downloadUrl: `/api/artifacts/download/${token}`,
            expiresAt,
            fileName: downloadInfo.fileName,
            fileSize: downloadInfo.fileSize
        };
    }

    /**
     * Valida un token de descarga y devuelve la información del archivo
     */
    validateDownloadToken(token, userId) {
        const downloadInfo = this.downloadTokens.get(token);
        
        if (!downloadInfo) {
            return { valid: false, reason: 'Token not found' };
        }

        if (downloadInfo.userId !== userId) {
            return { valid: false, reason: 'Unauthorized access' };
        }

        if (new Date() > downloadInfo.expiresAt) {
            this.downloadTokens.delete(token);
            return { valid: false, reason: 'Token expired' };
        }

        if (downloadInfo.downloadCount >= downloadInfo.maxDownloads) {
            return { valid: false, reason: 'Download limit exceeded' };
        }

        if (!fs.existsSync(downloadInfo.filePath)) {
            this.downloadTokens.delete(token);
            return { valid: false, reason: 'File no longer exists' };
        }

        return { valid: true, downloadInfo };
    }

    /**
     * Registra una descarga y actualiza el contador
     */
    recordDownload(token) {
        const downloadInfo = this.downloadTokens.get(token);
        if (downloadInfo) {
            downloadInfo.downloadCount++;
            downloadInfo.lastDownloadAt = new Date();
            
            console.log(`Download recorded for token ${token}: ${downloadInfo.downloadCount}/${downloadInfo.maxDownloads}`);
            
            // Si se alcanzó el límite, remover el token
            if (downloadInfo.downloadCount >= downloadInfo.maxDownloads) {
                console.log(`Token ${token} reached download limit, removing`);
                this.downloadTokens.delete(token);
            }
        }
    }

    /**
     * Obtiene información de descarga sin validar acceso
     */
    getDownloadInfo(token) {
        return this.downloadTokens.get(token);
    }

    /**
     * Lista los tokens de descarga para un usuario
     */
    getUserDownloadTokens(userId) {
        const userTokens = [];
        
        for (const [token, info] of this.downloadTokens.entries()) {
            if (info.userId === userId) {
                userTokens.push({
                    token,
                    fileName: info.fileName,
                    fileSize: info.fileSize,
                    createdAt: info.createdAt,
                    expiresAt: info.expiresAt,
                    downloadCount: info.downloadCount,
                    maxDownloads: info.maxDownloads,
                    metadata: info.metadata
                });
            }
        }

        // Ordenar por fecha de creación (más recientes primero)
        userTokens.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return userTokens;
    }

    /**
     * Revoca un token de descarga
     */
    revokeDownloadToken(token, userId) {
        const downloadInfo = this.downloadTokens.get(token);
        
        if (!downloadInfo) {
            return { success: false, message: 'Token not found' };
        }

        if (downloadInfo.userId !== userId) {
            return { success: false, message: 'Unauthorized' };
        }

        this.downloadTokens.delete(token);
        console.log(`Download token revoked: ${token}`);
        
        return { success: true, message: 'Token revoked successfully' };
    }

    /**
     * Limpia tokens expirados y archivos huérfanos
     */
    cleanupExpiredTokens() {
        let removedTokens = 0;
        const now = new Date();

        for (const [token, info] of this.downloadTokens.entries()) {
            if (now > info.expiresAt) {
                this.downloadTokens.delete(token);
                removedTokens++;
            }
        }

        if (removedTokens > 0) {
            console.log(`Cleaned up ${removedTokens} expired download tokens`);
        }

        // Limpiar archivos huérfanos (archivos que no tienen tokens activos)
        this.cleanupOrphanedFiles();
    }

    /**
     * Limpia archivos que ya no tienen tokens activos asociados
     */
    async cleanupOrphanedFiles() {
        try {
            if (!fs.existsSync(this.artifactDir)) {
                return;
            }

            const files = fs.readdirSync(this.artifactDir);
            const activeFiles = new Set();

            // Recopilar archivos que tienen tokens activos
            for (const info of this.downloadTokens.values()) {
                if (fs.existsSync(info.filePath)) {
                    activeFiles.add(path.basename(info.filePath));
                }
            }

            let removedFiles = 0;
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Remover archivos huérfanos más antiguos de 1 día
            for (const file of files) {
                const filePath = path.join(this.artifactDir, file);
                const stats = fs.statSync(filePath);
                
                if (!activeFiles.has(file) && stats.mtime < oneDayAgo) {
                    try {
                        fs.unlinkSync(filePath);
                        removedFiles++;
                        console.log(`Removed orphaned file: ${file}`);
                        
                        // También remover archivos de firma asociados
                        const signatureFiles = [
                            `${filePath}.sha256`,
                            `${filePath}.sig`,
                            `${filePath}.asc`
                        ];
                        
                        for (const sigFile of signatureFiles) {
                            if (fs.existsSync(sigFile)) {
                                fs.unlinkSync(sigFile);
                                console.log(`Removed signature file: ${path.basename(sigFile)}`);
                            }
                        }
                    } catch (error) {
                        console.error(`Error removing orphaned file ${file}:`, error);
                    }
                }
            }

            if (removedFiles > 0) {
                console.log(`Cleaned up ${removedFiles} orphaned artifact files`);
            }
        } catch (error) {
            console.error('Error during orphaned file cleanup:', error);
        }
    }

    /**
     * Obtiene estadísticas del gestor de artefactos
     */
    getStats() {
        const now = new Date();
        let activeTokens = 0;
        let expiredTokens = 0;
        let totalDownloads = 0;
        let totalFileSize = 0;

        for (const info of this.downloadTokens.values()) {
            if (now <= info.expiresAt) {
                activeTokens++;
            } else {
                expiredTokens++;
            }
            totalDownloads += info.downloadCount;
            totalFileSize += info.fileSize;
        }

        // Obtener información del directorio
        let filesOnDisk = 0;
        let diskUsage = 0;
        
        try {
            if (fs.existsSync(this.artifactDir)) {
                const files = fs.readdirSync(this.artifactDir);
                filesOnDisk = files.length;
                
                for (const file of files) {
                    const filePath = path.join(this.artifactDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        diskUsage += stats.size;
                    } catch (error) {
                        // Ignorar archivos que no se pueden leer
                    }
                }
            }
        } catch (error) {
            console.error('Error getting artifact directory stats:', error);
        }

        return {
            tokens: {
                active: activeTokens,
                expired: expiredTokens,
                total: this.downloadTokens.size
            },
            downloads: {
                total: totalDownloads
            },
            storage: {
                totalFileSize: totalFileSize,
                diskUsage: diskUsage,
                filesOnDisk: filesOnDisk,
                artifactDirectory: this.artifactDir
            }
        };
    }
}

// Instancia singleton del gestor de artefactos
export const artifactManager = new ArtifactManager();