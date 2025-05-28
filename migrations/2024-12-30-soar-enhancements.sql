-- Migration: Enhance SOAR tables for improved functionality
-- Version: 2024-12-30-soar-enhancements

-- Enhance playbooks table with new fields
ALTER TABLE playbooks 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS owner_tenant VARCHAR(255),
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS retry_policy JSONB DEFAULT '{"maxRetries": 3, "backoffMultiplier": 2, "initialDelay": 1000}',
ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER DEFAULT 3600,
ADD COLUMN IF NOT EXISTS concurrency_limit INTEGER DEFAULT 1;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_playbooks_trigger_type ON playbooks(trigger_type);
CREATE INDEX IF NOT EXISTS idx_playbooks_organization_active ON playbooks(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_playbooks_enabled ON playbooks(enabled);

-- Enhance playbook_executions table
ALTER TABLE playbook_executions
ADD COLUMN IF NOT EXISTS job_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS execution_context JSONB,
ADD COLUMN IF NOT EXISTS steps_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS steps_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_step_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS metrics JSONB;

-- Add indexes for playbook_executions
CREATE INDEX IF NOT EXISTS idx_executions_status ON playbook_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_organization ON playbook_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_executions_job_id ON playbook_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON playbook_executions(started_at);

-- Create playbook_run_steps table for detailed step tracking
CREATE TABLE IF NOT EXISTS playbook_run_steps (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES playbook_executions(id) ON DELETE CASCADE,
    step_id VARCHAR(255) NOT NULL,
    step_name VARCHAR(255),
    action_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, skipped
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(execution_id, step_id)
);

-- Add indexes for playbook_run_steps
CREATE INDEX IF NOT EXISTS idx_run_steps_execution ON playbook_run_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_status ON playbook_run_steps(status);

-- Create action_registry table for managing available actions
CREATE TABLE IF NOT EXISTS action_registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    version VARCHAR(50) DEFAULT '1.0.0',
    schema_definition JSONB NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    requires_permissions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert core actions into the registry
INSERT INTO action_registry (name, display_name, description, category, schema_definition, requires_permissions) VALUES
('notify_email', 'Email Notification', 'Send email notifications', 'notification', 
 '{"type":"object","properties":{"to":{"type":"string","format":"email"},"subject":{"type":"string"},"body":{"type":"string"}}}',
 '["soar.execute"]'),
('notify_slack', 'Slack Notification', 'Send Slack messages', 'notification',
 '{"type":"object","properties":{"channel":{"type":"string"},"message":{"type":"string"}}}',
 '["soar.execute"]'),
('block_ip', 'Block IP Address', 'Block IP address in firewall', 'remediation',
 '{"type":"object","properties":{"ipAddress":{"type":"string","format":"ipv4"},"reason":{"type":"string"}}}',
 '["soar.execute", "security.remediate"]'),
('isolate_host', 'Isolate Host', 'Isolate host from network', 'remediation',
 '{"type":"object","properties":{"hostname":{"type":"string"},"reason":{"type":"string"}}}',
 '["soar.execute", "security.remediate"]'),
('create_jira_ticket', 'Create Jira Ticket', 'Create Jira issue', 'notification',
 '{"type":"object","properties":{"projectKey":{"type":"string"},"summary":{"type":"string"},"description":{"type":"string"}}}',
 '["soar.execute"]')
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    schema_definition = EXCLUDED.schema_definition,
    updated_at = NOW();

-- Create soar_metrics table for observability
CREATE TABLE IF NOT EXISTS soar_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(10,4) NOT NULL,
    labels JSONB DEFAULT '{}',
    organization_id INTEGER REFERENCES organizations(id),
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for metrics
CREATE INDEX IF NOT EXISTS idx_soar_metrics_name ON soar_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_soar_metrics_recorded_at ON soar_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_soar_metrics_organization ON soar_metrics(organization_id);

-- Create soar_permissions table for RBAC
CREATE TABLE IF NOT EXISTS soar_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    permission_name VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP DEFAULT NOW(),
    granted_by INTEGER REFERENCES users(id),
    UNIQUE(user_id, organization_id, permission_name)
);

-- Add indexes for permissions
CREATE INDEX IF NOT EXISTS idx_soar_permissions_user ON soar_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_soar_permissions_org ON soar_permissions(organization_id);

-- Insert default SOAR permissions
INSERT INTO soar_permissions (user_id, organization_id, permission_name, granted_by)
SELECT 
    u.id as user_id,
    u.organization_id,
    perm.permission_name,
    NULL as granted_by
FROM users u
CROSS JOIN (
    VALUES 
    ('soar.view'),
    ('soar.execute'),
    ('soar.manage')
) AS perm(permission_name)
WHERE u.role IN ('admin', 'security_analyst')
ON CONFLICT (user_id, organization_id, permission_name) DO NOTHING;

-- Create view for playbook execution statistics
CREATE OR REPLACE VIEW playbook_execution_stats AS
SELECT 
    p.id as playbook_id,
    p.name as playbook_name,
    p.organization_id,
    COUNT(pe.id) as total_executions,
    COUNT(CASE WHEN pe.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN pe.status = 'failed' THEN 1 END) as failed_executions,
    ROUND(
        (COUNT(CASE WHEN pe.status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(pe.id), 0))::numeric, 
        2
    ) as success_rate,
    AVG(EXTRACT(EPOCH FROM (pe.completed_at - pe.started_at))) as avg_execution_time_seconds,
    MAX(pe.started_at) as last_execution_at
FROM playbooks p
LEFT JOIN playbook_executions pe ON p.id = pe.playbook_id
GROUP BY p.id, p.name, p.organization_id;

-- Create view for action usage statistics
CREATE OR REPLACE VIEW action_usage_stats AS
SELECT 
    prs.action_name,
    COUNT(*) as usage_count,
    COUNT(CASE WHEN prs.status = 'completed' THEN 1 END) as successful_count,
    COUNT(CASE WHEN prs.status = 'failed' THEN 1 END) as failed_count,
    ROUND(
        (COUNT(CASE WHEN prs.status = 'completed' THEN 1 END) * 100.0 / COUNT(*))::numeric,
        2
    ) as success_rate,
    AVG(prs.execution_time_ms) as avg_execution_time_ms
FROM playbook_run_steps prs
GROUP BY prs.action_name
ORDER BY usage_count DESC;

-- Add trigger to update playbook last_modified timestamp
CREATE OR REPLACE FUNCTION update_playbook_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_playbook_modified
    BEFORE UPDATE ON playbooks
    FOR EACH ROW
    EXECUTE FUNCTION update_playbook_modified();

-- Add trigger to update action_registry updated_at timestamp
CREATE OR REPLACE FUNCTION update_action_registry_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_action_registry_modified
    BEFORE UPDATE ON action_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_action_registry_modified();