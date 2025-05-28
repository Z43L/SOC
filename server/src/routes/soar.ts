import express from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { playbooks, playbookExecutions } from '../../../shared/schema';
import { playbookDefinitionSchema } from '../../../shared/playbookDefinition';
import { soarExecutor } from '../services/SoarExecutorService';
import { actionRegistry } from '../services/actions/ActionRegistry';
import { auditLogger } from '../services/auditLogger';

const router = express.Router();

// Get all playbooks for organization
router.get('/playbooks', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    const playbookList = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.organizationId, organizationId))
      .orderBy(playbooks.lastModified);

    res.json(playbookList);
  } catch (error) {
    console.error('[API] Error fetching playbooks:', error);
    res.status(500).json({ error: 'Failed to fetch playbooks' });
  }
});

// Get specific playbook
router.get('/playbooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    const playbook = await db
      .select()
      .from(playbooks)
      .where(and(
        eq(playbooks.id, parseInt(id)),
        eq(playbooks.organizationId, organizationId)
      ))
      .limit(1);

    if (!playbook.length) {
      return res.status(404).json({ error: 'Playbook not found' });
    }

    res.json(playbook[0]);
  } catch (error) {
    console.error('[API] Error fetching playbook:', error);
    res.status(500).json({ error: 'Failed to fetch playbook' });
  }
});

// Create new playbook
router.post('/playbooks', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    const {
      name,
      description,
      triggerType,
      triggerCondition,
      definition,
      isActive = false,
      category,
      tags,
    } = req.body;

    // Validate playbook definition
    try {
      playbookDefinitionSchema.parse(definition);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Invalid playbook definition',
        details: validationError.errors,
      });
    }

    // Create playbook
    const newPlaybook = await db
      .insert(playbooks)
      .values({
        name,
        description,
        triggerType,
        triggerCondition,
        definition: JSON.stringify(definition),
        isActive,
        category,
        tags: tags ? JSON.stringify(tags) : null,
        creator: userId,
        organizationId,
      })
      .returning();

    // Log creation
    await auditLogger.logPlaybookExecution(
      newPlaybook[0].id.toString(),
      '',
      'created',
      organizationId,
      userId,
      { playbookName: name }
    );

    res.status(201).json(newPlaybook[0]);
  } catch (error) {
    console.error('[API] Error creating playbook:', error);
    res.status(500).json({ error: 'Failed to create playbook' });
  }
});

// Update playbook
router.put('/playbooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    // Check if playbook exists and belongs to organization
    const existingPlaybook = await db
      .select()
      .from(playbooks)
      .where(and(
        eq(playbooks.id, parseInt(id)),
        eq(playbooks.organizationId, organizationId)
      ))
      .limit(1);

    if (!existingPlaybook.length) {
      return res.status(404).json({ error: 'Playbook not found' });
    }

    const {
      name,
      description,
      triggerType,
      triggerCondition,
      definition,
      isActive,
      category,
      tags,
    } = req.body;

    // Validate playbook definition if provided
    if (definition) {
      try {
        playbookDefinitionSchema.parse(definition);
      } catch (validationError) {
        return res.status(400).json({
          error: 'Invalid playbook definition',
          details: validationError.errors,
        });
      }
    }

    // Update playbook
    const updatedPlaybook = await db
      .update(playbooks)
      .set({
        ...(name && { name }),
        ...(description && { description }),
        ...(triggerType && { triggerType }),
        ...(triggerCondition !== undefined && { triggerCondition }),
        ...(definition && { definition: JSON.stringify(definition) }),
        ...(isActive !== undefined && { isActive }),
        ...(category && { category }),
        ...(tags && { tags: JSON.stringify(tags) }),
        lastModified: new Date(),
      })
      .where(eq(playbooks.id, parseInt(id)))
      .returning();

    // Log update
    await auditLogger.logPlaybookExecution(
      id,
      '',
      'updated',
      organizationId,
      userId,
      { playbookName: name || existingPlaybook[0].name }
    );

    res.json(updatedPlaybook[0]);
  } catch (error) {
    console.error('[API] Error updating playbook:', error);
    res.status(500).json({ error: 'Failed to update playbook' });
  }
});

// Delete playbook
router.delete('/playbooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    // Check if playbook exists and belongs to organization
    const existingPlaybook = await db
      .select()
      .from(playbooks)
      .where(and(
        eq(playbooks.id, parseInt(id)),
        eq(playbooks.organizationId, organizationId)
      ))
      .limit(1);

    if (!existingPlaybook.length) {
      return res.status(404).json({ error: 'Playbook not found' });
    }

    // Delete playbook
    await db
      .delete(playbooks)
      .where(eq(playbooks.id, parseInt(id)));

    // Log deletion
    await auditLogger.logPlaybookExecution(
      id,
      '',
      'deleted',
      organizationId,
      userId,
      { playbookName: existingPlaybook[0].name }
    );

    res.status(204).send();
  } catch (error) {
    console.error('[API] Error deleting playbook:', error);
    res.status(500).json({ error: 'Failed to delete playbook' });
  }
});

// Execute playbook manually
router.post('/playbooks/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    const { context = {} } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    // Check if playbook exists and belongs to organization
    const playbook = await db
      .select()
      .from(playbooks)
      .where(and(
        eq(playbooks.id, parseInt(id)),
        eq(playbooks.organizationId, organizationId)
      ))
      .limit(1);

    if (!playbook.length) {
      return res.status(404).json({ error: 'Playbook not found' });
    }

    // Check if playbook is active or if it's a manual trigger
    const playbookData = playbook[0];
    if (!playbookData.isActive && playbookData.triggerType !== 'manual') {
      return res.status(400).json({ error: 'Playbook is not active' });
    }

    // Enqueue playbook for execution
    const jobId = await soarExecutor.enqueuePlaybook({
      playbookId: id,
      userId,
      organizationId: organizationId.toString(),
      context,
    }, 10); // High priority for manual executions

    // Log manual execution
    await auditLogger.logPlaybookExecution(
      id,
      jobId,
      'manual_start',
      organizationId,
      userId,
      { playbookName: playbookData.name, context }
    );

    res.status(202).json({
      message: 'Playbook execution started',
      jobId,
      playbookName: playbookData.name,
    });
  } catch (error) {
    console.error('[API] Error executing playbook:', error);
    res.status(500).json({ error: 'Failed to execute playbook' });
  }
});

// Get playbook executions
router.get('/playbooks/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    const executions = await db
      .select()
      .from(playbookExecutions)
      .where(and(
        eq(playbookExecutions.playbookId, parseInt(id)),
        eq(playbookExecutions.organizationId, organizationId)
      ))
      .orderBy(playbookExecutions.startedAt);

    res.json(executions);
  } catch (error) {
    console.error('[API] Error fetching executions:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// Get execution status and logs
router.get('/executions/:executionId/status', async (req, res) => {
  try {
    const { executionId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization ID required' });
    }

    // Get execution from database
    const execution = await db
      .select()
      .from(playbookExecutions)
      .where(and(
        eq(playbookExecutions.id, parseInt(executionId)),
        eq(playbookExecutions.organizationId, organizationId)
      ))
      .limit(1);

    if (!execution.length) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Get real-time state from executor if running
    const executionState = soarExecutor.getExecutionState(executionId);

    res.json({
      ...execution[0],
      realTimeState: executionState,
    });
  } catch (error) {
    console.error('[API] Error fetching execution status:', error);
    res.status(500).json({ error: 'Failed to fetch execution status' });
  }
});

// Get available actions for playbook editor
router.get('/actions', async (req, res) => {
  try {
    const actionSchemas = actionRegistry.getAllActionSchemas();
    res.json(actionSchemas);
  } catch (error) {
    console.error('[API] Error fetching actions:', error);
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

// Get action schema for specific action
router.get('/actions/:actionName/schema', async (req, res) => {
  try {
    const { actionName } = req.params;
    
    if (!actionRegistry.hasAction(actionName)) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const actionSchema = actionRegistry.getActionSchema(actionName);
    res.json(actionSchema);
  } catch (error) {
    console.error('[API] Error fetching action schema:', error);
    res.status(500).json({ error: 'Failed to fetch action schema' });
  }
});

export default router;