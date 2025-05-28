import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { db, pool } from './db';
import * as schema from '@shared/schema';
import { PlaybookStatusTypes, ConnectorStatusTypes, ThreatFeedStatusTypes, AgentStatusTypes } from '@shared/schema';
import { eq, desc, asc, sql, and, or, gte, lte, ilike } from 'drizzle-orm';
const PgStore = connectPgSimple(session);
export class DatabaseStorage {
    sessionStore;
    constructor() {
        this.sessionStore = new PgStore({
            pool: pool,
            createTableIfMissing: true,
        });
    }
    // Plan methods
    async getPlan(id) {
        const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
        return plan;
    }
    async getPlans() {
        // Retorna todos los planes activos, ordenados por precio
        return await db.select()
            .from(schema.plans)
            .where(eq(schema.plans.isActive, true))
            .orderBy(asc(schema.plans.priceMonthly));
    }
    async createPlan(insertPlan) {
        const [plan] = await db.insert(schema.plans).values(insertPlan).returning();
        return plan;
    }
    async updatePlan(id, updateData) {
        const planToUpdate = {
            ...updateData,
            updatedAt: new Date()
        };
        const [plan] = await db.update(schema.plans).set(planToUpdate).where(eq(schema.plans.id, id)).returning();
        return plan;
    }
    async listPlans(limit = 10, offset = 0) {
        return await db.select().from(schema.plans).limit(limit).offset(offset);
    }
    // Organization methods
    async getOrganization(id) {
        const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id));
        return org;
    }
    async createOrganization(insertOrganization) {
        const [organization] = await db.insert(schema.organizations).values(insertOrganization).returning();
        return organization;
    }
    async updateOrganization(id, updateData) {
        const orgToUpdate = {
            ...updateData,
            updatedAt: new Date()
        };
        const [updatedOrganization] = await db.update(schema.organizations).set(orgToUpdate).where(eq(schema.organizations.id, id)).returning();
        return updatedOrganization;
    }
    async listOrganizations(limit = 10, offset = 0) {
        return await db.select().from(schema.organizations).limit(limit).offset(offset);
    }
    // User methods
    async getUser(id) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
        return user;
    }
    async getUserByUsername(username) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
        return user;
    }
    async createUser(insertUser) {
        if (!insertUser.organizationId) {
            throw new Error("organizationId is required to create a user.");
        }
        const [user] = await db.insert(schema.users).values(insertUser).returning();
        return user;
    }
    async listUsers(organizationId, limit = 10, offset = 0) {
        let query = db.select().from(schema.users);
        if (organizationId !== undefined) {
            query = query.where(eq(schema.users.organizationId, organizationId));
        }
        return await query.limit(limit).offset(offset);
    }
    // Alert methods
    async getAlert(id, organizationId) {
        const conditions = [eq(schema.alerts.id, id)];
        if (organizationId !== undefined)
            conditions.push(eq(schema.alerts.organizationId, organizationId));
        const [alert] = await db.select().from(schema.alerts).where(and(...conditions));
        return alert;
    }
    async createAlert(insertAlert) {
        if (!insertAlert.organizationId) {
            throw new Error("organizationId is required to create an alert.");
        }
        const [alert] = await db.insert(schema.alerts).values(insertAlert).returning();
        // Publish SOAR event for alert creation
        try {
            const { eventBus } = await import('./src/services/eventBus');
            const event = {
                type: 'alert.created',
                entityId: alert.id,
                entityType: 'alert',
                organizationId: alert.organizationId,
                timestamp: new Date(),
                data: {
                    alertId: alert.id,
                    severity: alert.severity || 'medium',
                    category: alert.metadata?.category,
                    sourceIp: alert.sourceIp,
                    hostId: alert.metadata?.hostId,
                    hostname: alert.metadata?.hostname,
                }
            };
            eventBus.publish(event);
            
            // Also publish to Redis Stream if PlaybookTriggerEngine is available
            try {
                const { playbookTriggerEngine } = await import('./src/services/PlaybookTriggerEngine');
                await playbookTriggerEngine.publishEventToStream(event);
            } catch (streamError) {
                console.error('[Storage] Error publishing to Redis Stream:', streamError);
            }
        }
        catch (error) {
            console.error('[Storage] Error publishing alert.created event:', error);
        }
        // Enqueue threat intel lookups for IoCs
        const iocs = [insertAlert.fileHash, insertAlert.url, insertAlert.sourceIp, insertAlert.destinationIp, insertAlert.cveId]
            .filter((ioc) => typeof ioc === 'string');
        for (const ioc of iocs) {
            ThreatIntel.lookup(ioc).catch(console.error);
        }
        return alert;
    }
    async updateAlert(id, data, organizationId) {
        const alertToUpdate = { ...data };
        const conditions = [eq(schema.alerts.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.alerts.organizationId, organizationId));
        }
        const [updatedAlert] = await db.update(schema.alerts).set(alertToUpdate).where(and(...conditions)).returning();
        return updatedAlert;
    }
    async listAlerts(limit = 10, offset = 0, organizationId, filters) {
        const conditions = [];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.alerts.organizationId, organizationId));
        }
        if (filters?.status)
            conditions.push(eq(schema.alerts.status, filters.status));
        if (filters?.severity)
            conditions.push(eq(schema.alerts.severity, filters.severity));
        if (filters?.dateFrom)
            conditions.push(gte(schema.alerts.timestamp, filters.dateFrom));
        if (filters?.dateTo)
            conditions.push(lte(schema.alerts.timestamp, filters.dateTo));
        if (filters?.query) {
            conditions.push(or(ilike(schema.alerts.title, `%${filters.query}%`), ilike(schema.alerts.description, `%${filters.query}%`)));
        }
        let queryChain = db.select().from(schema.alerts);
        if (conditions.length > 0) {
            queryChain = queryChain.where(and(...conditions));
        }
        queryChain = queryChain.orderBy(desc(schema.alerts.timestamp));
        return await queryChain.limit(limit).offset(offset);
    }
    async getAlertsCountByDay(organizationId, numberOfDays) {
        const query = sql `
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
        const result = await db.execute(query);
        return result.map(r => ({ ...r, count: Number(r.count) }));
    }
    // Incident methods
    async getIncident(id, organizationId) {
        const conditions = [eq(schema.incidents.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.incidents.organizationId, organizationId));
        }
        const [incident] = await db.select().from(schema.incidents).where(and(...conditions));
        return incident;
    }
    async createIncident(insertIncident) {
        if (!insertIncident.organizationId) {
            throw new Error("organizationId is required to create an incident.");
        }
        const [incident] = await db.insert(schema.incidents).values(insertIncident).returning();
        return incident;
    }
    async updateIncident(id, updateData, organizationId) {
        const dataToSet = { ...updateData };
        dataToSet.updatedAt = new Date();
        if (updateData.status === schema.IncidentStatusTypes.Enum.closed && updateData.closedAt === undefined) {
            dataToSet.closedAt = new Date();
        }
        else if (updateData.status !== schema.IncidentStatusTypes.Enum.closed && updateData.closedAt === null) {
            dataToSet.closedAt = null;
        }
        const conditions = [eq(schema.incidents.id, id)];
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
                    organizationId: updatedIncident.organizationId,
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
            }
            catch (error) {
                console.error('[Storage] Error publishing incident.status_updated event:', error);
            }
        }
        return updatedIncident;
    }
    async listIncidents(organizationId, limit = 10, offset = 0, filters) {
        const conditions = [eq(schema.incidents.organizationId, organizationId)];
        if (filters?.status) {
            conditions.push(eq(schema.incidents.status, filters.status));
        }
        if (filters?.severity) {
            conditions.push(eq(schema.incidents.severity, filters.severity));
        }
        if (filters?.query) {
            conditions.push(or(ilike(schema.incidents.title, `%${filters.query}%`), ilike(schema.incidents.description, `%${filters.query}%`)));
        }
        const queryChain = db.select()
            .from(schema.incidents)
            .where(and(...conditions))
            .orderBy(desc(schema.incidents.createdAt))
            .limit(limit)
            .offset(offset);
        return await queryChain;
    }
    async getMitreTacticsDistribution(organizationId) {
        const query = sql `
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
        const result = await db.execute(query);
        return result.map(r => ({ ...r, count: Number(r.count) }));
    }
    // Threat Intel methods
    async getThreatIntel(id, organizationId) {
        const conditions = [eq(schema.threatIntel.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.threatIntel.organizationId, organizationId));
        }
        const [intel] = await db.select().from(schema.threatIntel).where(and(...conditions));
        return intel;
    }
    async createThreatIntel(insertIntel) {
        if (!insertIntel.organizationId) {
            throw new Error("organizationId is required to create a threat intel entry.");
        }
        const [intel] = await db.insert(schema.threatIntel).values(insertIntel).returning();
        return intel;
    }
    async listThreatIntel(organizationId, limit = 10, offset = 0, type) {
        const conditions = [eq(schema.threatIntel.organizationId, organizationId)];
        if (type)
            conditions.push(eq(schema.threatIntel.type, type));
        let queryChain = db.select().from(schema.threatIntel).where(and(...conditions)).orderBy(desc(schema.threatIntel.createdAt));
        return await queryChain.limit(limit).offset(offset);
    }
    // AI Insight methods
    async getAiInsight(id, organizationId) {
        const conditions = [eq(schema.aiInsights.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.aiInsights.organizationId, organizationId));
        }
        const [insight] = await db.select().from(schema.aiInsights).where(and(...conditions));
        return insight;
    }
    async createAiInsight(insertInsight) {
        if (!insertInsight.organizationId) {
            throw new Error("organizationId is required to create an AI insight.");
        }
        const [insight] = await db.insert(schema.aiInsights).values(insertInsight).returning();
        return insight;
    }
    async listAiInsights(organizationId, limit = 10, offset = 0) {
        const conditions = [eq(schema.aiInsights.organizationId, organizationId)];
        let queryChain = db.select().from(schema.aiInsights).where(and(...conditions)).orderBy(desc(schema.aiInsights.createdAt));
        return await queryChain.limit(limit).offset(offset);
    }
    // Metrics methods
    async getMetric(id, organizationId) {
        const conditions = [eq(schema.metrics.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.metrics.organizationId, organizationId));
        }
        const [metric] = await db.select().from(schema.metrics).where(and(...conditions));
        return metric;
    }
    async createMetric(insertMetric) {
        const [metric] = await db.insert(schema.metrics).values(insertMetric).returning();
        return metric;
    }
    async getMetricByName(name, organizationId) {
        const conditions = [eq(schema.metrics.name, name)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.metrics.organizationId, organizationId));
        }
        const [metric] = await db.select().from(schema.metrics).where(and(...conditions));
        return metric;
    }
    async getMetricByNameAndOrg(name, organizationId) {
        return this.getMetricByName(name, organizationId);
    }
    async listMetrics(organizationId) {
        const conditions = [];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.metrics.organizationId, organizationId));
        }
        if (conditions.length > 0) {
            return await db.select().from(schema.metrics).where(and(...conditions));
        }
        return await db.select().from(schema.metrics);
    }
    // Connector methods
    async getConnector(id, organizationId) {
        const conditions = [eq(schema.connectors.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.connectors.organizationId, organizationId));
        }
        const [connector] = await db.select().from(schema.connectors).where(and(...conditions));
        return connector;
    }
    async createConnector(insertConnector) {
        if (!insertConnector.organizationId) {
            throw new Error("organizationId is required to create a connector.");
        }
        const [connector] = await db.insert(schema.connectors).values(insertConnector).returning();
        return connector;
    }
    async updateConnector(id, data, organizationId) {
        const connectorToUpdate = {
            ...data,
            updatedAt: new Date()
        };
        const conditions = [eq(schema.connectors.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.connectors.organizationId, organizationId));
        }
        const [updatedConnector] = await db.update(schema.connectors).set(connectorToUpdate).where(and(...conditions)).returning();
        return updatedConnector;
    }
    async deleteConnector(id, organizationId) {
        const conditions = [eq(schema.connectors.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.connectors.organizationId, organizationId));
        }
        const result = await db.delete(schema.connectors).where(and(...conditions)).returning({ id: schema.connectors.id });
        return result.length > 0;
    }
    async listConnectors(organizationId) {
        const conditions = [];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.connectors.organizationId, organizationId));
        }
        if (conditions.length > 0) {
            return await db.select().from(schema.connectors).where(and(...conditions));
        }
        return await db.select().from(schema.connectors);
    }
    async toggleConnectorStatus(id, isActive, organizationId) {
        const statusValue = isActive ? ConnectorStatusTypes.Enum.active : ConnectorStatusTypes.Enum.inactive;
        const updatePayload = {
            isActive: isActive,
            status: statusValue,
            updatedAt: new Date(),
        };
        const conditions = [eq(schema.connectors.id, id)];
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
    async getThreatFeed(id, organizationId) {
        const conditions_threat_feed_get = [eq(schema.threatFeeds.id, id)];
        if (organizationId !== undefined) {
            conditions_threat_feed_get.push(eq(schema.threatFeeds.organizationId, organizationId));
        }
        const [feed] = await db.select().from(schema.threatFeeds).where(and(...conditions_threat_feed_get));
        return feed;
    }
    async createThreatFeed(insertFeed) {
        if (!insertFeed.organizationId) {
            throw new Error("organizationId is required to create a threat feed.");
        }
        const [feed] = await db.insert(schema.threatFeeds).values(insertFeed).returning();
        return feed;
    }
    async updateThreatFeed(id, data, organizationId) {
        const feedToUpdate = { ...data, updatedAt: new Date() };
        const conditions_threat_feed_update = [eq(schema.threatFeeds.id, id)];
        if (organizationId !== undefined) {
            conditions_threat_feed_update.push(eq(schema.threatFeeds.organizationId, organizationId));
        }
        const [updatedFeed] = await db.update(schema.threatFeeds).set(feedToUpdate).where(and(...conditions_threat_feed_update)).returning();
        return updatedFeed;
    }
    async deleteThreatFeed(id, organizationId) {
        const conditions_threat_feed_delete = [eq(schema.threatFeeds.id, id)];
        if (organizationId !== undefined) {
            conditions_threat_feed_delete.push(eq(schema.threatFeeds.organizationId, organizationId));
        }
        const result_threat_feed_delete = await db.delete(schema.threatFeeds).where(and(...conditions_threat_feed_delete)).returning({ id: schema.threatFeeds.id });
        return result_threat_feed_delete.length > 0;
    }
    async listThreatFeeds(organizationId) {
        if (organizationId !== undefined) {
            return await db.select().from(schema.threatFeeds).where(eq(schema.threatFeeds.organizationId, organizationId));
        }
        return await db.select().from(schema.threatFeeds);
    }
    async toggleThreatFeedStatus(id, isActive, organizationId) {
        const now_threat_feed_toggle = new Date();
        const statusValue_threat_feed_toggle = isActive ? ThreatFeedStatusTypes.Enum.active : ThreatFeedStatusTypes.Enum.inactive;
        const conditions_threat_feed_toggle = [eq(schema.threatFeeds.id, id)];
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
    async getPlaybook(id, organizationId) {
        const conditions_playbook_get = [eq(schema.playbooks.id, id)];
        if (organizationId !== undefined) {
            conditions_playbook_get.push(eq(schema.playbooks.organizationId, organizationId));
        }
        const [playbook_get_result] = await db.select().from(schema.playbooks).where(and(...conditions_playbook_get));
        return playbook_get_result;
    }
    async createPlaybook(insertPlaybook) {
        if (!insertPlaybook.organizationId) {
            throw new Error("organizationId is required to create a playbook.");
        }
        const [playbook_create_result] = await db.insert(schema.playbooks).values(insertPlaybook).returning();
        return playbook_create_result;
    }
    async updatePlaybook(id, data, organizationId) {
        const playbookToUpdate = { ...data, lastModified: new Date() };
        const conditions_playbook_update = [eq(schema.playbooks.id, id)];
        if (organizationId !== undefined) {
            conditions_playbook_update.push(eq(schema.playbooks.organizationId, organizationId));
        }
        const [updatedPlaybook_update_result] = await db.update(schema.playbooks).set(playbookToUpdate).where(and(...conditions_playbook_update)).returning();
        return updatedPlaybook_update_result;
    }
    async deletePlaybook(id, organizationId) {
        const conditions_playbook_delete = [eq(schema.playbooks.id, id)];
        if (organizationId !== undefined) {
            conditions_playbook_delete.push(eq(schema.playbooks.organizationId, organizationId));
        }
        const result_playbook_delete = await db.delete(schema.playbooks).where(and(...conditions_playbook_delete)).returning({ id: schema.playbooks.id });
        return result_playbook_delete.length > 0;
    }
    async listPlaybooks(organizationId) {
        if (organizationId !== undefined) {
            return await db.select().from(schema.playbooks).where(eq(schema.playbooks.organizationId, organizationId));
        }
        return await db.select().from(schema.playbooks);
    }
    async togglePlaybookStatus(id, isActive, organizationId) {
        const now_playbook_toggle = new Date();
        const statusValue_playbook_toggle = isActive ? PlaybookStatusTypes.Enum.active : PlaybookStatusTypes.Enum.inactive;
        const conditions_playbook_toggle = [eq(schema.playbooks.id, id)];
        if (organizationId !== undefined) {
            conditions_playbook_toggle.push(eq(schema.playbooks.organizationId, organizationId));
        }
        const [updatedPlaybook_toggle_result] = await db.update(schema.playbooks)
            .set({ isActive, status: statusValue_playbook_toggle, lastModified: now_playbook_toggle })
            .where(and(...conditions_playbook_toggle))
            .returning();
        return updatedPlaybook_toggle_result;
    }
    async executePlaybook(id, organizationId, triggeredBy, triggerEntityId) {
        const playbook_exec = await this.getPlaybook(id, organizationId);
        if (!playbook_exec) {
            throw new Error(`Playbook with id ${id} not found for organization ${organizationId}`);
        }
        let triggerSourceType = undefined;
        if (triggerEntityId) {
            const alert_trigger = await this.getAlert(triggerEntityId, organizationId);
            if (alert_trigger) {
                triggerSourceType = 'alert';
            }
            else {
                const incident_trigger = await this.getIncident(triggerEntityId, organizationId);
                if (incident_trigger) {
                    triggerSourceType = 'incident';
                }
                else {
                    console.warn(`Trigger entity ID ${triggerEntityId} not found as alert or incident for playbook execution.`);
                }
            }
        }
        const executionToCreate = {
            playbookId: id,
            organizationId,
            status: 'running',
            triggeredBy,
            triggerEntityId,
            triggerSource: triggerSourceType || 'manual',
            results: playbook_exec.steps,
        };
        const [execution_result] = await db.insert(schema.playbookExecutions).values(executionToCreate).returning();
        console.log(`Executing steps for playbook ${playbook_exec.id}, execution ${execution_result.id}. Steps: `, playbook_exec.steps);
        return execution_result;
    }
    async incrementPlaybookExecutionCount(playbookId, organizationId, executionTimeMs) {
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
            }
            else {
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
    async getPlaybookExecution(id, organizationId) {
        const conditions_pb_exec_get = [eq(schema.playbookExecutions.id, id)];
        if (organizationId !== undefined) {
            conditions_pb_exec_get.push(eq(schema.playbookExecutions.organizationId, organizationId));
        }
        const [execution_get_res] = await db.select().from(schema.playbookExecutions).where(and(...conditions_pb_exec_get));
        return execution_get_res;
    }
    async listPlaybookExecutions(organizationId, playbookId, limit = 10, offset = 0, status) {
        const conditions_pb_exec_list = [eq(schema.playbookExecutions.organizationId, organizationId)];
        if (playbookId)
            conditions_pb_exec_list.push(eq(schema.playbookExecutions.playbookId, playbookId));
        if (status)
            conditions_pb_exec_list.push(eq(schema.playbookExecutions.status, status));
        let queryChain_pb_exec_list = db.select().from(schema.playbookExecutions).where(and(...conditions_pb_exec_list)).orderBy(desc(schema.playbookExecutions.startedAt));
        return await queryChain_pb_exec_list.limit(limit).offset(offset);
    }
    async updatePlaybookExecution(id, data, organizationId) {
        const updatePayload_pb_exec = { ...data, completedAt: data.status === 'completed' || data.status === 'failed' ? new Date() : undefined };
        const conditions_pb_exec_update = [eq(schema.playbookExecutions.id, id)];
        if (organizationId !== undefined) {
            conditions_pb_exec_update.push(eq(schema.playbookExecutions.organizationId, organizationId));
        }
        const [updatedExecution_res] = await db.update(schema.playbookExecutions).set(updatePayload_pb_exec).where(and(...conditions_pb_exec_update)).returning();
        return updatedExecution_res;
    }
    // Agent methods
    async getAgent(id, organizationId) {
        const conditions_agent_get = [eq(schema.agents.id, id)];
        if (organizationId !== undefined) {
            conditions_agent_get.push(eq(schema.agents.organizationId, organizationId));
        }
        const [agent_get_res] = await db.select().from(schema.agents).where(and(...conditions_agent_get));
        return agent_get_res;
    }
    async getAgentByIdentifier(agentIdentifier, organizationId) {
        const conditions_agent_get_id = [eq(schema.agents.agentIdentifier, agentIdentifier)];
        if (organizationId !== undefined) {
            conditions_agent_get_id.push(eq(schema.agents.organizationId, organizationId));
        }
        const [agent_get_id_res] = await db.select().from(schema.agents).where(and(...conditions_agent_get_id));
        return agent_get_id_res;
    }
    async createAgent(insertAgent) {
        if (!insertAgent.organizationId) {
            throw new Error("organizationId is required to create an agent.");
        }
        const [agent_create_res] = await db.insert(schema.agents).values(insertAgent).returning();
        return agent_create_res;
    }
    async updateAgent(id, data, organizationId) {
        const agentToUpdate = { ...data };
        if (data.organizationId && organizationId && data.organizationId !== organizationId) {
            throw new Error("Cannot change organizationId of an agent via this method if it conflicts with the query context.");
        }
        const conditions_agent_update = [eq(schema.agents.id, id)];
        if (organizationId !== undefined) {
            conditions_agent_update.push(eq(schema.agents.organizationId, organizationId));
        }
        const [updatedAgent_res] = await db.update(schema.agents).set(agentToUpdate).where(and(...conditions_agent_update)).returning();
        return updatedAgent_res;
    }
    async deleteAgent(id, organizationId) {
        const conditions_agent_delete = [eq(schema.agents.id, id)];
        if (organizationId !== undefined) {
            conditions_agent_delete.push(eq(schema.agents.organizationId, organizationId));
        }
        const result_agent_delete = await db.delete(schema.agents).where(and(...conditions_agent_delete)).returning({ id: schema.agents.id });
        return result_agent_delete.length > 0;
    }
    async listAgents(organizationId, limit = 10, offset = 0, userId, status) {
        const conditions_agent_list = [eq(schema.agents.organizationId, organizationId)];
        if (userId)
            conditions_agent_list.push(eq(schema.agents.userId, userId));
        if (status)
            conditions_agent_list.push(eq(schema.agents.status, status));
        return await db.select().from(schema.agents).where(and(...conditions_agent_list)).orderBy(desc(schema.agents.lastHeartbeat)).limit(limit).offset(offset);
    }
    async updateAgentHeartbeat(id, organizationId) {
        const now_agent_hb = new Date();
        const conditions_agent_hb = [eq(schema.agents.id, id)];
        if (organizationId !== undefined) {
            conditions_agent_hb.push(eq(schema.agents.organizationId, organizationId));
        }
        await db.update(schema.agents).set({ lastHeartbeat: now_agent_hb, status: AgentStatusTypes.Enum.active }).where(and(...conditions_agent_hb));
    }
    async updateAgentStatus(id, status, organizationId) {
        const conditions_agent_status = [eq(schema.agents.id, id)];
        if (organizationId !== undefined) {
            conditions_agent_status.push(eq(schema.agents.organizationId, organizationId));
        }
        const [updatedAgent_status_res] = await db.update(schema.agents).set({ status }).where(and(...conditions_agent_status)).returning();
        return updatedAgent_status_res;
    }
    // Report Template methods
    async getReportTemplate(id, organizationId) {
        const conditions = [eq(schema.reportTemplates.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportTemplates.organizationId, organizationId));
        }
        const [template] = await db.select().from(schema.reportTemplates).where(and(...conditions));
        return template;
    }
    async createReportTemplate(insertTemplate) {
        if (!insertTemplate.organizationId) {
            throw new Error("organizationId is required to create a report template.");
        }
        const [template] = await db.insert(schema.reportTemplates).values(insertTemplate).returning();
        return template;
    }
    async updateReportTemplate(id, data, organizationId) {
        const templateToUpdate = { ...data, updatedAt: new Date() };
        const conditions = [eq(schema.reportTemplates.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportTemplates.organizationId, organizationId));
        }
        const [updatedTemplate] = await db.update(schema.reportTemplates).set(templateToUpdate).where(and(...conditions)).returning();
        return updatedTemplate;
    }
    async deleteReportTemplate(id, organizationId) {
        const conditions = [eq(schema.reportTemplates.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportTemplates.organizationId, organizationId));
        }
        const result = await db.delete(schema.reportTemplates).where(and(...conditions)).returning({ id: schema.reportTemplates.id });
        return result.length > 0;
    }
    async listReportTemplates(organizationId, limit = 10, offset = 0, type) {
        const conditions = [eq(schema.reportTemplates.organizationId, organizationId)];
        if (type)
            conditions.push(eq(schema.reportTemplates.type, type));
        return await db.select()
            .from(schema.reportTemplates)
            .where(and(...conditions))
            .orderBy(desc(schema.reportTemplates.createdAt))
            .limit(limit)
            .offset(offset);
    }
    async getEnabledReportTemplates(organizationId) {
        return await db.select()
            .from(schema.reportTemplates)
            .where(and(eq(schema.reportTemplates.organizationId, organizationId), eq(schema.reportTemplates.isEnabled, true)))
            .orderBy(asc(schema.reportTemplates.name));
    }
    // Generated Reports methods
    async getReportGenerated(id, organizationId) {
        const conditions = [eq(schema.reportsGenerated.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportsGenerated.organizationId, organizationId));
        }
        const [report] = await db.select().from(schema.reportsGenerated).where(and(...conditions));
        return report;
    }
    async createReportGenerated(insertReport) {
        if (!insertReport.organizationId) {
            throw new Error("organizationId is required to create a generated report.");
        }
        const [report] = await db.insert(schema.reportsGenerated).values(insertReport).returning();
        return report;
    }
    async updateReportGenerated(id, data, organizationId) {
        const reportToUpdate = { ...data };
        const conditions = [eq(schema.reportsGenerated.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportsGenerated.organizationId, organizationId));
        }
        const [updatedReport] = await db.update(schema.reportsGenerated).set(reportToUpdate).where(and(...conditions)).returning();
        return updatedReport;
    }
    async deleteReportGenerated(id, organizationId) {
        const conditions = [eq(schema.reportsGenerated.id, id)];
        if (organizationId !== undefined) {
            conditions.push(eq(schema.reportsGenerated.organizationId, organizationId));
        }
        // First delete associated artifacts
        await db.delete(schema.reportArtifacts).where(eq(schema.reportArtifacts.reportId, id));
        // Then delete the report
        const result = await db.delete(schema.reportsGenerated).where(and(...conditions)).returning({ id: schema.reportsGenerated.id });
        return result.length > 0;
    }
    async listReportsGenerated(organizationId, limit = 10, offset = 0, filters) {
        const conditions = [eq(schema.reportsGenerated.organizationId, organizationId)];
        if (filters?.status)
            conditions.push(eq(schema.reportsGenerated.status, filters.status));
        if (filters?.type)
            conditions.push(eq(schema.reportsGenerated.type, filters.type));
        if (filters?.templateId)
            conditions.push(eq(schema.reportsGenerated.templateId, filters.templateId));
        if (filters?.dateFrom)
            conditions.push(gte(schema.reportsGenerated.createdAt, filters.dateFrom));
        if (filters?.dateTo)
            conditions.push(lte(schema.reportsGenerated.createdAt, filters.dateTo));
        return await db.select()
            .from(schema.reportsGenerated)
            .where(and(...conditions))
            .orderBy(desc(schema.reportsGenerated.createdAt))
            .limit(limit)
            .offset(offset);
    }
    async getReportsGeneratedByTemplate(templateId, organizationId) {
        return await db.select()
            .from(schema.reportsGenerated)
            .where(and(eq(schema.reportsGenerated.templateId, templateId), eq(schema.reportsGenerated.organizationId, organizationId)))
            .orderBy(desc(schema.reportsGenerated.createdAt));
    }
    async getRecentReportsGenerated(organizationId, limit = 5) {
        return await db.select()
            .from(schema.reportsGenerated)
            .where(and(eq(schema.reportsGenerated.organizationId, organizationId), eq(schema.reportsGenerated.status, 'completed')))
            .orderBy(desc(schema.reportsGenerated.generatedAt))
            .limit(limit);
    }
    // Report Artifacts methods
    async getReportArtifact(id) {
        const [artifact] = await db.select().from(schema.reportArtifacts).where(eq(schema.reportArtifacts.id, id));
        return artifact;
    }
    async createReportArtifact(insertArtifact) {
        const [artifact] = await db.insert(schema.reportArtifacts).values(insertArtifact).returning();
        return artifact;
    }
    async listReportArtifacts(reportId) {
        return await db.select()
            .from(schema.reportArtifacts)
            .where(eq(schema.reportArtifacts.reportId, reportId))
            .orderBy(asc(schema.reportArtifacts.name));
    }
    async deleteReportArtifact(id) {
        const result = await db.delete(schema.reportArtifacts).where(eq(schema.reportArtifacts.id, id)).returning({ id: schema.reportArtifacts.id });
        return result.length > 0;
    }
    // Report Statistics and Analytics methods
    async getReportStatistics(organizationId, days = 30) {
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - days);
        // Total reports in period
        const totalQuery = await db.select({ count: sql `count(*)` })
            .from(schema.reportsGenerated)
            .where(and(eq(schema.reportsGenerated.organizationId, organizationId), gte(schema.reportsGenerated.createdAt, dateFrom)));
        const totalReports = Number(totalQuery[0]?.count || 0);
        // Completed reports
        const completedQuery = await db.select({ count: sql `count(*)` })
            .from(schema.reportsGenerated)
            .where(and(eq(schema.reportsGenerated.organizationId, organizationId), eq(schema.reportsGenerated.status, 'completed'), gte(schema.reportsGenerated.createdAt, dateFrom)));
        const completedReports = Number(completedQuery[0]?.count || 0);
        // Failed reports
        const failedQuery = await db.select({ count: sql `count(*)` })
            .from(schema.reportsGenerated)
            .where(and(eq(schema.reportsGenerated.organizationId, organizationId), eq(schema.reportsGenerated.status, 'failed'), gte(schema.reportsGenerated.createdAt, dateFrom)));
        const failedReports = Number(failedQuery[0]?.count || 0);
        // Average generation time (for completed reports)
        const avgTimeQuery = await db.execute(sql `
      SELECT AVG(EXTRACT(EPOCH FROM (generated_at - created_at))) as avg_time
      FROM ${schema.reportsGenerated}
      WHERE ${schema.reportsGenerated.organizationId} = ${organizationId}
        AND ${schema.reportsGenerated.status} = 'completed'
        AND ${schema.reportsGenerated.generatedAt} IS NOT NULL
        AND ${schema.reportsGenerated.createdAt} >= ${dateFrom}
    `);
        const averageGenerationTime = Number(avgTimeQuery[0]?.avg_time || 0);
        // Reports by type
        const typeQuery = await db.execute(sql `
      SELECT type, COUNT(*)::int as count
      FROM ${schema.reportsGenerated}
      WHERE ${schema.reportsGenerated.organizationId} = ${organizationId}
        AND ${schema.reportsGenerated.createdAt} >= ${dateFrom}
      GROUP BY type
      ORDER BY count DESC
    `);
        const reportsByType = typeQuery.map((row) => ({
            type: row.type,
            count: Number(row.count)
        }));
        // Recent activity (daily counts)
        const activityQuery = await db.execute(sql `
      SELECT 
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        COUNT(*)::int as count
      FROM ${schema.reportsGenerated}
      WHERE ${schema.reportsGenerated.organizationId} = ${organizationId}
        AND ${schema.reportsGenerated.createdAt} >= ${dateFrom}
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at) ASC
    `);
        const recentActivity = activityQuery.map((row) => ({
            date: row.date,
            count: Number(row.count)
        }));
        return {
            totalReports,
            completedReports,
            failedReports,
            averageGenerationTime: Math.round(averageGenerationTime),
            reportsByType,
            recentActivity
        };
    }
}
export const storage = new DatabaseStorage();
