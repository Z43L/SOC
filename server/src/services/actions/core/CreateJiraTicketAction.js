import { z } from 'zod';
import { BaseAction } from '../BaseAction.js';
// Jira ticket creation action
export class CreateJiraTicketAction extends BaseAction {
    name = 'create_jira_ticket';
    description = 'Create Jira ticket';
    category = 'notification';
    parameterSchema = z.object({
        projectKey: z.string().min(1), // Jira project key (e.g., "SEC", "IT")
        summary: z.string().min(1),
        description: z.string().min(1),
        issueType: z.enum(['Bug', 'Task', 'Story', 'Epic', 'Incident', 'Security Incident']).default('Security Incident'),
        priority: z.enum(['Lowest', 'Low', 'Medium', 'High', 'Highest']).default('Medium'),
        assignee: z.string().optional(), // Jira username or email
        reporter: z.string().optional(), // Jira username or email
        labels: z.array(z.string()).optional(),
        components: z.array(z.string()).optional(),
        customFields: z.record(z.any()).optional(), // Custom field values
        parentIssue: z.string().optional(), // Parent issue key for subtasks
        watchers: z.array(z.string()).optional(), // List of watchers to add
        dueDate: z.string().optional(), // ISO date string
    });
    async execute(params, context) {
        try {
            // Validate parameters
            const validation = this.validateParameters(params);
            if (!validation.success) {
                return this.error(`Invalid parameters: ${validation.error.message}`);
            }
            const validParams = validation.data;
            this.log(context, `Creating Jira ticket in project ${validParams.projectKey}`);
            // Process template variables in summary and description
            const processedSummary = this.processTemplate(validParams.summary, context.data);
            const processedDescription = this.processTemplate(validParams.description, context.data);
            // Create Jira ticket
            const ticketResult = await this.createJiraTicket({
                ...validParams,
                summary: processedSummary,
                description: processedDescription,
            }, context);
            this.log(context, `Jira ticket created successfully: ${ticketResult.key}. ` +
                `URL: ${ticketResult.url}`);
            return this.success(`Jira ticket ${ticketResult.key} created successfully`, {
                ticketKey: ticketResult.key,
                ticketUrl: ticketResult.url,
                ticketId: ticketResult.id,
                project: validParams.projectKey,
                issueType: validParams.issueType,
                priority: validParams.priority,
                summary: processedSummary,
            });
        }
        catch (error) {
            this.log(context, `Failed to create Jira ticket: ${error.message}`, 'error');
            return this.error(`Failed to create Jira ticket: ${error.message}`);
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
    async createJiraTicket(params, context) {
        // Simulate Jira API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        const ticketId = Math.floor(Math.random() * 10000) + 1000;
        const ticketKey = `${params.projectKey}-${ticketId}`;
        // Log ticket creation details
        this.log(context, `Creating Jira ticket with details:`);
        this.log(context, `  - Project: ${params.projectKey}`);
        this.log(context, `  - Issue Type: ${params.issueType}`);
        this.log(context, `  - Priority: ${params.priority}`);
        this.log(context, `  - Summary: ${params.summary}`);
        this.log(context, `  - Description length: ${params.description.length} characters`);
        if (params.assignee) {
            this.log(context, `  - Assignee: ${params.assignee}`);
        }
        if (params.labels?.length) {
            this.log(context, `  - Labels: ${params.labels.join(', ')}`);
        }
        if (params.components?.length) {
            this.log(context, `  - Components: ${params.components.join(', ')}`);
        }
        if (params.customFields) {
            this.log(context, `  - Custom Fields: ${Object.keys(params.customFields).length} fields`);
        }
        // Prepare Jira issue payload
        const issuePayload = {
            fields: {
                project: { key: params.projectKey },
                summary: params.summary,
                description: this.formatDescriptionForJira(params.description, context),
                issuetype: { name: params.issueType },
                priority: { name: params.priority },
                ...(params.assignee && { assignee: { name: params.assignee } }),
                ...(params.reporter && { reporter: { name: params.reporter } }),
                ...(params.labels && { labels: params.labels }),
                ...(params.components && { components: params.components.map((c) => ({ name: c })) }),
                ...(params.dueDate && { duedate: params.dueDate }),
                ...(params.parentIssue && { parent: { key: params.parentIssue } }),
                ...params.customFields,
            }
        };
        // In a real implementation, this would call the Jira REST API
        // POST /rest/api/2/issue
        this.log(context, `Jira API payload prepared for ticket creation`);
        // Simulate Jira ticket creation response
        const jiraBaseUrl = process.env.JIRA_BASE_URL || 'https://your-org.atlassian.net';
        const ticketUrl = `${jiraBaseUrl}/browse/${ticketKey}`;
        // Add watchers if specified
        if (params.watchers?.length) {
            await this.addWatchers(ticketKey, params.watchers, context);
        }
        // Simulate occasional failures for testing
        if (Math.random() < 0.04) { // 4% failure rate
            throw new Error('Jira API authentication failed');
        }
        return {
            key: ticketKey,
            id: ticketId.toString(),
            url: ticketUrl,
        };
    }
    formatDescriptionForJira(description, context) {
        // Format description with Jira markup and add SOC context
        let formattedDescription = description;
        // Add SOC context information
        formattedDescription += '\n\n---\n';
        formattedDescription += '*Created by SOC-Inteligente SOAR Automation*\n';
        formattedDescription += `*Playbook ID:* ${context.playbookId}\n`;
        formattedDescription += `*Execution ID:* ${context.executionId}\n`;
        formattedDescription += `*Organization:* ${context.organizationId}\n`;
        formattedDescription += `*Created:* ${new Date().toISOString()}\n`;
        return formattedDescription;
    }
    async addWatchers(ticketKey, watchers, context) {
        this.log(context, `Adding ${watchers.length} watchers to ticket ${ticketKey}`);
        // Simulate API calls to add watchers
        for (const watcher of watchers) {
            // POST /rest/api/2/issue/{issueIdOrKey}/watchers
            this.log(context, `Adding watcher: ${watcher}`);
            await new Promise(resolve => setTimeout(resolve, 200)); // Simulate API delay
        }
    }
}
