// filepath: shared/playbookDefinition.ts
import { z } from 'zod';

// Parameter block for step inputs
const inputsSchema = z.record(z.string(), z.any());

// Step types enum
export const StepTypeEnum = z.enum(['action', 'condition', 'fork']);

// Enhanced step schema supporting different types
const stepSchema = z.object({
  id: z.string(),
  type: StepTypeEnum,
  actionId: z.string().optional(), // for action steps - references actions.name
  params: inputsSchema.optional(), // parameters for the action/condition
  next: z.array(z.string()).optional(), // array of next step IDs
  condition: z.string().optional(), // condition expression for condition steps
  onError: z.enum(['abort', 'continue', 'rollback']).optional().default('abort'),
  timeout: z.number().int().positive().optional(),
});

// Trigger configuration
const triggerSchema = z.object({
  type: z.enum(['alert', 'incident', 'manual', 'scheduled']),
  filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  where: z.string().optional(), // SQLJSONPath filter expression
});

// Enhanced playbook definition matching requirements
export const playbookDefinitionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  trigger: triggerSchema,
  steps: z.array(stepSchema),
  onError: z.enum(['abort', 'continue', 'rollback']).optional().default('abort'),
  ownerTenant: z.string(),
  enabled: z.boolean().default(true),
});

export type PlaybookDefinition = z.infer<typeof playbookDefinitionSchema>;
export type StepDefinition = z.infer<typeof stepSchema>;
export type TriggerDefinition = z.infer<typeof triggerSchema>;

// Legacy compatibility for existing code
export const actionStepSchema = z.object({
  id: z.string(),
  uses: z.string(), // for backward compatibility
  with: inputsSchema.optional(),
  if: z.string().optional(),
  then: z.array(z.lazy(() => simpleStepSchema)).optional(),
  else: z.array(z.lazy(() => simpleStepSchema)).optional(),
  onError: z.enum(['abort', 'continue', 'rollback']).optional().default('abort'),
  timeout: z.number().int().positive().optional(),
});

const simpleStepSchema = z.object({
  uses: z.string(),
  with: inputsSchema.optional(),
});

// Legacy schema for backward compatibility
export const legacyPlaybookDefinitionSchema = z.object({
  version: z.number().int().positive(),
  trigger: z.object({
    type: z.enum(['alert', 'incident', 'manual', 'scheduled']),
    filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  }),
  steps: z.array(actionStepSchema),
});
