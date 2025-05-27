/**
 * AI Alert Listener Module
 * 
 * This module subscribes to alert.created events and triggers AI analysis
 * for alerts that meet severity thresholds. It integrates with the AI queue
 * to ensure proper rate limiting and asynchronous processing.
 */

import { Alert } from "@shared/schema";
import { eventBus, AlertCreatedEvent, SOCEvent } from "../src/services/eventBus";
import { aiQueue } from "./ai-processing-queue";
import { storage } from "../storage";
import { log } from "../vite";

// Severity levels in ascending order of importance
const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

// Configuration for AI processing
const config = {
  // Minimum severity level to process with AI (inclusive)
  minSeverityLevel: 'medium',
  // Whether to enable automatic AI analysis for alerts
  enableAutoAnalysis: true,
  // Logging prefix
  logPrefix: 'ai-alert-listener'
};

/**
 * Initializes the AI alert listener and subscribes to relevant events
 */
export function initAiAlertListener(): void {
  if (!config.enableAutoAnalysis) {
    log(`Auto AI analysis is disabled. Skipping initialization.`, config.logPrefix);
    return;
  }

  log(`Initializing AI alert listener with min severity: ${config.minSeverityLevel}`, config.logPrefix);
  
  // Subscribe to alert.created events
  eventBus.on('alert.created', handleAlertCreated);
  
  log(`AI alert listener initialized and subscribed to alert.created events`, config.logPrefix);
}

/**
 * Handles alert.created events
 * @param event The alert created event
 */
// Fix 'publish' vs 'publishEvent' method issue
async function handleAlertCreated(event: SOCEvent): Promise<void> {
  try {
    const alertEvent = event as AlertCreatedEvent;
    log(`Received alert.created event for alert ID: ${alertEvent.data.alertId}`, config.logPrefix);
    
    // Get the full alert from the database
    const alert = await storage.getAlert(alertEvent.data.alertId, alertEvent.organizationId);
    
    if (!alert) {
      log(`Alert ID ${alertEvent.data.alertId} not found`, config.logPrefix);
      return;
    }
    
    // Check if the alert meets the severity threshold for AI processing
    if (shouldProcessAlert(alert)) {
      log(`Alert ID ${alert.id} meets severity threshold, enqueueing for AI analysis`, config.logPrefix);
      await enqueueAlertForAnalysis(alert);
    } else {
      log(`Alert ID ${alert.id} does not meet severity threshold (${alert.severity}), skipping AI analysis`, config.logPrefix);
    }
  } catch (error) {
    log(`Error handling alert.created event: ${error instanceof Error ? error.message : String(error)}`, config.logPrefix);
  }
}

/**
 * Determines if an alert should be processed by the AI
 * @param alert The alert to check
 * @returns True if the alert should be processed
 */
function shouldProcessAlert(alert: Alert): boolean {
  const alertSeverityIndex = SEVERITY_LEVELS.indexOf(alert.severity.toLowerCase());
  const thresholdIndex = SEVERITY_LEVELS.indexOf(config.minSeverityLevel.toLowerCase());
  
  // Only process if the severity is greater than or equal to the threshold
  return alertSeverityIndex >= thresholdIndex;
}

/**
 * Enqueues an alert for AI analysis
 * @param alert The alert to analyze
 */
async function enqueueAlertForAnalysis(alert: Alert): Promise<void> {
  try {
    const queueId = await aiQueue.enqueueAlertAnalysis(alert);
    
    if (queueId) {
      log(`Successfully enqueued alert ID ${alert.id} for AI analysis with queue ID: ${queueId}`, config.logPrefix);
    } else {
      log(`Failed to enqueue alert ID ${alert.id} for AI analysis`, config.logPrefix);
    }
  } catch (error) {
    log(`Error enqueueing alert ID ${alert.id} for AI analysis: ${error instanceof Error ? error.message : String(error)}`, config.logPrefix);
  }
}

/**
 * Updates the configuration for the AI alert listener
 * @param newConfig The new configuration
 */
export function updateAiAlertListenerConfig(newConfig: Partial<typeof config>): void {
  Object.assign(config, newConfig);
  log(`AI alert listener configuration updated: ${JSON.stringify(config)}`, config.logPrefix);
}