import { z } from 'zod';

// Execution context passed to all actions
export interface ActionContext {
  playbookId: string;
  executionId: string;
  organizationId: string;
  userId?: string;
  data: Record<string, any>; // Variables and data from previous steps
  logger: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

// Result returned by action execution
export interface ActionResult {
  success: boolean;
  data?: Record<string, any>; // Data to be passed to next steps
  message?: string;
  error?: string;
}

// Base interface that all actions must implement
export interface SoarAction {
  readonly name: string;
  readonly description: string;
  readonly category: 'notification' | 'remediation' | 'investigation' | 'cloud' | 'agent';
  readonly parameterSchema: z.ZodSchema<any>; // Zod schema for parameter validation
  
  // Execute the action with given parameters and context
  execute(params: Record<string, any>, context: ActionContext): Promise<ActionResult>;
  
  // Validate parameters against schema
  validateParameters(params: Record<string, any>): z.SafeParseReturn<any>;
  
  // Check if user has permission to execute this action
  checkPermissions?(context: ActionContext): Promise<boolean>;
}

// Action registry type
export interface ActionRegistry {
  [actionName: string]: SoarAction;
}