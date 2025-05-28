import { Router } from 'express';
import { db } from '../db';
import { playbookBindings, playbooks } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { checkAuth } from '../auth';
const router = Router();
// List all bindings for an organization
router.get('/bindings', checkAuth, async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const bindings = await db.select({
            id: playbookBindings.id,
            eventType: playbookBindings.eventType,
            predicate: playbookBindings.predicate,
            playbookId: playbookBindings.playbookId,
            createdBy: playbookBindings.createdBy,
            createdAt: playbookBindings.createdAt,
            updatedAt: playbookBindings.updatedAt,
            isActive: playbookBindings.isActive,
            description: playbookBindings.description,
            priority: playbookBindings.priority,
            // Join with playbooks to get the playbook name
            playbookName: playbooks.name,
        })
            .from(playbookBindings)
            .leftJoin(playbooks, eq(playbookBindings.playbookId, playbooks.id))
            .where(eq(playbookBindings.organizationId, organizationId));
        return res.json({ success: true, data: bindings });
    }
    catch (error) {
        console.error('Error fetching playbook bindings:', error);
        return res.status(500).json({ success: false, message: 'Error fetching playbook bindings' });
    }
});
// Get a specific binding
router.get('/bindings/:id', checkAuth, async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const bindingId = parseInt(req.params.id, 10);
        const [binding] = await db.select()
            .from(playbookBindings)
            .where(and(eq(playbookBindings.id, bindingId), eq(playbookBindings.organizationId, organizationId)));
        if (!binding) {
            return res.status(404).json({ success: false, message: 'Binding not found' });
        }
        return res.json({ success: true, data: binding });
    }
    catch (error) {
        console.error(`Error fetching binding ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Error fetching binding' });
    }
});
// Create a new binding
router.post('/bindings', checkAuth, async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const userId = req.user.id;
        const { eventType, predicate, playbookId, description, isActive, priority } = req.body;
        if (!eventType || !playbookId) {
            return res.status(400).json({ success: false, message: 'Missing required fields: eventType and playbookId' });
        }
        // Check if the playbook exists and belongs to the organization
        const [playbook] = await db.select()
            .from(playbooks)
            .where(and(eq(playbooks.id, playbookId), eq(playbooks.organizationId, organizationId)));
        if (!playbook) {
            return res.status(404).json({ success: false, message: 'Playbook not found' });
        }
        // Create the binding
        const [binding] = await db.insert(playbookBindings)
            .values({
            eventType,
            predicate,
            playbookId,
            createdBy: userId,
            isActive: isActive ?? true,
            description,
            organizationId,
            priority: priority ?? 0,
        })
            .returning();
        return res.status(201).json({ success: true, data: binding });
    }
    catch (error) {
        console.error('Error creating playbook binding:', error);
        return res.status(500).json({ success: false, message: 'Error creating playbook binding' });
    }
});
// Update a binding
router.put('/bindings/:id', checkAuth, async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const bindingId = parseInt(req.params.id, 10);
        const { eventType, predicate, playbookId, description, isActive, priority } = req.body;
        // Check if the binding exists and belongs to the organization
        const [existingBinding] = await db.select()
            .from(playbookBindings)
            .where(and(eq(playbookBindings.id, bindingId), eq(playbookBindings.organizationId, organizationId)));
        if (!existingBinding) {
            return res.status(404).json({ success: false, message: 'Binding not found' });
        }
        // If changing the playbook, check if the new playbook exists and belongs to the organization
        if (playbookId && playbookId !== existingBinding.playbookId) {
            const [playbook] = await db.select()
                .from(playbooks)
                .where(and(eq(playbooks.id, playbookId), eq(playbooks.organizationId, organizationId)));
            if (!playbook) {
                return res.status(404).json({ success: false, message: 'Playbook not found' });
            }
        }
        // Update the binding
        const [updatedBinding] = await db.update(playbookBindings)
            .set({
            eventType: eventType ?? existingBinding.eventType,
            predicate: predicate !== undefined ? predicate : existingBinding.predicate,
            playbookId: playbookId ?? existingBinding.playbookId,
            description: description !== undefined ? description : existingBinding.description,
            isActive: isActive !== undefined ? isActive : existingBinding.isActive,
            priority: priority !== undefined ? priority : existingBinding.priority,
            updatedAt: new Date(),
        })
            .where(and(eq(playbookBindings.id, bindingId), eq(playbookBindings.organizationId, organizationId)))
            .returning();
        return res.json({ success: true, data: updatedBinding });
    }
    catch (error) {
        console.error(`Error updating binding ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Error updating binding' });
    }
});
// Delete a binding
router.delete('/bindings/:id', checkAuth, async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const bindingId = parseInt(req.params.id, 10);
        // Check if the binding exists and belongs to the organization
        const [existingBinding] = await db.select()
            .from(playbookBindings)
            .where(and(eq(playbookBindings.id, bindingId), eq(playbookBindings.organizationId, organizationId)));
        if (!existingBinding) {
            return res.status(404).json({ success: false, message: 'Binding not found' });
        }
        // Delete the binding
        await db.delete(playbookBindings)
            .where(and(eq(playbookBindings.id, bindingId), eq(playbookBindings.organizationId, organizationId)));
        return res.json({ success: true, message: 'Binding deleted successfully' });
    }
    catch (error) {
        console.error(`Error deleting binding ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Error deleting binding' });
    }
});
export default router;
