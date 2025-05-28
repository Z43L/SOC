import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { playbooks } from '../../../shared/schema';
import { playbookDefinitionSchema, legacyPlaybookDefinitionSchema } from '../../../shared/playbookDefinition';
import { soarExecutor } from './SoarExecutorService';
import { eventBus } from './eventBus';
export class PlaybookTriggerService {
    constructor() {
        this.setupEventListeners();
    }
    setupEventListeners() {
        // Listen for alert creation events
        eventBus.subscribe('alert.created', this.handleAlertCreated.bind(this));
        eventBus.subscribe('incident.created', this.handleIncidentCreated.bind(this));
        eventBus.subscribe('incident.updated', this.handleIncidentUpdated.bind(this));
        console.log('[PlaybookTrigger] Event listeners setup complete');
    }
    // Handle alert creation events
    async handleAlertCreated(event) {
        console.log(`[PlaybookTrigger] Processing alert.created event for alert ${event.data.id}`);
        try {
            await this.findAndTriggerPlaybooks('alert', event);
        }
        catch (error) {
            console.error('[PlaybookTrigger] Error handling alert.created:', error);
        }
    }
    // Handle incident creation events
    async handleIncidentCreated(event) {
        console.log(`[PlaybookTrigger] Processing incident.created event for incident ${event.data.id}`);
        try {
            await this.findAndTriggerPlaybooks('incident', event);
        }
        catch (error) {
            console.error('[PlaybookTrigger] Error handling incident.created:', error);
        }
    }
    // Handle incident update events
    async handleIncidentUpdated(event) {
        console.log(`[PlaybookTrigger] Processing incident.updated event for incident ${event.data.id}`);
        try {
            await this.findAndTriggerPlaybooks('incident', event);
        }
        catch (error) {
            console.error('[PlaybookTrigger] Error handling incident.updated:', error);
        }
    }
    // Find and trigger matching playbooks
    async findAndTriggerPlaybooks(triggerType, event) {
        // Find active playbooks that match the trigger type
        const activePlaybooks = await db
            .select()
            .from(playbooks)
            .where(and(eq(playbooks.isActive, true), eq(playbooks.triggerType, triggerType), eq(playbooks.organizationId, event.organizationId)));
        console.log(`[PlaybookTrigger] Found ${activePlaybooks.length} active ${triggerType} playbooks`);
        for (const playbook of activePlaybooks) {
            try {
                const shouldTrigger = await this.evaluatePlaybookTrigger(playbook, event);
                if (shouldTrigger) {
                    console.log(`[PlaybookTrigger] Triggering playbook ${playbook.id}: ${playbook.name}`);
                    // Prepare execution context
                    const context = {
                        alert: triggerType === 'alert' ? event.data : undefined,
                        incident: triggerType === 'incident' ? event.data : undefined,
                        relatedIncident: event.data.relatedIncident,
                        triggerEvent: event,
                        timestamp: new Date().toISOString(),
                    };
                    // Enqueue playbook execution
                    await soarExecutor.enqueuePlaybook({
                        playbookId: playbook.id.toString(),
                        triggerEvent: event,
                        organizationId: event.organizationId.toString(),
                        context,
                    }, 5); // Medium priority for automatic triggers
                    console.log(`[PlaybookTrigger] Playbook ${playbook.id} queued for execution`);
                }
            }
            catch (error) {
                console.error(`[PlaybookTrigger] Error evaluating playbook ${playbook.id}:`, error);
            }
        }
    }
    // Evaluate if a playbook should be triggered based on its conditions
    async evaluatePlaybookTrigger(playbook, event) {
        try {
            // Parse playbook definition
            let definition;
            try {
                definition = playbookDefinitionSchema.parse(playbook.definition);
            }
            catch {
                // Fallback to legacy schema
                definition = legacyPlaybookDefinitionSchema.parse(playbook.definition);
            }
            // Check basic filter conditions
            if (definition.trigger.filter) {
                const filterMatches = this.evaluateFilterConditions(definition.trigger.filter, event.data);
                if (!filterMatches) {
                    console.log(`[PlaybookTrigger] Playbook ${playbook.id} filter conditions not met`);
                    return false;
                }
            }
            // Check WHERE clause (new schema feature)
            if (definition.trigger.where) {
                const whereMatches = this.evaluateWhereClause(definition.trigger.where, event.data);
                if (!whereMatches) {
                    console.log(`[PlaybookTrigger] Playbook ${playbook.id} WHERE clause not satisfied`);
                    return false;
                }
            }
            // Check trigger condition from database (legacy)
            if (playbook.triggerCondition) {
                const conditionMatches = this.evaluateTriggerCondition(playbook.triggerCondition, event.data);
                if (!conditionMatches) {
                    console.log(`[PlaybookTrigger] Playbook ${playbook.id} trigger condition not met`);
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            console.error(`[PlaybookTrigger] Error evaluating trigger for playbook ${playbook.id}:`, error);
            return false;
        }
    }
    // Evaluate filter conditions
    evaluateFilterConditions(filter, eventData) {
        for (const [key, expectedValues] of Object.entries(filter)) {
            const actualValue = this.getNestedValue(eventData, key);
            const expected = Array.isArray(expectedValues) ? expectedValues : [expectedValues];
            if (!expected.includes(actualValue)) {
                return false;
            }
        }
        return true;
    }
    // Evaluate WHERE clause (SQLJSONPath-like)
    evaluateWhereClause(whereClause, eventData) {
        try {
            // Simplified WHERE clause evaluation
            // In a real implementation, this would use a proper JSON path library or SQL engine
            let processedWhere = whereClause;
            // Replace JSON path expressions with actual values
            // Support patterns like: severity == 'high', category IN ['malware', 'phishing'], score >= 7
            // Simple replacements for common patterns
            processedWhere = processedWhere.replace(/\bseverity\b/g, `"${eventData.severity || ''}"`);
            processedWhere = processedWhere.replace(/\bcategory\b/g, `"${eventData.category || ''}"`);
            processedWhere = processedWhere.replace(/\bscore\b/g, String(eventData.score || 0));
            processedWhere = processedWhere.replace(/\bpriority\b/g, `"${eventData.priority || ''}"`);
            processedWhere = processedWhere.replace(/\bstatus\b/g, `"${eventData.status || ''}"`);
            // For now, implement basic comparisons
            if (processedWhere.includes('==')) {
                const [left, right] = processedWhere.split('==').map(s => s.trim());
                return this.evaluateEquality(left, right);
            }
            if (processedWhere.includes('>=')) {
                const [left, right] = processedWhere.split('>=').map(s => s.trim());
                return this.evaluateGreaterEqual(left, right);
            }
            if (processedWhere.includes('IN')) {
                const [left, right] = processedWhere.split(' IN ').map(s => s.trim());
                return this.evaluateInClause(left, right);
            }
            // Default to true if we can't parse the condition
            return true;
        }
        catch (error) {
            console.error('[PlaybookTrigger] Error evaluating WHERE clause:', error);
            return false;
        }
    }
    // Evaluate trigger condition (legacy format)
    evaluateTriggerCondition(condition, eventData) {
        try {
            if (typeof condition === 'object') {
                // JSON-based condition
                return this.evaluateFilterConditions(condition, eventData);
            }
            else if (typeof condition === 'string') {
                // String-based condition
                return this.evaluateWhereClause(condition, eventData);
            }
            return true;
        }
        catch (error) {
            console.error('[PlaybookTrigger] Error evaluating trigger condition:', error);
            return false;
        }
    }
    // Helper methods for condition evaluation
    evaluateEquality(left, right) {
        try {
            const leftVal = this.parseValue(left);
            const rightVal = this.parseValue(right);
            return leftVal === rightVal;
        }
        catch {
            return false;
        }
    }
    evaluateGreaterEqual(left, right) {
        try {
            const leftVal = parseFloat(left);
            const rightVal = parseFloat(right);
            return !isNaN(leftVal) && !isNaN(rightVal) && leftVal >= rightVal;
        }
        catch {
            return false;
        }
    }
    evaluateInClause(left, right) {
        try {
            const leftVal = this.parseValue(left);
            const rightArray = JSON.parse(right);
            return Array.isArray(rightArray) && rightArray.includes(leftVal);
        }
        catch {
            return false;
        }
    }
    parseValue(value) {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    // Get nested value from object using dot notation
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    // Test trigger with sample data (for development/testing)
    async testTrigger(playbookId, sampleEventData) {
        try {
            const playbook = await db
                .select()
                .from(playbooks)
                .where(eq(playbooks.id, playbookId))
                .limit(1);
            if (!playbook.length) {
                throw new Error(`Playbook ${playbookId} not found`);
            }
            const mockEvent = {
                type: 'test',
                data: sampleEventData,
                organizationId: playbook[0].organizationId,
                timestamp: new Date().toISOString(),
            };
            return await this.evaluatePlaybookTrigger(playbook[0], mockEvent);
        }
        catch (error) {
            console.error(`[PlaybookTrigger] Error testing trigger for playbook ${playbookId}:`, error);
            return false;
        }
    }
}
// Singleton instance
export const playbookTrigger = new PlaybookTriggerService();
