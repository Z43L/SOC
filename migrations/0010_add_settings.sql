-- Migration: Add settings tables
-- Created: 2025-05-26

-- User Settings table
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'en-US',
	"timezone" text DEFAULT 'UTC',
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"notify_channel" jsonb DEFAULT '{}' NOT NULL,
	"avatar_url" text,
	"theme" text DEFAULT 'system',
	"date_format" text DEFAULT 'MM/dd/yyyy',
	"time_format" text DEFAULT '12h',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Organization Settings table
CREATE TABLE IF NOT EXISTS "org_settings" (
	"organization_id" integer PRIMARY KEY NOT NULL,
	"branding" jsonb DEFAULT '{}' NOT NULL,
	"security" jsonb DEFAULT '{}' NOT NULL,
	"default_locale" text DEFAULT 'en-US',
	"default_timezone" text DEFAULT 'UTC',
	"integrations" jsonb DEFAULT '{}' NOT NULL,
	"notifications" jsonb DEFAULT '{}' NOT NULL,
	"compliance" jsonb DEFAULT '{}' NOT NULL,
	"audit_retention_days" integer DEFAULT 365,
	"allowed_domains" jsonb,
	"sso_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Settings History table for audit trail
CREATE TABLE IF NOT EXISTS "settings_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"changed_by" integer NOT NULL,
	"change_type" text NOT NULL,
	"field_name" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"organization_id" integer NOT NULL
);

-- Uploaded Files table
CREATE TABLE IF NOT EXISTS "uploaded_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"uploaded_by" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "settings_history" ADD CONSTRAINT "settings_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "settings_history" ADD CONSTRAINT "settings_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "settings_history_entity_type_entity_id_idx" ON "settings_history" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "settings_history_timestamp_idx" ON "settings_history" ("timestamp");
CREATE INDEX IF NOT EXISTS "uploaded_files_purpose_idx" ON "uploaded_files" ("purpose");
CREATE INDEX IF NOT EXISTS "uploaded_files_organization_id_idx" ON "uploaded_files" ("organization_id");

-- Insert default settings for existing organizations
INSERT INTO "org_settings" ("organization_id", "branding", "security", "integrations", "notifications", "compliance")
SELECT 
    id,
    '{"primaryColor": "#3b82f6", "secondaryColor": "#64748b", "accentColor": "#06b6d4"}',
    '{"passwordPolicy": {"minLength": 12, "requireUppercase": true, "requireLowercase": true, "requireNumbers": true, "requireSpecialChars": true, "preventReuse": 5}, "mfaRequired": false, "sessionTimeout": 480, "maxLoginAttempts": 5, "lockoutDuration": 30}',
    '{}',
    '{"email": {"enabled": true}, "slack": {"enabled": false}, "teams": {"enabled": false}}',
    '{}'
FROM "organizations"
WHERE id NOT IN (SELECT organization_id FROM "org_settings");

-- Insert default settings for existing users
INSERT INTO "user_settings" ("user_id", "notify_channel")
SELECT 
    id,
    '{"email": true, "slack": false, "teams": false}'
FROM "users"
WHERE id NOT IN (SELECT user_id FROM "user_settings");
