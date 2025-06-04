import Redis from 'redis';
import { db } from '../../db';
import { metricsRollup } from '../../../shared/schema';
import { sql } from 'drizzle-orm';
import { incidents } from '../../../shared/schema';
// Initialize Redis client
const redisClient = Redis.createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));
await redisClient.connect();
// Helper to build cache key
function buildCacheKey(prefix, params) {
    return `${prefix}:${Object.values(params).join(':')}`;
}
export async function getTimeSeries(metric, orgId, from, to, period) {
    const cacheKey = buildCacheKey('analytics:timeseries', { metric, orgId, from, to, period });
    const cached = await redisClient.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    const rows = await db
        .select({ tsBucket: metricsRollup.tsBucket, value: metricsRollup.value })
        .from(metricsRollup)
        .where(sql `${metricsRollup.metric} = ${metric}`, sql `${metricsRollup.organizationId} = ${orgId}`, sql `${metricsRollup.period} = ${period}`, sql `${metricsRollup.tsBucket} BETWEEN ${from} AND ${to}`)
        .orderBy(metricsRollup.tsBucket);
    await redisClient.set(cacheKey, JSON.stringify(rows), { EX: 300 });
    return rows;
}
export async function getTopN(metric, orgId, limit, from, to) {
    const cacheKey = buildCacheKey('analytics:top', { metric, orgId, limit, from, to });
    const cached = await redisClient.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    let result;
    if (metric === 'mitre-tactics') {
        const rows = await db
            .select({
            tactic: sql `value`,
            count: sql `COUNT(*)`
        })
            .from(sql `(SELECT jsonb_array_elements_text(${incidents.mitreTactics}) as value, ${incidents.organizationId} FROM ${incidents.name}) as t`)
            .where(sql `organization_id = ${orgId}`)
            .and(sql `t.value BETWEEN ${from} AND ${to}`)
            .groupBy(sql `value`)
            .orderBy(sql `count DESC`)
            .limit(limit);
        result = rows;
    }
    else {
        // Fallback: return empty
        result = [];
    }
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: 300 });
    return result;
}
