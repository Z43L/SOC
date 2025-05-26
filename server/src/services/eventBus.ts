import { EventEmitter } from 'events';

export interface SOCEvent {
  type: string;
  entityId: number;
  entityType: 'alert' | 'incident' | 'playbook';
  organizationId: number;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface AlertCreatedEvent extends SOCEvent {
  type: 'alert.created';
  entityType: 'alert';
  data: {
    alertId: number;
    severity: string;
    category?: string;
    sourceIp?: string;
    hostId?: string;
    hostname?: string;
  };
}

export interface IncidentUpdatedEvent extends SOCEvent {
  type: 'incident.updated';
  entityType: 'incident';
  data: {
    incidentId: number;
    oldStatus: string;
    newStatus: string;
    severity: string;
  };
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public publishEvent(event: SOCEvent): void {
    console.log(`[EventBus] Publishing event: ${event.type}`, {
      entityId: event.entityId,
      organizationId: event.organizationId,
    });
    
    this.emit(event.type, event);
    this.emit('*', event); // wildcard listener
  }

  public subscribeToEvent(eventType: string, handler: (event: SOCEvent) => void): void {
    this.on(eventType, handler);
  }

  public subscribeToAllEvents(handler: (event: SOCEvent) => void): void {
    this.on('*', handler);
  }
}

export const eventBus = EventBus.getInstance();
