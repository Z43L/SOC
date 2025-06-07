/**
 * Utilidad para notificaciones de eventos críticos
 * Maneja la notificación de eventos críticos en el sistema
 */

import { log } from '../vite.js';
import { notificationManager } from './notification-manager.js';

/**
 * Notifica un evento crítico en el sistema
 * @param {Object} alert - La alerta que representa el evento crítico
 * @param {Object} options - Opciones adicionales para la notificación
 */
export async function notifyCriticalEvent(alert, options = {}) {
  try {
    // Log the critical event
    log(`[CRITICAL EVENT] ${alert.title} - Severity: ${alert.severity} - Source: ${alert.source}`, 'notifier');
    
    // Use the enhanced notification manager to send all configured notifications
    const result = await notificationManager.notifyCriticalEvent(alert, options);
    
    if (result.success) {
      log(`[AUDIT] Critical event notifications sent successfully - Alert ID: ${alert.id}`, 'notifier');
      
      // Log detailed summary
      if (result.summary) {
        log(`[AUDIT] Notification summary: ${result.summary.successful}/${result.summary.total} sent successfully`, 'notifier');
        
        // Log individual notification results if there were failures
        if (result.summary.failed > 0) {
          result.summary.details.forEach(detail => {
            if (detail.status === 'failed') {
              log(`[WARNING] ${detail.type} notification failed: ${detail.error}`, 'notifier');
            }
          });
        }
      }
    } else {
      if (result.skipped) {
        log(`[INFO] Critical event notification skipped: ${result.reason}`, 'notifier');
      } else {
        log(`[ERROR] Failed to send critical event notifications: ${result.error}`, 'notifier');
      }
    }
    
    return result;
    
  } catch (error) {
    log(`Error notifying critical event for alert ${alert.id}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'notifier');
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      alertId: alert.id 
    };
  }
}

/**
 * Update notification configuration
 * @param {Object} config - New configuration settings
 */
export function updateNotificationConfig(config) {
  notificationManager.updateConfig(config);
  log('Notification configuration updated', 'notifier');
}

/**
 * Get current notification configuration
 * @returns {Object} Current configuration
 */
export function getNotificationConfig() {
  return notificationManager.getConfig();
}