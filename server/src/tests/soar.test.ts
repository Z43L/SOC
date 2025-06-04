import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PlaybookExecutor } from '../services/playbookExecutor';
import { eventBus } from '../services/eventBus';
import { db } from '../../db';
import { playbooks, playbookExecutions, actions } from '../../../shared/schema';

// Mock database
jest.mock('../../db');
const mockDb = db as jest.Mocked<typeof db>;

describe('SOAR System Tests', () => {
  let executor: PlaybookExecutor;
  
  beforeEach(() => {
    jest.clearAllMocks();
    executor = new PlaybookExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PlaybookExecutor', () => {
    describe('Action Registration', () => {
      it('should register custom actions', () => {
        const mockAction = jest.fn().mockResolvedValue({ success: true });
        
        executor.registerAction('test-action', mockAction);
        
        // Verify action was registered
        expect(executor['actionRegistry']['test-action']).toBe(mockAction);
      });

      it('should register core actions on initialization', () => {
        const newExecutor = new PlaybookExecutor();
        
        // Check that core actions are registered
        expect(newExecutor['actionRegistry']['alert.create']).toBeDefined();
        expect(newExecutor['actionRegistry']['notification.slack']).toBeDefined();
        expect(newExecutor['actionRegistry']['notification.email']).toBeDefined();
        expect(newExecutor['actionRegistry']['edr.isolate-host']).toBeDefined();
      });
    });

    describe('Event Handling', () => {
      it('should process alert.created events', async () => {
        // Mock database responses
        mockDb.select.mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                id: 1,
                name: 'Test Playbook',
                isActive: true,
                triggerType: 'alert',
                definition: {
                  steps: [
                    {
                      id: 'step1',
                      uses: 'notification.slack',
                      with: { message: 'Alert received: {{alert.title}}' }
                    }
                  ]
                }
              }
            ])
          })
        } as any);

        // Mock playbook execution insertion
        mockDb.insert.mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 1 }])
          })
        } as any);

        // Mock execution updates
        mockDb.update.mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([])
          })
        } as any);

        // Publish test event
        const testEvent = {
          type: 'alert.created',
          entityType: 'alert',
          entityId: 123,
          organizationId: 1,
          data: {
            alert: {
              id: 123,
              title: 'Test Alert',
              severity: 'high'
            }
          },
          timestamp: new Date()
        };

        await eventBus.publish(testEvent);

        // Allow event processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify playbook execution was initiated
        expect(mockDb.insert).toHaveBeenCalled();
      });

      it('should process incident.status_updated events', async () => {
        // Mock database responses for incident trigger
        mockDb.select.mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                id: 2,
                name: 'Incident Response Playbook',
                isActive: true,
                triggerType: 'incident',
                definition: {
                  steps: [
                    {
                      id: 'step1',
                      uses: 'notification.email',
                      with: { 
                        to: 'security@company.com',
                        subject: 'Incident {{incident.title}} updated to {{incident.status}}'
                      }
                    }
                  ]
                }
              }
            ])
          })
        } as any);

        mockDb.insert.mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 2 }])
          })
        } as any);

        mockDb.update.mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([])
          })
        } as any);

        const testEvent = {
          type: 'incident.status_updated',
          entityType: 'incident',
          entityId: 456,
          organizationId: 1,
          data: {
            incident: {
              id: 456,
              title: 'Critical Security Incident',
              status: 'investigating',
              previousStatus: 'new'
            }
          },
          timestamp: new Date()
        };

        await eventBus.publish(testEvent);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockDb.insert).toHaveBeenCalled();
      });
    });

    describe('Step Execution', () => {
      it('should execute steps with timeout', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: { test: 'data' },
          logger: jest.fn()
        };

        const step = {
          id: 'test-step',
          uses: 'test-action',
          with: { param: 'value' },
          timeout: 5000
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        // Register a test action
        const mockAction = jest.fn().mockResolvedValue({ success: true });
        executor.registerAction('test-action', mockAction);

        await executor['executeStep'](step, context, executionState);

        expect(mockAction).toHaveBeenCalledWith(context, { param: 'value' });
        expect(executionState.steps['test-step'].status).toBe('completed');
      });

      it('should handle step timeouts', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: {},
          logger: jest.fn()
        };

        const step = {
          id: 'timeout-step',
          uses: 'slow-action',
          timeout: 100 // Very short timeout
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        // Register a slow action
        const slowAction = jest.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 1000))
        );
        executor.registerAction('slow-action', slowAction);

        await expect(
          executor['executeStep'](step, context, executionState)
        ).rejects.toThrow();

        expect(executionState.steps['timeout-step'].status).toBe('failed');
      });

      it('should retry failed steps', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: {},
          logger: jest.fn()
        };

        const step = {
          id: 'retry-step',
          uses: 'flaky-action',
          retries: 2,
          errorPolicy: 'retry'
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        let callCount = 0;
        const flakyAction = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        });

        executor.registerAction('flaky-action', flakyAction);

        await executor['executeStep'](step, context, executionState);

        expect(flakyAction).toHaveBeenCalledTimes(3);
        expect(executionState.steps['retry-step'].status).toBe('completed');
        expect(executionState.steps['retry-step'].attempts).toBe(3);
      });

      it('should handle conditional steps', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: { condition: false },
          logger: jest.fn()
        };

        const step = {
          id: 'conditional-step',
          uses: 'test-action',
          if: 'condition === true'
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        const mockAction = jest.fn().mockResolvedValue({ success: true });
        executor.registerAction('test-action', mockAction);

        await executor['executeStep'](step, context, executionState);

        expect(mockAction).not.toHaveBeenCalled();
        expect(executionState.steps['conditional-step'].status).toBe('skipped');
      });
    });

    describe('Error Handling', () => {
      it('should handle abort error policy', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: {},
          logger: jest.fn()
        };

        const step = {
          id: 'failing-step',
          uses: 'failing-action',
          errorPolicy: 'abort'
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        const failingAction = jest.fn().mockRejectedValue(new Error('Action failed'));
        executor.registerAction('failing-action', failingAction);

        await expect(
          executor['executeStep'](step, context, executionState)
        ).rejects.toThrow('Action failed');

        expect(executionState.steps['failing-step'].status).toBe('failed');
      });

      it('should handle continue error policy', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: {},
          logger: jest.fn()
        };

        const step = {
          id: 'continue-step',
          uses: 'failing-action',
          errorPolicy: 'continue'
        };

        const executionState = {
          steps: {},
          variables: {},
          checkpoints: []
        };

        const failingAction = jest.fn().mockRejectedValue(new Error('Action failed'));
        executor.registerAction('failing-action', failingAction);

        // Should not throw
        await executor['executeStep'](step, context, executionState);

        expect(executionState.steps['continue-step'].status).toBe('failed');
      });

      it('should handle rollback error policy', async () => {
        const context = {
          playbookId: '1',
          executionId: '1',
          orgId: '1',
          data: {},
          logger: jest.fn()
        };

        const step = {
          id: 'rollback-step',
          uses: 'failing-action',
          errorPolicy: 'rollback'
        };

        const executionState = {
          steps: {},
          variables: { checkpoint: 'data' },
          checkpoints: [
            {
              stepId: 'previous-step',
              timestamp: Date.now(),
              variables: { checkpoint: 'data' }
            }
          ]
        };

        const failingAction = jest.fn().mockRejectedValue(new Error('Action failed'));
        executor.registerAction('failing-action', failingAction);

        await expect(
          executor['executeStep'](step, context, executionState)
        ).rejects.toThrow('Action failed');

        expect(executionState.steps['rollback-step'].status).toBe('failed');
      });
    });

    describe('Template Resolution', () => {
      it('should resolve Handlebars templates in action inputs', () => {
        const data = {
          alert: { title: 'Test Alert', severity: 'high' },
          user: { name: 'John Doe' }
        };

        const template = {
          message: 'Alert: {{alert.title}} ({{alert.severity}}) reported by {{user.name}}',
          nested: {
            value: 'Severity is {{alert.severity}}'
          }
        };

        const result = executor['resolveTemplate'](template, data);

        expect(result.message).toBe('Alert: Test Alert (high) reported by John Doe');
        expect(result.nested.value).toBe('Severity is high');
      });

      it('should handle missing template variables gracefully', () => {
        const data = { alert: { title: 'Test Alert' } };
        const template = { message: 'Alert: {{alert.title}} ({{alert.nonexistent}})' };

        const result = executor['resolveTemplate'](template, data);

        expect(result.message).toBe('Alert: Test Alert ()');
      });
    });

    describe('Condition Evaluation', () => {
      it('should evaluate simple conditions', () => {
        const data = { severity: 'high', count: 5 };

        expect(executor['evaluateCondition']('severity === "high"', data)).toBe(true);
        expect(executor['evaluateCondition']('severity === "low"', data)).toBe(false);
        expect(executor['evaluateCondition']('count > 3', data)).toBe(true);
        expect(executor['evaluateCondition']('count < 3', data)).toBe(false);
      });

      it('should evaluate complex conditions', () => {
        const data = { 
          alert: { severity: 'high', category: 'malware' },
          user: { role: 'admin' }
        };

        const condition = 'alert.severity === "high" && alert.category === "malware"';
        expect(executor['evaluateCondition'](condition, data)).toBe(true);

        const condition2 = 'alert.severity === "low" || user.role === "admin"';
        expect(executor['evaluateCondition'](condition2, data)).toBe(true);
      });

      it('should handle invalid conditions safely', () => {
        const data = { test: 'value' };

        // Should not throw, should return false for invalid conditions
        expect(executor['evaluateCondition']('invalid.syntax..', data)).toBe(false);
        expect(executor['evaluateCondition']('', data)).toBe(false);
      });
    });
  });

  describe('Event Bus', () => {
    it('should publish and receive events', async () => {
      const mockHandler = jest.fn();
      
      eventBus.subscribe('test.event', mockHandler);

      const testEvent = {
        type: 'test.event',
        entityType: 'test',
        entityId: 1,
        organizationId: 1,
        data: { test: 'data' },
        timestamp: new Date()
      };

      await eventBus.publish(testEvent);

      expect(mockHandler).toHaveBeenCalledWith(testEvent);
    });

    it('should handle multiple subscribers', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.subscribe('multi.event', handler1);
      eventBus.subscribe('multi.event', handler2);

      const testEvent = {
        type: 'multi.event',
        entityType: 'test',
        entityId: 1,
        organizationId: 1,
        data: {},
        timestamp: new Date()
      };

      await eventBus.publish(testEvent);

      expect(handler1).toHaveBeenCalledWith(testEvent);
      expect(handler2).toHaveBeenCalledWith(testEvent);
    });

    it('should unsubscribe handlers', async () => {
      const mockHandler = jest.fn();

      const unsubscribe = eventBus.subscribe('unsub.event', mockHandler);
      unsubscribe();

      const testEvent = {
        type: 'unsub.event',
        entityType: 'test',
        entityId: 1,
        organizationId: 1,
        data: {},
        timestamp: new Date()
      };

      await eventBus.publish(testEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should execute a complete incident response playbook', async () => {
      // Mock successful database operations
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              id: 1,
              name: 'Incident Response',
              isActive: true,
              triggerType: 'alert',
              definition: {
                steps: [
                  {
                    id: 'notify-team',
                    uses: 'notification.slack',
                    with: {
                      channel: '#security',
                      message: 'New high-severity alert: {{alert.title}}'
                    }
                  },
                  {
                    id: 'isolate-host',
                    uses: 'edr.isolate-host',
                    with: {
                      hostname: '{{alert.sourceHost}}'
                    },
                    if: 'alert.severity === "critical"'
                  },
                  {
                    id: 'create-incident',
                    uses: 'incident.create',
                    with: {
                      title: 'Security Incident: {{alert.title}}',
                      description: 'Automatically created from alert {{alert.id}}'
                    }
                  }
                ]
              }
            }
          ])
        })
      } as any);

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 1 }])
        })
      } as any);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      } as any);

      // Mock action implementations
      const slackAction = jest.fn().mockResolvedValue({ messageId: 'msg123' });
      const isolateAction = jest.fn().mockResolvedValue({ success: true });
      const incidentAction = jest.fn().mockResolvedValue({ incidentId: 456 });

      executor.registerAction('notification.slack', slackAction);
      executor.registerAction('edr.isolate-host', isolateAction);
      executor.registerAction('incident.create', incidentAction);

      // Trigger the playbook
      const alertEvent = {
        type: 'alert.created',
        entityType: 'alert',
        entityId: 123,
        organizationId: 1,
        data: {
          alert: {
            id: 123,
            title: 'Malware Detected',
            severity: 'critical',
            sourceHost: 'workstation-01'
          }
        },
        timestamp: new Date()
      };

      await eventBus.publish(alertEvent);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all actions were called
      expect(slackAction).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alert: expect.objectContaining({
              title: 'Malware Detected'
            })
          })
        }),
        expect.objectContaining({
          channel: '#security',
          message: 'New high-severity alert: Malware Detected'
        })
      );

      expect(isolateAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          hostname: 'workstation-01'
        })
      );

      expect(incidentAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Security Incident: Malware Detected'
        })
      );
    });

    it('should handle playbook execution with step failure and continue policy', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              id: 2,
              name: 'Resilient Playbook',
              isActive: true,
              triggerType: 'alert',
              definition: {
                steps: [
                  {
                    id: 'step1',
                    uses: 'action.success',
                    with: { data: 'test' }
                  },
                  {
                    id: 'step2',
                    uses: 'action.failure',
                    errorPolicy: 'continue'
                  },
                  {
                    id: 'step3',
                    uses: 'action.success',
                    with: { data: 'final' }
                  }
                ]
              }
            }
          ])
        })
      } as any);

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 2 }])
        })
      } as any);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      } as any);

      const successAction = jest.fn().mockResolvedValue({ success: true });
      const failureAction = jest.fn().mockRejectedValue(new Error('Simulated failure'));

      executor.registerAction('action.success', successAction);
      executor.registerAction('action.failure', failureAction);

      const testEvent = {
        type: 'alert.created',
        entityType: 'alert',
        entityId: 124,
        organizationId: 1,
        data: { alert: { id: 124 } },
        timestamp: new Date()
      };

      await eventBus.publish(testEvent);
      await new Promise(resolve => setTimeout(resolve, 200));

      // All actions should have been called despite the failure
      expect(successAction).toHaveBeenCalledTimes(2);
      expect(failureAction).toHaveBeenCalledTimes(1);

      // Execution should have completed (marked as completed despite step failure)
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.anything()
      );
    });
  });
});
