-- Migration 0007: Create metrics_rollup table and alert_counts_daily materialized view

-- Create historical rollup table
CREATE TABLE IF NOT EXISTS metrics_rollup (
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  ts_bucket TIMESTAMP NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (org_id, metric, period, ts_bucket)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_metrics_rollup_org_metric_bucket
  ON metrics_rollup(org_id, metric, ts_bucket);

-- Daily alert counts materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS alert_counts_daily AS
SELECT
  organization_id AS org_id,
  date_trunc('day', timestamp) AS ts_bucket,
  COUNT(*) AS total,
  SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
  SUM(CASE WHEN severity = 'high'     THEN 1 ELSE 0 END) AS high,
  SUM(CASE WHEN severity = 'medium'   THEN 1 ELSE 0 END) AS medium,
  SUM(CASE WHEN severity = 'low'      THEN 1 ELSE 0 END) AS low
FROM alerts
GROUP BY organization_id, date_trunc('day', timestamp);

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_alert_counts_daily_org_bucket
  ON alert_counts_daily(org_id, ts_bucket);
