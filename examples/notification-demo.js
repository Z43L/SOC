/**
 * Example usage of the enhanced notification system
 * This file demonstrates how to use the new notification features
 */

import { notifyCriticalEvent, updateNotificationConfig } from '../server/utils/notifier.js';
import { notificationManager } from '../server/utils/notification-manager.js';

// Example: Configure notifications for your environment
function configureNotifications() {
  const config = {
    // Email configuration
    email: {
      enabled: true,
      adminEmails: ['security@yourcompany.com', 'admin@yourcompany.com']
    },
    
    // Slack configuration
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: '#security-alerts'
    },
    
    // Microsoft Teams configuration
    teams: {
      enabled: true,
      webhookUrl: process.env.TEAMS_WEBHOOK_URL
    },
    
    // Custom webhooks
    webhooks: {
      enabled: true,
      endpoints: [
        {
          name: 'security-siem',
          url: 'https://your-siem.com/api/webhook',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer your-token',
            'Content-Type': 'application/json'
          },
          enabled: true
        }
      ]
    },
    
    // Push notifications
    push: {
      enabled: true,
      fcmServerKey: process.env.FCM_SERVER_KEY,
      topics: ['security-alerts', 'critical-incidents']
    },
    
    // General settings
    general: {
      minSeverity: 'medium', // Only notify for medium, high, critical
      maxNotificationsPerHour: 20,
      useTemplates: true
    }
  };
  
  updateNotificationConfig(config);
  console.log('✅ Notification configuration updated');
}

// Example: Send a critical event notification
async function exampleCriticalEvent() {
  const alert = {
    id: 'ALT-2024-001',
    title: 'Multiple Failed Login Attempts Detected',
    severity: 'high',
    source: 'Network Security Monitor',
    description: 'Detected 15 failed SSH login attempts from external IP within 5 minutes',
    sourceIp: '203.0.113.42',
    hostname: 'web-server-01.company.com',
    timestamp: new Date().toISOString(),
    metadata: {
      attemptCount: 15,
      protocol: 'SSH',
      targetUser: 'root',
      duration: '5 minutes'
    }
  };

  console.log('📢 Sending critical event notification...');
  
  const result = await notifyCriticalEvent(alert, {
    organizationId: 'company-123',
    userId: 'security-system'
  });
  
  if (result.success) {
    console.log('✅ Notifications sent successfully!');
    console.log(`📊 Summary: ${result.summary.successful}/${result.summary.total} notifications delivered`);
    
    // Log details of any failures
    if (result.summary.failed > 0) {
      result.summary.details.forEach(detail => {
        if (detail.status === 'failed') {
          console.warn(`⚠️  ${detail.type} notification failed: ${detail.error}`);
        }
      });
    }
  } else {
    console.error('❌ Failed to send notifications:', result.error);
  }

  return result;
}

// Example: Test different severity levels
async function testSeverityFiltering() {
  console.log('\n🔍 Testing severity filtering...');
  
  const alerts = [
    { id: 'ALT-LOW', title: 'Low Priority Event', severity: 'low', source: 'System Monitor' },
    { id: 'ALT-MED', title: 'Medium Priority Event', severity: 'medium', source: 'Security Monitor' },
    { id: 'ALT-HIGH', title: 'High Priority Event', severity: 'high', source: 'Threat Detector' },
    { id: 'ALT-CRIT', title: 'Critical Security Incident', severity: 'critical', source: 'Intrusion Detection' }
  ];

  for (const alert of alerts) {
    console.log(`\n📋 Testing ${alert.severity.toUpperCase()} severity alert...`);
    const result = await notifyCriticalEvent(alert);
    
    if (result.skipped) {
      console.log(`⏭️  Skipped: ${result.reason}`);
    } else if (result.success) {
      console.log(`✅ Sent: ${result.summary.successful} notifications`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }
}

// Example: Using individual notification actions directly
async function testIndividualActions() {
  console.log('\n🔧 Testing individual notification actions...');
  
  const { actionRegistry } = await import('../server/src/services/actions/ActionRegistry.js');
  
  const context = {
    playbookId: 'test-playbook',
    executionId: 'test-execution',
    organizationId: 'test-org',
    userId: 'test-user',
    data: {
      alertId: 'TEST-001',
      severity: 'high',
      hostname: 'test-server',
      sourceIp: '192.168.1.100'
    },
    logger: (msg, level = 'info') => console.log(`[${level.toUpperCase()}] ${msg}`)
  };

  // Test Teams notification
  try {
    const teamsResult = await actionRegistry.executeAction('notify_teams', {
      webhookUrl: 'https://outlook.office.com/webhook/test-webhook-url',
      title: 'Test Security Alert: {{severity}}',
      message: 'Security incident detected on {{hostname}}',
      color: 'attention',
      sections: [{
        title: 'Alert Details',
        facts: [
          { name: 'Host', value: '{{hostname}}' },
          { name: 'Severity', value: '{{severity}}' },
          { name: 'IP Address', value: '{{sourceIp}}' }
        ]
      }]
    }, context);
    
    console.log('✅ Teams notification:', teamsResult.success ? 'Success' : 'Failed');
  } catch (error) {
    console.log('❌ Teams notification failed:', error.message);
  }

  // Test webhook notification
  try {
    const webhookResult = await actionRegistry.executeAction('notify_webhook', {
      url: 'https://api.example.com/security-webhook',
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-token' },
      includeAlertData: true,
      payload: {
        event_type: 'security_alert',
        custom_field: 'test value'
      }
    }, context);
    
    console.log('✅ Webhook notification:', webhookResult.success ? 'Success' : 'Failed');
  } catch (error) {
    console.log('❌ Webhook notification failed:', error.message);
  }

  // Test push notification
  try {
    const pushResult = await actionRegistry.executeAction('notify_push', {
      serverKey: 'test-fcm-server-key',
      topic: 'security-alerts',
      title: 'Security Alert: {{severity}}',
      body: 'Incident detected on {{hostname}}',
      priority: 'high'
    }, context);
    
    console.log('✅ Push notification:', pushResult.success ? 'Success' : 'Failed');
  } catch (error) {
    console.log('❌ Push notification failed:', error.message);
  }
}

// Example: Rate limiting demonstration
async function testRateLimiting() {
  console.log('\n⏱️  Testing rate limiting...');
  
  // Configure very low rate limit for testing
  updateNotificationConfig({
    general: { maxNotificationsPerHour: 2 }
  });

  const testAlert = {
    id: 'RATE-TEST',
    title: 'Rate Limit Test Alert',
    severity: 'high',
    source: 'Test System'
  };

  // Send multiple notifications rapidly
  for (let i = 1; i <= 4; i++) {
    const result = await notifyCriticalEvent({ ...testAlert, id: `RATE-TEST-${i}` });
    
    if (result.success) {
      console.log(`✅ Notification ${i}: Sent successfully`);
    } else if (result.error?.includes('Rate limit')) {
      console.log(`🛑 Notification ${i}: Rate limited`);
    } else {
      console.log(`❌ Notification ${i}: Failed - ${result.error}`);
    }
  }
  
  // Reset rate limit for normal operation
  updateNotificationConfig({
    general: { maxNotificationsPerHour: 50 }
  });
}

// Main demonstration function
async function runDemo() {
  console.log('🚀 Enhanced Notification System Demo\n');
  
  try {
    // 1. Configure the system
    configureNotifications();
    
    // 2. Send a sample critical event
    await exampleCriticalEvent();
    
    // 3. Test severity filtering
    await testSeverityFiltering();
    
    // 4. Test individual actions
    await testIndividualActions();
    
    // 5. Test rate limiting
    await testRateLimiting();
    
    console.log('\n🎉 Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

// Export functions for use in other files
export {
  configureNotifications,
  exampleCriticalEvent,
  testSeverityFiltering,
  testIndividualActions,
  testRateLimiting,
  runDemo
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}