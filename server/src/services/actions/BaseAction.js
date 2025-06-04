// Base abstract class for actions
export class BaseAction {
    // Default implementation of parameter validation
    validateParameters(params) {
        return this.parameterSchema.safeParse(params);
    }
    // Default permission check - can be overridden
    async checkPermissions(context) {
        // Default: allow all executions
        // Override in specific actions for more restrictive permissions
        return true;
    }
    // Helper method to create success result
    success(message, data) {
        return {
            success: true,
            message,
            data,
        };
    }
    // Helper method to create error result
    error(error, data) {
        return {
            success: false,
            error,
            data,
        };
    }
    // Helper method to log with context
    log(context, message, level = 'info') {
        context.logger(`[${this.name}] ${message}`, level);
    }
}
