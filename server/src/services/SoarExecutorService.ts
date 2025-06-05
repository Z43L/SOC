import { Queue, Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { playbooks, playbookExecutions } from '../../../shared/schema';
import { playbookDefinitionSchema, legacyPlaybookDefinitionSchema } from '../../../shared/playbookDefinition';
import { actionRegistry } from './actions/ActionRegistry';
import { auditLogger } from './auditLogger';

// Job data interface for playbook execution
interface PlaybookJobData {
  playbookId: string;
  triggerEvent?: any;
  userId?: string;
  organizationId: string;
  context?: Record<string, any>;
}

// Execution state for tracking playbook progress
interface ExecutionState {
  executionId: string;
  playbookId: string;
  organizationId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  currentStep?: string;
  steps: Record<string, {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: number;
    endTime?: number;
    result?: any;
    error?: string;
    retryCount: number;
  }>;
  variables: Record<string, any>;
  checkpoints: Array<{
    stepId: string;
    timestamp: number;
    variables: Record<string, any>;
  }>;
  logs: Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    stepId?: string;
  }>;
}

export class SoarExecutorService {
  private playbookQueue: Queue;
  private worker: Worker;
  private executionStates = new Map<string, ExecutionState>();

  constructor() {
    // Initialize BullMQ queue
    this.playbookQueue = new Queue('playbook-execution', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,           // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,         // Start with 2s delay
        },
      },
    });

    // Initialize worker
    this.worker = new Worker('playbook-execution', this.processPlaybookJob.bind(this), {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      concurrency: parseInt(process.env.SOAR_CONCURRENCY || '5'), // Process up to 5 jobs concurrently
    });

    this.setupWorkerEventHandlers();
  }

  // Setup event handlers for the worker
  private setupWorkerEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`[SoarExecutor] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[SoarExecutor] Job ${job?.id} failed:`, err);
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`[SoarExecutor] Job ${job.id} progress: ${progress}%`);
    });
  }

  // Enqueue a playbook for execution
  async enqueuePlaybook(jobData: PlaybookJobData, priority: number = 0): Promise<string> {
    const job = await this.playbookQueue.add('execute-playbook', jobData, {
      priority, // Higher numbers = higher priority
    });
    
    console.log(`[SoarExecutor] Enqueued playbook ${jobData.playbookId} with job ID ${job.id}`);
    return job.id!;
  }

  // Process a playbook execution job
  private async processPlaybookJob(job: Job<PlaybookJobData>): Promise<any> {
    const { playbookId, triggerEvent, userId, organizationId, context = {} } = job.data;

    // Track execution id so we can access the state in the catch block
    let executionId: string | undefined;
    
    console.log(`[SoarExecutor] Processing playbook ${playbookId}`);
    
    try {
      // Get playbook from database
      const playbook = await db
        .select()
        .from(playbooks)
        .where(eq(playbooks.id, parseInt(playbookId)))
        .limit(1);

      if (!playbook.length) {
        throw new Error(`Playbook ${playbookId} not found`);
      }

      const playbookData = playbook[0];

      // Create execution record
      const execution = await db
        .insert(playbookExecutions)
        .values({
          playbookId: parseInt(playbookId),
          status: 'running',
          triggerData: triggerEvent ? JSON.stringify(triggerEvent) : null,
          userId: userId,
          organizationId: parseInt(organizationId),
        })
        .returning();

      executionId = execution[0].id.toString();

      // Initialize execution state
      const executionState: ExecutionState = {
        executionId,
        playbookId,
        organizationId,
        status: 'running',
        steps: {},
        variables: { ...context, ...triggerEvent?.data },
        checkpoints: [],
        logs: [],
      };

      this.executionStates.set(executionId, executionState);

      // Parse playbook definition
      let definition;
      try {
        definition = playbookDefinitionSchema.parse(playbookData.definition);
      } catch {
        // Fallback to legacy schema
        definition = legacyPlaybookDefinitionSchema.parse(playbookData.definition);
      }

      // Create execution context
      const executionContext = {
        playbookId,
        executionId,
        organizationId,
        userId,
        data: executionState.variables,
        logger: (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
          this.log(executionState, message, level);
        },
      };

      // Execute playbook steps
      await this.executeSteps(definition.steps, executionContext, executionState, job);

      // Mark execution as completed
      executionState.status = 'completed';
      await this.updateExecutionStatus(executionId, 'completed');

      // Log completion
      await auditLogger.logPlaybookExecution(
        playbookId,
        executionId,
        'completed',
        parseInt(organizationId),
        userId,
        { duration: Date.now() - (execution[0].startedAt?.getTime() || Date.now()) }
      );

      return { status: 'completed', executionId };

    } catch (error) {
      console.error(`[SoarExecutor] Playbook ${playbookId} execution failed:`, error);
      
      // Update execution state if it exists
      const executionState = executionId
        ? this.executionStates.get(executionId)
        : undefined;
      if (executionState) {
        executionState.status = 'failed';
        this.log(executionState, `Execution failed: ${error.message}`, 'error');
      }

      if (executionId) {
        await this.updateExecutionStatus(executionId, 'failed');
      }

      throw error;
    }
  }

  // Execute playbook steps
  private async executeSteps(
    steps: any[],
    context: any,
    executionState: ExecutionState,
    job: Job
  ): Promise<void> {
    const totalSteps = steps.length;
    let completedSteps = 0;

    for (const step of steps) {
      await this.executeStep(step, context, executionState);
      completedSteps++;

      // Update job progress
      const progress = Math.round((completedSteps / totalSteps) * 100);
      await job.updateProgress(progress);
    }
  }

  // Execute a single step
  private async executeStep(step: any, context: any, executionState: ExecutionState): Promise<void> {
    const stepId = step.id;
    
    // Initialize step state
    executionState.steps[stepId] = {
      id: stepId,
      status: 'running',
      startTime: Date.now(),
      retryCount: 0,
    };

    executionState.currentStep = stepId;
    this.log(executionState, `Executing step: ${stepId}`);

    try {
      // Determine action to execute
      let actionName: string;
      let params: Record<string, any>;

      if (step.uses) {
        // Legacy format
        actionName = step.uses;
        params = step.with || {};
      } else {
        // New format
        actionName = step.actionId;
        params = step.params || {};
      }

      // Execute condition if present
      if (step.condition || step.if) {
        const condition = step.condition || step.if;
        const shouldExecute = this.evaluateCondition(condition, context.data);
        
        if (!shouldExecute) {
          executionState.steps[stepId].status = 'skipped';
          this.log(executionState, `Step ${stepId} skipped due to condition`);
          return;
        }
      }

      // Execute the action
      const result = await actionRegistry.executeAction(actionName, params, {
        ...context,
        actionName, // Pass action name for bridge function
      });

      // Update step state
      executionState.steps[stepId].status = result.success ? 'completed' : 'failed';
      executionState.steps[stepId].endTime = Date.now();
      executionState.steps[stepId].result = result;

      // Update context variables with result data
      if (result.data) {
        Object.assign(context.data, result.data);
        Object.assign(executionState.variables, result.data);
      }

      if (result.success) {
        this.log(executionState, `Step ${stepId} completed: ${result.message}`);
      } else {
        throw new Error(result.error || 'Step execution failed');
      }

    } catch (error) {
      executionState.steps[stepId].status = 'failed';
      executionState.steps[stepId].endTime = Date.now();
      executionState.steps[stepId].error = error.message;

      this.log(executionState, `Step ${stepId} failed: ${error.message}`, 'error');

      // Handle error based on step's onError policy
      const errorPolicy = step.onError || 'abort';
      await this.handleStepError(errorPolicy, stepId, error, executionState, context);
    }
  }

  // Handle step execution errors
  private async handleStepError(
    errorPolicy: string,
    stepId: string,
    error: Error,
    executionState: ExecutionState,
    context: any
  ): Promise<void> {
    switch (errorPolicy) {
      case 'continue':
        this.log(executionState, `Continuing execution despite step ${stepId} failure`);
        break;
      
      case 'rollback':
        this.log(executionState, `Rolling back due to step ${stepId} failure`);
        await this.rollbackToLastCheckpoint(executionState);
        throw error;
      
      case 'abort':
      default:
        throw error;
    }
  }

  // Rollback to last checkpoint
  private async rollbackToLastCheckpoint(executionState: ExecutionState): Promise<void> {
    const lastCheckpoint = executionState.checkpoints[executionState.checkpoints.length - 1];
    if (!lastCheckpoint) {
      this.log(executionState, 'No checkpoint available for rollback', 'warn');
      return;
    }

    this.log(executionState, `Rolling back to checkpoint at step ${lastCheckpoint.stepId}`);
    
    // Restore variables
    executionState.variables = { ...lastCheckpoint.variables };
    
    // Mark steps after checkpoint as pending
    const checkpointTime = lastCheckpoint.timestamp;
    for (const [stepId, stepExec] of Object.entries(executionState.steps)) {
      if (stepExec.startTime && stepExec.startTime > checkpointTime) {
        stepExec.status = 'pending';
        stepExec.error = undefined;
        stepExec.result = undefined;
      }
    }
  }

  // Evaluate condition expression
  private evaluateCondition(condition: string, data: Record<string, any>): boolean {
    try {
      // Simple condition evaluation - in a real implementation use a proper expression evaluator
      // For now, support basic comparisons
      let processedCondition = condition;
      
      // Replace variables with actual values
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        processedCondition = processedCondition.replace(regex, JSON.stringify(value));
      }

      // For now, return true if condition seems valid
      return true;
    } catch {
      return false;
    }
  }

  // Log message to execution state
  private log(executionState: ExecutionState, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    executionState.logs.push({
      timestamp: Date.now(),
      level,
      message,
      stepId: executionState.currentStep,
    });
    
    console.log(`[SoarExecutor:${executionState.executionId}] ${message}`);
  }

  // Update execution status in database
  private async updateExecutionStatus(executionId: string, status: string): Promise<void> {
    await db
      .update(playbookExecutions)
      .set({
        status,
        completedAt: status === 'completed' ? new Date() : undefined,
      })
      .where(eq(playbookExecutions.id, parseInt(executionId)));
  }

  // Get execution state
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.executionStates.get(executionId);
  }

  // Clean up
  async shutdown(): Promise<void> {
    await this.worker.close();
    await this.playbookQueue.close();
  }
}

// Singleton instance
export const soarExecutor = new SoarExecutorService();