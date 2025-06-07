/**
 * Configuration system for notifications
 * Handles various notification types and their settings
 */

/**
 * Default notification configuration
 */
export const defaultNotificationConfig = {
  // Email notifications
  email: {
    enabled: true,
    adminEmails: ['admin@example.com'], // Default admin emails
    smtpConfig: {
      // These would typically come from environment variables
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    }
  },

  // Slack notifications
  slack: {
    enabled: true,
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    channel: process.env.SLACK_CHANNEL || '#security-alerts',
    botToken: process.env.SLACK_BOT_TOKEN || ''
  },

  // Microsoft Teams notifications
  teams: {
    enabled: false,
    webhookUrl: process.env.TEAMS_WEBHOOK_URL || ''
  },

  // Configurable webhooks
  webhooks: {
    enabled: false,
    endpoints: [
      // Example webhook endpoint configuration
      // {
      //   name: 'webhook1',
      //   url: 'https://api.example.com/webhook',
      //   method: 'POST',
      //   headers: {
      //     'Authorization': 'Bearer token',
      //     'Content-Type': 'application/json'
      //   },
      //   enabled: true
      // }
    ]
  },

  // Push notifications
  push: {
    enabled: false,
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    topics: ['security-alerts']
  },

  // General settings
  general: {
    // Only send notifications for these severity levels
    minSeverity: 'medium', // low, medium, high, critical
    // Rate limiting - max notifications per hour
    maxNotificationsPerHour: 50,
    // Template settings
    useTemplates: true,
    defaultTemplate: 'security-alert'
  }
};

/**
 * Load notification configuration from environment or defaults
 */
export function loadNotificationConfig() {
  return defaultNotificationConfig;
}

/**
 * Check if notifications should be sent for a given severity level
 */
export function shouldNotify(severity, config = defaultNotificationConfig) {
  const severityLevels = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  const minLevel = severityLevels[config.general.minSeverity] || 2;
  const alertLevel = severityLevels[severity] || 1;

  return alertLevel >= minLevel;
}

/**
 * Get enabled notification types
 */
export function getEnabledNotificationTypes(config = defaultNotificationConfig) {
  const enabled = [];
  
  if (config.email.enabled) enabled.push('email');
  if (config.slack.enabled && config.slack.webhookUrl) enabled.push('slack');
  if (config.teams.enabled && config.teams.webhookUrl) enabled.push('teams');
  if (config.webhooks.enabled && config.webhooks.endpoints.length > 0) enabled.push('webhooks');
  if (config.push.enabled && config.push.fcmServerKey) enabled.push('push');

  return enabled;
}