// SOAR Audit Logger Service
import { db } from '../../db';
import { auditLogs } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface AuditEvent {
  entityType: 'playbook' | 'execution' | 'action' | 'test';
  entityId: string;
  action: string;
  userId?: string | null;
  organizationId: number;
  details: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'system' | 'user' | 'api';
}

export class AuditLogger {
  private static instance: AuditLogger;

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async log(event: AuditEvent): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        userId: event.userId,
        organizationId: event.organizationId,
        details: event.details,
        severity: event.severity,
        source: event.source,
        timestamp: new Date(),
      });

      // Also log to console for immediate visibility
      const logLevel = event.severity === 'error' || event.severity === 'critical' ? 'error' : 'info';
      console[logLevel](`[AUDIT] ${event.entityType}.${event.action}`, {
        entityId: event.entityId,
        userId: event.userId,
        organizationId: event.organizationId,
        severity: event.severity,
        source: event.source,
        details: event.details
      });

    } catch (error) {
      console.error('[AuditLogger] Failed to write audit log:', error);
      // Don't throw to avoid disrupting main operations
    }
  }

  // Convenience methods for common audit events
  async logPlaybookExecution(
    playbookId: string, 
    executionId: string, 
    action: 'started' | 'completed' | 'failed' | 'cancelled',
    organizationId: number,
    userId?: string | null,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      entityType: 'execution',
      entityId: executionId,
      action: `playbook.${action}`,
      userId,
      organizationId,
      details: { playbookId, ...details },
      severity: action === 'failed' ? 'error' : 'info',
      source: userId ? 'user' : 'system'
    });
  }

  async logPlaybookTest(
    playbookId: string, 
    testId: string, 
    result: 'success' | 'failure',
    organizationId: number,
    userId?: string | null,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      entityType: 'test',
      entityId: testId,
      action: `playbook.test.${result}`,
      userId,
      organizationId,
      details: { playbookId, ...details },
      severity: result === 'failure' ? 'warning' : 'info',
      source: 'user'
    });
  }

  async logActionExecution(
    actionName: string, 
    executionId: string, 
    stepId: string,
    result: 'success' | 'failure' | 'timeout' | 'retry',
    organizationId: number,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      entityType: 'action',
      entityId: stepId,
      action: `action.${actionName}.${result}`,
      userId: null,
      organizationId,
      details: { executionId, actionName, ...details },
      severity: result === 'failure' || result === 'timeout' ? 'warning' : 'info',
      source: 'system'
    });
  }

  async logSecurityEvent(
    event: string,
    entityId: string,
    organizationId: number,
    userId?: string | null,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      entityType: 'playbook',
      entityId,
      action: `security.${event}`,
      userId,
      organizationId,
      details,
      severity: 'critical',
      source: userId ? 'user' : 'system'
    });
  }

  // Query methods for audit logs
  async getExecutionAuditLogs(
    executionId: string, 
    organizationId: number
  ): Promise<any[]> {
    try {
      return await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, executionId),
            eq(auditLogs.organizationId, organizationId),
            eq(auditLogs.entityType, 'execution')
          )
        )
        .orderBy(auditLogs.timestamp);
    } catch (error) {
      console.error('[AuditLogger] Failed to query audit logs:', error);
      return [];
    }
  }

  async getPlaybookAuditLogs(
    playbookId: string, 
    organizationId: number,
    limit: number = 100
  ): Promise<any[]> {
    try {
      return await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            sql`details->>'playbookId' = ${playbookId}`
          )
        )
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('[AuditLogger] Failed to query playbook audit logs:', error);
      return [];
    }
  }
}

export const auditLogger = AuditLogger.getInstance();
