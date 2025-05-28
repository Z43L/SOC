// filepath: shared/playbookDefinition.ts
import { z } from 'zod';
// Parameter block for step inputs
const inputsSchema = z.record(z.string(), z.any());
// Single action step (basic)
const actionStepSchema = z.object({
    id: z.string(),
    uses: z.string(), // action key (must match actions.name)
    with: inputsSchema.optional(), // parameters for action
    if: z.string().optional(), // condition template
    then: z.array(z.lazy(() => simpleStepSchema)).optional(),
    else: z.array(z.lazy(() => simpleStepSchema)).optional(),
    onError: z.enum(['abort', 'continue', 'rollback']).optional().default('abort'),
    timeout: z.number().int().positive().optional(),
});
// For branching, simple steps inside then/else have uses and with
const simpleStepSchema = z.object({
    uses: z.string(),
    with: inputsSchema.optional(),
});
// Full playbook definition
export const playbookDefinitionSchema = z.object({
    version: z.number().int().positive(),
    trigger: z.object({
        type: z.enum(['alert', 'incident', 'manual', 'scheduled']),
        filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    }),
    steps: z.array(actionStepSchema),
});
