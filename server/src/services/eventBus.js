import { EventEmitter } from 'events';
export class EventBus extends EventEmitter {
    static instance;
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    publishEvent(event) {
        console.log(`[EventBus] Publishing event: ${event.type}`, {
            entityId: event.entityId,
            organizationId: event.organizationId,
        });
        this.emit(event.type, event);
        this.emit('*', event); // wildcard listener
    }
    // Alias for publishEvent to maintain compatibility
    publish(event) {
        return this.publishEvent(event);
    }
    subscribeToEvent(eventType, handler) {
        this.on(eventType, handler);
    }
    subscribeToAllEvents(handler) {
        this.on('*', handler);
    }
}
export const eventBus = EventBus.getInstance();
