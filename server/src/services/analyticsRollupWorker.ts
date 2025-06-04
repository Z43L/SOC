import cron from 'node-cron';
import { db } from '../../db';
import { metricsRollup, alerts } from '../../../shared/schema';
import { sql } from 'drizzle-orm';

// Worker to aggregate alert counts into metrics_rollup
export function startAnalyticsRollupWorker() {
  // Hourly alert counts rollup
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[AnalyticsRollup] Running hourly alert counts rollup');
      const rows = await db
        .select({
          orgId: alerts.organizationId,
          tsBucket: sql`date_trunc('hour', ${alerts.timestamp})`,
          total: sql`COUNT(*)`,
          critical: sql`SUM(CASE WHEN ${alerts.severity} = 'critical' THEN 1 ELSE 0 END)`,
          high: sql`SUM(CASE WHEN ${alerts.severity} = 'high' THEN 1 ELSE 0 END)`,
          medium: sql`SUM(CASE WHEN ${alerts.severity} = 'medium' THEN 1 ELSE 0 END)`,
          low: sql`SUM(CASE WHEN ${alerts.severity} = 'low' THEN 1 ELSE 0 END)`,
        })
        .from(alerts)
        .groupBy(alerts.organizationId, sql`date_trunc('hour', ${alerts.timestamp})`);

      if (rows.length === 0) return;
      // Prepare insert values
      const values = rows.map(r => ({
        organizationId: r.orgId,
        metric: 'alert_counts',
        period: 'hour',
        tsBucket: r.tsBucket as Date,
        value: {
          total: Number(r.total),
          critical: Number(r.critical),
          high: Number(r.high),
          medium: Number(r.medium),
          low: Number(r.low),
        },
      }));
      // Upsert into metrics_rollup
      await db.insert(metricsRollup)
        .values(values)
        .onConflict(oc =>
          oc.columns([
            metricsRollup.organizationId,
            metricsRollup.metric,
            metricsRollup.period,
            metricsRollup.tsBucket,
          ]).doUpdateSet({ value: sql`EXCLUDED.value` })
        );
      console.log('[AnalyticsRollup] Completed hourly rollup for alert_counts');
    } catch (error) {
      console.error('[AnalyticsRollup] Error in hourly rollup:', error);
    }
  });

  // Daily refresh materialized views at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[AnalyticsRollup] Refreshing materialized view alert_counts_daily');
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY alert_counts_daily`);
      console.log('[AnalyticsRollup] Materialized view refreshed');
    } catch (error) {
      console.error('[AnalyticsRollup] Error refreshing materialized view:', error);
    }
  });
}
