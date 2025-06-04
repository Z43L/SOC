// Import all core actions
import { EmailNotificationAction } from './core/EmailNotificationAction';
import { SlackNotificationAction } from './core/SlackNotificationAction';
import { BlockIpAction } from './core/BlockIpAction';
import { IsolateHostAction } from './core/IsolateHostAction';
import { CreateJiraTicketAction } from './core/CreateJiraTicketAction';
export class SoarActionRegistry {
    actions = {};
    constructor() {
        this.registerCoreActions();
    }
    // Register core actions
    registerCoreActions() {
        this.registerAction(new EmailNotificationAction());
        this.registerAction(new SlackNotificationAction());
        this.registerAction(new BlockIpAction());
        this.registerAction(new IsolateHostAction());
        this.registerAction(new CreateJiraTicketAction());
    }
    // Register a new action
    registerAction(action) {
        if (this.actions[action.name]) {
            throw new Error(`Action with name '${action.name}' is already registered`);
        }
        this.actions[action.name] = action;
    }
    // Unregister an action
    unregisterAction(actionName) {
        delete this.actions[actionName];
    }
    // Get a specific action
    getAction(actionName) {
        return this.actions[actionName];
    }
    // Get all registered actions
    getAllActions() {
        return { ...this.actions };
    }
    // Get actions by category
    getActionsByCategory(category) {
        return Object.values(this.actions).filter(action => action.category === category);
    }
    // Get action names
    getActionNames() {
        return Object.keys(this.actions);
    }
    // Check if an action exists
    hasAction(actionName) {
        return actionName in this.actions;
    }
    // Execute an action with validation
    async executeAction(actionName, params, context) {
        const action = this.getAction(actionName);
        if (!action) {
            throw new Error(`Action '${actionName}' not found`);
        }
        // Check permissions if the action supports it
        if (action.checkPermissions) {
            const hasPermission = await action.checkPermissions(context);
            if (!hasPermission) {
                throw new Error(`Insufficient permissions to execute action '${actionName}'`);
            }
        }
        // Validate parameters
        const validation = action.validateParameters(params);
        if (!validation.success) {
            throw new Error(`Invalid parameters for action '${actionName}': ${validation.error.message}`);
        }
        // Execute the action
        return await action.execute(params, context);
    }
    // Get action schema for UI generation
    getActionSchema(actionName) {
        const action = this.getAction(actionName);
        if (!action) {
            throw new Error(`Action '${actionName}' not found`);
        }
        return {
            name: action.name,
            description: action.description,
            category: action.category,
            schema: action.parameterSchema,
        };
    }
    // Get all action schemas for UI
    getAllActionSchemas() {
        return Object.values(this.actions).map(action => ({
            name: action.name,
            description: action.description,
            category: action.category,
            schema: action.parameterSchema,
        }));
    }
}
// Singleton instance
export const actionRegistry = new SoarActionRegistry();
