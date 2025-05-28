import express from 'express';
import { isAuthenticated } from './src/middlewares/authMiddleware';
import { getTimeSeries, getTopN } from './src/services/analyticsService';
const apiRouter = express.Router();
// Analytics endpoints
apiRouter.get('/analytics/timeseries', isAuthenticated, async (req, res) => {
    try {
        const metric = String(req.query.metric);
        const period = String(req.query.period);
        const from = String(req.query.from);
        const to = String(req.query.to);
        const orgId = req.user?.organizationId;
        if (!metric || !period || !from || !to || !orgId) {
            return res.status(400).json({ message: 'Missing query parameters' });
        }
        const data = await getTimeSeries(metric, orgId, from, to, period);
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
apiRouter.get('/analytics/top', isAuthenticated, async (req, res) => {
    try {
        const metric = String(req.query.metric);
        const limit = Number(req.query.limit) || 10;
        const from = String(req.query.from);
        const to = String(req.query.to);
        const orgId = req.user?.organizationId;
        if (!metric || !from || !to || !orgId) {
            return res.status(400).json({ message: 'Missing query parameters' });
        }
        const data = await getTopN(metric, orgId, limit, from, to);
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
export default apiRouter;
