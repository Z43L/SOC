-- Adds encrypted_credentials, last_event_at, events_per_min, error_message to connectors
ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS encrypted_credentials JSONB;
ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS events_per_min NUMERIC;
ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Creates connector_logs table
CREATE TABLE IF NOT EXISTS connector_logs (
  id SERIAL PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL
);
-- (Partitioning can be added if needed, e.g., by month)
