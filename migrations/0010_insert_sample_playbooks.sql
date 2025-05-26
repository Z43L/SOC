-- Sample playbooks for testing and demonstration

INSERT INTO playbooks (
  name, 
  description, 
  category, 
  trigger_type, 
  trigger_condition, 
  definition, 
  is_active, 
  organization_id,
  created_by,
  created_at,
  updated_at
) VALUES 
-- 1. Critical Alert Response
(
  'Critical Alert Response',
  'Automated response to critical security alerts including team notification, host isolation, and incident creation',
  'incident-response',
  'alert',
  '{"severity": "critical", "categories": ["malware", "intrusion", "data-exfiltration"]}',
  '{
    "version": "1.0",
    "steps": [
      {
        "id": "notify-security-team",
        "uses": "notification.slack",
        "with": {
          "channel": "#security-alerts",
          "message": "🚨 CRITICAL ALERT: {{alert.title}}\nSeverity: {{alert.severity}}\nHost: {{alert.sourceHost}}\nTime: {{alert.timestamp}}",
          "urgency": "high"
        },
        "timeout": 10000
      },
      {
        "id": "isolate-affected-host",
        "uses": "edr.isolate-host",
        "with": {
          "hostname": "{{alert.sourceHost}}",
          "reason": "Critical security alert - automatic isolation"
        },
        "if": "alert.sourceHost && alert.severity === \"critical\"",
        "timeout": 30000,
        "retries": 2,
        "errorPolicy": "continue"
      },
      {
        "id": "block-malicious-ip",
        "uses": "firewall.block-ip",
        "with": {
          "ip": "{{alert.sourceIp}}",
          "duration": "24h",
          "reason": "Blocked due to critical security alert"
        },
        "if": "alert.sourceIp && alert.category === \"malware\"",
        "timeout": 15000,
        "errorPolicy": "continue"
      },
      {
        "id": "create-security-incident",
        "uses": "incident.create",
        "with": {
          "title": "Security Incident: {{alert.title}}",
          "description": "Automatically created from critical alert {{alert.id}}. Investigation required.",
          "severity": "high",
          "category": "security",
          "assignedTo": "security-team",
          "alerts": ["{{alert.id}}"]
        },
        "timeout": 10000
      },
      {
        "id": "notify-incident-created",
        "uses": "notification.email",
        "with": {
          "to": ["security-manager@company.com", "ciso@company.com"],
          "subject": "Critical Security Incident Created: {{steps.create-security-incident.incidentId}}",
          "body": "A critical security incident has been automatically created and requires immediate attention.\n\nIncident ID: {{steps.create-security-incident.incidentId}}\nAlert: {{alert.title}}\nSeverity: {{alert.severity}}\nAffected Host: {{alert.sourceHost}}\n\nActions Taken:\n- Security team notified via Slack\n- Host isolated (if applicable)\n- Malicious IP blocked (if applicable)\n\nPlease review and take appropriate action."
        },
        "timeout": 10000,
        "errorPolicy": "continue"
      }
    ]
  }',
  true,
  1,
  1,
  NOW(),
  NOW()
),

-- 2. Phishing Email Response
(
  'Phishing Email Response',
  'Responds to phishing email alerts by disabling compromised accounts, notifying users, and blocking malicious domains',
  'incident-response',
  'alert',
  '{"category": "phishing", "severity": ["medium", "high", "critical"]}',
  '{
    "version": "1.0",
    "steps": [
      {
        "id": "disable-user-account",
        "uses": "identity.disable-user",
        "with": {
          "username": "{{alert.targetUser}}",
          "reason": "Potential phishing compromise - account disabled pending investigation"
        },
        "if": "alert.targetUser && alert.severity !== \"low\"",
        "timeout": 20000,
        "retries": 1
      },
      {
        "id": "reset-user-password",
        "uses": "identity.reset-password",
        "with": {
          "username": "{{alert.targetUser}}",
          "sendEmail": true,
          "requireChange": true
        },
        "if": "alert.targetUser && steps.disable-user-account.success",
        "timeout": 15000,
        "errorPolicy": "continue"
      },
      {
        "id": "block-malicious-domain",
        "uses": "firewall.block-domain",
        "with": {
          "domain": "{{alert.maliciousDomain}}",
          "reason": "Phishing domain identified in security alert"
        },
        "if": "alert.maliciousDomain",
        "timeout": 15000,
        "errorPolicy": "continue"
      },
      {
        "id": "notify-user",
        "uses": "notification.email",
        "with": {
          "to": "{{alert.targetUser}}@company.com",
          "subject": "Security Alert: Potential Phishing Attempt",
          "body": "We have detected a potential phishing attempt targeting your account. As a precaution:\n\n- Your account has been temporarily disabled\n- Your password has been reset\n- Please contact IT security immediately\n\nDo not click on any suspicious links or provide credentials to untrusted sources."
        },
        "if": "alert.targetUser",
        "timeout": 10000,
        "errorPolicy": "continue"
      },
      {
        "id": "notify-it-security",
        "uses": "notification.slack",
        "with": {
          "channel": "#it-security",
          "message": "📧 Phishing Response Executed\nUser: {{alert.targetUser}}\nDomain: {{alert.maliciousDomain}}\nActions: Account disabled, password reset, domain blocked"
        },
        "timeout": 10000
      }
    ]
  }',
  true,
  1,
  1,
  NOW(),
  NOW()
),

-- 3. Vulnerability Patch Management
(
  'Critical Vulnerability Response',
  'Automated response to critical vulnerability alerts including asset inventory, patch scheduling, and stakeholder notification',
  'vulnerability-management',
  'alert',
  '{"category": "vulnerability", "severity": "critical", "cvssScore": {"$gte": 9.0}}',
  '{
    "version": "1.0",
    "steps": [
      {
        "id": "inventory-affected-assets",
        "uses": "asset.query",
        "with": {
          "software": "{{alert.software}}",
          "version": "{{alert.version}}",
          "includeOffline": false
        },
        "timeout": 30000
      },
      {
        "id": "create-patch-ticket",
        "uses": "ticket.create",
        "with": {
          "system": "jira",
          "project": "SEC",
          "issueType": "Task",
          "summary": "CRITICAL: Patch {{alert.software}} - CVE-{{alert.cveId}}",
          "description": "Critical vulnerability identified requiring immediate patching.\n\nCVE: {{alert.cveId}}\nCVSS Score: {{alert.cvssScore}}\nAffected Software: {{alert.software}} {{alert.version}}\nAffected Assets: {{steps.inventory-affected-assets.count}} systems\n\nPlease coordinate with system owners for emergency patching.",
          "priority": "Critical",
          "assignee": "security-team",
          "labels": ["security", "vulnerability", "critical"]
        },
        "timeout": 15000
      },
      {
        "id": "schedule-emergency-patching",
        "uses": "patch-management.schedule",
        "with": {
          "assets": "{{steps.inventory-affected-assets.assets}}",
          "patch": "{{alert.patch}}",
          "priority": "emergency",
          "window": "immediate",
          "approvers": ["security-manager", "it-manager"]
        },
        "if": "steps.inventory-affected-assets.count > 0",
        "timeout": 20000,
        "errorPolicy": "continue"
      },
      {
        "id": "notify-stakeholders",
        "uses": "notification.email",
        "with": {
          "to": ["security-manager@company.com", "it-manager@company.com", "ciso@company.com"],
          "subject": "CRITICAL VULNERABILITY ALERT: {{alert.software}} - CVE-{{alert.cveId}}",
          "body": "A critical vulnerability has been identified that requires immediate attention.\n\nVulnerability Details:\n- CVE ID: {{alert.cveId}}\n- CVSS Score: {{alert.cvssScore}}\n- Software: {{alert.software}} {{alert.version}}\n- Affected Systems: {{steps.inventory-affected-assets.count}}\n\nActions Taken:\n- Asset inventory completed\n- Patch ticket created: {{steps.create-patch-ticket.ticketId}}\n- Emergency patching scheduled\n\nImmediate action required for emergency patching coordination."
        },
        "timeout": 10000
      }
    ]
  }',
  true,
  1,
  1,
  NOW(),
  NOW()
),

-- 4. Incident Status Update Notifications
(
  'Incident Status Notifications',
  'Notifies relevant stakeholders when incident status changes, ensuring proper communication flow',
  'incident-response',
  'incident',
  '{"statusChanges": ["investigating", "resolved", "closed"]}',
  '{
    "version": "1.0",
    "steps": [
      {
        "id": "determine-notification-scope",
        "uses": "conditional",
        "with": {
          "conditions": [
            {
              "if": "incident.severity === \"critical\"",
              "then": "notify-executives"
            },
            {
              "if": "incident.severity === \"high\"",
              "then": "notify-managers"
            },
            {
              "if": "incident.severity === \"medium\" || incident.severity === \"low\"",
              "then": "notify-team"
            }
          ]
        }
      },
      {
        "id": "notify-team",
        "uses": "notification.slack",
        "with": {
          "channel": "#security-incidents",
          "message": "📋 Incident Status Update\nIncident: {{incident.title}}\nStatus: {{incident.previousStatus}} → {{incident.status}}\nSeverity: {{incident.severity}}\nAssigned: {{incident.assignedTo}}"
        },
        "timeout": 10000
      },
      {
        "id": "notify-managers",
        "uses": "notification.email",
        "with": {
          "to": ["security-manager@company.com", "it-manager@company.com"],
          "subject": "Incident Status Update: {{incident.title}}",
          "body": "Incident status has been updated:\n\nIncident ID: {{incident.id}}\nTitle: {{incident.title}}\nPrevious Status: {{incident.previousStatus}}\nNew Status: {{incident.status}}\nSeverity: {{incident.severity}}\nAssigned To: {{incident.assignedTo}}\nLast Updated: {{incident.updatedAt}}\n\nFor more details, please access the incident management system."
        },
        "if": "steps.determine-notification-scope.result === \"notify-managers\" || steps.determine-notification-scope.result === \"notify-executives\"",
        "timeout": 10000,
        "errorPolicy": "continue"
      },
      {
        "id": "notify-executives",
        "uses": "notification.email",
        "with": {
          "to": ["ciso@company.com", "cto@company.com"],
          "subject": "CRITICAL INCIDENT UPDATE: {{incident.title}}",
          "body": "A critical incident status has been updated and requires executive awareness:\n\nIncident Details:\n- ID: {{incident.id}}\n- Title: {{incident.title}}\n- Previous Status: {{incident.previousStatus}}\n- New Status: {{incident.status}}\n- Severity: {{incident.severity}}\n- Duration: {{incident.duration}}\n- Assigned To: {{incident.assignedTo}}\n\nThis incident may require executive decision-making or resource allocation.",
          "urgency": "high"
        },
        "if": "steps.determine-notification-scope.result === \"notify-executives\"",
        "timeout": 10000,
        "errorPolicy": "continue"
      },
      {
        "id": "update-status-dashboard",
        "uses": "dashboard.update",
        "with": {
          "dashboard": "security-status",
          "widget": "incident-tracker",
          "data": {
            "incidentId": "{{incident.id}}",
            "status": "{{incident.status}}",
            "severity": "{{incident.severity}}",
            "lastUpdate": "{{incident.updatedAt}}"
          }
        },
        "timeout": 5000,
        "errorPolicy": "continue"
      }
    ]
  }',
  true,
  1,
  1,
  NOW(),
  NOW()
),

-- 5. Threat Intelligence Enrichment
(
  'Threat Intelligence Enrichment',
  'Automatically enriches security alerts with threat intelligence data and updates IOC databases',
  'threat-hunting',
  'alert',
  '{"categories": ["malware", "suspicious-activity", "network-anomaly"]}',
  '{
    "version": "1.0",
    "steps": [
      {
        "id": "enrich-ip-reputation",
        "uses": "threat-intel.lookup-ip",
        "with": {
          "ip": "{{alert.sourceIp}}",
          "sources": ["virustotal", "malwaredomainlist", "emergingthreats"]
        },
        "if": "alert.sourceIp",
        "timeout": 15000,
        "errorPolicy": "continue"
      },
      {
        "id": "enrich-domain-reputation",
        "uses": "threat-intel.lookup-domain",
        "with": {
          "domain": "{{alert.domain}}",
          "sources": ["virustotal", "opendns", "safebrowsing"]
        },
        "if": "alert.domain",
        "timeout": 15000,
        "errorPolicy": "continue"
      },
      {
        "id": "enrich-file-hash",
        "uses": "threat-intel.lookup-hash",
        "with": {
          "hash": "{{alert.fileHash}}",
          "hashType": "{{alert.hashType}}",
          "sources": ["virustotal", "malwarebytes", "hybridanalysis"]
        },
        "if": "alert.fileHash",
        "timeout": 20000,
        "errorPolicy": "continue"
      },
      {
        "id": "update-ioc-database",
        "uses": "ioc.update",
        "with": {
          "indicators": [
            {
              "type": "ip",
              "value": "{{alert.sourceIp}}",
              "reputation": "{{steps.enrich-ip-reputation.reputation}}",
              "confidence": "{{steps.enrich-ip-reputation.confidence}}"
            },
            {
              "type": "domain", 
              "value": "{{alert.domain}}",
              "reputation": "{{steps.enrich-domain-reputation.reputation}}",
              "confidence": "{{steps.enrich-domain-reputation.confidence}}"
            },
            {
              "type": "hash",
              "value": "{{alert.fileHash}}",
              "reputation": "{{steps.enrich-file-hash.reputation}}",
              "confidence": "{{steps.enrich-file-hash.confidence}}"
            }
          ]
        },
        "timeout": 10000,
        "errorPolicy": "continue"
      },
      {
        "id": "generate-threat-report",
        "uses": "report.generate",
        "with": {
          "template": "threat-analysis",
          "data": {
            "alertId": "{{alert.id}}",
            "indicators": {
              "ip": "{{steps.enrich-ip-reputation}}",
              "domain": "{{steps.enrich-domain-reputation}}",
              "hash": "{{steps.enrich-file-hash}}"
            }
          },
          "format": "pdf",
          "recipients": ["threat-intel-team@company.com"]
        },
        "timeout": 30000,
        "errorPolicy": "continue"
      }
    ]
  }',
  true,
  1,
  1,
  NOW(),
  NOW()
);

-- Insert corresponding playbook steps
INSERT INTO playbook_steps (playbook_id, step_id, step_order, action_id, configuration, conditions, error_policy, timeout_seconds, max_retries)
SELECT 
  p.id as playbook_id,
  'notify-security-team' as step_id,
  1 as step_order,
  (SELECT id FROM actions WHERE name = 'notification.slack') as action_id,
  '{"channel": "#security-alerts", "urgency": "high"}' as configuration,
  NULL as conditions,
  'abort' as error_policy,
  10 as timeout_seconds,
  0 as max_retries
FROM playbooks p WHERE p.name = 'Critical Alert Response';

-- Add step for host isolation
INSERT INTO playbook_steps (playbook_id, step_id, step_order, action_id, configuration, conditions, error_policy, timeout_seconds, max_retries)
SELECT 
  p.id as playbook_id,
  'isolate-affected-host' as step_id,
  2 as step_order,
  (SELECT id FROM actions WHERE name = 'edr.isolate-host') as action_id,
  '{"reason": "Critical security alert - automatic isolation"}' as configuration,
  'alert.sourceHost && alert.severity === "critical"' as conditions,
  'continue' as error_policy,
  30 as timeout_seconds,
  2 as max_retries
FROM playbooks p WHERE p.name = 'Critical Alert Response';
