-- Create Plans table
CREATE TABLE IF NOT EXISTS "plans" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "price_monthly" INTEGER NOT NULL,
  "price_yearly" INTEGER NOT NULL,
  "features" JSONB NOT NULL,
  "max_users" INTEGER NOT NULL,
  "max_agents" INTEGER NOT NULL,
  "max_alerts" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "stripe_price_id_monthly" TEXT UNIQUE,
  "stripe_price_id_yearly" TEXT UNIQUE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Organizations table with reference to plans
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "plan_id" INTEGER REFERENCES "plans"("id"),
  "subscription_status" TEXT DEFAULT 'inactive',
  "stripe_customer_id" TEXT UNIQUE,
  "max_users" INTEGER,
  "max_storage" INTEGER,
  "subscription_start_date" TIMESTAMP WITH TIME ZONE,
  "subscription_end_date" TIMESTAMP WITH TIME ZONE,
  "domain" TEXT,
  "logo" TEXT,
  "api_key" TEXT,
  "billing_cycle" TEXT,
  "stripe_subscription_id" TEXT,
  "email" TEXT,
  "contact_name" TEXT,
  "contact_email" TEXT,
  "settings" JSONB
);

-- Alter existing tables to add organization_id foreign key
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "threat_intel" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "metrics" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER REFERENCES "organizations"("id");

-- Update users table to make organization_id required after migration
-- This will be executed after data migration to ensure all users have an organization
-- ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;