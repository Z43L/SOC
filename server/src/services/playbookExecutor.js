import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { playbooks, playbookExecutions } from '../../../shared/schema';
import { playbookDefinitionSchema } from '../../../shared/playbookDefinition';
import { eventBus } from './eventBus';
import { auditLogger } from './auditLogger';
import Handlebars from 'handlebars';
export class PlaybookExecutor {
    actionRegistry = {};
    executionStates = new Map();
    constructor() {
        this.setupEventListeners();
        this.registerCoreActions();
    }
    setupEventListeners() {
        eventBus.subscribeToAllEvents(async (event) => {
            try {
                await this.handleEvent(event);
            }
            catch (error) {
                console.error('[PlaybookExecutor] Error handling event:', error);
            }
        });
    }
    async handleEvent(event) {
        console.log(`[PlaybookExecutor] Processing event: ${event.type}`);
        // Find active playbooks that match this trigger
        const activePlaybooks = await db
            .select()
            .from(playbooks)
            .where(and(eq(playbooks.isActive, true), eq(playbooks.organizationId, event.organizationId), eq(playbooks.triggerType, event.entityType)));
        for (const playbook of activePlaybooks) {
            if (await this.shouldTriggerPlaybook(playbook, event)) {
                await this.executePlaybook(playbook, event);
            }
        }
    }
    async shouldTriggerPlaybook(playbook, event) {
        if (!playbook.triggerCondition)
            return true;
        try {
            const definition = playbookDefinitionSchema.parse(playbook.definition);
            const filter = definition.trigger.filter;
            if (!filter)
                return true;
            // Simple filter matching (can be extended)
            for (const [key, expectedValues] of Object.entries(filter)) {
                const actualValue = event.data[key];
                const expected = Array.isArray(expectedValues) ? expectedValues : [expectedValues];
                if (!expected.includes(actualValue)) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            console.error('[PlaybookExecutor] Error validating trigger condition:', error);
            return false;
        }
    }
    async executePlaybook(playbook, triggerEvent) {
        const startTime = Date.now();
        // Create execution record
        const [execution] = await db
            .insert(playbookExecutions)
            .values({
            playbookId: playbook.id,
            status: 'running',
            triggeredBy: null, // system triggered
            triggerSource: triggerEvent.entityType,
            triggerEntityId: triggerEvent.entityId,
            organizationId: triggerEvent.organizationId,
        })
            .returning();
        const logger = (msg) => {
            console.log(`[Execution ${execution.id}] ${msg}`);
        };
        // Initialize execution state
        const executionState = {
            steps: {},
            variables: {
                ...triggerEvent.data,
                trigger: triggerEvent,
                steps: {}, // Step outputs will be stored here
            },
            checkpoints: []
        };
        this.executionStates.set(execution.id.toString(), executionState);
        try {
            logger(`Starting playbook execution: ${playbook.name}`);
            // Log execution start
            await auditLogger.logPlaybookExecution(playbook.id.toString(), execution.id.toString(), 'started', triggerEvent.organizationId, null, // system triggered
            {
                playbookName: playbook.name,
                triggerType: triggerEvent.entityType,
                triggerData: triggerEvent.data
            });
            const definition = playbookDefinitionSchema.parse(playbook.definition);
            const context = {
                playbookId: playbook.id.toString(),
                executionId: execution.id.toString(),
                orgId: triggerEvent.organizationId.toString(),
                data: executionState.variables,
                logger,
            };
            await this.executeSteps(definition.steps, context, executionState);
            const executionTime = Date.now() - startTime;
            // Mark as completed
            await db
                .update(playbookExecutions)
                .set({
                status: 'completed',
                completedAt: new Date(),
                executionTime,
                results: this.serializeExecutionResults(executionState),
            })
                .where(eq(playbookExecutions.id, execution.id));
            logger(`Playbook completed successfully in ${executionTime}ms`);
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            await db
                .update(playbookExecutions)
                .set({
                status: 'failed',
                completedAt: new Date(),
                executionTime,
                error: error instanceof Error ? error.message : 'Unknown error',
                results: this.serializeExecutionResults(executionState),
            })
                .where(eq(playbookExecutions.id, execution.id));
            logger(`Playbook failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            // Clean up execution state
            this.executionStates.delete(execution.id.toString());
        }
    }
    async executeSteps(steps, context, executionState) {
        for (const step of steps) {
            await this.executeStep(step, context, executionState);
        }
    }
    async executeStep(step, context, executionState) {
        const { id, uses, with: inputs, if: condition, then: thenSteps, else: elseSteps } = step;
        const options = {
            timeout: step.timeout || 30000, // 30 second default timeout
            retries: step.retries || 0,
            errorPolicy: step.errorPolicy || 'abort',
            continueOnError: step.continueOnError || false,
        };
        // Initialize step execution state
        const stepExecution = {
            stepId: id,
            status: 'pending',
            attempts: 0,
            startTime: Date.now()
        };
        executionState.steps[id] = stepExecution;
        // Evaluate condition if present
        if (condition && !this.evaluateCondition(condition, context.data)) {
            stepExecution.status = 'skipped';
            stepExecution.endTime = Date.now();
            context.logger(`Step ${id} skipped due to condition: ${condition}`);
            return;
        }
        // Create checkpoint before step execution
        this.createCheckpoint(id, executionState);
        let lastError = null;
        const maxAttempts = options.retries + 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            stepExecution.attempts = attempt;
            stepExecution.status = attempt === 1 ? 'running' : 'retrying';
            context.logger(`Executing step ${id}: ${uses} (attempt ${attempt}/${maxAttempts})`);
            try {
                // Execute with timeout
                const output = await this.executeStepWithTimeout(step, context, options.timeout);
                // Store output in context for next steps
                context.data.steps[id] = output;
                stepExecution.output = output;
                stepExecution.status = 'completed';
                stepExecution.endTime = Date.now();
                context.logger(`Step ${id} completed successfully`);
                // Handle branching
                if (thenSteps || elseSteps) {
                    const shouldExecuteThen = this.evaluateCondition(`steps.${id}.success`, context.data);
                    const branchSteps = shouldExecuteThen ? thenSteps : elseSteps;
                    if (branchSteps) {
                        await this.executeSteps(branchSteps, context, executionState);
                    }
                }
                return; // Success, exit retry loop
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                stepExecution.lastError = lastError.message;
                context.logger(`Step ${id} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}`);
                // If this is not the last attempt, wait before retrying
                if (attempt < maxAttempts) {
                    const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                    context.logger(`Retrying step ${id} in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        // All retries exhausted, handle error based on policy
        stepExecution.status = 'failed';
        stepExecution.endTime = Date.now();
        context.logger(`Step ${id} failed after ${maxAttempts} attempts. Error policy: ${options.errorPolicy}`);
        switch (options.errorPolicy) {
            case 'continue':
                context.logger(`Continuing execution despite step ${id} failure`);
                break;
            case 'rollback':
                context.logger(`Rolling back to last checkpoint due to step ${id} failure`);
                await this.rollbackToLastCheckpoint(executionState, context);
                throw lastError;
            case 'retry':
                // For now, retry is handled by the attempt loop above
                // Could be extended to retry the entire playbook
                throw lastError;
            case 'abort':
            default:
                throw lastError;
        }
    }
    async executeStepWithTimeout(step, context, timeoutMs) {
        const { id, uses, with: inputs } = step;
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Step ${id} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        // Resolve inputs with template variables
        const resolvedInputs = this.resolveTemplate(inputs || {}, context.data);
        // Execute the action
        const actionFn = this.actionRegistry[uses];
        if (!actionFn) {
            throw new Error(`Action not found: ${uses}`);
        }
        // Race between action execution and timeout
        const executionPromise = actionFn(context, resolvedInputs);
        return Promise.race([executionPromise, timeoutPromise]);
    }
    createCheckpoint(stepId, executionState) {
        executionState.checkpoints.push({
            stepId,
            timestamp: Date.now(),
            variables: JSON.parse(JSON.stringify(executionState.variables)) // Deep clone
        });
        // Keep only last 10 checkpoints to manage memory
        if (executionState.checkpoints.length > 10) {
            executionState.checkpoints.shift();
        }
    }
    async rollbackToLastCheckpoint(executionState, context) {
        const lastCheckpoint = executionState.checkpoints[executionState.checkpoints.length - 1];
        if (!lastCheckpoint) {
            context.logger('No checkpoint available for rollback');
            return;
        }
        context.logger(`Rolling back to checkpoint at step ${lastCheckpoint.stepId}`);
        // Restore variables to checkpoint state
        executionState.variables = lastCheckpoint.variables;
        context.data = executionState.variables;
        // Mark steps after checkpoint as pending for potential re-execution
        const checkpointTime = lastCheckpoint.timestamp;
        for (const [stepId, stepExec] of Object.entries(executionState.steps)) {
            if (stepExec.startTime && stepExec.startTime > checkpointTime) {
                stepExec.status = 'pending';
                stepExec.lastError = undefined;
                stepExec.output = undefined;
            }
        }
    }
    serializeExecutionResults(executionState) {
        return {
            steps: Object.fromEntries(Object.entries(executionState.steps).map(([id, step]) => [
                id,
                {
                    status: step.status,
                    attempts: step.attempts,
                    duration: step.endTime && step.startTime ? step.endTime - step.startTime : null,
                    output: step.output,
                    error: step.lastError
                }
            ])),
            checkpoints: executionState.checkpoints.length,
            variables: Object.keys(executionState.variables).filter(k => k !== 'steps')
        };
    }
    evaluateCondition(condition, data) {
        try {
            // Simple condition evaluation - can be enhanced with a proper expression parser
            const template = Handlebars.compile(`{{#if ${condition}}}true{{else}}false{{/if}}`);
            const result = template(data);
            return result === 'true';
        }
        catch (error) {
            console.warn('[PlaybookExecutor] Failed to evaluate condition:', condition, error);
            return false;
        }
    }
    resolveTemplate(input, data) {
        if (typeof input === 'string') {
            const template = Handlebars.compile(input);
            return template(data);
        }
        if (typeof input === 'object' && input !== null) {
            const resolved = {};
            for (const [key, value] of Object.entries(input)) {
                resolved[key] = this.resolveTemplate(value, data);
            }
            return resolved;
        }
        return input;
    }
    registerAction(name, fn) {
        this.actionRegistry[name] = fn;
        console.log(`[PlaybookExecutor] Registered action: ${name}`);
    }
    // Public method to resume failed executions (for future use)
    async resumeExecution(executionId) {
        const executionState = this.executionStates.get(executionId);
        if (!executionState) {
            throw new Error(`Execution state not found for ID: ${executionId}`);
        }
        // Find the last successful checkpoint
        const lastCheckpoint = executionState.checkpoints[executionState.checkpoints.length - 1];
        if (lastCheckpoint) {
            await this.rollbackToLastCheckpoint(executionState, {
                playbookId: '',
                executionId,
                orgId: '',
                data: executionState.variables,
                logger: (msg) => console.log(`[Resume ${executionId}] ${msg}`)
            });
        }
    }
    // Public method to test a playbook with test data
    async testPlaybook(playbookId, testData, dryRun = true) {
        const startTime = Date.now();
        try {
            // Get playbook from database
            const [playbook] = await db
                .select()
                .from(playbooks)
                .where(eq(playbooks.id, parseInt(playbookId, 10)));
            if (!playbook) {
                throw new Error(`Playbook not found: ${playbookId}`);
            }
            // Parse playbook definition
            const definition = playbookDefinitionSchema.parse(playbook.definition);
            // Create test execution context
            const testExecutionId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const logger = (msg) => {
                console.log(`[TEST ${testExecutionId}] ${msg}`);
            };
            // Initialize test execution state with provided test data
            const executionState = {
                steps: {},
                variables: {
                    ...testData,
                    trigger: {
                        type: 'test',
                        data: testData,
                        entityType: definition.trigger.type,
                        entityId: testExecutionId,
                        organizationId: playbook.organizationId,
                        timestamp: Date.now()
                    },
                    steps: {}, // Step outputs will be stored here
                },
                checkpoints: []
            };
            // Store test execution state temporarily
            this.executionStates.set(testExecutionId, executionState);
            const context = {
                playbookId: playbookId,
                executionId: testExecutionId,
                orgId: playbook.organizationId?.toString() || '1',
                data: executionState.variables,
                logger,
            };
            logger(`Starting test execution for playbook: ${playbook.name} (dryRun: ${dryRun})`);
            // Create test-safe action registry if in dry run mode
            const originalRegistry = this.actionRegistry;
            if (dryRun) {
                this.setupTestActionRegistry();
            }
            try {
                // Execute steps
                await this.executeSteps(definition.steps, context, executionState);
                const executionTime = Date.now() - startTime;
                logger(`Test execution completed successfully in ${executionTime}ms`);
                return {
                    success: true,
                    executionTime,
                    steps: this.serializeExecutionResults(executionState).steps,
                    variables: Object.fromEntries(Object.entries(executionState.variables).filter(([key]) => key !== 'steps'))
                };
            }
            finally {
                // Restore original action registry if we modified it
                if (dryRun) {
                    this.actionRegistry = originalRegistry;
                }
            }
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[TEST] Playbook test failed: ${errorMessage}`);
            return {
                success: false,
                executionTime,
                steps: {},
                variables: {},
                error: errorMessage
            };
        }
        finally {
            // Clean up test execution state
            const testExecutionId = `test-${Date.now()}`;
            this.executionStates.delete(testExecutionId);
        }
    }
    setupTestActionRegistry() {
        // Create safe test versions of actions that don't affect production systems
        const testActions = {
            // Safe logging action
            'log_message': async (ctx, input) => {
                const message = input?.message || 'No message provided';
                ctx.logger(`[TEST] LOG: ${message}`);
                return { success: true, message, testMode: true };
            },
            // Safe delay action (reduced time for testing)
            'delay': async (ctx, input) => {
                const ms = Math.min(input?.milliseconds || 1000, 5000); // Max 5 seconds in test
                ctx.logger(`[TEST] Delaying for ${ms}ms`);
                await new Promise(resolve => setTimeout(resolve, ms));
                return { success: true, delayed: ms, testMode: true };
            },
            // Safe conditional action
            'conditional': async (ctx, input) => {
                const condition = input?.condition;
                const trueAction = input?.then;
                const falseAction = input?.else;
                if (!condition) {
                    throw new Error('Conditional action requires a condition');
                }
                const shouldExecuteThen = ctx.data[condition] || false;
                const actionToExecute = shouldExecuteThen ? trueAction : falseAction;
                ctx.logger(`[TEST] Conditional: ${condition} = ${shouldExecuteThen}`);
                return {
                    success: true,
                    executed: !!actionToExecute,
                    condition: shouldExecuteThen,
                    action: actionToExecute,
                    testMode: true
                };
            },
            // Mock external API calls
            'http_request': async (ctx, input) => {
                const url = input?.url;
                const method = input?.method || 'GET';
                ctx.logger(`[TEST] Mock HTTP ${method} request to: ${url}`);
                return {
                    success: true,
                    status: 200,
                    data: { message: 'Mock response for testing', url, method },
                    testMode: true
                };
            },
            // Mock email sending
            'send_email': async (ctx, input) => {
                const to = input?.to;
                const subject = input?.subject;
                ctx.logger(`[TEST] Mock email sent to: ${to}, subject: ${subject}`);
                return {
                    success: true,
                    messageId: `test-${Date.now()}`,
                    to,
                    subject,
                    testMode: true
                };
            },
            // Mock database operations
            'database_query': async (ctx, input) => {
                const query = input?.query;
                ctx.logger(`[TEST] Mock database query: ${query}`);
                return {
                    success: true,
                    rows: [{ id: 1, result: 'Mock database result' }],
                    testMode: true
                };
            },
            // Mock ticket creation
            'create_ticket': async (ctx, input) => {
                const title = input?.title;
                const description = input?.description;
                ctx.logger(`[TEST] Mock ticket created: ${title}`);
                return {
                    success: true,
                    ticketId: `TEST-${Date.now()}`,
                    title,
                    description,
                    testMode: true
                };
            },
            // Mock alert enrichment
            'enrich_alert': async (ctx, input) => {
                const alertId = input?.alertId;
                ctx.logger(`[TEST] Mock alert enrichment for: ${alertId}`);
                return {
                    success: true,
                    alertId,
                    enrichment: {
                        reputation: 'unknown',
                        geolocation: 'Test Location',
                        threatIntel: 'No threats found (test data)'
                    },
                    testMode: true
                };
            },
            // Default mock action for any unregistered actions
            'mock_action': async (ctx, input) => {
                ctx.logger(`[TEST] Mock action executed with input: ${JSON.stringify(input)}`);
                return {
                    success: true,
                    input,
                    testMode: true
                };
            }
        };
        // Store original registry and replace with test registry
        this.actionRegistry = testActions;
    }
    registerCoreActions() {
        // Register basic actions
        this.registerAction('log_message', async (ctx, input) => {
            const message = input?.message || 'No message provided';
            ctx.logger(`LOG: ${message}`);
            return { success: true, message };
        });
        this.registerAction('delay', async (ctx, input) => {
            const ms = input?.milliseconds || 1000;
            ctx.logger(`Delaying for ${ms}ms`);
            await new Promise(resolve => setTimeout(resolve, ms));
            return { success: true, delayed: ms };
        });
        // Enhanced conditional action
        this.registerAction('conditional', async (ctx, input) => {
            const condition = input?.condition;
            const trueAction = input?.then;
            const falseAction = input?.else;
            if (!condition) {
                throw new Error('Conditional action requires a condition');
            }
            const shouldExecuteThen = ctx.data[condition] || false;
            const actionToExecute = shouldExecuteThen ? trueAction : falseAction;
            if (!actionToExecute) {
                return { success: true, executed: false, condition: shouldExecuteThen };
            }
            ctx.logger(`Conditional: ${condition} = ${shouldExecuteThen}, executing ${actionToExecute}`);
            // This would need to be enhanced to actually execute nested actions
            return { success: true, executed: true, condition: shouldExecuteThen, action: actionToExecute };
        });
    }
}
export const playbookExecutor = new PlaybookExecutor();
