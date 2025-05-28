import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { userSettings, orgSettings, settingsHistory, uploadedFiles, users } from '../../shared/schema.js';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
const ENCRYPTION_KEY = process.env.SETTINGS_SECRET || 'default-secret-key-change-in-production';
// Encryption utilities
function encrypt(text) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedText) {
    const algorithm = 'aes-256-gcm';
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipher(algorithm, ENCRYPTION_KEY);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// Settings History Service
export class SettingsHistoryService {
    static async logChange(params) {
        const historyEntry = {
            entityType: params.entityType,
            entityId: params.entityId,
            changedBy: params.changedBy,
            changeType: params.changeType,
            fieldName: params.fieldName,
            oldValue: params.oldValue || null,
            newValue: params.newValue || null,
            ipAddress: params.ipAddress || null,
            userAgent: params.userAgent || null,
            organizationId: params.organizationId,
        };
        await db.insert(settingsHistory).values(historyEntry);
    }
    static async getHistory(entityType, entityId, limit = 50) {
        return await db
            .select({
            id: settingsHistory.id,
            changeType: settingsHistory.changeType,
            fieldName: settingsHistory.fieldName,
            oldValue: settingsHistory.oldValue,
            newValue: settingsHistory.newValue,
            timestamp: settingsHistory.timestamp,
            changedBy: users.name,
            ipAddress: settingsHistory.ipAddress,
        })
            .from(settingsHistory)
            .leftJoin(users, eq(settingsHistory.changedBy, users.id))
            .where(and(eq(settingsHistory.entityType, entityType), eq(settingsHistory.entityId, entityId)))
            .orderBy(settingsHistory.timestamp)
            .limit(limit);
    }
}
// User Settings Service
export class UserSettingsService {
    static async getUserSettings(userId) {
        const settings = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .limit(1);
        if (settings.length === 0) {
            // Create default settings if they don't exist
            const defaultSettings = {
                userId,
                locale: 'en-US',
                timezone: 'UTC',
                mfaEnabled: false,
                notifyChannel: { email: true, slack: false, teams: false },
                theme: 'system',
                dateFormat: 'MM/dd/yyyy',
                timeFormat: '12h',
            };
            await db.insert(userSettings).values(defaultSettings);
            return {
                ...defaultSettings,
                mfaSecret: null,
                avatarUrl: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }
        return settings[0];
    }
    static async updateUserSettings(userId, updates, changedBy, organizationId, ipAddress, userAgent) {
        // Get current settings for audit trail
        const currentSettings = await this.getUserSettings(userId);
        // Update settings
        const updatedSettings = await db
            .update(userSettings)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(userSettings.userId, userId))
            .returning();
        // Log changes
        for (const [field, newValue] of Object.entries(updates)) {
            if (currentSettings && currentSettings[field] !== newValue) {
                await SettingsHistoryService.logChange({
                    entityType: 'user',
                    entityId: userId,
                    changedBy,
                    changeType: 'update',
                    fieldName: field,
                    oldValue: currentSettings[field],
                    newValue,
                    ipAddress,
                    userAgent,
                    organizationId,
                });
            }
        }
        return updatedSettings[0];
    }
    // MFA Methods
    static async enableMFA(userId) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user.length) {
            throw new Error('User not found');
        }
        const secret = speakeasy.generateSecret({
            name: `SOC Platform (${user[0].email})`,
            issuer: 'SOC Platform',
        });
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
        // Store encrypted secret (don't activate yet)
        await db
            .update(userSettings)
            .set({
            mfaSecret: encrypt(secret.base32),
            updatedAt: new Date()
        })
            .where(eq(userSettings.userId, userId));
        return {
            secret: secret.base32,
            qrCodeUrl,
            backupCodes,
        };
    }
    static async verifyAndActivateMFA(userId, token, organizationId) {
        const settings = await this.getUserSettings(userId);
        if (!settings?.mfaSecret) {
            throw new Error('MFA setup not initiated');
        }
        const secret = decrypt(settings.mfaSecret);
        const verified = speakeasy.totp.verify({
            secret,
            token,
            window: 2,
        });
        if (verified) {
            await db
                .update(userSettings)
                .set({
                mfaEnabled: true,
                updatedAt: new Date()
            })
                .where(eq(userSettings.userId, userId));
            await SettingsHistoryService.logChange({
                entityType: 'user',
                entityId: userId,
                changedBy: userId,
                changeType: 'update',
                fieldName: 'mfaEnabled',
                oldValue: false,
                newValue: true,
                organizationId,
            });
        }
        return verified;
    }
    static async disableMFA(userId, organizationId) {
        await db
            .update(userSettings)
            .set({
            mfaEnabled: false,
            mfaSecret: null,
            updatedAt: new Date()
        })
            .where(eq(userSettings.userId, userId));
        await SettingsHistoryService.logChange({
            entityType: 'user',
            entityId: userId,
            changedBy: userId,
            changeType: 'update',
            fieldName: 'mfaEnabled',
            oldValue: true,
            newValue: false,
            organizationId,
        });
    }
    static async verifyMFA(userId, token) {
        const settings = await this.getUserSettings(userId);
        if (!settings?.mfaEnabled || !settings.mfaSecret) {
            return false;
        }
        const secret = decrypt(settings.mfaSecret);
        return speakeasy.totp.verify({
            secret,
            token,
            window: 2,
        });
    }
}
// Organization Settings Service
export class OrgSettingsService {
    static async getOrgSettings(organizationId) {
        const settings = await db
            .select()
            .from(orgSettings)
            .where(eq(orgSettings.organizationId, organizationId))
            .limit(1);
        if (settings.length === 0) {
            // Create default settings if they don't exist
            const defaultSettings = {
                organizationId,
                branding: {
                    primaryColor: '#3b82f6',
                    secondaryColor: '#64748b',
                    accentColor: '#06b6d4',
                },
                security: {
                    passwordPolicy: {
                        minLength: 12,
                        requireUppercase: true,
                        requireLowercase: true,
                        requireNumbers: true,
                        requireSpecialChars: true,
                        preventReuse: 5,
                    },
                    mfaRequired: false,
                    sessionTimeout: 480,
                    maxLoginAttempts: 5,
                    lockoutDuration: 30,
                },
                defaultLocale: 'en-US',
                defaultTimezone: 'UTC',
                integrations: {},
                notifications: {
                    email: { enabled: true },
                    slack: { enabled: false },
                    teams: { enabled: false },
                },
                compliance: {},
                auditRetentionDays: 365,
                ssoEnabled: false,
            };
            await db.insert(orgSettings).values(defaultSettings);
            return {
                ...defaultSettings,
                allowedDomains: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }
        // Decrypt sensitive integration data
        const decryptedSettings = { ...settings[0] };
        if (decryptedSettings.integrations && typeof decryptedSettings.integrations === 'object') {
            decryptedSettings.integrations = this.decryptIntegrations(decryptedSettings.integrations);
        }
        return decryptedSettings;
    }
    static async updateOrgSettings(organizationId, updates, changedBy, ipAddress, userAgent) {
        // Get current settings for audit trail
        const currentSettings = await this.getOrgSettings(organizationId);
        // Encrypt sensitive integration data
        const processedUpdates = { ...updates };
        if (processedUpdates.integrations) {
            processedUpdates.integrations = this.encryptIntegrations(processedUpdates.integrations);
        }
        // Update settings
        const updatedSettings = await db
            .update(orgSettings)
            .set({ ...processedUpdates, updatedAt: new Date() })
            .where(eq(orgSettings.organizationId, organizationId))
            .returning();
        // Log changes
        for (const [field, newValue] of Object.entries(updates)) {
            if (currentSettings && JSON.stringify(currentSettings[field]) !== JSON.stringify(newValue)) {
                await SettingsHistoryService.logChange({
                    entityType: 'organization',
                    entityId: organizationId,
                    changedBy,
                    changeType: 'update',
                    fieldName: field,
                    oldValue: currentSettings[field],
                    newValue,
                    ipAddress,
                    userAgent,
                    organizationId,
                });
            }
        }
        return updatedSettings[0];
    }
    static encryptIntegrations(integrations) {
        const encrypted = { ...integrations };
        // Encrypt sensitive fields
        const sensitiveFields = [
            'slack.webhookUrl',
            'teams.webhookUrl',
            'jira.apiToken',
            'pagerduty.integrationKey',
            'webhook.secret'
        ];
        for (const field of sensitiveFields) {
            const parts = field.split('.');
            if (parts.length === 2) {
                const [service, key] = parts;
                if (encrypted[service] && encrypted[service][key]) {
                    encrypted[service][key] = encrypt(encrypted[service][key]);
                }
            }
        }
        return encrypted;
    }
    static decryptIntegrations(integrations) {
        const decrypted = { ...integrations };
        // Decrypt sensitive fields
        const sensitiveFields = [
            'slack.webhookUrl',
            'teams.webhookUrl',
            'jira.apiToken',
            'pagerduty.integrationKey',
            'webhook.secret'
        ];
        for (const field of sensitiveFields) {
            const parts = field.split('.');
            if (parts.length === 2) {
                const [service, key] = parts;
                if (decrypted[service] && decrypted[service][key]) {
                    try {
                        decrypted[service][key] = decrypt(decrypted[service][key]);
                    }
                    catch (error) {
                        // If decryption fails, it might be plain text (migration case)
                        console.warn(`Failed to decrypt ${field}, keeping as plain text`);
                    }
                }
            }
        }
        return decrypted;
    }
    // Integration testing methods
    static async testSlackIntegration(webhookUrl) {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: '🔧 SOC Platform Settings Test - This is a test notification from your SOC platform.',
                    username: 'SOC Platform',
                }),
            });
            return response.ok;
        }
        catch (error) {
            console.error('Slack test failed:', error);
            return false;
        }
    }
    static async testTeamsIntegration(webhookUrl) {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: '🔧 SOC Platform Settings Test - This is a test notification from your SOC platform.',
                }),
            });
            return response.ok;
        }
        catch (error) {
            console.error('Teams test failed:', error);
            return false;
        }
    }
    static async testWebhookIntegration(url, secret) {
        try {
            const payload = {
                event: 'test',
                message: 'SOC Platform Settings Test',
                timestamp: new Date().toISOString(),
            };
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'SOC-Platform/1.0',
            };
            if (secret) {
                const signature = crypto
                    .createHmac('sha256', secret)
                    .update(JSON.stringify(payload))
                    .digest('hex');
                headers['X-SOC-Signature'] = `sha256=${signature}`;
            }
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });
            return response.ok;
        }
        catch (error) {
            console.error('Webhook test failed:', error);
            return false;
        }
    }
}
// File Upload Service
export class FileUploadService {
    static async uploadFile(file, uploadedBy, organizationId, purpose) {
        const fileRecord = {
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            uploadedBy,
            organizationId,
            purpose,
        };
        const inserted = await db.insert(uploadedFiles).values(fileRecord).returning();
        return inserted[0];
    }
    static async getFilesByPurpose(organizationId, purpose) {
        return await db
            .select()
            .from(uploadedFiles)
            .where(and(eq(uploadedFiles.organizationId, organizationId), eq(uploadedFiles.purpose, purpose)));
    }
    static async deleteFile(fileId, organizationId) {
        const result = await db
            .delete(uploadedFiles)
            .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.organizationId, organizationId)));
        return result.rowCount > 0;
    }
}
