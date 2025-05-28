-- Create playbook_bindings table for SOAR automatic triggering
CREATE TABLE IF NOT EXISTS "playbook_bindings" (
  "id" SERIAL PRIMARY KEY,
  "event_type" TEXT NOT NULL,
  "predicate" TEXT,
  "playbook_id" INTEGER NOT NULL REFERENCES "playbooks"("id") ON DELETE CASCADE,
  "created_by" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "description" TEXT,
  "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
  "priority" INTEGER DEFAULT 0
);

-- Create index on event_type for fast lookup
CREATE INDEX IF NOT EXISTS "playbook_bindings_event_type_idx" ON "playbook_bindings"("event_type");

-- Create index on organization_id for filtering by organization
CREATE INDEX IF NOT EXISTS "playbook_bindings_organization_id_idx" ON "playbook_bindings"("organization_id");

-- Create composite index on event_type and is_active
CREATE INDEX IF NOT EXISTS "playbook_bindings_event_active_idx" ON "playbook_bindings"("event_type", "is_active");