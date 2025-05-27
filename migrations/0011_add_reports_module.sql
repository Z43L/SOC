-- Add Reports Module Tables
-- Migration: 0011_add_reports_module.sql

BEGIN;

-- Report Templates table
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'executive_summary', 'technical_incidents', 'compliance_audit', etc.
  description TEXT,
  schedule_cron TEXT, -- Cron expression for automated generation
  parameters JSONB NOT NULL DEFAULT '{}', -- Report-specific parameters
  notify_emails JSONB, -- Array of email addresses
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Generated Reports table
CREATE TABLE IF NOT EXISTS reports_generated (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE SET NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- Same values as report_templates.type
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'generating', 'completed', 'failed', 'cancelled'
  format TEXT NOT NULL DEFAULT 'pdf', -- 'pdf', 'html', 'csv', 'xlsx'
  period_from TIMESTAMP NOT NULL,
  period_to TIMESTAMP NOT NULL,
  file_path TEXT, -- Path to generated file
  file_size INTEGER, -- File size in bytes
  hash_sha256 TEXT, -- SHA-256 hash for integrity
  metadata JSONB, -- Additional metadata
  generated_by INTEGER REFERENCES users(id),
  requested_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  generated_at TIMESTAMP,
  error TEXT -- Error message if generation failed
);

-- Report Artifacts table (for attachments, charts, etc.)
CREATE TABLE IF NOT EXISTS report_artifacts (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports_generated(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- 'chart', 'attachment', 'signature', 'evidence'
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_report_templates_organization_id ON report_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_type ON report_templates(type);
CREATE INDEX IF NOT EXISTS idx_report_templates_enabled ON report_templates(is_enabled);

CREATE INDEX IF NOT EXISTS idx_reports_generated_organization_id ON reports_generated(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_template_id ON reports_generated(template_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_status ON reports_generated(status);
CREATE INDEX IF NOT EXISTS idx_reports_generated_type ON reports_generated(type);
CREATE INDEX IF NOT EXISTS idx_reports_generated_period ON reports_generated(period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_report_artifacts_report_id ON report_artifacts(report_id);
CREATE INDEX IF NOT EXISTS idx_report_artifacts_type ON report_artifacts(artifact_type);

-- Insert default report templates
INSERT INTO report_templates (organization_id, name, type, description, parameters, notify_emails, created_by)
SELECT 
  org.id,
  'Executive Summary - Monthly',
  'executive_summary',
  'High-level overview of security posture and key incidents',
  '{"period": "monthly", "includeMetrics": true, "includeIncidents": true, "includeCompliance": true}',
  '[]',
  NULL
FROM organizations org
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates rt 
  WHERE rt.organization_id = org.id AND rt.type = 'executive_summary'
);

INSERT INTO report_templates (organization_id, name, type, description, parameters, notify_emails, created_by)
SELECT 
  org.id,
  'Technical Incidents Report',
  'technical_incidents',
  'Detailed analysis of security incidents and response actions',
  '{"period": "weekly", "severityFilter": ["critical", "high"], "includeTimeline": true, "includeMitre": true}',
  '[]',
  NULL
FROM organizations org
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates rt 
  WHERE rt.organization_id = org.id AND rt.type = 'technical_incidents'
);

INSERT INTO report_templates (organization_id, name, type, description, parameters, notify_emails, created_by)
SELECT 
  org.id,
  'Compliance & Audit Report',
  'compliance_audit',
  'Regulatory compliance status and audit evidence',
  '{"period": "monthly", "frameworks": ["ISO 27001", "NIST CSF"], "includeEvidence": true, "includeGaps": true}',
  '[]',
  NULL
FROM organizations org
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates rt 
  WHERE rt.organization_id = org.id AND rt.type = 'compliance_audit'
);

INSERT INTO report_templates (organization_id, name, type, description, parameters, notify_emails, created_by)
SELECT 
  org.id,
  'Agent Health Report',
  'agent_health',
  'Status and performance of security agents and connectors',
  '{"period": "weekly", "includeOfflineAgents": true, "includeConnectorErrors": true, "includeMetrics": true}',
  '[]',
  NULL
FROM organizations org
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates rt 
  WHERE rt.organization_id = org.id AND rt.type = 'agent_health'
);

COMMIT;
