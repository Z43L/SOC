import { z } from 'zod';
import { SoarAction, ActionContext, ActionResult } from './ActionInterface';

// Base abstract class for actions
export abstract class BaseAction implements SoarAction {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: 'notification' | 'remediation' | 'investigation' | 'cloud' | 'agent';
  abstract readonly parameterSchema: z.ZodSchema<any>;

  // Default implementation of parameter validation
  validateParameters(params: Record<string, any>): z.SafeParseReturn<any> {
    return this.parameterSchema.safeParse(params);
  }

  // Default permission check - can be overridden
  async checkPermissions(context: ActionContext): Promise<boolean> {
    // Default: allow all executions
    // Override in specific actions for more restrictive permissions
    return true;
  }

  // Abstract method that must be implemented by concrete actions
  abstract execute(params: Record<string, any>, context: ActionContext): Promise<ActionResult>;

  // Helper method to create success result
  protected success(message?: string, data?: Record<string, any>): ActionResult {
    return {
      success: true,
      message,
      data,
    };
  }

  // Helper method to create error result
  protected error(error: string, data?: Record<string, any>): ActionResult {
    return {
      success: false,
      error,
      data,
    };
  }

  // Helper method to log with context
  protected log(context: ActionContext, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    context.logger(`[${this.name}] ${message}`, level);
  }
}