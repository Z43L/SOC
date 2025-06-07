import { z } from 'zod';
import { BaseAction } from '../BaseAction.js';

// Microsoft Teams notification action
export class TeamsNotificationAction extends BaseAction {
    name = 'notify_teams';
    description = 'Send Microsoft Teams notification';
    category = 'notification';
    
    parameterSchema = z.object({
        webhookUrl: z.string().url().optional(), // Teams webhook URL
        title: z.string().min(1),
        message: z.string().min(1),
        color: z.string().optional(), // Card color - 'good', 'warning', 'attention' or hex color
        sections: z.array(z.object({
            title: z.string().optional(),
            facts: z.array(z.object({
                name: z.string(),
                value: z.string()
            })).optional(),
            text: z.string().optional()
        })).optional(),
        potentialActions: z.array(z.object({
            '@type': z.string().default('OpenUri'),
            name: z.string(),
            targets: z.array(z.object({
                os: z.string().default('default'),
                uri: z.string().url()
            }))
        })).optional()
    });

    async execute(params, context) {
        try {
            // Validate parameters
            const validation = this.validateParameters(params);
            if (!validation.success) {
                return this.error(`Invalid parameters: ${validation.error.message}`);
            }

            const validParams = validation.data;
            
            // Use webhook URL from params or context (could come from config)
            const webhookUrl = validParams.webhookUrl || context.config?.teams?.webhookUrl;
            
            if (!webhookUrl) {
                return this.error('Teams webhook URL not provided');
            }

            this.log(context, `Sending Teams notification: ${validParams.title}`);

            // Process template variables in message
            const processedTitle = this.processTemplate(validParams.title, context.data);
            const processedMessage = this.processTemplate(validParams.message, context.data);

            // Prepare Teams message payload
            const teamsPayload = {
                '@type': 'MessageCard',
                '@context': 'https://schema.org/extensions',
                summary: processedTitle,
                themeColor: this.getThemeColor(validParams.color),
                title: processedTitle,
                text: processedMessage,
                sections: this.processSections(validParams.sections, context.data),
                potentialAction: validParams.potentialActions
            };

            // Send Teams message
            const messageResponse = await this.sendTeamsMessage(teamsPayload, webhookUrl, context);
            
            return this.success(`Teams notification sent successfully`, {
                title: processedTitle,
                message: processedMessage,
                webhookUrl: this.maskWebhookUrl(webhookUrl)
            });

        } catch (error) {
            this.log(context, `Failed to send Teams notification: ${error.message}`, 'error');
            return this.error(`Failed to send Teams notification: ${error.message}`);
        }
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

    processSections(sections, data) {
        if (!sections) return undefined;

        return sections.map(section => ({
            title: section.title ? this.processTemplate(section.title, data) : undefined,
            text: section.text ? this.processTemplate(section.text, data) : undefined,
            facts: section.facts?.map(fact => ({
                name: this.processTemplate(fact.name, data),
                value: this.processTemplate(fact.value, data)
            }))
        }));
    }

    getThemeColor(color) {
        // Convert common color names to hex values
        const colorMap = {
            good: '00FF00',
            warning: 'FFA500',
            attention: 'FF0000',
            danger: 'FF0000',
            info: '0078D4'
        };

        if (!color) return '0078D4'; // Default Teams blue
        
        // If it's already a hex color, return as is (remove # if present)
        if (color.startsWith('#')) {
            return color.substring(1);
        }
        
        // Return mapped color or the original color
        return colorMap[color.toLowerCase()] || color;
    }

    async sendTeamsMessage(payload, webhookUrl, context) {
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 300));

            // In a real implementation, this would make the actual HTTP request
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Teams API returned ${response.status}: ${response.statusText}`);
            }

            this.log(context, `Teams message would be sent with title: ${payload.title}`);
            this.log(context, `Message: ${payload.text}`);
            if (payload.sections) {
                this.log(context, `Sections: ${payload.sections.length} items`);
            }

            // Simulate occasional failures for testing (lower rate than others)
            if (Math.random() < 0.02) { // 2% failure rate
                throw new Error('Teams webhook temporarily unavailable');
            }

            return {
                success: true,
                timestamp: Date.now()
            };

        } catch (error) {
            this.log(context, `Teams API error: ${error.message}`, 'error');
            throw error;
        }
    }

    maskWebhookUrl(url) {
        // Mask webhook URL for security in logs
        if (!url) return '';
        
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname.substring(0, 20)}...`;
    }
}