/**
 * Event Processing Pipeline
 * Handles processing of events from all connectors through parsing, enrichment, and storage
 */

import { RawEvent } from './connector.interface';
import { InsertAlert, alerts } from '@shared/schema';
import { db } from '../../db';
import { log } from '../../vite';
import { z } from 'zod';
import { connectorRegistry } from './connector.interface';
import { eventBus } from '../../src/services/eventBus';

// Schema for validating event structure
const rawEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  source: z.string(),
  type: z.string(),
  payload: z.record(z.any()),
  tags: z.array(z.string()),
  metadata: z.object({
    connectorId: z.string(),
    organizationId: z.string(),
  }).optional(),
});

// Schema for structured data
const structuredDataSchema = z.object({
  timestamp: z.date(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  source: z.string(),
  sourceIp: z.string().optional(),
  destinationIp: z.string().optional(),
  message: z.string(),
  data: z.record(z.any()),
});

// Type for structured data
export interface StructuredData {
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  sourceIp?: string;
  destinationIp?: string;
  message: string;
  data: Record<string, any>;
}

// Type for enriched data
export interface EnrichedData extends StructuredData {
  enrichments: Record<string, any>;
  context?: Record<string, any>;
  recommendedAction?: string;
  insight?: string;
}

/**
 * Event Pipeline class for processing events
 */
export class EventPipeline {
  private static instance: EventPipeline;
  
  private constructor() {
    // Set up event listeners for all connectors
    this.setupConnectorListeners();
  }
  
  public static getInstance(): EventPipeline {
    if (!EventPipeline.instance) {
      EventPipeline.instance = new EventPipeline();
    }
    return EventPipeline.instance;
  }
  
  /**
   * Set up event listeners for all connectors
   */
  private setupConnectorListeners(): void {
    // Get the connector registry
    const registry = connectorRegistry;
    
    // Listen for new connector registrations
    registry.on('connector-registered', (connector: any) => {
      this.attachListenerToConnector(connector);
    });
    
    // Attach listeners to existing connectors
    for (const connector of registry.getAllConnectors()) {
      this.attachListenerToConnector(connector);
    }
  }
  
  /**
   * Attach event listener to a connector
   */
  private attachListenerToConnector(connector: any): void {
    // Listen for events from this connector
    connector.on('event', (event: RawEvent) => {
      this.processEvent(event).catch(error => {
        log(`Error processing event from connector ${connector.id}: ${error}`, 'event-pipeline');
      });
    });
  }
  
  /**
   * Process a single event through the pipeline
   */
  public async processEvent(event: RawEvent): Promise<void> {
    try {
      // Validate event structure
      const validationResult = rawEventSchema.safeParse(event);
      if (!validationResult.success) {
        log(`Invalid event structure: ${validationResult.error}`, 'event-pipeline');
        return;
      }
      
      // 1. Parsing phase
      const structuredData = await this.parseEvent(event);
      if (!structuredData) {
        log(`Failed to parse event: ${event.id}`, 'event-pipeline');
        return;
      }
      
      // 2. Enrichment phase
      const enrichedData = await this.enrichEvent(structuredData, event);
      
      // 3. Storage phase
      await this.storeEvent(enrichedData, event);
      
    } catch (error) {
      log(`Error in event pipeline: ${error}`, 'event-pipeline');
      throw error;
    }
  }
  
  /**
   * Parse a raw event into structured data
   */
  private async parseEvent(event: RawEvent): Promise<StructuredData | null> {
    try {
      // Check if the event already has a structured format
      if (event.payload.structured === true) {
        return structuredDataSchema.parse(event.payload.data);
      }
      
      // Otherwise, parse based on event type
      switch (event.type) {
        case 'cloudwatch':
          return this.parseCloudWatchEvent(event);
        
        case 'google-workspace-login':
        case 'google-workspace-admin':
        case 'google-workspace-drive':
          return this.parseGoogleWorkspaceEvent(event);
        
        case 'syslog':
          return this.parseSyslogEvent(event);
        
        default:
          // For other types, use the generic parser
          return this.parseGenericEvent(event);
      }
    } catch (error) {
      log(`Error parsing event: ${error}`, 'event-pipeline');
      return null;
    }
  }
  
  /**
   * Parse a CloudWatch event
   */
  private parseCloudWatchEvent(event: RawEvent): StructuredData {
    const payload = event.payload;
    
    return {
      timestamp: event.timestamp,
      severity: this.determineSeverity(payload.message),
      source: 'aws-cloudwatch',
      sourceIp: undefined,
      destinationIp: undefined,
      message: payload.message || 'AWS CloudWatch event',
      data: {
        logGroupName: payload.logGroupName,
        logStreamName: payload.logStreamName,
        eventId: payload.eventId,
        rawMessage: payload.message
      }
    };
  }
  
  /**
   * Parse a Google Workspace event
   */
  private parseGoogleWorkspaceEvent(event: RawEvent): StructuredData {
    const payload = event.payload;
    
    return {
      timestamp: event.timestamp,
      severity: this.mapGoogleSeverity(payload.eventType),
      source: 'google-workspace',
      sourceIp: payload.ipAddress,
      destinationIp: undefined,
      message: `Google Workspace ${payload.eventName} by ${payload.actorEmail}`,
      data: {
        actorEmail: payload.actorEmail,
        eventName: payload.eventName,
        eventType: payload.eventType,
        parameters: payload.parameters,
        applicationName: payload.applicationName
      }
    };
  }
  
  /**
   * Parse a Syslog event
   */
  private parseSyslogEvent(event: RawEvent): StructuredData {
    const payload = event.payload;
    
    // Map syslog severity to our severity levels
    const severityMap: Record<number, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      0: 'critical', // Emergency
      1: 'critical', // Alert
      2: 'critical', // Critical
      3: 'high',     // Error
      4: 'medium',   // Warning
      5: 'low',      // Notice
      6: 'info',     // Informational
      7: 'info'      // Debug
    };
    
    return {
      timestamp: event.timestamp,
      severity: severityMap[payload.severity] || 'info',
      source: 'syslog',
      sourceIp: payload.sourceIp,
      destinationIp: undefined,
      message: payload.message,
      data: {
        hostname: payload.hostname,
        appName: payload.appName,
        procId: payload.procId,
        msgId: payload.msgId,
        facility: payload.facility,
        severity: payload.severity,
        rawMessage: payload.rawMessage
      }
    };
  }
  
  /**
   * Parse a generic event
   */
  private parseGenericEvent(event: RawEvent): StructuredData {
    return {
      timestamp: event.timestamp,
      severity: this.determineSeverity(JSON.stringify(event.payload)),
      source: event.source,
      message: `Event from ${event.source}`,
      data: event.payload
    };
  }
  
  /**
   * Enrich an event with additional context and intelligence
   */
  private async enrichEvent(data: StructuredData, originalEvent: RawEvent): Promise<EnrichedData> {
    // Start with the base structured data
    const enriched: EnrichedData = {
      ...data,
      enrichments: {}
    };
    
    try {
      // TODO: Add real enrichment services
      
      // Add threat intelligence enrichment
      // enriched.enrichments.threatIntel = await threatIntelService.lookup(data);
      
      // Add geographic information for IPs
      if (data.sourceIp) {
        // enriched.enrichments.geoip = await geoipService.lookup(data.sourceIp);
      }
      
      // Add vulnerability information if available
      // enriched.enrichments.vulnerabilities = await vulnService.lookup(data);
      
      // Generate AI insights for unstructured or syslog events
      if (originalEvent.type === 'syslog' || originalEvent.type === 'unstructured') {
        // enriched.insight = await aiService.generateAlertInsight(data);
        enriched.insight = `This appears to be a ${data.severity} severity event from ${data.source}`;
      }
      
      // Add recommended action based on severity and type
      enriched.recommendedAction = this.generateRecommendedAction(data.severity, originalEvent.type);
      
    } catch (error) {
      log(`Error enriching event: ${error}`, 'event-pipeline');
      // Continue with partial enrichment
    }
    
    return enriched;
  }
  
  /**
   * Store the processed event in the database
   */
  private async storeEvent(data: EnrichedData, originalEvent: RawEvent): Promise<void> {
    try {
      // Create alert record
      const alertData: InsertAlert = {
        title: data.message.substring(0, 100), // Truncate if too long
        description: data.message,
        severity: data.severity,
        source: data.source,
        sourceIp: data.sourceIp,
        destinationIp: data.destinationIp,
        timestamp: data.timestamp,
        status: 'new',
        metadata: {
          rawEvent: originalEvent,
          enriched: data.enrichments,
          context: data.context,
          recommendedAction: data.recommendedAction,
          insight: data.insight
        },
        organizationId: originalEvent.metadata?.organizationId 
          ? parseInt(originalEvent.metadata.organizationId)
          : undefined
      };
      
      // Insert into alerts table
      const result = await db.insert(alerts).values(alertData).returning();
      const alertId = result[0].id;
      
      log(`Stored alert ${alertId} from event ${originalEvent.id}`, 'event-pipeline');
      
      // If high or critical severity, emit an event for SOAR/playbooks
      if (data.severity === 'high' || data.severity === 'critical') {
        eventBus.emit('alert.created', {
          alertId,
          severity: data.severity,
          source: data.source,
          organizationId: alertData.organizationId
        });
      }
    } catch (error) {
      log(`Error storing event: ${error}`, 'event-pipeline');
      throw error;
    }
  }
  
  /**
   * Determine severity based on message content
   */
  private determineSeverity(message: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    // This is a simple heuristic - in a real system, this would be more sophisticated
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('critical') || 
        lowerMessage.includes('emergency') || 
        lowerMessage.includes('alert')) {
      return 'critical';
    }
    
    if (lowerMessage.includes('error') || 
        lowerMessage.includes('failure') || 
        lowerMessage.includes('failed')) {
      return 'high';
    }
    
    if (lowerMessage.includes('warning') || 
        lowerMessage.includes('warn')) {
      return 'medium';
    }
    
    if (lowerMessage.includes('notice') || 
        lowerMessage.includes('info')) {
      return 'low';
    }
    
    return 'info';
  }
  
  /**
   * Map Google event types to severity levels
   */
  private mapGoogleSeverity(eventType?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (!eventType) return 'info';
    
    const lowerType = eventType.toLowerCase();
    
    if (lowerType.includes('admin_login_failure') || 
        lowerType.includes('suspicious_login') || 
        lowerType.includes('unauthorized')) {
      return 'high';
    }
    
    if (lowerType.includes('login_failure') || 
        lowerType.includes('permission_change') || 
        lowerType.includes('password_change')) {
      return 'medium';
    }
    
    if (lowerType.includes('login_success') || 
        lowerType.includes('settings_change')) {
      return 'low';
    }
    
    return 'info';
  }
  
  /**
   * Generate a recommended action based on severity and event type
   */
  private generateRecommendedAction(
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
    eventType: string
  ): string {
    if (severity === 'critical') {
      return 'Immediate investigation required. Isolate affected systems if necessary.';
    }
    
    if (severity === 'high') {
      return 'Prioritize investigation within 1 hour. Review related logs and activities.';
    }
    
    if (severity === 'medium') {
      return 'Investigate within 24 hours. Monitor for additional related events.';
    }
    
    if (severity === 'low') {
      return 'Review during routine analysis. No immediate action required.';
    }
    
    return 'No action required. Informational only.';
  }
}

// Export singleton instance
export const eventPipeline = EventPipeline.getInstance();