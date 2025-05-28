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
});