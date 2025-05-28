import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import { virustotalProvider, abuseipdbProvider, otxProvider, osvProvider } from '../threatIntel';
import { db } from '../../../server/db';
import { threatIntelCache } from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
dotenv.config();
// Redis connection
const connection = new IORedis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    maxRetriesPerRequest: null,
});
// Initialize queue (QueueScheduler is no longer needed in BullMQ v4+)
export const intelQueue = new Queue('intel', {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
});
// Worker to process IoC lookups
new Worker('intel', async (job) => {
    const { ioc, type } = job.data;
    // Check cache for valid entry
    const cacheHits = await db.select().from(threatIntelCache)
        .where(and(eq(threatIntelCache.iocValue, ioc), sql `(last_seen + ttl) > now()`))
        .execute();
    if (cacheHits.length > 0) {
        return;
    }
    const reports = [];
    // Perform lookups for each provider based on IoC type
    if (type === 'hash' || type === 'url') {
        reports.push(await virustotalProvider.lookup(ioc));
    }
    if (type === 'ip') {
        reports.push(await abuseipdbProvider.lookup(ioc));
        reports.push(await otxProvider.lookup(ioc, type));
    }
    if (type === 'cve') {
        reports.push(await osvProvider.lookup(ioc));
    }
    // Upsert each report into cache
    for (const report of reports) {
        const now = new Date();
        await db.insert(threatIntelCache)
            .values({
            iocValue: report.ioc,
            iocType: type,
            provider: report.provider,
            rawJson: report.raw,
            verdict: report.verdict,
            score: report.score,
            firstSeen: report.firstSeen || now,
            lastSeen: now,
            ttl: report.ttl,
        })
            .onConflictDoUpdate({
            target: threatIntelCache.iocValue,
            set: {
                rawJson: report.raw,
                verdict: report.verdict,
                score: report.score,
                lastSeen: now,
                ttl: report.ttl,
            },
        });
    }
}, { connection });
