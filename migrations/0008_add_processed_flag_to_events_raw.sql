-- Adds processed_at column to events_raw for normalization pipeline
ALTER TABLE events_raw
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
