import { Store } from 'express-session';
import {
  User, InsertUser,
  Alert, InsertAlert,
  Incident, InsertIncident,
  ThreatIntel, InsertThreatIntel,
  AiInsight, InsertAiInsight,
  Metric, InsertMetric,
  Connector, InsertConnector,
  ThreatFeed, InsertThreatFeed,
  Playbook, InsertPlaybook,
  PlaybookExecution,
  Agent, InsertAgent,
  Plan, InsertPlan,
  Organization, InsertOrganization,
  ComplianceAssessment, InsertComplianceAssessment
} from '../shared/schema';

export interface IStorage {
  // Session store
  sessionStore: Store;

  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUsers(organizationId?: number): Promise<User[]>;

  // Alert methods
  getAlert(id: number, organizationId?: number): Promise<Alert | undefined>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: number, alert: Partial<InsertAlert>, organizationId?: number): Promise<Alert | undefined>;
  listAlerts(limit?: number, organizationId?: number): Promise<Alert[]>;
  getAlertsCountByDay(organizationId: number, numberOfDays: number): Promise<{ date: string; count: number }[]>;

  // Incident methods
  getIncident(id: number, organizationId?: number): Promise<Incident | undefined>;
  createIncident(incident: InsertIncident): Promise<Incident>;
  updateIncident(id: number, incident: Partial<InsertIncident>, organizationId?: number): Promise<Incident | undefined>;
  listIncidents(limit?: number, organizationId?: number): Promise<Incident[]>;
  getMitreTacticsDistribution(organizationId: number): Promise<{ tactic: string; count: number }[]>;

  // Threat Intel methods
  getThreatIntel(id: number, organizationId?: number): Promise<ThreatIntel | undefined>;
  createThreatIntel(intel: InsertThreatIntel): Promise<ThreatIntel>;
  listThreatIntel(limit?: number, organizationId?: number): Promise<ThreatIntel[]>;

  // AI Insight methods
  getAiInsight(id: number, organizationId?: number): Promise<AiInsight | undefined>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  listAiInsights(limit?: number, organizationId?: number): Promise<AiInsight[]>;

  // Metrics methods
  getMetric(id: number, organizationId?: number): Promise<Metric | undefined>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  getMetricByName(name: string, organizationId?: number): Promise<Metric | undefined>;
  getMetricByNameAndOrg(name: string, organizationId?: number): Promise<Metric | undefined>;
  listMetrics(organizationId?: number): Promise<Metric[]>;

  // Connector methods
  getConnector(id: number, organizationId?: number): Promise<Connector | undefined>;
  createConnector(connector: InsertConnector): Promise<Connector>;
  updateConnector(id: number, connector: Partial<InsertConnector>, organizationId?: number): Promise<Connector | undefined>;
  deleteConnector(id: number, organizationId?: number): Promise<boolean>;
  listConnectors(organizationId?: number): Promise<Connector[]>;
  toggleConnectorStatus(id: number, isActive: boolean, organizationId?: number): Promise<Connector | undefined>;

  // Threat Feed methods
  getThreatFeed(id: number, organizationId?: number): Promise<ThreatFeed | undefined>;
  createThreatFeed(feed: InsertThreatFeed): Promise<ThreatFeed>;
  updateThreatFeed(id: number, feed: Partial<InsertThreatFeed>, organizationId?: number): Promise<ThreatFeed | undefined>;
  deleteThreatFeed(id: number, organizationId?: number): Promise<boolean>;
  listThreatFeeds(organizationId?: number): Promise<ThreatFeed[]>;
  toggleThreatFeedStatus(id: number, isActive: boolean, organizationId?: number): Promise<ThreatFeed | undefined>;

  // Playbook methods
  getPlaybook(id: number, organizationId?: number): Promise<Playbook | undefined>;
  createPlaybook(playbook: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(id: number, playbook: Partial<InsertPlaybook>, organizationId?: number): Promise<Playbook | undefined>;
  deletePlaybook(id: number, organizationId?: number): Promise<boolean>;
  listPlaybooks(organizationId?: number): Promise<Playbook[]>;
  togglePlaybookStatus(id: number, isActive: boolean, organizationId?: number): Promise<Playbook | undefined>;
  executePlaybook(id: number, organizationId: number, triggeredBy?: number, triggerEntityId?: number): Promise<PlaybookExecution>;
  incrementPlaybookExecutionCount(id: number, executionTimeMs?: number): Promise<void>;

  // Playbook Execution methods
  getPlaybookExecution(id: number, organizationId?: number): Promise<PlaybookExecution | undefined>;
  listPlaybookExecutions(playbookId?: number, limit?: number, organizationId?: number): Promise<PlaybookExecution[]>;
  updatePlaybookExecution(id: number, data: Partial<PlaybookExecution>, organizationId?: number): Promise<PlaybookExecution | undefined>;

  // Agent methods
  getAgent(id: number, organizationId?: number): Promise<Agent | undefined>;
  getAgentByIdentifier(agentIdentifier: string, organizationId?: number): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: number, agent: Partial<InsertAgent>, organizationId?: number): Promise<Agent | undefined>;
  deleteAgent(id: number, organizationId?: number): Promise<boolean>;
  listAgents(userId?: number, organizationId?: number): Promise<Agent[]>;
  updateAgentHeartbeat(id: number, organizationId?: number): Promise<void>;
  updateAgentStatus(id: number, status: string, organizationId?: number): Promise<Agent | undefined>;

  // Plan methods
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, plan: Partial<InsertPlan>): Promise<Plan | undefined>;
  listPlans(): Promise<Plan[]>;

  // Organization methods
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, organization: Partial<InsertOrganization>): Promise<Organization | undefined>;
  listOrganizations(): Promise<Organization[]>;

  // Compliance Assessment methods
  getComplianceAssessment(id: number, organizationId?: number): Promise<ComplianceAssessment | undefined>;
  createComplianceAssessment(data: InsertComplianceAssessment): Promise<ComplianceAssessment>;
  updateComplianceAssessment(id: number, data: Partial<InsertComplianceAssessment>, organizationId?: number): Promise<ComplianceAssessment | undefined>;
  listComplianceAssessments(organizationId?: number, filters?: { framework?: string; status?: string }): Promise<ComplianceAssessment[]>;
  deleteComplianceAssessment(id: number, organizationId?: number): Promise<boolean>;
}
