import { db } from '../../db';
import { eventsRaw } from '@shared/schema';
import { Kafka } from 'kafkajs';
import client from 'prom-client';
// Prometheus metrics
const eventsCounter = new client.Counter({
    name: 'events_ingested_total',
    help: 'Total number of events ingested',
    labelNames: ['connector']
});
const latencyHistogram = new client.Histogram({
    name: 'connector_latency_ms',
    help: 'Latency of connectors in ms',
    labelNames: ['connector']
});
// Kafka setup
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();
export class EventService {
    constructor() {
        producer.connect().catch(console.error);
    }
    async create(event) {
        const start = Date.now();
        // Insert into Postgres
        const insert = {
            id: event.id,
            agentId: event.agentId,
            severity: event.severity,
            category: event.category,
            engine: event.engine,
            timestamp: new Date(event.timestamp),
            data: event
        };
        await db.insert(eventsRaw).values(insert);
        // Publish to Kafka
        try {
            await producer.send({
                topic: 'events.raw',
                messages: [{ key: event.id, value: JSON.stringify(event) }]
            });
        }
        catch (err) {
            console.error('Kafka publish error', err);
        }
        // Update metrics
        eventsCounter.labels(event.engine).inc();
        const duration = Date.now() - start;
        latencyHistogram.labels(event.engine).observe(duration);
    }
}
