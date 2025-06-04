-- Create Actions catalog table
CREATE TABLE IF NOT EXISTS "actions" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Insert core actions
INSERT INTO "actions" ("name", "description") VALUES
  ('notify_slack', 'Send notification to Slack channel'),
  ('create_ticket', 'Create support/incident ticket'),
  ('isolate_host', 'Isolate host from network'),
  ('kill_process', 'Terminate malicious process'),
  ('quarantine_file', 'Move file to quarantine'),
  ('query_asset_risk', 'Query host risk assessment'),
  ('log_message', 'Log a message'),
  ('delay', 'Add delay between steps');

-- Update playbooks table to use definition instead of steps
ALTER TABLE "playbooks" 
  RENAME COLUMN "steps" TO "definition";

-- Add organization_id to playbook_executions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'playbook_executions' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE "playbook_executions" 
    ADD COLUMN "organization_id" INTEGER REFERENCES "organizations"("id");
  END IF;
END $$;

-- Add organization_id to playbooks if not exists  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'playbooks' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE "playbooks" 
    ADD COLUMN "organization_id" INTEGER REFERENCES "organizations"("id");
  END IF;
END $$;
