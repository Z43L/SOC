-- Create Playbooks table
CREATE TABLE IF NOT EXISTS "playbooks" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "trigger_type" TEXT NOT NULL,
  "trigger_condition" JSONB,
  "steps" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "creator" INTEGER REFERENCES "users"("id"),
  "last_executed" TIMESTAMP,
  "last_modified" TIMESTAMP DEFAULT NOW(),
  "created_at" TIMESTAMP DEFAULT NOW(),
  "execution_count" INTEGER DEFAULT 0,
  "avg_execution_time" INTEGER,
  "category" TEXT,
  "tags" JSONB
);

-- Create Playbook Executions table
CREATE TABLE IF NOT EXISTS "playbook_executions" (
  "id" SERIAL PRIMARY KEY,
  "playbook_id" INTEGER REFERENCES "playbooks"("id") NOT NULL,
  "started_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "completed_at" TIMESTAMP,
  "status" TEXT NOT NULL,
  "triggered_by" INTEGER REFERENCES "users"("id"),
  "trigger_source" TEXT NOT NULL,
  "trigger_entity_id" INTEGER,
  "results" JSONB,
  "execution_time" INTEGER,
  "error" TEXT
);

-- Create index on playbook_id for playbook_executions
CREATE INDEX IF NOT EXISTS "playbook_executions_playbook_id_idx" ON "playbook_executions"("playbook_id");

-- Create index on trigger_type for playbooks
CREATE INDEX IF NOT EXISTS "playbooks_trigger_type_idx" ON "playbooks"("trigger_type");

-- Create index on is_active for playbooks
CREATE INDEX IF NOT EXISTS "playbooks_is_active_idx" ON "playbooks"("is_active");
