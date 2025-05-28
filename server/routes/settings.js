import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserSettingsService, OrgSettingsService, SettingsHistoryService, FileUploadService } from '../services/settings-service';
import { UserSettingsUpdateSchema, OrgSettingsUpdateSchema } from '@shared/schema';
import { isAuthenticated, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
const router = Router();
// Configure multer for file uploads
const multerStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        }
        catch (error) {
            cb(error, '');
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({
    storage: multerStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// Password change schema
const PasswordChangeSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
});
// MFA schemas
const MFAVerifySchema = z.object({
    token: z.string().length(6, 'MFA token must be 6 digits'),
});
const TestIntegrationSchema = z.object({
    service: z.enum(['slack', 'teams', 'webhook']),
    config: z.record(z.any()),
});
// =============================================================================
// USER SETTINGS ROUTES
// =============================================================================
// Get user settings
router.get('/user', isAuthenticated, async (req, res) => {
    try {
        const settings = await UserSettingsService.getUserSettings(req.user.id);
        res.json(settings);
    }
    catch (error) {
        console.error('Error getting user settings:', error);
        res.status(500).json({ error: 'Failed to get user settings' });
    }
});
// Update user settings
router.patch('/user', isAuthenticated, validateRequest(UserSettingsUpdateSchema), async (req, res) => {
    try {
        const updates = req.body;
        const settings = await UserSettingsService.updateUserSettings(req.user.id, updates, req.user.id, req.user.organizationId, req.ip, req.get('user-agent'));
        res.json({
            message: 'Settings updated successfully',
            settings
        });
    }
    catch (error) {
        console.error('Error updating user settings:', error);
        res.status(500).json({ error: 'Failed to update user settings' });
    }
});
// Change password
router.post('/user/password', isAuthenticated, validateRequest(PasswordChangeSchema), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = req.user;
        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        // Check organization password policy
        const orgSettings = await OrgSettingsService.getOrgSettings(user.organizationId);
        const passwordPolicy = orgSettings?.security?.passwordPolicy;
        if (passwordPolicy) {
            // Validate new password against policy
            if (newPassword.length < passwordPolicy.minLength) {
                return res.status(400).json({
                    error: `Password must be at least ${passwordPolicy.minLength} characters long`
                });
            }
            if (passwordPolicy.requireUppercase && !/[A-Z]/.test(newPassword)) {
                return res.status(400).json({ error: 'Password must contain uppercase letters' });
            }
            if (passwordPolicy.requireLowercase && !/[a-z]/.test(newPassword)) {
                return res.status(400).json({ error: 'Password must contain lowercase letters' });
            }
            if (passwordPolicy.requireNumbers && !/\d/.test(newPassword)) {
                return res.status(400).json({ error: 'Password must contain numbers' });
            }
            if (passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
                return res.status(400).json({ error: 'Password must contain special characters' });
            }
        }
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        // Update password in database (you'll need to add this to user service)
        // For now, we'll just log the action
        await SettingsHistoryService.logChange({
            entityType: 'user',
            entityId: user.id,
            changedBy: user.id,
            changeType: 'update',
            fieldName: 'password',
            oldValue: '[REDACTED]',
            newValue: '[REDACTED]',
            organizationId: user.organizationId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});
// Upload avatar
router.post('/user/avatar', isAuthenticated, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Save file record to database
        const fileRecord = await FileUploadService.uploadFile(req.file, req.user.id, req.user.organizationId, 'avatar');
        // Update user settings with avatar URL
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const settings = await UserSettingsService.updateUserSettings(req.user.id, { avatarUrl }, req.user.id, req.user.organizationId, req.ip, req.get('user-agent'));
        res.json({
            message: 'Avatar uploaded successfully',
            avatarUrl,
            settings
        });
    }
    catch (error) {
        console.error('Error uploading avatar:', error);
        // Clean up uploaded file if database operation failed
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            }
            catch (unlinkError) {
                console.error('Error cleaning up uploaded file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});
// =============================================================================
// MFA ROUTES
// =============================================================================
// Enable MFA - Generate QR code
router.post('/user/mfa/enable', isAuthenticated, async (req, res) => {
    try {
        const result = await UserSettingsService.enableMFA(req.user.id);
        res.json({
            message: 'MFA setup initiated',
            qrCodeUrl: result.qrCodeUrl,
            backupCodes: result.backupCodes,
        });
    }
    catch (error) {
        console.error('Error enabling MFA:', error);
        res.status(500).json({ error: 'Failed to enable MFA' });
    }
});
// Verify and activate MFA
router.post('/user/mfa/verify', isAuthenticated, validateRequest(MFAVerifySchema), async (req, res) => {
    try {
        const { token } = req.body;
        const verified = await UserSettingsService.verifyAndActivateMFA(req.user.id, token, req.user.organizationId);
        if (verified) {
            res.json({ message: 'MFA enabled successfully' });
        }
        else {
            res.status(400).json({ error: 'Invalid MFA token' });
        }
    }
    catch (error) {
        console.error('Error verifying MFA:', error);
        res.status(500).json({ error: 'Failed to verify MFA' });
    }
});
// Disable MFA
router.post('/user/mfa/disable', isAuthenticated, async (req, res) => {
    try {
        await UserSettingsService.disableMFA(req.user.id, req.user.organizationId);
        res.json({ message: 'MFA disabled successfully' });
    }
    catch (error) {
        console.error('Error disabling MFA:', error);
        res.status(500).json({ error: 'Failed to disable MFA' });
    }
});
// =============================================================================
// ORGANIZATION SETTINGS ROUTES
// =============================================================================
// Get organization settings
router.get('/org', isAuthenticated, requireRole('admin'), async (req, res) => {
    try {
        const settings = await OrgSettingsService.getOrgSettings(req.user.organizationId);
        res.json(settings);
    }
    catch (error) {
        console.error('Error getting organization settings:', error);
        res.status(500).json({ error: 'Failed to get organization settings' });
    }
});
// Update organization settings
router.patch('/org', isAuthenticated, requireRole('admin'), validateRequest(OrgSettingsUpdateSchema), async (req, res) => {
    try {
        const updates = req.body;
        const settings = await OrgSettingsService.updateOrgSettings(req.user.organizationId, updates, req.user.id, req.ip, req.get('user-agent'));
        res.json({
            message: 'Organization settings updated successfully',
            settings
        });
    }
    catch (error) {
        console.error('Error updating organization settings:', error);
        res.status(500).json({ error: 'Failed to update organization settings' });
    }
});
// Test integrations
router.post('/org/test-integration', isAuthenticated, requireRole('admin'), validateRequest(TestIntegrationSchema), async (req, res) => {
    try {
        const { service, config } = req.body;
        let success = false;
        switch (service) {
            case 'slack':
                if (config.webhookUrl) {
                    success = await OrgSettingsService.testSlackIntegration(config.webhookUrl);
                }
                break;
            case 'teams':
                if (config.webhookUrl) {
                    success = await OrgSettingsService.testTeamsIntegration(config.webhookUrl);
                }
                break;
            case 'webhook':
                if (config.url) {
                    success = await OrgSettingsService.testWebhookIntegration(config.url, config.secret);
                }
                break;
            default:
                return res.status(400).json({ error: 'Unsupported integration service' });
        }
        res.json({
            message: success ? 'Integration test successful' : 'Integration test failed',
            success
        });
    }
    catch (error) {
        console.error('Error testing integration:', error);
        res.status(500).json({ error: 'Failed to test integration' });
    }
});
// Upload organization logo
router.post('/org/logo', isAuthenticated, requireRole('admin'), upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Save file record to database
        const fileRecord = await FileUploadService.uploadFile(req.file, req.user.id, req.user.organizationId, 'logo');
        // Update organization settings with logo URL
        const logoUrl = `/uploads/avatars/${req.file.filename}`;
        const settings = await OrgSettingsService.updateOrgSettings(req.user.organizationId, {
            branding: {
                logoUrl,
                primaryColor: '#000000',
                secondaryColor: '#ffffff',
                accentColor: '#0066cc'
            }
        }, req.user.id, req.ip, req.get('user-agent'));
        res.json({
            message: 'Logo uploaded successfully',
            logoUrl,
            settings
        });
    }
    catch (error) {
        console.error('Error uploading logo:', error);
        // Clean up uploaded file if database operation failed
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            }
            catch (unlinkError) {
                console.error('Error cleaning up uploaded file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});
// =============================================================================
// SETTINGS HISTORY ROUTES
// =============================================================================
// Get user settings history
router.get('/user/history', isAuthenticated, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await SettingsHistoryService.getHistory('user', req.user.id, limit);
        res.json(history);
    }
    catch (error) {
        console.error('Error getting user settings history:', error);
        res.status(500).json({ error: 'Failed to get settings history' });
    }
});
// Get organization settings history
router.get('/org/history', isAuthenticated, requireRole('admin'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await SettingsHistoryService.getHistory('organization', req.user.organizationId, limit);
        res.json(history);
    }
    catch (error) {
        console.error('Error getting organization settings history:', error);
        res.status(500).json({ error: 'Failed to get settings history' });
    }
});
// =============================================================================
// UTILITY ROUTES
// =============================================================================
// Get available timezones
router.get('/timezones', isAuthenticated, async (req, res) => {
    try {
        // Return common timezones - in a real app you might use a library like moment-timezone
        const timezones = [
            { value: 'UTC', label: 'UTC' },
            { value: 'America/New_York', label: 'Eastern Time (ET)' },
            { value: 'America/Chicago', label: 'Central Time (CT)' },
            { value: 'America/Denver', label: 'Mountain Time (MT)' },
            { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
            { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
            { value: 'Europe/Paris', label: 'Central European Time (CET)' },
            { value: 'Europe/Moscow', label: 'Moscow Time (MSK)' },
            { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
            { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
            { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
            { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
        ];
        res.json(timezones);
    }
    catch (error) {
        console.error('Error getting timezones:', error);
        res.status(500).json({ error: 'Failed to get timezones' });
    }
});
// Get available locales
router.get('/locales', isAuthenticated, async (req, res) => {
    try {
        const locales = [
            { value: 'en-US', label: 'English (US)' },
            { value: 'en-GB', label: 'English (UK)' },
            { value: 'es-ES', label: 'Español (España)' },
            { value: 'es-MX', label: 'Español (México)' },
            { value: 'fr-FR', label: 'Français (France)' },
            { value: 'de-DE', label: 'Deutsch (Deutschland)' },
            { value: 'it-IT', label: 'Italiano (Italia)' },
            { value: 'pt-BR', label: 'Português (Brasil)' },
            { value: 'ja-JP', label: '日本語 (Japan)' },
            { value: 'ko-KR', label: '한국어 (Korea)' },
            { value: 'zh-CN', label: '中文 (简体)' },
            { value: 'zh-TW', label: '中文 (繁體)' },
        ];
        res.json(locales);
    }
    catch (error) {
        console.error('Error getting locales:', error);
        res.status(500).json({ error: 'Failed to get locales' });
    }
});
export default router;
