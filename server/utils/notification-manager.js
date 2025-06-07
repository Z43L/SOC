/**
 * Enhanced notification manager for critical events
 * Orchestrates multiple notification types based on configuration
 */

import { log } from '../vite.js';
import { actionRegistry } from '../src/services/actions/ActionRegistry.js';
import { loadNotificationConfig, shouldNotify, getEnabledNotificationTypes } from './notification-config.js';

export class NotificationManager {
    constructor() {
        this.config = loadNotificationConfig();
        this.notificationHistory = new Map(); // Rate limiting tracking
    }

    /**
     * Send notifications for a critical event
     * @param {Object} alert - The alert object
     * @param {Object} options - Additional options
     */
    async notifyCriticalEvent(alert, options = {}) {
        try {
            // Check if notification should be sent based on severity
            if (!shouldNotify(alert.severity, this.config)) {
                log(`Skipping notification for ${alert.severity} severity alert (below threshold)`, 'notification-manager');
                return { success: true, skipped: true, reason: 'Below severity threshold' };
            }

            // Check rate limiting
            if (this.isRateLimited()) {
                log('Rate limit exceeded for notifications', 'notification-manager');
                return { success: false, error: 'Rate limit exceeded' };
            }

            // Get enabled notification types
            const enabledTypes = getEnabledNotificationTypes(this.config);
            
            if (enabledTypes.length === 0) {
                log('No notification types enabled', 'notification-manager');
                return { success: true, skipped: true, reason: 'No notification types enabled' };
            }

            log(`[CRITICAL EVENT] ${alert.title} - Severity: ${alert.severity} - Source: ${alert.source}`, 'notification-manager');
            
            // Prepare notification context
            const context = this.createNotificationContext(alert, options);
            
            // Send notifications concurrently
            const notificationPromises = [];
            
            for (const type of enabledTypes) {
                switch (type) {
                    case 'email':
                        notificationPromises.push(this.sendEmailNotification(alert, context));
                        break;
                    case 'slack':
                        notificationPromises.push(this.sendSlackNotification(alert, context));
                        break;
                    case 'teams':
                        notificationPromises.push(this.sendTeamsNotification(alert, context));
                        break;
                    case 'webhooks':
                        notificationPromises.push(this.sendWebhookNotifications(alert, context));
                        break;
                    case 'push':
                        notificationPromises.push(this.sendPushNotification(alert, context));
                        break;
                }
            }

            // Wait for all notifications to complete
            const results = await Promise.allSettled(notificationPromises);
            
            // Process results
            const summary = this.processNotificationResults(results, enabledTypes);
            
            // Update rate limiting tracking
            this.updateRateLimiting();
            
            // Log audit trail
            log(`[AUDIT] Critical event notification summary - Sent: ${summary.successful}, Failed: ${summary.failed}`, 'notification-manager');
            
            return {
                success: summary.successful > 0,
                summary,
                enabledTypes,
                alertId: alert.id
            };

        } catch (error) {
            log(`Error in notification manager: ${error instanceof Error ? error.message : 'Unknown error'}`, 'notification-manager');
            return { success: false, error: error.message };
        }
    }

    createNotificationContext(alert, options = {}) {
        return {
            playbookId: options.playbookId || 'critical-event-notification',
            executionId: `notification-${Date.now()}`,
            organizationId: options.organizationId || 'default',
            userId: options.userId || 'system',
            data: {
                alertId: alert.id,
                title: alert.title,
                severity: alert.severity,
                source: alert.source,
                description: alert.description || '',
                sourceIp: alert.sourceIp,
                hostname: alert.hostname,
                timestamp: alert.timestamp || new Date().toISOString(),
                ...alert.metadata
            },
            config: this.config,
            logger: (message, level = 'info') => log(`[${level.toUpperCase()}] ${message}`, 'notification-manager')
        };
    }

    async sendEmailNotification(alert, context) {
        try {
            const params = {
                to: this.config.email.adminEmails,
                subject: `🚨 Security Alert: ${alert.severity.toUpperCase()} - ${alert.title}`,
                body: this.generateEmailBody(alert),
                priority: this.getSeverityPriority(alert.severity)
            };

            return await actionRegistry.executeAction('notify_email', params, context);
        } catch (error) {
            log(`Email notification failed: ${error.message}`, 'notification-manager');
            throw error;
        }
    }

    async sendSlackNotification(alert, context) {
        try {
            const params = {
                channel: this.config.slack.channel,
                message: `🚨 *Security Alert*: ${alert.title}`,
                attachments: [{
                    color: this.getSeverityColor(alert.severity),
                    title: `${alert.severity.toUpperCase()} Priority Incident`,
                    fields: [
                        { title: 'Source', value: alert.source, short: true },
                        { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
                        { title: 'Source IP', value: alert.sourceIp || 'N/A', short: true },
                        { title: 'Hostname', value: alert.hostname || 'N/A', short: true },
                        { title: 'Description', value: alert.description || 'No description available', short: false }
                    ]
                }]
            };

            return await actionRegistry.executeAction('notify_slack', params, context);
        } catch (error) {
            log(`Slack notification failed: ${error.message}`, 'notification-manager');
            throw error;
        }
    }

    async sendTeamsNotification(alert, context) {
        try {
            const params = {
                webhookUrl: this.config.teams.webhookUrl,
                title: `🚨 Security Alert: ${alert.severity.toUpperCase()}`,
                message: alert.title,
                color: this.getSeverityColor(alert.severity),
                sections: [{
                    title: 'Alert Details',
                    facts: [
                        { name: 'Severity', value: alert.severity.toUpperCase() },
                        { name: 'Source', value: alert.source },
                        { name: 'Source IP', value: alert.sourceIp || 'N/A' },
                        { name: 'Hostname', value: alert.hostname || 'N/A' },
                        { name: 'Time', value: new Date(alert.timestamp || Date.now()).toLocaleString() }
                    ],
                    text: alert.description || 'No additional details available'
                }]
            };

            return await actionRegistry.executeAction('notify_teams', params, context);
        } catch (error) {
            log(`Teams notification failed: ${error.message}`, 'notification-manager');
            throw error;
        }
    }

    async sendWebhookNotifications(alert, context) {
        const promises = [];
        
        for (const webhook of this.config.webhooks.endpoints) {
            if (!webhook.enabled) continue;
            
            try {
                const params = {
                    url: webhook.url,
                    method: webhook.method || 'POST',
                    headers: webhook.headers || {},
                    includeAlertData: true,
                    customTemplate: webhook.template
                };

                promises.push(actionRegistry.executeAction('notify_webhook', params, context));
            } catch (error) {
                log(`Webhook ${webhook.name} notification failed: ${error.message}`, 'notification-manager');
                promises.push(Promise.reject(error));
            }
        }

        return Promise.allSettled(promises);
    }

    async sendPushNotification(alert, context) {
        try {
            const params = {
                topic: this.config.push.topics[0] || 'security-alerts',
                title: `Security Alert: ${alert.severity.toUpperCase()}`,
                body: alert.title,
                priority: alert.severity === 'critical' || alert.severity === 'high' ? 'high' : 'normal',
                data: {
                    alertId: alert.id,
                    severity: alert.severity,
                    source: alert.source
                }
            };

            return await actionRegistry.executeAction('notify_push', params, context);
        } catch (error) {
            log(`Push notification failed: ${error.message}`, 'notification-manager');
            throw error;
        }
    }

    generateEmailBody(alert) {
        return `
Security Alert Notification

Alert Details:
- ID: ${alert.id}
- Title: ${alert.title}
- Severity: ${alert.severity.toUpperCase()}
- Source: ${alert.source}
- Time: ${new Date(alert.timestamp || Date.now()).toLocaleString()}

Technical Details:
- Source IP: ${alert.sourceIp || 'N/A'}
- Hostname: ${alert.hostname || 'N/A'}
- Description: ${alert.description || 'No description available'}

This is an automated notification from the SOC-Inteligente system.
Please investigate this alert promptly.

---
SOC-Inteligente Security Operations Center
        `.trim();
    }

    getSeverityColor(severity) {
        const colors = {
            low: 'good',
            medium: 'warning',
            high: 'danger',
            critical: 'danger'
        };
        return colors[severity] || 'warning';
    }

    getSeverityPriority(severity) {
        const priorities = {
            low: 'low',
            medium: 'normal',
            high: 'high',
            critical: 'high'
        };
        return priorities[severity] || 'normal';
    }

    isRateLimited() {
        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000); // 1 hour ago
        
        // Clean old entries
        for (const [timestamp] of this.notificationHistory) {
            if (timestamp < hourAgo) {
                this.notificationHistory.delete(timestamp);
            }
        }

        return this.notificationHistory.size >= this.config.general.maxNotificationsPerHour;
    }

    updateRateLimiting() {
        this.notificationHistory.set(Date.now(), true);
    }

    processNotificationResults(results, enabledTypes) {
        let successful = 0;
        let failed = 0;
        const details = [];

        results.forEach((result, index) => {
            const type = enabledTypes[index];
            
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    successful++;
                    details.push({ type, status: 'success', message: result.value.message });
                } else {
                    failed++;
                    details.push({ type, status: 'failed', error: result.value.error });
                }
            } else {
                failed++;
                details.push({ type, status: 'failed', error: result.reason.message });
            }
        });

        return { successful, failed, total: results.length, details };
    }

    /**
     * Update notification configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return this.config;
    }
}

// Singleton instance
export const notificationManager = new NotificationManager();