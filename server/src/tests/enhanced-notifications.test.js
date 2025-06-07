import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { notificationManager } from '../../utils/notification-manager.js';
import { notifyCriticalEvent } from '../../utils/notifier.js';
import { actionRegistry } from '../services/actions/ActionRegistry.js';

// Mock the action registry
jest.mock('../services/actions/ActionRegistry.js', () => ({
  actionRegistry: {
    executeAction: jest.fn()
  }
}));

describe('Enhanced Notification System', () => {
  let mockAlert;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAlert = {
      id: 'alert-123',
      title: 'Suspicious Network Activity',
      severity: 'high',
      source: 'Network Monitor',
      description: 'Multiple failed login attempts detected',
      sourceIp: '192.168.1.100',
      hostname: 'web-server-01',
      timestamp: new Date().toISOString(),
      metadata: {
        attempts: 15,
        protocol: 'SSH'
      }
    };

    // Mock successful action execution
    actionRegistry.executeAction.mockResolvedValue({
      success: true,
      message: 'Notification sent successfully'
    });
  });

  describe('Notification Manager', () => {
    it('should send notifications for high severity alerts', async () => {
      const result = await notificationManager.notifyCriticalEvent(mockAlert);
      
      expect(result.success).toBe(true);
      expect(result.alertId).toBe('alert-123');
      expect(result.summary.successful).toBeGreaterThan(0);
    });

    it('should skip notifications for low severity alerts', async () => {
      const lowSeverityAlert = { ...mockAlert, severity: 'low' };
      
      // Update config to only notify for medium and above
      notificationManager.updateConfig({
        general: { minSeverity: 'medium' }
      });
      
      const result = await notificationManager.notifyCriticalEvent(lowSeverityAlert);
      
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('Below severity threshold');
    });

    it('should handle notification failures gracefully', async () => {
      // Mock action failure
      actionRegistry.executeAction.mockRejectedValue(new Error('Service unavailable'));
      
      const result = await notificationManager.notifyCriticalEvent(mockAlert);
      
      // Should still return success if at least one notification succeeds
      expect(result.summary.failed).toBeGreaterThan(0);
    });

    it('should respect rate limiting', async () => {
      // Set very low rate limit
      notificationManager.updateConfig({
        general: { maxNotificationsPerHour: 1 }
      });
      
      // First notification should succeed
      const result1 = await notificationManager.notifyCriticalEvent(mockAlert);
      expect(result1.success).toBe(true);
      
      // Second notification should be rate limited
      const result2 = await notificationManager.notifyCriticalEvent(mockAlert);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Rate limit exceeded');
    });
  });

  describe('Enhanced Notifier', () => {
    it('should use notification manager for critical events', async () => {
      const result = await notifyCriticalEvent(mockAlert);
      
      expect(result.success).toBe(true);
      expect(result.alertId).toBe('alert-123');
    });

    it('should handle errors gracefully', async () => {
      const invalidAlert = null;
      
      const result = await notifyCriticalEvent(invalidAlert);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Individual Notification Actions', () => {
    it('should prepare correct email notification parameters', async () => {
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      const emailCall = actionRegistry.executeAction.mock.calls.find(
        call => call[0] === 'notify_email'
      );
      
      expect(emailCall).toBeDefined();
      expect(emailCall[1].subject).toContain('Security Alert');
      expect(emailCall[1].subject).toContain('HIGH');
      expect(emailCall[1].body).toContain(mockAlert.title);
    });

    it('should prepare correct Slack notification parameters', async () => {
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      const slackCall = actionRegistry.executeAction.mock.calls.find(
        call => call[0] === 'notify_slack'
      );
      
      expect(slackCall).toBeDefined();
      expect(slackCall[1].message).toContain('Security Alert');
      expect(slackCall[1].attachments).toBeDefined();
      expect(slackCall[1].attachments[0].fields).toContainEqual(
        expect.objectContaining({
          title: 'Severity',
          value: 'HIGH'
        })
      );
    });

    it('should prepare correct Teams notification parameters', async () => {
      // Enable Teams notifications
      notificationManager.updateConfig({
        teams: { enabled: true, webhookUrl: 'https://teams.webhook.url' }
      });
      
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      const teamsCall = actionRegistry.executeAction.mock.calls.find(
        call => call[0] === 'notify_teams'
      );
      
      expect(teamsCall).toBeDefined();
      expect(teamsCall[1].title).toContain('Security Alert');
      expect(teamsCall[1].sections).toBeDefined();
    });

    it('should prepare correct webhook notification parameters', async () => {
      // Enable webhook notifications
      notificationManager.updateConfig({
        webhooks: {
          enabled: true,
          endpoints: [{
            name: 'test-webhook',
            url: 'https://api.example.com/webhook',
            enabled: true
          }]
        }
      });
      
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      const webhookCall = actionRegistry.executeAction.mock.calls.find(
        call => call[0] === 'notify_webhook'
      );
      
      expect(webhookCall).toBeDefined();
      expect(webhookCall[1].url).toBe('https://api.example.com/webhook');
      expect(webhookCall[1].includeAlertData).toBe(true);
    });

    it('should prepare correct push notification parameters', async () => {
      // Enable push notifications
      notificationManager.updateConfig({
        push: { 
          enabled: true, 
          fcmServerKey: 'test-key',
          topics: ['security-alerts']
        }
      });
      
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      const pushCall = actionRegistry.executeAction.mock.calls.find(
        call => call[0] === 'notify_push'
      );
      
      expect(pushCall).toBeDefined();
      expect(pushCall[1].topic).toBe('security-alerts');
      expect(pushCall[1].priority).toBe('high');
      expect(pushCall[1].title).toContain('Security Alert');
    });
  });

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        email: { enabled: false },
        slack: { enabled: true, channel: '#custom-alerts' }
      };
      
      notificationManager.updateConfig(newConfig);
      const config = notificationManager.getConfig();
      
      expect(config.email.enabled).toBe(false);
      expect(config.slack.channel).toBe('#custom-alerts');
    });

    it('should determine enabled notification types correctly', async () => {
      // Enable only email and Slack
      notificationManager.updateConfig({
        email: { enabled: true },
        slack: { enabled: true, webhookUrl: 'test-url' },
        teams: { enabled: false },
        webhooks: { enabled: false },
        push: { enabled: false }
      });
      
      await notificationManager.notifyCriticalEvent(mockAlert);
      
      // Should only call email and slack actions
      const actionCalls = actionRegistry.executeAction.mock.calls;
      const actionTypes = actionCalls.map(call => call[0]);
      
      expect(actionTypes).toContain('notify_email');
      expect(actionTypes).toContain('notify_slack');
      expect(actionTypes).not.toContain('notify_teams');
      expect(actionTypes).not.toContain('notify_webhook');
      expect(actionTypes).not.toContain('notify_push');
    });
  });
});