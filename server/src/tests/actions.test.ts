import { describe, it, expect, beforeEach } from '@jest/globals';
import { actionRegistry } from '../services/actions/ActionRegistry';
import { ActionContext } from '../services/actions/ActionInterface';

describe('SOAR Action System', () => {
  let mockContext: ActionContext;

  beforeEach(() => {
    mockContext = {
      playbookId: 'test-playbook-1',
      executionId: 'test-execution-1',
      organizationId: 'test-org-1',
      userId: 'test-user-1',
      data: {
        alertId: 'alert-123',
        severity: 'high',
        sourceIp: '192.168.1.100',
        hostname: 'test-host',
        description: 'Test security incident',
      },
      logger: jest.fn(),
    };
  });

  describe('Action Registry', () => {
    it('should have all core actions registered', () => {
      const actionNames = actionRegistry.getActionNames();
      
      expect(actionNames).toContain('notify_email');
      expect(actionNames).toContain('notify_slack');
      expect(actionNames).toContain('notify_teams');
      expect(actionNames).toContain('notify_webhook');
      expect(actionNames).toContain('notify_push');
      expect(actionNames).toContain('block_ip');
      expect(actionNames).toContain('isolate_host');
      expect(actionNames).toContain('create_jira_ticket');
    });

    it('should provide action schemas', () => {
      const emailAction = actionRegistry.getActionSchema('notify_email');
      
      expect(emailAction).toHaveProperty('name', 'notify_email');
      expect(emailAction).toHaveProperty('description');
      expect(emailAction).toHaveProperty('category', 'notification');
      expect(emailAction).toHaveProperty('schema');
    });

    it('should categorize actions correctly', () => {
      const notificationActions = actionRegistry.getActionsByCategory('notification');
      const remediationActions = actionRegistry.getActionsByCategory('remediation');
      
      expect(notificationActions.length).toBeGreaterThan(0);
      expect(remediationActions.length).toBeGreaterThan(0);
      
      const notificationNames = notificationActions.map(a => a.name);
      expect(notificationNames).toContain('notify_email');
      expect(notificationNames).toContain('notify_slack');
      expect(notificationNames).toContain('notify_teams');
      expect(notificationNames).toContain('notify_webhook');
      expect(notificationNames).toContain('notify_push');
      expect(notificationNames).toContain('create_jira_ticket');
    });
  });

  describe('Email Notification Action', () => {
    it('should execute successfully with valid parameters', async () => {
      const params = {
        to: 'admin@example.com',
        subject: 'Security Alert: {{severity}} priority incident',
        body: 'An incident has been detected on host {{hostname}} with IP {{sourceIp}}.',
        priority: 'high',
      };

      const result = await actionRegistry.executeAction('notify_email', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Email sent successfully');
      expect(result.data).toHaveProperty('emailId');
      expect(result.data).toHaveProperty('recipients');
      expect(result.data.recipients).toContain('admin@example.com');
    });

    it('should fail with invalid email address', async () => {
      const params = {
        to: 'invalid-email',
        subject: 'Test',
        body: 'Test message',
      };

      await expect(
        actionRegistry.executeAction('notify_email', params, mockContext)
      ).rejects.toThrow('Invalid parameters');
    });

    it('should process template variables correctly', async () => {
      const params = {
        to: 'admin@example.com',
        subject: 'Alert: {{severity}}',
        body: 'Host: {{hostname}}, IP: {{sourceIp}}',
      };

      const result = await actionRegistry.executeAction('notify_email', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(mockContext.logger).toHaveBeenCalledWith(
        expect.stringContaining('Sending email to admin@example.com')
      );
    });
  });

  describe('Slack Notification Action', () => {
    it('should execute successfully with valid parameters', async () => {
      const params = {
        channel: '#security-alerts',
        message: '🚨 Security incident detected on {{hostname}}',
        attachments: [{
          color: 'danger',
          title: 'Incident Details',
          fields: [{
            title: 'Severity',
            value: '{{severity}}',
            short: true,
          }],
        }],
      };

      const result = await actionRegistry.executeAction('notify_slack', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Slack message sent successfully');
      expect(result.data).toHaveProperty('messageTs');
      expect(result.data).toHaveProperty('channel', '#security-alerts');
    });
  });

  describe('IP Blocking Action', () => {
    it('should execute successfully with valid IP', async () => {
      const params = {
        ipAddress: '192.168.1.100',
        reason: 'Suspicious activity detected',
        firewallType: 'iptables',
        duration: 60, // 1 hour
      };

      const result = await actionRegistry.executeAction('block_ip', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('IP 192.168.1.100 blocked successfully');
      expect(result.data).toHaveProperty('ruleId');
      expect(result.data).toHaveProperty('blockedIp', '192.168.1.100');
      expect(result.data).toHaveProperty('firewallType', 'iptables');
    });

    it('should fail with invalid IP address', async () => {
      const params = {
        ipAddress: 'invalid-ip',
        reason: 'Test',
      };

      await expect(
        actionRegistry.executeAction('block_ip', params, mockContext)
      ).rejects.toThrow('Invalid parameters');
    });
  });

  describe('Host Isolation Action', () => {
    it('should execute successfully with valid hostname', async () => {
      const params = {
        hostname: 'test-host',
        reason: 'Malware detected',
        edrAgent: 'crowdstrike',
        isolationType: 'network',
        duration: 24, // 24 hours
      };

      const result = await actionRegistry.executeAction('isolate_host', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Host test-host isolated successfully');
      expect(result.data).toHaveProperty('isolationId');
      expect(result.data).toHaveProperty('hostIdentifier', 'test-host');
      expect(result.data).toHaveProperty('edrAgent', 'crowdstrike');
    });

    it('should require at least one identifier', async () => {
      const params = {
        reason: 'Test isolation',
      };

      await expect(
        actionRegistry.executeAction('isolate_host', params, mockContext)
      ).rejects.toThrow('Invalid parameters');
    });
  });

  describe('Jira Ticket Creation Action', () => {
    it('should execute successfully with valid parameters', async () => {
      const params = {
        projectKey: 'SEC',
        summary: 'Security incident on {{hostname}}',
        description: 'Incident details: {{description}}',
        issueType: 'Security Incident',
        priority: 'High',
        labels: ['security', 'automated'],
      };

      const result = await actionRegistry.executeAction('create_jira_ticket', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Jira ticket');
      expect(result.message).toContain('created successfully');
      expect(result.data).toHaveProperty('ticketKey');
      expect(result.data).toHaveProperty('ticketUrl');
      expect(result.data.ticketKey).toMatch(/^SEC-\d+$/);
    });
  });

  describe('Teams Notification Action', () => {
    it('should execute successfully with valid parameters', async () => {
      const params = {
        webhookUrl: 'https://outlook.office.com/webhook/test',
        title: 'Security Alert: {{severity}} priority',
        message: 'Incident detected on host {{hostname}}',
        color: 'attention',
        sections: [{
          title: 'Alert Details',
          facts: [
            { name: 'Host', value: '{{hostname}}' },
            { name: 'IP', value: '{{sourceIp}}' }
          ]
        }]
      };

      const result = await actionRegistry.executeAction('notify_teams', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Teams notification sent successfully');
      expect(result.data).toHaveProperty('title');
      expect(result.data).toHaveProperty('message');
    });

    it('should fail without webhook URL', async () => {
      const params = {
        title: 'Test Alert',
        message: 'Test message'
      };

      await expect(
        actionRegistry.executeAction('notify_teams', params, mockContext)
      ).rejects.toThrow('Teams webhook URL not provided');
    });
  });

  describe('Webhook Notification Action', () => {
    it('should execute successfully with valid parameters', async () => {
      const params = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token'
        },
        includeAlertData: true
      };

      const result = await actionRegistry.executeAction('notify_webhook', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Webhook notification sent successfully');
      expect(result.data).toHaveProperty('url');
      expect(result.data).toHaveProperty('method', 'POST');
      expect(result.data).toHaveProperty('statusCode');
    });

    it('should include alert data in payload when requested', async () => {
      const params = {
        url: 'https://api.example.com/webhook',
        includeAlertData: true,
        payload: {
          customField: 'test value'
        }
      };

      const result = await actionRegistry.executeAction('notify_webhook', params, mockContext);
      
      expect(result.success).toBe(true);
    });
  });

  describe('Push Notification Action', () => {
    it('should execute successfully with FCM topic', async () => {
      const params = {
        serverKey: 'test-fcm-key',
        topic: 'security-alerts',
        title: 'Security Alert: {{severity}}',
        body: 'Incident on {{hostname}}',
        priority: 'high'
      };

      const result = await actionRegistry.executeAction('notify_push', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Push notification sent successfully');
      expect(result.data).toHaveProperty('title');
      expect(result.data).toHaveProperty('body');
      expect(result.data).toHaveProperty('messageId');
    });

    it('should execute successfully with device tokens', async () => {
      const params = {
        serverKey: 'test-fcm-key',
        tokens: ['token1', 'token2'],
        title: 'Security Alert',
        body: 'Test alert message'
      };

      const result = await actionRegistry.executeAction('notify_push', params, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data.recipients).toBe(2);
    });

    it('should fail without FCM server key', async () => {
      const params = {
        topic: 'test-topic',
        title: 'Test',
        body: 'Test message'
      };

      await expect(
        actionRegistry.executeAction('notify_push', params, mockContext)
      ).rejects.toThrow('FCM server key not provided');
    });

    it('should fail without topic or tokens', async () => {
      const params = {
        serverKey: 'test-key',
        title: 'Test',
        body: 'Test message'
      };

      await expect(
        actionRegistry.executeAction('notify_push', params, mockContext)
      ).rejects.toThrow('Either device tokens or topic must be provided');
    });
  });
});