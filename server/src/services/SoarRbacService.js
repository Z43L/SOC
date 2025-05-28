// SOAR permission constants
export const SOAR_PERMISSIONS = {
    VIEW: 'soar.view', // View playbooks and executions
    EXECUTE: 'soar.execute', // Execute playbooks manually
    MANAGE: 'soar.manage', // Create, edit, delete playbooks
    ADMIN: 'soar.admin', // Full administrative access
};
// Permission hierarchy (higher permissions include lower ones)
const PERMISSION_HIERARCHY = {
    [SOAR_PERMISSIONS.VIEW]: [SOAR_PERMISSIONS.VIEW],
    [SOAR_PERMISSIONS.EXECUTE]: [SOAR_PERMISSIONS.VIEW, SOAR_PERMISSIONS.EXECUTE],
    [SOAR_PERMISSIONS.MANAGE]: [SOAR_PERMISSIONS.VIEW, SOAR_PERMISSIONS.EXECUTE, SOAR_PERMISSIONS.MANAGE],
    [SOAR_PERMISSIONS.ADMIN]: [SOAR_PERMISSIONS.VIEW, SOAR_PERMISSIONS.EXECUTE, SOAR_PERMISSIONS.MANAGE, SOAR_PERMISSIONS.ADMIN],
};
export class SoarRbacService {
    // Check if user has specific SOAR permission
    async hasPermission(userId, organizationId, permission) {
        try {
            // Check if user has direct permission or higher permission that includes it
            const userPermissions = await this.getUserPermissions(userId, organizationId);
            // Check if user has this specific permission or a higher one that includes it
            for (const userPerm of userPermissions) {
                const includedPermissions = PERMISSION_HIERARCHY[userPerm];
                if (includedPermissions?.includes(permission)) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            console.error('[SoarRbac] Error checking permission:', error);
            return false;
        }
    }
    // Get all permissions for a user
    async getUserPermissions(userId, organizationId) {
        try {
            // In a real implementation, this would query the soar_permissions table
            // For now, simulate based on user role
            const user = await this.getUserWithRole(userId, organizationId);
            if (!user)
                return [];
            // Default permission mapping based on roles
            const rolePermissions = {
                'admin': [SOAR_PERMISSIONS.ADMIN],
                'security_manager': [SOAR_PERMISSIONS.MANAGE],
                'security_analyst': [SOAR_PERMISSIONS.EXECUTE],
                'security_observer': [SOAR_PERMISSIONS.VIEW],
                'user': [],
            };
            const userRolePermissions = rolePermissions[user.role] || [];
            // Flatten permissions based on hierarchy
            const allPermissions = new Set();
            for (const permission of userRolePermissions) {
                const includedPermissions = PERMISSION_HIERARCHY[permission];
                includedPermissions.forEach(p => allPermissions.add(p));
            }
            return Array.from(allPermissions);
        }
        catch (error) {
            console.error('[SoarRbac] Error getting user permissions:', error);
            return [];
        }
    }
    // Grant permission to user
    async grantPermission(userId, organizationId, permission, grantedBy) {
        try {
            // In a real implementation, this would insert into soar_permissions table
            console.log(`[SoarRbac] Granting permission ${permission} to user ${userId} in org ${organizationId} by ${grantedBy}`);
            // Simulate permission grant
            return true;
        }
        catch (error) {
            console.error('[SoarRbac] Error granting permission:', error);
            return false;
        }
    }
    // Revoke permission from user
    async revokePermission(userId, organizationId, permission) {
        try {
            // In a real implementation, this would delete from soar_permissions table
            console.log(`[SoarRbac] Revoking permission ${permission} from user ${userId} in org ${organizationId}`);
            // Simulate permission revocation
            return true;
        }
        catch (error) {
            console.error('[SoarRbac] Error revoking permission:', error);
            return false;
        }
    }
    // Check if user can execute specific action
    async canExecuteAction(userId, organizationId, actionName) {
        try {
            // First check if user has basic execute permission
            const hasExecutePermission = await this.hasPermission(userId, organizationId, SOAR_PERMISSIONS.EXECUTE);
            if (!hasExecutePermission) {
                return false;
            }
            // Check action-specific requirements
            const actionRequirements = this.getActionRequirements(actionName);
            for (const requirement of actionRequirements) {
                const hasRequirement = await this.hasPermission(userId, organizationId, requirement);
                if (!hasRequirement) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            console.error('[SoarRbac] Error checking action permission:', error);
            return false;
        }
    }
    // Get action-specific permission requirements
    getActionRequirements(actionName) {
        // Define action-specific permission requirements
        const actionRequirements = {
            'block_ip': ['security.remediate'],
            'isolate_host': ['security.remediate'],
            'create_jira_ticket': ['integrations.jira'],
            'notify_email': [],
            'notify_slack': ['integrations.slack'],
        };
        return actionRequirements[actionName] || [];
    }
    // Middleware for Express routes
    requirePermission(permission) {
        return async (req, res, next) => {
            try {
                const userId = req.user?.id;
                const organizationId = req.user?.organizationId;
                if (!userId || !organizationId) {
                    return res.status(401).json({ error: 'Authentication required' });
                }
                const hasPermission = await this.hasPermission(userId, organizationId, permission);
                if (!hasPermission) {
                    return res.status(403).json({
                        error: 'Insufficient permissions',
                        required: permission,
                        action: 'contact_admin'
                    });
                }
                next();
            }
            catch (error) {
                console.error('[SoarRbac] Permission middleware error:', error);
                res.status(500).json({ error: 'Permission check failed' });
            }
        };
    }
    // Check permissions for playbook execution
    async canExecutePlaybook(userId, organizationId, playbookId) {
        try {
            // Check basic execute permission
            const hasExecutePermission = await this.hasPermission(userId, organizationId, SOAR_PERMISSIONS.EXECUTE);
            if (!hasExecutePermission) {
                return { allowed: false, reason: 'Missing soar.execute permission' };
            }
            // Get playbook details
            const playbook = await this.getPlaybookDetails(playbookId);
            if (!playbook) {
                return { allowed: false, reason: 'Playbook not found' };
            }
            // Check if playbook belongs to user's organization
            if (playbook.organizationId !== organizationId) {
                return { allowed: false, reason: 'Playbook not accessible' };
            }
            // Check action-specific permissions
            const actions = this.extractActionsFromPlaybook(playbook.definition);
            for (const actionName of actions) {
                const canExecuteAction = await this.canExecuteAction(userId, organizationId, actionName);
                if (!canExecuteAction) {
                    return {
                        allowed: false,
                        reason: `Missing permission for action: ${actionName}`
                    };
                }
            }
            return { allowed: true };
        }
        catch (error) {
            console.error('[SoarRbac] Error checking playbook execution permission:', error);
            return { allowed: false, reason: 'Permission check failed' };
        }
    }
    // Helper method to get user with role (simulated)
    async getUserWithRole(userId, organizationId) {
        // In a real implementation, this would query the database
        // For now, return a mock user based on common roles
        return {
            id: userId,
            organizationId,
            role: userId.includes('admin') ? 'admin' :
                userId.includes('manager') ? 'security_manager' :
                    userId.includes('analyst') ? 'security_analyst' : 'security_observer',
        };
    }
    // Helper method to get playbook details (simulated)
    async getPlaybookDetails(playbookId) {
        // In a real implementation, this would query the playbooks table
        return {
            id: playbookId,
            organizationId: 1, // Mock organization ID
            definition: {
                steps: [
                    { actionId: 'notify_email' },
                    { actionId: 'create_jira_ticket' },
                ]
            }
        };
    }
    // Extract action names from playbook definition
    extractActionsFromPlaybook(definition) {
        const actions = [];
        if (definition.steps) {
            for (const step of definition.steps) {
                if (step.actionId) {
                    actions.push(step.actionId);
                }
                else if (step.uses) { // Legacy format
                    actions.push(step.uses);
                }
            }
        }
        return actions;
    }
    // Get permission requirements for a playbook
    async getPlaybookPermissionRequirements(playbookId) {
        try {
            const playbook = await this.getPlaybookDetails(playbookId);
            if (!playbook)
                return [];
            const actions = this.extractActionsFromPlaybook(playbook.definition);
            const requirements = new Set([SOAR_PERMISSIONS.EXECUTE]);
            for (const actionName of actions) {
                const actionRequirements = this.getActionRequirements(actionName);
                actionRequirements.forEach(req => requirements.add(req));
            }
            return Array.from(requirements);
        }
        catch (error) {
            console.error('[SoarRbac] Error getting playbook requirements:', error);
            return [];
        }
    }
}
// Singleton instance
export const soarRbac = new SoarRbacService();
