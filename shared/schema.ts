import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, numeric, interval, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
// Define JSON type
type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Planes de suscripción para organizaciones
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // ej: "Free", "Pro", "Enterprise"
  description: text("description").notNull(),
  priceMonthly: integer("price_monthly").notNull(), // en centavos o la unidad menor
  priceYearly: integer("price_yearly").notNull(),
  features: jsonb("features").notNull(), // Lista de características incluidas
  maxUsers: integer("max_users").notNull(),
  maxAgents: integer("max_agents").notNull(), // 0 o -1 para ilimitado en plan de pago, 1 para plan gratis
  maxAlerts: integer("max_alerts").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  stripePriceIdMonthly: text("stripe_price_id_monthly").unique(), // IDs de precio de Stripe
  stripePriceIdYearly: text("stripe_price_id_yearly").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

// Organizations schema - para multi-tenancy
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  planId: integer("plan_id").references(() => plans.id),
  subscriptionStatus: text("subscription_status").default('inactive'), // 'active', 'inactive', 'past_due', 'trial'
  stripeCustomerId: text("stripe_customer_id").unique(),
  maxUsers: integer("max_users"),
  maxStorage: integer("max_storage"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  domain: text("domain"),
  logo: text("logo"),
  apiKey: text("api_key"),
  billingCycle: text("billing_cycle"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  email: text("email"), // Email principal para facturación
  contactName: text("contact_name"), // Nombre de contacto
  contactEmail: text("contact_email"), // Email de contacto
  settings: jsonb("settings"), // Configuración de la organización
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login"),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
});

// Alert schema
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull(),
  sourceIp: text("source_ip"),
  destinationIp: text("destination_ip"),
  fileHash: text("file_hash"),
  url: text("url"),
  cveId: text("cve_id"),
  packageName: text("package_name"),
  packageVersion: text("package_version"),
  malwareFamily: text("malware_family"),
  timestamp: timestamp("timestamp").defaultNow(),
  status: text("status").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  assignedTo: integer("assigned_to").references(() => users.id),
  metadata: jsonb("metadata"),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  timestamp: true,
});

// Incident schema
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low'
  status: text("status").notNull(), // 'new', 'in_progress', 'resolved', 'closed'
  assignedTo: integer("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  relatedAlerts: jsonb("related_alerts"), // Array of alert IDs
  timeline: jsonb("timeline"), // Array of timeline events
  aiAnalysis: jsonb("ai_analysis"), // AI-generated insights
  mitreTactics: jsonb("mitre_tactics"), // MITRE ATT&CK tactics IDs
  evidence: jsonb("evidence"), // List of collected evidence
  playbooks: jsonb("playbooks"), // Executed playbooks information
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
});

// Threat Intel schema
export const threatIntel = pgTable("threat_intel", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'ioc', 'vulnerability', 'apt', 'ransomware', etc.
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low'
  confidence: integer("confidence"), // 0-100
  iocs: jsonb("iocs"), // Indicators of Compromise
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  relevance: text("relevance"), // 'high', 'medium', 'low'
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertThreatIntelSchema = createInsertSchema(threatIntel).omit({
  id: true,
  createdAt: true,
});

// AI Insight schema
export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // 'detection', 'recommendation', 'prediction'
  severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low'
  confidence: integer("confidence").notNull(), // 0-100
  relatedEntities: jsonb("related_entities"), // Related alerts, assets, etc.
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull(), // 'new', 'acknowledged', 'resolved', 'false_positive'
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
});

// Dashboard Metrics schema
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value").notNull(), // Changed from integer to text
  trend: text("trend"), // 'up', 'down', 'stable'
  changePercentage: integer("change_percentage"),
  timestamp: timestamp("timestamp").defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  timestamp: true,
});

// Enrichment schema
export const enrichments = pgTable("enrichments", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").references(() => alerts.id).notNull(),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
  severity: integer("severity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEnrichmentSchema = createInsertSchema(enrichments).omit({ id: true, createdAt: true });

export type Enrichment = typeof enrichments.$inferSelect;
export type InsertEnrichment = z.infer<typeof insertEnrichmentSchema>;

// Define types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidents.$inferSelect;

export type InsertThreatIntel = z.infer<typeof insertThreatIntelSchema>;
export type ThreatIntel = typeof threatIntel.$inferSelect;

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

export type InsertEnrichment = z.infer<typeof insertEnrichmentSchema>;
export type Enrichment = typeof enrichments.$inferSelect;

// Severity Types
export const SeverityTypes = z.enum(['critical', 'high', 'medium', 'low']);
export type SeverityType = z.infer<typeof SeverityTypes>;

// Status Types
export const AlertStatusTypes = z.enum(['new', 'in_progress', 'resolved', 'acknowledged']);
export type AlertStatusType = z.infer<typeof AlertStatusTypes>;

export const IncidentStatusTypes = z.enum(['new', 'in_progress', 'resolved', 'closed']);
export type IncidentStatusType = z.infer<typeof IncidentStatusTypes>;

// Connector Status Types
export const ConnectorStatusTypes = z.enum(['active', 'inactive', 'warning', 'configuring', 'error']);
export type ConnectorStatusType = z.infer<typeof ConnectorStatusTypes>;

// Connector schema
export const connectors = pgTable("connectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull(),
  type: text("type").notNull(), // "EDR", "Firewall", "Network IDS", "Cloud Security", etc.
  dataVolume: text("data_volume"), // ex: "850 MB/day"
  status: text("status").notNull().default('inactive'), // Reference ConnectorStatusTypes
  lastData: text("last_data"), // ex: "2 min ago"
  encryptedCredentials: jsonb("encrypted_credentials"),
  lastEventAt: timestamp("last_event_at"),
  eventsPerMin: numeric("events_per_min"),
  errorMessage: text("error_message"),
  isActive: boolean("is_active").notNull().default(false),
  icon: text("icon").default('plug'),
  configuration: jsonb("configuration"), // Store connection details, API keys, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastSuccessfulConnection: timestamp("last_successful_connection"),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertConnectorSchema = createInsertSchema(connectors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSuccessfulConnection: true,
});

export type InsertConnector = z.infer<typeof insertConnectorSchema>;
export type Connector = typeof connectors.$inferSelect;

// Table for connector logs
export const connectorLogs = pgTable("connector_logs", {
  id: serial("id").primaryKey(),
  connectorId: integer("connector_id").notNull().references(() => connectors.id),
  ts: timestamp("ts").notNull().defaultNow(),
  level: varchar("level", { length: 20 }).notNull(),
  message: text("message").notNull(),
});

// Threat Feed Status and Types
export const ThreatFeedStatusTypes = z.enum(['active', 'inactive', 'error']);
export type ThreatFeedStatusType = z.infer<typeof ThreatFeedStatusTypes>;

export const ThreatFeedTypes = z.enum(['ioc', 'vulnerability', 'threat-actor', 'general']);
export type ThreatFeedType = z.infer<typeof ThreatFeedTypes>;

// Threat Feed schema
export const threatFeeds = pgTable("threat_feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  type: text("type").notNull(), // Reference ThreatFeedTypes
  description: text("description").notNull(),
  url: text("url").notNull(),
  apiKey: text("api_key"),
  isActive: boolean("is_active").notNull().default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
  iocsCount: integer("iocs_count").default(0),
  status: text("status").notNull().default('inactive'), // Reference ThreatFeedStatusTypes
  icon: text("icon").default('globe'),
  configuration: jsonb("configuration"), // Additional configuration options
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertThreatFeedSchema = createInsertSchema(threatFeeds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUpdated: true,
});

export type InsertThreatFeed = z.infer<typeof insertThreatFeedSchema>;
export type ThreatFeed = typeof threatFeeds.$inferSelect;

// Playbook Trigger Types
export const PlaybookTriggerTypes = z.enum(['alert', 'incident', 'manual', 'scheduled']);
export type PlaybookTriggerType = z.infer<typeof PlaybookTriggerTypes>;

// Playbook Status Types
export const PlaybookStatusTypes = z.enum(['active', 'inactive', 'draft']);
export type PlaybookStatusType = z.infer<typeof PlaybookStatusTypes>;

// Playbook schema
export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  triggerType: text("trigger_type").notNull(), // Reference PlaybookTriggerTypes
  triggerCondition: jsonb("trigger_condition"), // Conditions that must be satisfied to trigger this playbook
  definition: jsonb("definition").notNull(), // DSL declarative definition
  isActive: boolean("is_active").notNull().default(false),
  status: text("status").notNull().default('draft'), // Reference PlaybookStatusTypes
  creator: integer("creator").references(() => users.id),
  lastExecuted: timestamp("last_executed"),
  lastModified: timestamp("last_modified").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  executionCount: integer("execution_count").default(0),
  avgExecutionTime: integer("avg_execution_time"), // in milliseconds
  category: text("category"), // 'remediation', 'investigation', 'notification', etc.
  tags: jsonb("tags"), // Array of tags
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertPlaybookSchema = createInsertSchema(playbooks).omit({
  id: true,
  createdAt: true,
  lastModified: true,
  lastExecuted: true,
  executionCount: true,
  avgExecutionTime: true,
});

export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type Playbook = typeof playbooks.$inferSelect;

// Playbook Execution schema
export const playbookExecutions = pgTable("playbook_executions", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").references(() => playbooks.id).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull(), // 'running', 'completed', 'failed', 'cancelled'
  triggeredBy: integer("triggered_by").references(() => users.id),
  triggerSource: text("trigger_source").notNull(), // 'alert', 'incident', 'manual', 'scheduled'
  triggerEntityId: integer("trigger_entity_id"), // ID of the alert or incident that triggered this
  results: jsonb("results"), // Execution results
  executionTime: integer("execution_time"), // in milliseconds
  error: text("error"), // Error message if failed
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertPlaybookExecutionSchema = createInsertSchema(playbookExecutions).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  executionTime: true,
});

export type InsertPlaybookExecution = z.infer<typeof insertPlaybookExecutionSchema>;
export type PlaybookExecution = typeof playbookExecutions.$inferSelect;

// Agent Status Types
export const AgentStatusTypes = z.enum(['active', 'inactive', 'warning', 'error']);
export type AgentStatusType = z.infer<typeof AgentStatusTypes>;

// Agent schema - para gestionar los agentes instalados en sistemas cliente
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  ipAddress: text("ip_address"),
  operatingSystem: text("operating_system").notNull(),
  version: text("version"),
  status: text("status").notNull().default('inactive'), // Reference AgentStatusTypes
  lastHeartbeat: timestamp("last_heartbeat"),
  installedAt: timestamp("installed_at").defaultNow(),
  userId: integer("user_id").references(() => users.id),
  capabilities: jsonb("capabilities"), // Array of agent capabilities
  configuration: jsonb("configuration"), // Agent configuration
  systemInfo: jsonb("system_info"), // System information
  lastMetrics: jsonb("last_metrics"), // Last reported metrics
  agentIdentifier: text("agent_identifier").notNull().unique(), // Unique identifier for the agent
  authToken: text("auth_token"), // Authentication token for communication
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  installedAt: true,
  lastHeartbeat: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// Compliance Assessment Schemas
export const complianceFrameworksEnum = z.enum(["ISO 27001", "NIST CSF", "GDPR", "PCI DSS", "OTHER"]);
export type ComplianceFrameworkType = z.infer<typeof complianceFrameworksEnum>;

export const complianceStatusEnum = z.enum(["compliant", "at-risk", "non-compliant", "unknown"]);
export type ComplianceStatusValueType = z.infer<typeof complianceStatusEnum>;

export const complianceAssessments = pgTable("compliance_assessments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  framework: text("framework").notNull(), // e.g., "ISO 27001"
  status: text("status").notNull(), // e.g., "compliant"
  score: integer("score"), // Percentage, e.g., 87. Can be null if not applicable.
  lastAssessmentDate: timestamp("last_assessment_date").defaultNow(),
  details: jsonb("details"), // Additional notes, evidence links, etc. Can be null.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(), // Will be updated manually in storage methods
});

export const insertComplianceAssessmentSchema = createInsertSchema(complianceAssessments, {
  score: z.number().optional().nullable(),
  details: z.any().optional().nullable(),
  // organizationId is required and should be part of the input to create
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertComplianceAssessment = z.infer<typeof insertComplianceAssessmentSchema>;
export type ComplianceAssessment = typeof complianceAssessments.$inferSelect;

// Threat Intel Cache schema
export const threatIntelCache = pgTable("threat_intel_cache", {
  iocValue: text("ioc_value").primaryKey(),
  iocType: text("ioc_type").notNull(),
  provider: text("provider").notNull(),
  rawJson: jsonb("raw_json").notNull(),
  verdict: text("verdict").notNull(),
  score: integer("score").notNull(),
  firstSeen: timestamp("first_seen").notNull(),
  lastSeen: timestamp("last_seen").notNull(),
  ttl: interval("ttl").notNull(),
});

export const insertThreatIntelCacheSchema = createInsertSchema(threatIntelCache);
export type ThreatIntelCache = typeof threatIntelCache.$inferSelect;

// Connector errors tracking
export const connectorErrors = pgTable("connector_errors", {
  id: serial("id").primaryKey(),
  connector: text("connector").notNull(),
  error: text("error").notNull(),
  occurredAt: timestamp("occurred_at").defaultNow(),
});

export const insertConnectorErrorSchema = createInsertSchema(connectorErrors).omit({ id: true, occurredAt: true });
export type InsertConnectorError = z.infer<typeof insertConnectorErrorSchema>;
export type ConnectorError = typeof connectorErrors.$inferSelect;

// Raw events ingested by SOC
export const eventsRaw = pgTable("events_raw", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  engine: text("engine").notNull(),
  timestamp: timestamp("event_timestamp").notNull(),
  data: jsonb("data").notNull(),
});

export const insertEventsRawSchema = createInsertSchema(eventsRaw).omit({ id: true });

// Actions catalog for versioned playbook modules
export const actions = pgTable("actions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertActionSchema = createInsertSchema(actions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actions.$inferSelect;

// Playbook Steps: normalized task breakdown referencing actions catalog
export const playbookSteps = pgTable("playbook_steps", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").references(() => playbooks.id).notNull(),
  sequence: integer("sequence").notNull(),              // order of execution
  stepKey: text("step_key").notNull(),                  // unique identifier within playbook
  actionId: integer("action_id").references(() => actions.id).notNull(),
  condition: text("condition"),                          // e.g. "steps.prev.output >= 7"
  inputs: jsonb("inputs").notNull(),                     // parameters for action
  onError: text("on_error").notNull().default('abort'),   // 'abort' | 'continue' | 'rollback'
  timeoutMs: integer("timeout_ms"),                     // milliseconds
});

export const insertPlaybookStepSchema = createInsertSchema(playbookSteps).omit({
  id: true,
});

export type InsertPlaybookStep = z.infer<typeof insertPlaybookStepSchema>;
export type PlaybookStep = typeof playbookSteps.$inferSelect;

// Audit Logs for SOAR system tracking
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'playbook' | 'execution' | 'action' | 'test'
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  userId: text("user_id"),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  details: jsonb("details"),
  severity: text("severity").notNull().default('info'), // 'info' | 'warn' | 'error' | 'critical'
  source: text("source").notNull().default('system'), // 'user' | 'system' | 'api'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Metrics Rollup schema for historical analytics
export const metricsRollup = pgTable(
  "metrics_rollup",
  {
    organizationId: integer("org_id").references(() => organizations.id).notNull(),
    metric: text("metric").notNull(),
    period: text("period").notNull(), // 'hour' | 'day' | 'week'
    tsBucket: timestamp("ts_bucket").notNull(), // start of interval
    value: jsonb("value").notNull(),
  },
  (table) => ({
    primaryKey: primaryKey(table.organizationId, table.metric, table.period, table.tsBucket),
  })
);

export const insertMetricsRollupSchema = createInsertSchema(metricsRollup);
export type InsertMetricsRollup = z.infer<typeof insertMetricsRollupSchema>;
export type MetricsRollup = typeof metricsRollup.$inferSelect;

// Report Types
export const ReportTypes = z.enum(['executive_summary', 'technical_incidents', 'compliance_audit', 'agent_health', 'vulnerability_assessment', 'threat_intelligence', 'soc_performance', 'custom']);
export type ReportType = z.infer<typeof ReportTypes>;

export const ReportStatusTypes = z.enum(['scheduled', 'generating', 'completed', 'failed', 'cancelled']);
export type ReportStatusType = z.infer<typeof ReportStatusTypes>;

export const ReportFormatTypes = z.enum(['pdf', 'html', 'csv', 'xlsx']);
export type ReportFormatType = z.infer<typeof ReportFormatTypes>;

// Report Templates schema
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // Reference ReportTypes
  description: text("description"),
  scheduleCron: text("schedule_cron"), // Cron expression for automated generation
  parameters: jsonb("parameters").notNull(), // Report-specific parameters (filters, date ranges, etc.)
  notifyEmails: jsonb("notify_emails"), // Array of email addresses to notify
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;

// Generated Reports schema
export const reportsGenerated = pgTable("reports_generated", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => reportTemplates.id),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // Reference ReportTypes
  status: text("status").notNull().default('scheduled'), // Reference ReportStatusTypes
  format: text("format").notNull().default('pdf'), // Reference ReportFormatTypes
  periodFrom: timestamp("period_from").notNull(),
  periodTo: timestamp("period_to").notNull(),
  filePath: text("file_path"), // Path to generated file
  fileSize: integer("file_size"), // File size in bytes
  hashSha256: text("hash_sha256"), // SHA-256 hash for integrity
  metadata: jsonb("metadata"), // Additional metadata about the report
  generatedBy: integer("generated_by").references(() => users.id),
  requestedBy: integer("requested_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  generatedAt: timestamp("generated_at"),
  error: text("error"), // Error message if generation failed
});

export const insertReportGeneratedSchema = createInsertSchema(reportsGenerated).omit({
  id: true,
  createdAt: true,
  generatedAt: true,
});

export type InsertReportGenerated = z.infer<typeof insertReportGeneratedSchema>;
export type ReportGenerated = typeof reportsGenerated.$inferSelect;

// Report Artifacts schema (for attachments, charts, etc.)
export const reportArtifacts = pgTable("report_artifacts", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").references(() => reportsGenerated.id).notNull(),
  artifactType: text("artifact_type").notNull(), // 'chart', 'attachment', 'signature', 'evidence'
  name: text("name").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReportArtifactSchema = createInsertSchema(reportArtifacts).omit({
  id: true,
  createdAt: true,
});

export type InsertReportArtifact = z.infer<typeof insertReportArtifactSchema>;
export type ReportArtifact = typeof reportArtifacts.$inferSelect;

// User Settings schema
export const userSettings = pgTable("user_settings", {
  userId: integer("user_id").references(() => users.id).primaryKey(),
  locale: text("locale").default('en-US'),
  timezone: text("timezone").default('UTC'),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"), // Encrypted TOTP secret
  notifyChannel: jsonb("notify_channel").notNull().default('{}'), // {email: true, slack: {...}, etc}
  avatarUrl: text("avatar_url"),
  theme: text("theme").default('system'), // 'light', 'dark', 'system'
  dateFormat: text("date_format").default('MM/dd/yyyy'),
  timeFormat: text("time_format").default('12h'), // '12h' or '24h'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

// Organization Settings schema
export const orgSettings = pgTable("org_settings", {
  organizationId: integer("organization_id").references(() => organizations.id).primaryKey(),
  branding: jsonb("branding").notNull().default('{}'), // {logoUrl, primaryColor, secondaryColor, favicon}
  security: jsonb("security").notNull().default('{}'), // {passwordPolicy, ipAllowList, mfaRequired, sessionTimeout}
  defaultLocale: text("default_locale").default('en-US'),
  defaultTimezone: text("default_timezone").default('UTC'),
  integrations: jsonb("integrations").notNull().default('{}'), // Encrypted external API keys and webhooks
  notifications: jsonb("notifications").notNull().default('{}'), // Default notification settings
  compliance: jsonb("compliance").notNull().default('{}'), // Compliance-specific settings
  auditRetentionDays: integer("audit_retention_days").default(365),
  allowedDomains: jsonb("allowed_domains"), // Array of domains for SSO
  ssoEnabled: boolean("sso_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrgSettingsSchema = createInsertSchema(orgSettings).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgSettings = z.infer<typeof insertOrgSettingsSchema>;
export type OrgSettings = typeof orgSettings.$inferSelect;

// Settings History for audit trail
export const settingsHistory = pgTable("settings_history", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'user' | 'organization'
  entityId: integer("entity_id").notNull(),
  changedBy: integer("changed_by").references(() => users.id).notNull(),
  changeType: text("change_type").notNull(), // 'update', 'create', 'delete'
  fieldName: text("field_name").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
});

export const insertSettingsHistorySchema = createInsertSchema(settingsHistory).omit({
  id: true,
  timestamp: true,
});

export type InsertSettingsHistory = z.infer<typeof insertSettingsHistorySchema>;
export type SettingsHistory = typeof settingsHistory.$inferSelect;

// Upload Files schema (for avatars, logos, etc.)
export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  purpose: text("purpose").notNull(), // 'avatar', 'logo', 'attachment', etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

// Notification Types and Settings
export const NotificationChannelTypes = z.enum(['email', 'slack', 'teams', 'webhook', 'pagerduty', 'sms']);
export type NotificationChannelType = z.infer<typeof NotificationChannelTypes>;

export const NotificationSeverityTypes = z.enum(['low', 'medium', 'high', 'critical']);
export type NotificationSeverityType = z.infer<typeof NotificationSeverityTypes>;

// Password Policy Types
export const PasswordPolicySchema = z.object({
  minLength: z.number().min(8).max(128).default(12),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumbers: z.boolean().default(true),
  requireSpecialChars: z.boolean().default(true),
  maxAge: z.number().optional(), // Days before password expires
  preventReuse: z.number().default(5), // Number of previous passwords to remember
});
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;

// Security Settings Schema
export const SecuritySettingsSchema = z.object({
  passwordPolicy: PasswordPolicySchema.optional(),
  ipAllowList: z.array(z.string()).optional(), // CIDR ranges
  mfaRequired: z.boolean().default(false),
  sessionTimeout: z.number().default(480), // Minutes
  maxLoginAttempts: z.number().default(5),
  lockoutDuration: z.number().default(30), // Minutes
});
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;

// Branding Settings Schema
export const BrandingSettingsSchema = z.object({
  logoUrl: z.string().optional(),
  primaryColor: z.string().default('#3b82f6'),
  secondaryColor: z.string().default('#64748b'),
  accentColor: z.string().default('#06b6d4'),
  favicon: z.string().optional(),
  companyName: z.string().optional(),
});
export type BrandingSettings = z.infer<typeof BrandingSettingsSchema>;

// Integration Settings Schema
export const IntegrationSettingsSchema = z.object({
  slack: z.object({
    enabled: z.boolean().default(false),
    webhookUrl: z.string().optional(),
    channel: z.string().optional(),
  }).optional(),
  teams: z.object({
    enabled: z.boolean().default(false),
    webhookUrl: z.string().optional(),
  }).optional(),
  jira: z.object({
    enabled: z.boolean().default(false),
    baseUrl: z.string().optional(),
    username: z.string().optional(),
    apiToken: z.string().optional(),
    projectKey: z.string().optional(),
  }).optional(),
  pagerduty: z.object({
    enabled: z.boolean().default(false),
    integrationKey: z.string().optional(),
  }).optional(),
  webhook: z.object({
    enabled: z.boolean().default(false),
    url: z.string().optional(),
    secret: z.string().optional(),
  }).optional(),
});
export type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>;

// User Settings Update Schemas
export const UserSettingsUpdateSchema = z.object({
  locale: z.string().optional(),
  timezone: z.string().optional(),
  notifyChannel: z.record(z.any()).optional(),
  avatarUrl: z.string().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
});
export type UserSettingsUpdate = z.infer<typeof UserSettingsUpdateSchema>;

// Organization Settings Update Schemas
export const OrgSettingsUpdateSchema = z.object({
  branding: BrandingSettingsSchema.optional(),
  security: SecuritySettingsSchema.optional(),
  defaultLocale: z.string().optional(),
  defaultTimezone: z.string().optional(),
  integrations: IntegrationSettingsSchema.optional(),
  notifications: z.record(z.any()).optional(),
  compliance: z.record(z.any()).optional(),
  auditRetentionDays: z.number().optional(),
  allowedDomains: z.array(z.string()).optional(),
  ssoEnabled: z.boolean().optional(),
});
export type OrgSettingsUpdate = z.infer<typeof OrgSettingsUpdateSchema>;
