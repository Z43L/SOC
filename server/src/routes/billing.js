import express from 'express';
// import { authenticate } from '../middleware/auth'; // Assuming an auth middleware
import { db } from '../../db'; // Corrected path
const router = express.Router();
/**
 * @swagger
 * /api/billing/plans:
 *   get:
 *     summary: Retrieve all available billing plans
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: A list of plans.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Plan'
 *       500:
 *         description: Server error
 */
router.get('/plans', async (req, res) => {
    try {
        // TODO: Add authentication and authorization checks if necessary
        const plans = await db.selectFrom('plans').where('is_active', '=', true).selectAll().execute();
        res.json({ data: plans });
    }
    catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});
/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Retrieve the current subscription for the user's organization
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: [] # Assuming you use bearer token authentication
 *     responses:
 *       200:
 *         description: The current subscription details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription or organization not found
 *       500:
 *         description: Server error
 */
// router.get('/subscription', authenticate, async (req: Request, res: Response) => { // Uncomment authenticate when middleware is ready
router.get('/subscription', async (req, res) => {
    try {
        // @ts-ignore
        const organizationId = req.organization?.id; // Assuming organization ID is on req.organization
        if (!organizationId) {
            // This case should ideally be handled by authentication/authorization middleware
            return res.status(401).json({ error: 'Unauthorized or organization not identified' });
        }
        const organization = await db
            .selectFrom('organizations')
            .where('organizations.id', '=', organizationId)
            .leftJoin('plans', 'plans.id', 'organizations.plan_id')
            .select([
            'organizations.id as org_id',
            'organizations.name as org_name',
            'organizations.subscription_status',
            'organizations.stripe_customer_id',
            'organizations.stripe_subscription_id',
            'organizations.subscription_start_date',
            'organizations.subscription_end_date',
            'plans.id as plan_id',
            'plans.name as plan_name',
            'plans.description as plan_description',
            'plans.price_monthly as plan_price_monthly',
            'plans.price_yearly as plan_price_yearly',
            'plans.features as plan_features',
            'plans.max_users as plan_max_users',
            'plans.max_agents as plan_max_agents',
            'plans.max_alerts as plan_max_alerts'
        ])
            .executeTakeFirst();
        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Constructing the subscription object based on your frontend expectations
        const subscription = {
            id: organization.stripe_subscription_id || `org-${organization.org_id}-sub`,
            status: organization.subscription_status,
            currentPeriodEnd: organization.subscription_end_date,
            cancelAtPeriodEnd: false, // This might need to be fetched or determined differently
            planId: organization.plan_id,
            plan: organization.plan_id ? {
                id: organization.plan_id,
                name: organization.plan_name,
                description: organization.plan_description,
                price_monthly: organization.plan_price_monthly,
                price_yearly: organization.plan_price_yearly,
                features: organization.plan_features,
                // Add other plan properties as needed by PlanCard
            } : null,
        };
        res.json({ data: subscription });
    }
    catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});
export default router;
