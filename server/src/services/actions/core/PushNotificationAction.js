import { z } from 'zod';
import { BaseAction } from '../BaseAction.js';

// Push notification action using Firebase Cloud Messaging (FCM)
export class PushNotificationAction extends BaseAction {
    name = 'notify_push';
    description = 'Send push notification via Firebase Cloud Messaging';
    category = 'notification';
    
    parameterSchema = z.object({
        serverKey: z.string().optional(), // FCM server key
        tokens: z.array(z.string()).optional(), // Device tokens
        topic: z.string().optional(), // FCM topic
        title: z.string().min(1),
        body: z.string().min(1),
        icon: z.string().optional(), // Icon URL or default icon name
        badge: z.number().optional(), // Badge count for iOS
        sound: z.string().optional(), // Sound to play
        priority: z.enum(['normal', 'high']).default('high'),
        data: z.record(z.any()).optional(), // Custom data payload
        clickAction: z.string().optional(), // Action when notification is clicked
        tag: z.string().optional(), // Notification tag for grouping
        ttl: z.number().min(0).max(2419200).default(86400) // Time to live in seconds (default 24h)
    });

    async execute(params, context) {
        try {
            // Validate parameters
            const validation = this.validateParameters(params);
            if (!validation.success) {
                return this.error(`Invalid parameters: ${validation.error.message}`);
            }

            const validParams = validation.data;
            
            // Get FCM server key from params or context
            const serverKey = validParams.serverKey || 
                              context.config?.push?.fcmServerKey || 
                              process.env.FCM_SERVER_KEY;
            
            if (!serverKey) {
                return this.error('FCM server key not provided');
            }

            // Must have either tokens or topic
            if (!validParams.tokens && !validParams.topic) {
                return this.error('Either device tokens or topic must be provided');
            }

            this.log(context, `Sending push notification: ${validParams.title}`);

            // Process template variables in title and body
            const processedTitle = this.processTemplate(validParams.title, context.data);
            const processedBody = this.processTemplate(validParams.body, context.data);

            // Prepare FCM payload
            const fcmPayload = this.prepareFCMPayload(validParams, processedTitle, processedBody, context);

            // Send push notification
            const response = await this.sendPushNotification(fcmPayload, serverKey, context);
            
            return this.success(`Push notification sent successfully`, {
                title: processedTitle,
                body: processedBody,
                recipients: validParams.tokens ? validParams.tokens.length : `topic: ${validParams.topic}`,
                messageId: response.messageId || response.name,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.log(context, `Failed to send push notification: ${error.message}`, 'error');
            return this.error(`Failed to send push notification: ${error.message}`);
        }
    }

    prepareFCMPayload(params, title, body, context) {
        const payload = {
            notification: {
                title,
                body,
                icon: params.icon || 'security-alert-icon',
                sound: params.sound || 'default',
                badge: params.badge,
                tag: params.tag || 'security-alert',
                click_action: params.clickAction || 'FCM_PLUGIN_ACTIVITY'
            },
            data: {
                alertId: context.data.alertId || '',
                severity: context.data.severity || '',
                source: context.data.source || '',
                timestamp: new Date().toISOString(),
                ...(params.data || {})
            },
            android: {
                priority: params.priority,
                ttl: `${params.ttl}s`,
                notification: {
                    icon: params.icon || 'security_alert',
                    color: this.getSeverityColor(context.data.severity),
                    sound: params.sound || 'default',
                    tag: params.tag || 'security-alert'
                }
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title,
                            body
                        },
                        badge: params.badge,
                        sound: params.sound || 'default'
                    }
                }
            },
            webpush: {
                headers: {
                    TTL: params.ttl.toString()
                },
                notification: {
                    title,
                    body,
                    icon: params.icon || '/icons/security-alert.png',
                    badge: '/icons/badge.png',
                    tag: params.tag || 'security-alert',
                    requireInteraction: params.priority === 'high'
                }
            }
        };

        // Add targeting
        if (params.tokens) {
            payload.registration_ids = params.tokens;
        } else if (params.topic) {
            payload.to = `/topics/${params.topic}`;
        }

        return payload;
    }

    getSeverityColor(severity) {
        const colorMap = {
            low: '#4CAF50',      // Green
            medium: '#FF9800',   // Orange
            high: '#F44336',     // Red
            critical: '#9C27B0'  // Purple
        };
        
        return colorMap[severity] || '#2196F3'; // Default blue
    }

    processTemplate(template, data) {
        // Simple template processing - replace {{variable}} with actual values
        let processed = template;
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            processed = processed.replace(regex, String(value));
        }
        return processed;
    }

    async sendPushNotification(payload, serverKey, context) {
        try {
            // FCM endpoint
            const fcmUrl = 'https://fcm.googleapis.com/fcm/send';

            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 400));

            this.log(context, `Push notification would be sent to FCM`);
            this.log(context, `Title: ${payload.notification.title}`);
            this.log(context, `Body: ${payload.notification.body}`);
            
            if (payload.registration_ids) {
                this.log(context, `Target: ${payload.registration_ids.length} device tokens`);
            } else if (payload.to) {
                this.log(context, `Target: ${payload.to}`);
            }

            // In a real implementation, this would make the actual HTTP request to FCM
            const response = await fetch(fcmUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `key=${serverKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`FCM API returned ${response.status}: ${response.statusText}`);
            }

            // Simulate occasional failures for testing
            if (Math.random() < 0.03) { // 3% failure rate
                throw new Error('FCM service temporarily unavailable');
            }

            // Simulate FCM response
            return {
                messageId: `msg_${Date.now()}`,
                success: 1,
                failure: 0,
                canonical_ids: 0
            };

        } catch (error) {
            this.log(context, `FCM API error: ${error.message}`, 'error');
            throw error;
        }
    }
}