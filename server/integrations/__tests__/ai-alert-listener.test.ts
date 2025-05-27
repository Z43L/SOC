/**
 * Tests for AI alert listener functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, AlertCreatedEvent } from '../../src/services/eventBus';
import { aiQueue } from '../ai-processing-queue';
import { storage } from '../../storage';
import { initAiAlertListener, updateAiAlertListenerConfig } from '../ai-alert-listener';

// Mock dependencies
vi.mock('../ai-processing-queue', () => ({
  aiQueue: {
    enqueueAlertAnalysis: vi.fn().mockResolvedValue('mock-queue-id')
  }
}));

vi.mock('../../storage', () => ({
  storage: {
    getAlert: vi.fn()
  }
}));

vi.mock('../../vite', () => ({
  log: vi.fn()
}));

// Test data
const mockAlert = {
  id: 123,
  title: 'Test Alert',
  description: 'This is a test alert',
  severity: 'high',
  source: 'test-source',
  sourceIp: '192.168.1.1',
  destinationIp: '10.0.0.1',
  status: 'new',
  retryCount: 0,
  organizationId: 1
};

describe('AI Alert Listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock storage.getAlert to return our test alert
    storage.getAlert.mockResolvedValue(mockAlert);
    
    // Initialize the listener with test configuration
    updateAiAlertListenerConfig({
      minSeverityLevel: 'medium',
      enableAutoAnalysis: true
    });
    
    initAiAlertListener();
  });

  afterEach(() => {
    // Clean up any listeners
    eventBus.removeAllListeners();
  });

  it('should process high severity alerts', async () => {
    // Create a test alert.created event
    const alertEvent: AlertCreatedEvent = {
      type: 'alert.created',
      entityId: 123,
      entityType: 'alert',
      organizationId: 1,
      timestamp: new Date(),
      data: {
        alertId: 123,
        severity: 'high'
      }
    };

    // Emit the event
    eventBus.publishEvent(alertEvent);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify that storage.getAlert was called with the correct parameters
    expect(storage.getAlert).toHaveBeenCalledWith(123, 1);
    
    // Verify that the alert was enqueued for AI analysis
    expect(aiQueue.enqueueAlertAnalysis).toHaveBeenCalledWith(mockAlert);
  });

  it('should skip low severity alerts', async () => {
    // Override the alert severity
    storage.getAlert.mockResolvedValueOnce({
      ...mockAlert,
      severity: 'low'
    });
    
    // Create a test alert.created event for a low severity alert
    const alertEvent: AlertCreatedEvent = {
      type: 'alert.created',
      entityId: 456,
      entityType: 'alert',
      organizationId: 1,
      timestamp: new Date(),
      data: {
        alertId: 456,
        severity: 'low'
      }
    };

    // Emit the event
    eventBus.publishEvent(alertEvent);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify that storage.getAlert was called
    expect(storage.getAlert).toHaveBeenCalledWith(456, 1);
    
    // Verify that the alert was NOT enqueued for AI analysis
    expect(aiQueue.enqueueAlertAnalysis).not.toHaveBeenCalled();
  });

  it('should handle alerts not found in storage', async () => {
    // Mock storage.getAlert to return null (alert not found)
    storage.getAlert.mockResolvedValueOnce(null);
    
    const alertEvent: AlertCreatedEvent = {
      type: 'alert.created',
      entityId: 789,
      entityType: 'alert',
      organizationId: 1,
      timestamp: new Date(),
      data: {
        alertId: 789,
        severity: 'critical'
      }
    };

    // Emit the event
    eventBus.publishEvent(alertEvent);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify that the alert was not enqueued
    expect(aiQueue.enqueueAlertAnalysis).not.toHaveBeenCalled();
  });

  it('should respect the configured minimum severity level', async () => {
    // Update config to only process critical alerts
    updateAiAlertListenerConfig({
      minSeverityLevel: 'critical',
      enableAutoAnalysis: true
    });
    
    // Test with high severity (should be skipped with critical threshold)
    storage.getAlert.mockResolvedValueOnce({
      ...mockAlert,
      severity: 'high'
    });
    
    const alertEvent: AlertCreatedEvent = {
      type: 'alert.created',
      entityId: 123,
      entityType: 'alert',
      organizationId: 1,
      timestamp: new Date(),
      data: {
        alertId: 123,
        severity: 'high'
      }
    };

    // Emit the event
    eventBus.publishEvent(alertEvent);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify that the alert was NOT enqueued (high < critical)
    expect(aiQueue.enqueueAlertAnalysis).not.toHaveBeenCalled();
    
    // Now test with critical severity (should be processed)
    storage.getAlert.mockResolvedValueOnce({
      ...mockAlert,
      severity: 'critical',
      id: 999
    });
    
    const criticalAlertEvent: AlertCreatedEvent = {
      type: 'alert.created',
      entityId: 999,
      entityType: 'alert',
      organizationId: 1,
      timestamp: new Date(),
      data: {
        alertId: 999,
        severity: 'critical'
      }
    };

    // Emit the event
    eventBus.publishEvent(criticalAlertEvent);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify that the critical alert was enqueued
    expect(aiQueue.enqueueAlertAnalysis).toHaveBeenCalled();
  });
});