import { z } from 'zod';
import { BaseAction } from '../BaseAction.js';

// Webhook notification action for sending outgoing webhooks
export class WebhookNotificationAction extends BaseAction {
    name = 'notify_webhook';
    description = 'Send webhook notification to external endpoints';
    category = 'notification';
    
    parameterSchema = z.object({
        url: z.string().url(),
        method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
        headers: z.record(z.string()).optional(),
        payload: z.record(z.any()).optional(), // Custom payload structure
        timeout: z.number().min(1000).max(30000).default(10000), // Timeout in milliseconds
        retries: z.number().min(0).max(5).default(3),
        retryDelay: z.number().min(100).max(10000).default(1000), // Delay between retries in ms
        includeAlertData: z.boolean().default(true), // Whether to include alert context data
        customTemplate: z.string().optional() // Custom template for payload
    });

    async execute(params, context) {
        try {
            // Validate parameters
            const validation = this.validateParameters(params);
            if (!validation.success) {
                return this.error(`Invalid parameters: ${validation.error.message}`);
            }

            const validParams = validation.data;
            
            this.log(context, `Sending webhook notification to: ${this.maskUrl(validParams.url)}`);

            // Prepare webhook payload
            const webhookPayload = this.preparePayload(validParams, context);

            // Send webhook with retries
            const response = await this.sendWebhookWithRetries(
                validParams.url,
                validParams.method,
                webhookPayload,
                validParams.headers || {},
                validParams.timeout,
                validParams.retries,
                validParams.retryDelay,
                context
            );

            return this.success(`Webhook notification sent successfully to ${this.maskUrl(validParams.url)}`, {
                url: this.maskUrl(validParams.url),
                method: validParams.method,
                statusCode: response.status,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.log(context, `Failed to send webhook notification: ${error.message}`, 'error');
            return this.error(`Failed to send webhook notification: ${error.message}`);
        }
    }

    preparePayload(params, context) {
        let payload = {};

        // Include alert data if requested
        if (params.includeAlertData) {
            payload = {
                alert: {
                    id: context.data.alertId || 'unknown',
                    severity: context.data.severity || 'unknown',
                    title: context.data.title || 'Security Alert',
                    description: context.data.description || '',
                    source: context.data.source || 'SOC System',
                    sourceIp: context.data.sourceIp || null,
                    hostname: context.data.hostname || null,
                    timestamp: new Date().toISOString(),
                    organizationId: context.organizationId
                },
                system: {
                    source: 'SOC-Inteligente',
                    version: '1.0.0',
                    timestamp: new Date().toISOString()
                }
            };
        }

        // Add custom payload if provided
        if (params.payload) {
            payload = {
                ...payload,
                ...this.processTemplateObject(params.payload, context.data)
            };
        }

        // Apply custom template if provided
        if (params.customTemplate) {
            try {
                const templateFunction = new Function('data', 'alert', params.customTemplate);
                const customPayload = templateFunction(context.data, payload.alert);
                payload = { ...payload, ...customPayload };
            } catch (error) {
                this.log(context, `Error applying custom template: ${error.message}`, 'warning');
            }
        }

        return payload;
    }

    processTemplateObject(obj, data) {
        if (typeof obj === 'string') {
            return this.processTemplate(obj, data);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.processTemplateObject(item, data));
        } else if (obj && typeof obj === 'object') {
            const processed = {};
            for (const [key, value] of Object.entries(obj)) {
                processed[key] = this.processTemplateObject(value, data);
            }
            return processed;
        }
        return obj;
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

    async sendWebhookWithRetries(url, method, payload, headers, timeout, maxRetries, retryDelay, context) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    this.log(context, `Webhook retry attempt ${attempt}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                }

                const response = await this.sendWebhook(url, method, payload, headers, timeout, context);
                
                // Consider 2xx and 3xx as success
                if (response.status >= 200 && response.status < 400) {
                    this.log(context, `Webhook sent successfully with status ${response.status}`);
                    return response;
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            } catch (error) {
                lastError = error;
                this.log(context, `Webhook attempt ${attempt + 1} failed: ${error.message}`, 'warning');
                
                // Don't retry on certain HTTP status codes
                if (error.message.includes('HTTP 4')) {
                    this.log(context, 'Client error detected, not retrying', 'warning');
                    break;
                }
            }
        }

        throw lastError || new Error('Webhook failed after all retry attempts');
    }

    async sendWebhook(url, method, payload, headers, timeout, context) {
        // Default headers
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'SOC-Inteligente/1.0'
        };

        // Merge headers
        const finalHeaders = { ...defaultHeaders, ...headers };

        this.log(context, `Sending ${method} request to webhook`);
        this.log(context, `Payload size: ${JSON.stringify(payload).length} bytes`);

        // Simulate webhook sending (replace with actual HTTP request in production)
        const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body: JSON.stringify(payload),
            timeout
        });

        // Simulate occasional failures for testing
        if (Math.random() < 0.04) { // 4% failure rate
            throw new Error('Webhook endpoint temporarily unavailable');
        }

        return response;
    }

    maskUrl(url) {
        // Mask URL for security in logs
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname.substring(0, 20)}...`;
        } catch {
            return 'invalid-url';
        }
    }
}