import session, { Store } from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { db, pool } from './db';
import * as schema from '@shared/schema';
import {
  Alert, InsertAlert,
  AiInsight, InsertAiInsight,
  Playbook, InsertPlaybook, PlaybookExecution, InsertPlaybookExecution, PlaybookStatusTypes,
  User, InsertUser,
  Incident,
  ThreatIntel, InsertThreatIntel,
  Metric, InsertMetric,
  Connector, InsertConnector, ConnectorStatusTypes,
  ThreatFeed, InsertThreatFeed, ThreatFeedStatusTypes,
  Agent, InsertAgent, AgentStatusTypes,
  Plan, InsertPlan,
  Organization, InsertOrganization
} from '@shared/schema';
import { IStorage } from './istorage';
import { eq, desc, asc, sql, and, or, gte, lte, ilike, SQL, AnyColumn } from 'drizzle-orm';
import { ThreatIntel } from '../backend/services/threatIntel';

const PgStore = connectPgSimple(session);

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PgStore({
      pool: pool,
      createTableIfMissing: true,
    });
  }

  // Plan methods
  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
    return plan;
  }
  
  async getPlans(): Promise<Plan[]> {
    // Retorna todos los planes activos, ordenados por precio
    return await db.select()
      .from(schema.plans)
      .where(eq(schema.plans.isActive, true))
      .orderBy(asc(schema.plans.priceMonthly));
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(schema.plans).values(insertPlan).returning();
    return plan;
  }

  async updatePlan(id: number, updateData: Partial<InsertPlan>): Promise<Plan | undefined> {
    const planToUpdate: Partial<schema.Plan> = {
      ...updateData,
      updatedAt: new Date()
    };
    const [plan] = await db.update(schema.plans).set(planToUpdate).where(eq(schema.plans.id, id)).returning();
    return plan;
  }

  async listPlans(limit: number = 10, offset: number = 0): Promise<Plan[]> {
    return await db.select().from(schema.plans).limit(limit).offset(offset);
  }
  
  // Organization methods
  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id));
    return org;
  }

  async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
    const [organization] = await db.insert(schema.organizations).values(insertOrganization).returning();
    return organization;
  }

  async updateOrganization(id: number, updateData: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const orgToUpdate: Partial<schema.Organization> = {
      ...updateData,
      updatedAt: new Date()
    };
    const [updatedOrganization] = await db.update(schema.organizations).set(orgToUpdate).where(eq(schema.organizations.id, id)).returning();
    return updatedOrganization;
  }

  async listOrganizations(limit: number = 10, offset: number = 0): Promise<Organization[]> {
    return await db.select().from(schema.organizations).limit(limit).offset(offset);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user as User | undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user as User | undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!insertUser.organizationId) {
      throw new Error("organizationId is required to create a user.");
    }
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async listUsers(organizationId?: number, limit: number = 10, offset: number = 0): Promise<User[]> {
    let query = db.select().from(schema.users) as any;
    if (organizationId !== undefined) {
      query = query.where(eq(schema.users.organizationId, organizationId));
    }
    return await query.limit(limit).offset(offset);
  }

  // Alert methods
  async getAlert(id: number, organizationId?: number): Promise<Alert | undefined> {
    const conditions: SQL[] = [eq(schema.alerts.id, id)];
    if (organizationId !== undefined) conditions.push(eq(schema.alerts.organizationId, organizationId));
    const [alert] = await db.select().from(schema.alerts).where(and(...conditions));
    return alert;
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    if (!insertAlert.organizationId) {
      throw new Error("organizationId is required to create an alert.");
    }
    const [alert] = await db.insert(schema.alerts).values(insertAlert).returning();
    
    // Publish SOAR event for alert creation
    try {
      const { eventBus } = await import('./src/services/eventBus');
      eventBus.publish({
        type: 'alert.created',
        entityId: alert.id,
        entityType: 'alert',
        organizationId: alert.organizationId!,
        timestamp: new Date(),
        data: {
          alertId: alert.id,
          severity: alert.severity || 'medium',
          category: (alert.metadata as any)?.category,
          sourceIp: alert.sourceIp,
          hostId: (alert.metadata as any)?.hostId,
          hostname: (alert.metadata as any)?.hostname,
        }
      });
    } catch (error) {
      console.error('[Storage] Error publishing alert.created event:', error);
    }
    
    // Enqueue threat intel lookups for IoCs
    const iocs = [insertAlert.fileHash, insertAlert.url, insertAlert.sourceIp, insertAlert.destinationIp, insertAlert.cveId]
      .filter((ioc): ioc is string => typeof ioc === 'string');
    for (const ioc of iocs) {
      ThreatIntel.lookup(ioc).catch(console.error);
    }
    return alert;
  }

  async updateAlert(id: number, data: Partial<InsertAlert>, organizationId?: number): Promise<Alert | undefined> {
    const alertToUpdate: Partial<schema.Alert> = { ...data };
    const conditions: SQL[] = [eq(schema.alerts.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.alerts.organizationId, organizationId));
    }
    const [updatedAlert] = await db.update(schema.alerts).set(alertToUpdate).where(and(...conditions)).returning();
    return updatedAlert;
  }

  async listAlerts(
    limit: number = 10,
    offset: number = 0,
    organizationId?: number,
    filters?: { status?: string; severity?: string; dateFrom?: Date; dateTo?: Date; query?: string }
  ): Promise<Alert[]> {
    const conditions: SQL[] = [];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.alerts.organizationId, organizationId));
    }

    if (filters?.status) conditions.push(eq(schema.alerts.status, filters.status));
    if (filters?.severity) conditions.push(eq(schema.alerts.severity, filters.severity));
    if (filters?.dateFrom) conditions.push(gte(schema.alerts.timestamp, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(schema.alerts.timestamp, filters.dateTo));
    if (filters?.query) {
      conditions.push(or(
        ilike(schema.alerts.title, `%${filters.query}%`),
        ilike(schema.alerts.description, `%${filters.query}%`)
      )!);
    }
    
    let queryChain = db.select().from(schema.alerts) as any;
    if (conditions.length > 0) {
      queryChain = queryChain.where(and(...conditions)); 
    }
    queryChain = queryChain.orderBy(desc(schema.alerts.timestamp));
    return await queryChain.limit(limit).offset(offset);
  }

  async getAlertsCountByDay(organizationId: number, numberOfDays: number): Promise<{ date: string; count: number }[]> {
    const query = sql`
      SELECT
        to_char(date_trunc('day', ${schema.alerts.timestamp}), 'YYYY-MM-DD') as date,
        COUNT(*)::int as count
      FROM
        ${schema.alerts}
      WHERE
        ${schema.alerts.organizationId} = ${organizationId}
        AND ${schema.alerts.timestamp} >= NOW() - make_interval(days => ${numberOfDays})
      GROUP BY
        date_trunc('day', ${schema.alerts.timestamp})
      ORDER BY
        date_trunc('day', ${schema.alerts.timestamp}) ASC;
    `;
    const result = await db.execute(query) as Array<{ date: string; count: number }>;
    return result.map(r => ({ ...r, count: Number(r.count) }));
  }

  // Incident methods
  async getIncident(id: number, organizationId?: number): Promise<Incident | undefined> {
    const conditions: SQL[] = [eq(schema.incidents.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.incidents.organizationId, organizationId));
    }
    const [incident] = await db.select().from(schema.incidents).where(and(...conditions));
    return incident;
  }

  async createIncident(insertIncident: schema.InsertIncident): Promise<Incident> {
    if (!insertIncident.organizationId) {
      throw new Error("organizationId is required to create an incident.");
    }
    const [incident] = await db.insert(schema.incidents).values(insertIncident).returning();
    return incident;
  }

  async updateIncident(
    id: number,
    updateData: Partial<Omit<schema.Incident, 'id' | 'createdAt' | 'organizationId' | 'updatedAt'>>,
    organizationId?: number
  ): Promise<Incident | undefined> {
    const dataToSet: Partial<schema.Incident> = { ...updateData };
    dataToSet.updatedAt = new Date();

    if (updateData.status === schema.IncidentStatusTypes.Enum.closed && updateData.closedAt === undefined) {
      dataToSet.closedAt = new Date();
    } else if (updateData.status !== schema.IncidentStatusTypes.Enum.closed && updateData.closedAt === null) {
      dataToSet.closedAt = null;
    }

    const conditions: SQL[] = [eq(schema.incidents.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.incidents.organizationId, organizationId));
    }
    const [updatedIncident] = await db.update(schema.incidents)
      .set(dataToSet)
      .where(and(...conditions))
      .returning();
    
    // Publish SOAR event for incident status update
    if (updatedIncident && updateData.status) {
      try {
        const { eventBus } = await import('./src/services/eventBus');
        eventBus.publish({
          type: 'incident.status_updated',
          entityId: updatedIncident.id,
          entityType: 'incident',
          organizationId: updatedIncident.organizationId!,
          timestamp: new Date(),
          data: {
            incidentId: updatedIncident.id,
            oldStatus: updateData.status, // Note: we don't have the old status here, could enhance later
            newStatus: updatedIncident.status,
            severity: updatedIncident.severity,
            title: updatedIncident.title,
            assignedTo: updatedIncident.assignedTo,
          }
        });
      } catch (error) {
        console.error('[Storage] Error publishing incident.status_updated event:', error);
      }
    }
    
    return updatedIncident;
  }

  async listIncidents(
    organizationId: number,
    limit: number = 10,
    offset: number = 0,
    filters?: { status?: string; severity?: string; query?: string }
  ): Promise<Incident[]> {
    const conditions: SQL[] = [eq(schema.incidents.organizationId, organizationId)];
    if (filters?.status) {
      conditions.push(eq(schema.incidents.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(schema.incidents.severity, filters.severity));
    }
    if (filters?.query) {
      conditions.push(or(
        ilike(schema.incidents.title, `%${filters.query}%`),
        ilike(schema.incidents.description, `%${filters.query}%`)
      )!);
    }
    const queryChain = db.select()
      .from(schema.incidents)
      .where(and(...conditions))
      .orderBy(desc(schema.incidents.createdAt))
      .limit(limit)
      .offset(offset);
    return await queryChain;
  }

  async getMitreTacticsDistribution(organizationId: number): Promise<{ tactic: string; count: number }[]> {
    const query = sql`
      SELECT
        tactic,
        COUNT(*)::int as count
      FROM
        ${schema.incidents},
        jsonb_array_elements_text(${schema.incidents.mitreTactics}) AS tactic
      WHERE
        ${schema.incidents.organizationId} = ${organizationId}
        AND ${schema.incidents.mitreTactics} IS NOT NULL 
        AND jsonb_typeof(${schema.incidents.mitreTactics}) = 'array'
      GROUP BY
        tactic
      ORDER BY
        count DESC;
    `;
    const result = await db.execute(query) as Array<{ tactic: string; count: number }>;
    return result.map(r => ({ ...r, count: Number(r.count) }));
  }

  // Threat Intel methods
  async getThreatIntel(id: number, organizationId?: number): Promise<ThreatIntel | undefined> {
    const conditions: SQL[] = [eq(schema.threatIntel.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.threatIntel.organizationId, organizationId));
    }
    const [intel] = await db.select().from(schema.threatIntel).where(and(...conditions));
    return intel;
  }

  async createThreatIntel(insertIntel: InsertThreatIntel): Promise<ThreatIntel> {
    if (!insertIntel.organizationId) {
      throw new Error("organizationId is required to create a threat intel entry.");
    }
    const [intel] = await db.insert(schema.threatIntel).values(insertIntel).returning();
    return intel;
  }

  async listThreatIntel(
    organizationId: number,
    limit: number = 10,
    offset: number = 0,
    type?: string
  ): Promise<ThreatIntel[]> {
    const conditions: SQL[] = [eq(schema.threatIntel.organizationId, organizationId)];
    if (type) conditions.push(eq(schema.threatIntel.type, type));

    let queryChain = db.select().from(schema.threatIntel).where(and(...conditions)).orderBy(desc(schema.threatIntel.createdAt)) as any;
    return await queryChain.limit(limit).offset(offset);
  }
  
  // AI Insight methods
  async getAiInsight(id: number, organizationId?: number): Promise<AiInsight | undefined> {
    const conditions: SQL[] = [eq(schema.aiInsights.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.aiInsights.organizationId, organizationId));
    }
    const [insight] = await db.select().from(schema.aiInsights).where(and(...conditions));
    return insight;
  }

  async createAiInsight(insertInsight: InsertAiInsight): Promise<AiInsight> {
    if (!insertInsight.organizationId) {
      throw new Error("organizationId is required to create an AI insight.");
    }
    const [insight] = await db.insert(schema.aiInsights).values(insertInsight).returning();
    return insight;
  }

  async listAiInsights(
    organizationId: number,
    limit: number = 10,
    offset: number = 0
  ): Promise<AiInsight[]> {
    const conditions: SQL[] = [eq(schema.aiInsights.organizationId, organizationId)];
    
    let queryChain = db.select().from(schema.aiInsights).where(and(...conditions)).orderBy(desc(schema.aiInsights.createdAt)) as any;
    return await queryChain.limit(limit).offset(offset);
  }

  // Metrics methods
  async getMetric(id: number, organizationId?: number): Promise<Metric | undefined> {
    const conditions: SQL[] = [eq(schema.metrics.id, id)];
    if (organizationId !== undefined) {
        conditions.push(eq(schema.metrics.organizationId, organizationId));
    }
    const [metric] = await db.select().from(schema.metrics).where(and(...conditions));
    return metric;
  }

  async createMetric(insertMetric: InsertMetric): Promise<Metric> {
    const [metric] = await db.insert(schema.metrics).values(insertMetric).returning();
    return metric;
  }
  
  async getMetricByName(name: string, organizationId?: number): Promise<Metric | undefined> {
    const conditions: SQL[] = [eq(schema.metrics.name, name)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.metrics.organizationId, organizationId));
    }
    const [metric] = await db.select().from(schema.metrics).where(and(...conditions));
    return metric;
  }     
  
  async getMetricByNameAndOrg(name: string, organizationId?: number): Promise<Metric | undefined> {
    return this.getMetricByName(name, organizationId);
  }

  async listMetrics(organizationId?: number): Promise<Metric[]> {
    const conditions: SQL[] = [];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.metrics.organizationId, organizationId));
    }
    if (conditions.length > 0) {
        return await db.select().from(schema.metrics).where(and(...conditions));
    }
    return await db.select().from(schema.metrics);
  }
  
  // Connector methods
  async getConnector(id: number, organizationId?: number): Promise<Connector | undefined> {
    const conditions: SQL[] = [eq(schema.connectors.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.connectors.organizationId, organizationId));
    }
    const [connector] = await db.select().from(schema.connectors).where(and(...conditions));
    return connector;
  }

  async createConnector(insertConnector: InsertConnector): Promise<Connector> {
    if (!insertConnector.organizationId) {
      throw new Error("organizationId is required to create a connector.");
    }
    const [connector] = await db.insert(schema.connectors).values(insertConnector).returning();
    return connector;
  }

  async updateConnector(id: number, data: Partial<InsertConnector>, organizationId?: number): Promise<Connector | undefined> {
    const connectorToUpdate: Partial<schema.Connector> = {
      ...data,
      updatedAt: new Date()
    };
    const conditions: SQL[] = [eq(schema.connectors.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.connectors.organizationId, organizationId));
    }
    const [updatedConnector] = await db.update(schema.connectors).set(connectorToUpdate).where(and(...conditions)).returning();
    return updatedConnector;
  }

  async deleteConnector(id: number, organizationId?: number): Promise<boolean> {
    const conditions: SQL[] = [eq(schema.connectors.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.connectors.organizationId, organizationId));
    }
    const result = await db.delete(schema.connectors).where(and(...conditions)).returning({ id: schema.connectors.id });
    return result.length > 0;
  }

  async listConnectors(organizationId?: number): Promise<Connector[]> {
    const conditions: SQL[] = [];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.connectors.organizationId, organizationId));
    }
    if (conditions.length > 0) {
        return await db.select().from(schema.connectors).where(and(...conditions));
    }
    return await db.select().from(schema.connectors);
  }

  async toggleConnectorStatus(id: number, isActive: boolean, organizationId?: number): Promise<Connector | undefined> {
    const statusValue = isActive ? ConnectorStatusTypes.Enum.active : ConnectorStatusTypes.Enum.inactive;
    const updatePayload: Partial<schema.Connector> = {
      isActive: isActive,
      status: statusValue,
      updatedAt: new Date(),
    };
    
    const conditions: SQL[] = [eq(schema.connectors.id, id)];
    if (organizationId !== undefined) {
      conditions.push(eq(schema.connectors.organizationId, organizationId));
    }
    const [updatedConnector] = await db.update(schema.connectors)
      .set(updatePayload)
      .where(and(...conditions))
      .returning();
    return updatedConnector;
  }

  // Threat Feed methods
  async getThreatFeed(id: number, organizationId?: number): Promise<ThreatFeed | undefined> {
    const conditions_threat_feed_get: SQL[] = [eq(schema.threatFeeds.id, id)];
    if (organizationId !== undefined) {
      conditions_threat_feed_get.push(eq(schema.threatFeeds.organizationId, organizationId));
    }
    const [feed] = await db.select().from(schema.threatFeeds).where(and(...conditions_threat_feed_get));
    return feed;
  }

  async createThreatFeed(insertFeed: InsertThreatFeed): Promise<ThreatFeed> {
    if (!insertFeed.organizationId) {
      throw new Error("organizationId is required to create a threat feed.");
    }
    const [feed] = await db.insert(schema.threatFeeds).values(insertFeed).returning();
    return feed;
  }

  async updateThreatFeed(id: number, data: Partial<InsertThreatFeed>, organizationId?: number): Promise<ThreatFeed | undefined> {
    const feedToUpdate: Partial<schema.ThreatFeed> = { ...data, updatedAt: new Date() };
    const conditions_threat_feed_update: SQL[] = [eq(schema.threatFeeds.id, id)];
    if (organizationId !== undefined) {
      conditions_threat_feed_update.push(eq(schema.threatFeeds.organizationId, organizationId));
    }
    const [updatedFeed] = await db.update(schema.threatFeeds).set(feedToUpdate).where(and(...conditions_threat_feed_update)).returning();
    return updatedFeed;
  }

  async deleteThreatFeed(id: number, organizationId?: number): Promise<boolean> {
    const conditions_threat_feed_delete: SQL[] = [eq(schema.threatFeeds.id, id)];
    if (organizationId !== undefined) {
      conditions_threat_feed_delete.push(eq(schema.threatFeeds.organizationId, organizationId));
    }
    const result_threat_feed_delete = await db.delete(schema.threatFeeds).where(and(...conditions_threat_feed_delete)).returning({ id: schema.threatFeeds.id });
    return result_threat_feed_delete.length > 0;
  }

  async listThreatFeeds(organizationId?: number): Promise<ThreatFeed[]> {
     if (organizationId !== undefined) {
        return await db.select().from(schema.threatFeeds).where(eq(schema.threatFeeds.organizationId, organizationId));
     }
     return await db.select().from(schema.threatFeeds);
  }

  async toggleThreatFeedStatus(id: number, isActive: boolean, organizationId?: number): Promise<ThreatFeed | undefined> {
    const now_threat_feed_toggle = new Date();
    const statusValue_threat_feed_toggle = isActive ? ThreatFeedStatusTypes.Enum.active : ThreatFeedStatusTypes.Enum.inactive;
    const conditions_threat_feed_toggle: SQL[] = [eq(schema.threatFeeds.id, id)];
    if (organizationId !== undefined) {
      conditions_threat_feed_toggle.push(eq(schema.threatFeeds.organizationId, organizationId));
    }
    const [updatedFeed_toggle] = await db.update(schema.threatFeeds)
      .set({ isActive, status: statusValue_threat_feed_toggle, updatedAt: now_threat_feed_toggle })
      .where(and(...conditions_threat_feed_toggle))
      .returning();
    return updatedFeed_toggle;
  }

  // Playbook methods
  async getPlaybook(id: number, organizationId?: number): Promise<Playbook | undefined> {
    const conditions_playbook_get: SQL[] = [eq(schema.playbooks.id, id)];
    if (organizationId !== undefined) {
      conditions_playbook_get.push(eq(schema.playbooks.organizationId, organizationId));
    }
    const [playbook_get_result] = await db.select().from(schema.playbooks).where(and(...conditions_playbook_get));
    return playbook_get_result;
  }

  async createPlaybook(insertPlaybook: InsertPlaybook): Promise<Playbook> {
    if (!insertPlaybook.organizationId) {
      throw new Error("organizationId is required to create a playbook.");
    }
    const [playbook_create_result] = await db.insert(schema.playbooks).values(insertPlaybook).returning();
    return playbook_create_result;
  }

  async updatePlaybook(id: number, data: Partial<InsertPlaybook>, organizationId?: number): Promise<Playbook | undefined> {
    const playbookToUpdate: Partial<schema.Playbook> = { ...data, lastModified: new Date() };
    const conditions_playbook_update: SQL[] = [eq(schema.playbooks.id, id)];
    if (organizationId !== undefined) {
      conditions_playbook_update.push(eq(schema.playbooks.organizationId, organizationId));
    }
    const [updatedPlaybook_update_result] = await db.update(schema.playbooks).set(playbookToUpdate).where(and(...conditions_playbook_update)).returning();
    return updatedPlaybook_update_result;
  }

  async deletePlaybook(id: number, organizationId?: number): Promise<boolean> {
    const conditions_playbook_delete: SQL[] = [eq(schema.playbooks.id, id)];
    if (organizationId !== undefined) {
      conditions_playbook_delete.push(eq(schema.playbooks.organizationId, organizationId));
    }
    const result_playbook_delete = await db.delete(schema.playbooks).where(and(...conditions_playbook_delete)).returning({ id: schema.playbooks.id });
    return result_playbook_delete.length > 0;
  }

  async listPlaybooks(organizationId?: number): Promise<Playbook[]> {
    if (organizationId !== undefined) {
      return await db.select().from(schema.playbooks).where(eq(schema.playbooks.organizationId, organizationId));
    }
    return await db.select().from(schema.playbooks);
  }

  async togglePlaybookStatus(id: number, isActive: boolean, organizationId?: number): Promise<Playbook | undefined> {
    const now_playbook_toggle = new Date();
    const statusValue_playbook_toggle = isActive ? PlaybookStatusTypes.Enum.active : PlaybookStatusTypes.Enum.inactive;
    const conditions_playbook_toggle: SQL[] = [eq(schema.playbooks.id, id)];
    if (organizationId !== undefined) {
      conditions_playbook_toggle.push(eq(schema.playbooks.organizationId, organizationId));
    }
    const [updatedPlaybook_toggle_result] = await db.update(schema.playbooks)
      .set({ isActive, status: statusValue_playbook_toggle, lastModified: now_playbook_toggle })
      .where(and(...conditions_playbook_toggle))
      .returning();
    return updatedPlaybook_toggle_result;
  }

  async executePlaybook(id: number, organizationId: number, triggeredBy?: number, triggerEntityId?: number): Promise<PlaybookExecution> {
    const playbook_exec = await this.getPlaybook(id, organizationId);
    if (!playbook_exec) {
      throw new Error(`Playbook with id ${id} not found for organization ${organizationId}`);
    }

    let triggerSourceType: string | undefined = undefined;
    if (triggerEntityId) {
      const alert_trigger = await this.getAlert(triggerEntityId, organizationId);
      if (alert_trigger) {
        triggerSourceType = 'alert';
      } else {
        const incident_trigger = await this.getIncident(triggerEntityId, organizationId);
        if (incident_trigger) {
          triggerSourceType = 'incident';
        } else {
          console.warn(`Trigger entity ID ${triggerEntityId} not found as alert or incident for playbook execution.`);
        }
      }
    }

    const executionToCreate: InsertPlaybookExecution = {
      playbookId: id,
      organizationId,
      status: 'running',
      triggeredBy,
      triggerEntityId,
      triggerSource: triggerSourceType || 'manual',
      results: playbook_exec.steps as unknown[],
    };

    const [execution_result] = await db.insert(schema.playbookExecutions).values(executionToCreate).returning();
    
    console.log(`Executing steps for playbook ${playbook_exec.id}, execution ${execution_result.id}. Steps: `, playbook_exec.steps as unknown[]);

    return execution_result;
  }

  async incrementPlaybookExecutionCount(playbookId: number, organizationId: number, executionTimeMs?: number): Promise<void> {
    const playbook_inc_count = await this.getPlaybook(playbookId, organizationId);
    if (!playbook_inc_count) {
        console.warn(`Playbook with id ${playbookId} not found for organization ${organizationId} during incrementExecutionCount.`);
        return;
    }

    const currentExecutionCount_inc = playbook_inc_count.executionCount || 0;
    const newExecutionCount_inc = currentExecutionCount_inc + 1;
    let newAvgExecutionTime_inc = playbook_inc_count.avgExecutionTime;

    if (executionTimeMs !== undefined) {
        if (playbook_inc_count.avgExecutionTime === null || playbook_inc_count.avgExecutionTime === undefined || currentExecutionCount_inc === 0) {
            newAvgExecutionTime_inc = executionTimeMs;
        } else {
            const currentTotalTime_inc = (playbook_inc_count.avgExecutionTime || 0) * currentExecutionCount_inc;
            newAvgExecutionTime_inc = Math.round((currentTotalTime_inc + executionTimeMs) / newExecutionCount_inc);
        }
    }

    await db.update(schema.playbooks)
      .set({
        executionCount: newExecutionCount_inc,
        avgExecutionTime: newAvgExecutionTime_inc,
        lastExecuted: new Date(),
        lastModified: new Date()
      })
      .where(and(eq(schema.playbooks.id, playbookId), eq(schema.playbooks.organizationId, organizationId)));
  }

  // Playbook Execution methods
  async getPlaybookExecution(id: number, organizationId?: number): Promise<PlaybookExecution | undefined> {
    const conditions_pb_exec_get: SQL[] = [eq(schema.playbookExecutions.id, id)];
    if (organizationId !== undefined) {
      conditions_pb_exec_get.push(eq(schema.playbookExecutions.organizationId, organizationId));
    }
    const [execution_get_res] = await db.select().from(schema.playbookExecutions).where(and(...conditions_pb_exec_get));
    return execution_get_res;
  }

  async listPlaybookExecutions(
    organizationId: number,
    playbookId?: number,
    limit: number = 10,
    offset: number = 0,
    status?: string
  ): Promise<PlaybookExecution[]> {
    const conditions_pb_exec_list: SQL[] = [eq(schema.playbookExecutions.organizationId, organizationId)];
    if (playbookId) conditions_pb_exec_list.push(eq(schema.playbookExecutions.playbookId, playbookId));
    if (status) conditions_pb_exec_list.push(eq(schema.playbookExecutions.status, status));
    
    let queryChain_pb_exec_list = db.select().from(schema.playbookExecutions).where(and(...conditions_pb_exec_list)).orderBy(desc(schema.playbookExecutions.startedAt)) as any;
    return await queryChain_pb_exec_list.limit(limit).offset(offset);
  }

  async updatePlaybookExecution(
    id: number,
    data: Partial<InsertPlaybookExecution>,
    organizationId?: number
  ): Promise<PlaybookExecution | undefined> {
    const updatePayload_pb_exec: Partial<schema.PlaybookExecution> = { ...data, completedAt: data.status === 'completed' || data.status === 'failed' ? new Date() : undefined };
    const conditions_pb_exec_update: SQL[] = [eq(schema.playbookExecutions.id, id)];
    if (organizationId !== undefined) {
      conditions_pb_exec_update.push(eq(schema.playbookExecutions.organizationId, organizationId));
    }
    const [updatedExecution_res] = await db.update(schema.playbookExecutions).set(updatePayload_pb_exec).where(and(...conditions_pb_exec_update)).returning();
    return updatedExecution_res;
  }
  
  // Agent methods
  async getAgent(id: number, organizationId?: number): Promise<Agent | undefined> {
    const conditions_agent_get: SQL[] = [eq(schema.agents.id, id)];
    if (organizationId !== undefined) {
      conditions_agent_get.push(eq(schema.agents.organizationId, organizationId));
    }
    const [agent_get_res] = await db.select().from(schema.agents).where(and(...conditions_agent_get));
    return agent_get_res;
  }

  async getAgentByIdentifier(agentIdentifier: string, organizationId?: number): Promise<Agent | undefined> {
    const conditions_agent_get_id: SQL[] = [eq(schema.agents.agentIdentifier as unknown as AnyColumn, agentIdentifier)];
    if (organizationId !== undefined) {
      conditions_agent_get_id.push(eq(schema.agents.organizationId, organizationId));
    }
    const [agent_get_id_res] = await db.select().from(schema.agents).where(and(...conditions_agent_get_id));
    return agent_get_id_res;
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    if (!insertAgent.organizationId) {
      throw new Error("organizationId is required to create an agent.");
    }
    const [agent_create_res] = await db.insert(schema.agents).values(insertAgent).returning();
    return agent_create_res;
  }

  async updateAgent(
    id: number,
    data: Partial<InsertAgent> & { lastHeartbeat?: Date; lastMetrics?: any },
    organizationId?: number
  ): Promise<Agent | undefined> {
    const agentToUpdate: Partial<schema.Agent> = { ...data };
    if ((data as Partial<schema.Agent>).organizationId && organizationId && (data as Partial<schema.Agent>).organizationId !== organizationId) {
      throw new Error("Cannot change organizationId of an agent via this method if it conflicts with the query context.");
    }
    const conditions_agent_update: SQL[] = [eq(schema.agents.id, id)];
    if (organizationId !== undefined) {
      conditions_agent_update.push(eq(schema.agents.organizationId, organizationId));
    }
    const [updatedAgent_res] = await db.update(schema.agents).set(agentToUpdate).where(and(...conditions_agent_update)).returning();
    return updatedAgent_res;
  }

  async deleteAgent(id: number, organizationId?: number): Promise<boolean> {
    const conditions_agent_delete: SQL[] = [eq(schema.agents.id, id)];
    if (organizationId !== undefined) {
      conditions_agent_delete.push(eq(schema.agents.organizationId, organizationId));
    }
    const result_agent_delete = await db.delete(schema.agents).where(and(...conditions_agent_delete)).returning({ id: schema.agents.id });
    return result_agent_delete.length > 0;
  }

  async listAgents(
    organizationId: number,
    limit: number = 10,
    offset: number = 0,
    userId?: number,
    status?: string
  ): Promise<Agent[]> {
    const conditions_agent_list: SQL[] = [eq(schema.agents.organizationId, organizationId)];
    if (userId) conditions_agent_list.push(eq(schema.agents.userId as unknown as AnyColumn, userId));
    if (status) conditions_agent_list.push(eq(schema.agents.status, status));
    
    return await db.select().from(schema.agents).where(and(...conditions_agent_list)).orderBy(desc(schema.agents.lastHeartbeat as unknown as AnyColumn)).limit(limit).offset(offset);
  }

  async updateAgentHeartbeat(id: number, organizationId?: number): Promise<void> {
    const now_agent_hb = new Date();
    const conditions_agent_hb: SQL[] = [eq(schema.agents.id, id)];
    if (organizationId !== undefined) {
      conditions_agent_hb.push(eq(schema.agents.organizationId, organizationId));
    }
    await db.update(schema.agents).set({ lastHeartbeat: now_agent_hb, status: AgentStatusTypes.Enum.active }).where(and(...conditions_agent_hb));
  }

  async updateAgentStatus(id: number, status: string, organizationId?: number): Promise<Agent | undefined> {
    const conditions_agent_status: SQL[] = [eq(schema.agents.id, id)];
    if (organizationId !== undefined) {
      conditions_agent_status.push(eq(schema.agents.organizationId, organizationId));
    }
    const [updatedAgent_status_res] = await db.update(schema.agents).set({ status }).where(and(...conditions_agent_status)).returning();
    return updatedAgent_status_res;
  }
}

export const storage = new DatabaseStorage();