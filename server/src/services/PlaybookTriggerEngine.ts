import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { playbookBindings, playbooks } from '../../../shared/schema';
import { soarExecutor } from './SoarExecutorService';
import { eventBus } from './eventBus';

// Interface for events in Redis Stream
interface EventData {
  id: string;
  entityId: number;
  entityType: string;
  organizationId: number;
  timestamp: string;
  type: string;
  data: Record<string, any>;
}

export class PlaybookTriggerEngine {
  private static instance: PlaybookTriggerEngine;
  private redisClient: Redis;
  private eventsStream: Queue;
  private worker: Worker;
  private streamName = 'alerts_stream';
  private consumerGroup = 'playbook-trigger-engine';

  private constructor() {
    // Initialize Redis client
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    // Initialize BullMQ queue for events
    this.eventsStream = new Queue('events-stream', {
      connection: this.redisClient,
    });

    // Initialize worker to process events
    this.worker = new Worker('events-stream', this.processEvent.bind(this), {
      connection: this.redisClient,
      concurrency: parseInt(process.env.TRIGGER_ENGINE_CONCURRENCY || '5'),
    });

    this.setupWorkerEventHandlers();
    this.setupStreamConsumer();
    this.setupEventListeners();
  }

  public static getInstance(): PlaybookTriggerEngine {
    if (!PlaybookTriggerEngine.instance) {
      PlaybookTriggerEngine.instance = new PlaybookTriggerEngine();
    }
    return PlaybookTriggerEngine.instance;
  }

  private setupWorkerEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`[PlaybookTriggerEngine] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[PlaybookTriggerEngine] Job ${job?.id} failed:`, err);
    });
  }

  private async setupStreamConsumer(): Promise<void> {
    try {
      // Create consumer group if it doesn't exist
      try {
        await this.redisClient.xgroup('CREATE', this.streamName, this.consumerGroup, '$', 'MKSTREAM');
        console.log(`[PlaybookTriggerEngine] Created consumer group ${this.consumerGroup} for stream ${this.streamName}`);
      } catch (error) {
        // Group may already exist, which is fine
        console.log(`[PlaybookTriggerEngine] Consumer group already exists or error: ${error.message}`);
      }

      // Start reading from the stream
      this.startConsumingEvents();
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Error setting up stream consumer: ${error.message}`);
    }
  }

  private async startConsumingEvents(): Promise<void> {
    try {
      // Read new messages continuously
      while (true) {
        try {
          // Read from stream with a blocking call (wait for 2 seconds)
          const results = await this.redisClient.xreadgroup(
            'GROUP', this.consumerGroup, 'consumer1',
            'COUNT', '10',
            'BLOCK', '2000',
            'STREAMS', this.streamName, '>'
          );

          if (results && results.length > 0) {
            const [streamName, messages] = results[0];
            
            for (const [id, fields] of messages) {
              // Process each message
              try {
                // Convert the flat array from Redis to an object
                const eventData: Record<string, string> = {};
                for (let i = 0; i < fields.length; i += 2) {
                  eventData[fields[i]] = fields[i + 1];
                }

                // Parse JSON data
                const event: EventData = {
                  id: eventData.id || id,
                  entityId: parseInt(eventData.entityId, 10),
                  entityType: eventData.entityType,
                  organizationId: parseInt(eventData.organizationId, 10),
                  timestamp: eventData.timestamp,
                  type: eventData.type,
                  data: JSON.parse(eventData.data || '{}'),
                };

                // Queue the event for processing
                await this.eventsStream.add('process-event', event);

                // Acknowledge the message
                await this.redisClient.xack(this.streamName, this.consumerGroup, id);
              } catch (error) {
                console.error(`[PlaybookTriggerEngine] Error processing message ${id}: ${error.message}`);
                // Skip this message and continue to the next one
                await this.redisClient.xack(this.streamName, this.consumerGroup, id);
              }
            }
          }
        } catch (error) {
          console.error(`[PlaybookTriggerEngine] Error reading from stream: ${error.message}`);
          // Brief pause before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Fatal error in consumer: ${error.message}`);
      // Attempt to restart after a short delay
      setTimeout(() => this.startConsumingEvents(), 5000);
    }
  }

  private setupEventListeners(): void {
    // Also listen to local eventBus for compatibility
    eventBus.subscribeToEvent('alert.created', async (event) => {
      try {
        // Publish to Redis Stream for persistence
        await this.publishEventToStream(event);
      } catch (error) {
        console.error(`[PlaybookTriggerEngine] Error publishing to stream: ${error.message}`);
      }
    });
  }

  // Method to publish events to Redis Stream
  public async publishEventToStream(event: any): Promise<string> {
    try {
      // Generate a unique ID for idempotence if not present
      if (!event.id) {
        event.id = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }

      // Serialize data field to JSON
      const serializedData = JSON.stringify(event.data || {});

      // Add event to stream
      const messageId = await this.redisClient.xadd(
        this.streamName,
        '*', // Auto-generate ID
        'id', event.id,
        'type', event.type,
        'entityId', event.entityId.toString(),
        'entityType', event.entityType,
        'organizationId', event.organizationId.toString(),
        'timestamp', event.timestamp || new Date().toISOString(),
        'data', serializedData
      );

      console.log(`[PlaybookTriggerEngine] Published event ${event.type} to stream with ID ${messageId}`);
      return messageId;
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Error publishing to stream: ${error.message}`);
      throw error;
    }
  }

  // Process events from the queue
  private async processEvent(job: any): Promise<any> {
    const event = job.data as EventData;
    console.log(`[PlaybookTriggerEngine] Processing ${event.type} event for entity ${event.entityId}`);

    try {
      // Only process alert.created events for now
      if (event.type !== 'alert.created') {
        return { processed: false, reason: 'Not an alert.created event' };
      }

      // Find bindings that match this event type
      const matchingBindings = await db.select()
        .from(playbookBindings)
        .where(
          and(
            eq(playbookBindings.eventType, event.type),
            eq(playbookBindings.isActive, true),
            eq(playbookBindings.organizationId, event.organizationId)
          )
        )
        .orderBy(db.desc(playbookBindings.priority));

      if (matchingBindings.length === 0) {
        return { processed: false, reason: 'No matching bindings found' };
      }

      const triggeredPlaybooks = [];

      // Evaluate each binding to see if it should trigger
      for (const binding of matchingBindings) {
        if (await this.evaluateBinding(binding, event)) {
          // Get the playbook
          const [playbook] = await db.select()
            .from(playbooks)
            .where(and(
              eq(playbooks.id, binding.playbookId),
              eq(playbooks.isActive, true)
            ));

          if (playbook) {
            // Trigger the playbook execution
            const jobId = await soarExecutor.enqueuePlaybook({
              playbookId: playbook.id.toString(),
              triggerEvent: event,
              organizationId: event.organizationId.toString(),
            }, binding.priority);

            console.log(`[PlaybookTriggerEngine] Triggered playbook ${playbook.id} with job ID ${jobId}`);
            
            triggeredPlaybooks.push({
              playbookId: playbook.id,
              name: playbook.name,
              bindingId: binding.id,
              jobId
            });
          }
        }
      }

      return {
        processed: true,
        eventType: event.type,
        entityId: event.entityId,
        triggeredPlaybooks
      };
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Error processing event: ${error.message}`);
      throw error;
    }
  }

  // Evaluate if a binding matches an event
  private async evaluateBinding(binding: typeof playbookBindings.$inferSelect, event: EventData): Promise<boolean> {
    try {
      // If no predicate, always trigger
      if (!binding.predicate) {
        return true;
      }

      // Simple evaluation for MVP
      // This can be replaced with a more robust expression evaluator like JSONata or JQ
      const predicate = binding.predicate.trim();
      
      // Handle basic severity check
      if (predicate.includes('severity ==')) {
        const severityMatch = predicate.match(/severity\s*==\s*['"](\w+)['"]/);
        if (severityMatch && severityMatch[1]) {
          const expectedSeverity = severityMatch[1].toLowerCase();
          const actualSeverity = (event.data.severity || '').toLowerCase();
          return expectedSeverity === actualSeverity;
        }
      }
      
      // Handle basic tag check
      if (predicate.includes('tags.contains')) {
        const tagMatch = predicate.match(/tags\.contains\(['"](\w+)['"]\)/);
        if (tagMatch && tagMatch[1]) {
          const expectedTag = tagMatch[1].toLowerCase();
          const tags = event.data.tags || [];
          return tags.some((tag: string) => tag.toLowerCase() === expectedTag);
        }
      }

      // For MVP, default to true if we can't parse the predicate
      return true;
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Error evaluating binding: ${error.message}`);
      return false;
    }
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    try {
      await this.worker.close();
      await this.eventsStream.close();
      await this.redisClient.quit();
    } catch (error) {
      console.error(`[PlaybookTriggerEngine] Error during shutdown: ${error.message}`);
    }
  }
}

// Singleton instance
export const playbookTriggerEngine = PlaybookTriggerEngine.getInstance();