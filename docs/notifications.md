# Enhanced Notification System

This document describes the enhanced notification system implemented for SOC-Inteligente, providing multiple notification channels for critical security events.

## Overview

The enhanced notification system replaces the simple logging-only implementation with a comprehensive multi-channel notification framework that supports:

- 📧 **Email notifications** to administrators
- 💬 **Slack notifications** to security channels
- 🔷 **Microsoft Teams notifications** with rich cards
- 🔗 **Configurable webhooks** for third-party integrations
- 📱 **Push notifications** via Firebase Cloud Messaging
- ⚙️ **Configurable settings** for severity filtering and rate limiting

## Architecture

### Core Components

1. **Notification Manager** (`server/utils/notification-manager.js`)
   - Orchestrates all notification types
   - Handles rate limiting and error resilience
   - Provides concurrent notification sending

2. **Notification Configuration** (`server/utils/notification-config.js`)
   - Centralized configuration management
   - Environment variable integration
   - Severity filtering and rate limiting settings

3. **Enhanced Notifier** (`server/utils/notifier.js`)
   - Main entry point for critical event notifications
   - Integrates with the notification manager
   - Maintains backward compatibility

4. **Notification Actions** (`server/src/services/actions/core/`)
   - Individual action implementations for each notification type
   - Follow the existing SOAR action pattern
   - Comprehensive parameter validation and error handling

## Configuration

### Environment Variables

Set these environment variables for your deployment:

```bash
# Email Configuration (SMTP)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@company.com
SMTP_PASS=your-email-password

# Slack Integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
SLACK_CHANNEL=#security-alerts
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Microsoft Teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/your-webhook-url

# Firebase Cloud Messaging (Push Notifications)
FCM_SERVER_KEY=your-fcm-server-key
```

### Notification Configuration

Configure notifications programmatically:

```javascript
import { updateNotificationConfig } from '../server/utils/notifier.js';

updateNotificationConfig({
  // Email settings
  email: {
    enabled: true,
    adminEmails: ['security@company.com', 'admin@company.com']
  },
  
  // Slack settings
  slack: {
    enabled: true,
    channel: '#security-alerts'
  },
  
  // Teams settings
  teams: {
    enabled: true,
    webhookUrl: process.env.TEAMS_WEBHOOK_URL
  },
  
  // Custom webhooks
  webhooks: {
    enabled: true,
    endpoints: [
      {
        name: 'siem-integration',
        url: 'https://your-siem.com/api/webhook',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer your-token'
        },
        enabled: true
      }
    ]
  },
  
  // Push notifications
  push: {
    enabled: true,
    topics: ['security-alerts', 'critical-incidents']
  },
  
  // General settings
  general: {
    minSeverity: 'medium', // Only notify for medium, high, critical
    maxNotificationsPerHour: 50,
    useTemplates: true
  }
});
```

## Usage

### Basic Usage

Send a critical event notification:

```javascript
import { notifyCriticalEvent } from '../server/utils/notifier.js';

const alert = {
  id: 'ALT-2024-001',
  title: 'Suspicious Network Activity Detected',
  severity: 'high',
  source: 'Network Monitor',
  description: 'Multiple failed login attempts from external IP',
  sourceIp: '203.0.113.42',
  hostname: 'web-server-01',
  timestamp: new Date().toISOString(),
  metadata: {
    attemptCount: 15,
    protocol: 'SSH'
  }
};

const result = await notifyCriticalEvent(alert, {
  organizationId: 'your-org-id',
  userId: 'security-system'
});

if (result.success) {
  console.log(`Sent ${result.summary.successful} notifications`);
} else {
  console.error('Failed to send notifications:', result.error);
}
```

### Using Individual Actions

You can also use individual notification actions directly:

```javascript
import { actionRegistry } from '../server/src/services/actions/ActionRegistry.js';

const context = {
  playbookId: 'incident-response',
  executionId: 'exec-123',
  organizationId: 'org-123',
  userId: 'user-123',
  data: {
    alertId: 'ALT-001',
    severity: 'high',
    hostname: 'server-01'
  },
  logger: console.log
};

// Send Teams notification
await actionRegistry.executeAction('notify_teams', {
  webhookUrl: 'https://outlook.office.com/webhook/...',
  title: 'Security Alert: {{severity}}',
  message: 'Incident on {{hostname}}',
  color: 'attention'
}, context);

// Send webhook notification
await actionRegistry.executeAction('notify_webhook', {
  url: 'https://api.example.com/webhook',
  method: 'POST',
  includeAlertData: true,
  payload: {
    event_type: 'security_alert'
  }
}, context);

// Send push notification
await actionRegistry.executeAction('notify_push', {
  topic: 'security-alerts',
  title: 'Security Alert',
  body: 'Check the security dashboard',
  priority: 'high'
}, context);
```

## Notification Types

### Email Notifications

- **Action**: `notify_email`
- **Features**: HTML templates, multiple recipients, priority levels
- **Configuration**: SMTP settings, admin email list

**Parameters**:
```javascript
{
  to: ['admin@company.com'],
  subject: 'Security Alert: {{severity}}',
  body: 'Alert details: {{description}}',
  priority: 'high',
  cc: ['security@company.com'],
  bcc: ['audit@company.com']
}
```

### Slack Notifications

- **Action**: `notify_slack`
- **Features**: Rich attachments, custom channels, bot integration
- **Configuration**: Webhook URL or bot token, default channel

**Parameters**:
```javascript
{
  channel: '#security-alerts',
  message: '🚨 Security Alert: {{title}}',
  attachments: [{
    color: 'danger',
    title: 'Alert Details',
    fields: [
      { title: 'Severity', value: '{{severity}}', short: true },
      { title: 'Host', value: '{{hostname}}', short: true }
    ]
  }]
}
```

### Microsoft Teams Notifications

- **Action**: `notify_teams`
- **Features**: Adaptive cards, rich formatting, action buttons
- **Configuration**: Incoming webhook URL

**Parameters**:
```javascript
{
  title: 'Security Alert: {{severity}}',
  message: '{{description}}',
  color: 'attention',
  sections: [{
    title: 'Alert Details',
    facts: [
      { name: 'Host', value: '{{hostname}}' },
      { name: 'IP', value: '{{sourceIp}}' }
    ]
  }]
}
```

### Webhook Notifications

- **Action**: `notify_webhook`
- **Features**: Custom HTTP requests, retry logic, template payloads
- **Configuration**: Endpoint URLs, headers, methods

**Parameters**:
```javascript
{
  url: 'https://api.example.com/webhook',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  includeAlertData: true,
  payload: {
    event_type: 'security_alert',
    custom_field: '{{severity}}'
  },
  retries: 3,
  timeout: 10000
}
```

### Push Notifications

- **Action**: `notify_push`
- **Features**: Firebase Cloud Messaging, topic/token targeting, rich notifications
- **Configuration**: FCM server key, default topics

**Parameters**:
```javascript
{
  topic: 'security-alerts',
  // OR tokens: ['device-token-1', 'device-token-2'],
  title: 'Security Alert',
  body: 'Incident detected on {{hostname}}',
  priority: 'high',
  data: {
    alertId: '{{alertId}}',
    severity: '{{severity}}'
  }
}
```

## Template System

All notification types support template variables using `{{variable}}` syntax:

### Available Variables

- `{{alertId}}` - Alert ID
- `{{title}}` - Alert title
- `{{severity}}` - Alert severity (low, medium, high, critical)
- `{{source}}` - Alert source
- `{{description}}` - Alert description
- `{{sourceIp}}` - Source IP address
- `{{hostname}}` - Affected hostname
- `{{timestamp}}` - Alert timestamp
- Any field from `alert.metadata`

### Example Templates

```javascript
// Email subject template
"🚨 {{severity}} Security Alert: {{title}}"

// Slack message template
"Security incident on {{hostname}} ({{sourceIp}})"

// Teams card title template
"{{severity}} Priority Alert from {{source}}"
```

## Rate Limiting

The system includes built-in rate limiting to prevent notification spam:

- **Default**: Maximum 50 notifications per hour
- **Configurable**: Adjust via `general.maxNotificationsPerHour`
- **Per-system**: Rate limiting applies globally, not per notification type

## Error Handling

The notification system provides robust error handling:

### Graceful Degradation
- If one notification type fails, others continue
- Detailed error logging for troubleshooting
- Retry logic for transient failures (webhooks, push notifications)

### Error Types
- **Configuration errors**: Missing required settings
- **Network errors**: Connection timeouts, service unavailable
- **Authentication errors**: Invalid credentials or tokens
- **Rate limiting**: Too many notifications sent

### Monitoring
- All notification attempts are logged
- Success/failure metrics are tracked
- Audit trail for compliance

## Testing

Run the example demo to test the notification system:

```bash
cd /path/to/SOC
node examples/notification-demo.js
```

The demo will:
1. Configure all notification types
2. Send sample notifications
3. Test severity filtering
4. Demonstrate rate limiting
5. Test individual actions

## Security Considerations

### Sensitive Data
- Webhook URLs and API keys are masked in logs
- Use environment variables for credentials
- Implement proper access controls for configuration

### Data Protection
- Alert data in notifications should be sanitized
- Consider data retention policies for notification logs
- Implement encryption for sensitive webhook payloads

## Troubleshooting

### Common Issues

1. **Notifications not sending**
   - Check configuration: `getNotificationConfig()`
   - Verify environment variables
   - Check severity filtering settings

2. **Specific notification type failing**
   - Review logs for error details
   - Test connectivity to external services
   - Verify authentication credentials

3. **Rate limiting triggered**
   - Check `maxNotificationsPerHour` setting
   - Review notification frequency
   - Adjust rate limits if needed

### Debug Mode

Enable detailed logging by setting the log level in your configuration or environment.

## Migration from Legacy System

The enhanced notification system maintains backward compatibility:

```javascript
// Legacy usage (still works)
import { notifyCriticalEvent } from '../server/utils/notifier.js';
await notifyCriticalEvent(alert);

// Enhanced usage (recommended)
await notifyCriticalEvent(alert, {
  organizationId: 'org-123',
  userId: 'user-123'
});
```

## Contributing

When adding new notification types:

1. Create a new action class extending `BaseAction`
2. Implement required methods: `execute()`, parameter schema
3. Add the action to `ActionRegistry.js`
4. Update configuration schema in `notification-config.js`
5. Add tests for the new notification type
6. Update this documentation

## Support

For issues or questions:
- Check the logs for error details
- Review configuration settings
- Test individual notification actions
- Consult the example demo for proper usage