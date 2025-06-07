import { z } from 'zod';
import { BaseAction } from '../BaseAction.js';
// Slack notification action
export class SlackNotificationAction extends BaseAction {
    name = 'notify_slack';
    description = 'Send Slack notification';
    category = 'notification';
    parameterSchema = z.object({
        channel: z.string().min(1), // Channel name or ID
        message: z.string().min(1),
        username: z.string().optional(), // Bot username
        iconEmoji: z.string().optional(), // e.g. ":warning:"
        iconUrl: z.string().url().optional(), // Custom icon URL
        attachments: z.array(z.object({
            color: z.string().optional(), // "good", "warning", "danger" or hex color
            title: z.string().optional(),
            text: z.string().optional(),
            fields: z.array(z.object({
                title: z.string(),
                value: z.string(),
                short: z.boolean().optional(),
            })).optional(),
        })).optional(),
        blocks: z.array(z.any()).optional(), // Slack Block Kit blocks
        threadTs: z.string().optional(), // Reply in thread
    });
    async execute(params, context) {
        try {
            // Validate parameters
            const validation = this.validateParameters(params);
            if (!validation.success) {
                return this.error(`Invalid parameters: ${validation.error.message}`);
            }
            const validParams = validation.data;
            this.log(context, `Sending Slack message to channel: ${validParams.channel}`);
            // Process template variables in message
            const processedMessage = this.processTemplate(validParams.message, context.data);
            // Prepare Slack message payload
            const slackPayload = {
                channel: validParams.channel,
                text: processedMessage,
                username: validParams.username || 'SOC-Inteligente',
                icon_emoji: validParams.iconEmoji || ':shield:',
                icon_url: validParams.iconUrl,
                attachments: this.processAttachments(validParams.attachments, context.data),
                blocks: validParams.blocks,
                thread_ts: validParams.threadTs,
            };
            // Send Slack message
            const messageResponse = await this.sendSlackMessage(slackPayload, context);
            return this.success(`Slack message sent successfully to ${validParams.channel}`, {
                messageTs: messageResponse.ts,
                channel: validParams.channel,
                messageText: processedMessage,
            });
        }
        catch (error) {
            this.log(context, `Failed to send Slack message: ${error.message}`, 'error');
            return this.error(`Failed to send Slack message: ${error.message}`);
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
    processAttachments(attachments, data) {
        if (!attachments)
            return undefined;
        return attachments.map(attachment => ({
            ...attachment,
            title: attachment.title ? this.processTemplate(attachment.title, data) : undefined,
            text: attachment.text ? this.processTemplate(attachment.text, data) : undefined,
            fields: attachment.fields?.map((field) => ({
                ...field,
                title: this.processTemplate(field.title, data),
                value: this.processTemplate(field.value, data),
            })),
        }));
    }
    async sendSlackMessage(payload, context) {
        // Simulate Slack API call delay
        await new Promise(resolve => setTimeout(resolve, 300));
        // In a real implementation, this would use the Slack Web API
        this.log(context, `Slack message would be sent to: ${payload.channel}`);
        this.log(context, `Message: ${payload.text}`);
        if (payload.attachments) {
            this.log(context, `Attachments: ${payload.attachments.length} items`);
        }
        // Simulate occasional failures for testing
        if (Math.random() < 0.03) { // 3% failure rate
            throw new Error('Slack API rate limit exceeded');
        }
        // Return simulated message timestamp
        return {
            ts: `${Date.now()}.000000`,
        };
    }
}
