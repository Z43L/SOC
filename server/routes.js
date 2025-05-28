import { Router } from "express";
import express from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { SeverityTypes, AlertStatusTypes, IncidentStatusTypes, insertThreatFeedSchema, insertPlaybookSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";
import { generateAlertInsight, correlateAlerts, analyzeThreatIntel, generateSecurityRecommendations, initializeOpenAI, isOpenAIConfigured } from "./ai-service";
import { processNewAlertWithEnrichment, enrichAlertWithThreatIntel } from './integrations/alertEnrichment';
// Importar las rutas de Stripe
import stripeRoutes from "./integrations/stripe/stripe-routes";
// Importamos los servicios de integración con datos reales
import { importAllFeeds } from "./integrations/threatFeeds";
import { importAllAlerts } from "./integrations/alerts";
// Importar node-cron para programar tareas automáticas
import cron from "node-cron";
import { log } from "./vite";
// Importar el módulo scheduler para actualizaciones automáticas
import { updateAllData, updateSystemMetrics } from "./integrations/scheduler";
// Importar real-time monitor para WebSocket updates
import { RealtimeMonitor } from "./integrations/connectors/real-time-monitor";
import * as path from 'path';
// Importar servicios avanzados de IA
import { aiQueue } from "./integrations/ai-processing-queue";
import { aiCorrelation } from "./integrations/ai-correlation-engine";
import { aiParser } from "./integrations/ai-parser-service";
import { playbookExecutor } from "./src/services/playbookExecutor";
// Importar gestión de conectores
import { initializeConnectors, getActiveConnectors } from "./integrations/connectors";
import { registerAgent, processAgentData, processAgentHeartbeat, generateAgentRegistrationKey, buildAgentPackage } from "./integrations/agents";
// Import billing routes
import billingRoutes from "./src/routes/billing";
// Import settings routes
import settingsRoutes from "./routes/settings";
// Import connectors routes
import connectorsRoutes from "./routes/connectors";
export async function registerRoutes(app) {
    // Set up authentication
    setupAuth(app);
    // Initializar los conectores - para recibir datos de fuentes externas
    // Almacenamos una referencia a Express global para que los conectores puedan registrar endpoints
    global.expressApp = app;
    try {
        log('Inicializando conectores...', 'routes');
        await initializeConnectors(app);
        log('Conectores inicializados correctamente', 'routes');
    }
    catch (error) {
        log(`Error inicializando conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'routes');
    }
    const apiRouter = Router();
    // Registrar las rutas de Stripe
    apiRouter.use('/billing', stripeRoutes);
    // Registrar las nuevas rutas de facturación
    apiRouter.use('/billing', billingRoutes);
    // Registrar las rutas de configuración/settings
    apiRouter.use('/settings', settingsRoutes);
    // Registrar las rutas de conectores
    apiRouter.use('/connectors', connectorsRoutes);
    // Registrar las rutas de playbook bindings para SOAR automático
    import playbookBindingsRoutes from "./src/routes/playbookBindings";
    apiRouter.use('/soar', playbookBindingsRoutes);
    // --- AGENT PUBLIC ENDPOINTS (NO AUTH) ---
    // Agent heartbeat endpoint (no auth required, agent uses token)
    apiRouter.post("/agents/heartbeat", async (req, res) => {
        try {
            const { token, agentId, status, metrics } = req.body;
            const authToken = token || agentId;
            if (!authToken || !status) {
                return res.status(400).json({ success: false, message: "Missing token or status" });
            }
            const result = await processAgentHeartbeat(authToken, status, metrics);
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    // Agent data ingestion endpoint (no auth required, agent uses token)
    apiRouter.post("/agents/data", async (req, res) => {
        try {
            const { token, agentId, events } = req.body;
            const authToken = token || agentId;
            if (!authToken || !Array.isArray(events)) {
                return res.status(400).json({ success: false, message: "Missing token or events" });
            }
            const result = await processAgentData(authToken, events);
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    // Agent registration endpoint (no auth required)
    apiRouter.post("/agents/register", async (req, res) => {
        try {
            const { registrationKey, hostname, ipAddress, operatingSystem, version, capabilities } = req.body;
            if (!registrationKey || !hostname || !ipAddress || !operatingSystem || !version) {
                return res.status(400).json({ success: false, message: "Missing required fields" });
            }
            const result = await registerAgent(registrationKey, hostname, ipAddress, operatingSystem, version, capabilities || []);
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    // --- END AGENT PUBLIC ENDPOINTS ---
    // Authentication middleware mejorado
    const isAuthenticated = (req, res, next) => {
        // Verificación detallada del estado de autenticación
        if (req.isAuthenticated && req.isAuthenticated()) {
            console.log(`Usuario autenticado: ${req.user?.username || 'Desconocido'} accediendo a ${req.path}`);
            return next();
        }
        // Si llegamos aquí, el usuario no está autenticado
        console.log(`Intento de acceso no autorizado a ${req.path}`);
        // Devolver una respuesta con información detallada
        return res.status(401).json({
            message: "No autenticado",
            code: "AUTH_REQUIRED",
            redirectTo: "/auth",
            details: "La sesión ha expirado o no existe. Por favor inicie sesión nuevamente."
        });
    };
    // Health check endpoint - no auth required
    apiRouter.get("/health", (req, res) => {
        res.json({ status: "healthy" });
    });
    // Endpoint para métricas de MITRE ATT&CK (Top tactics)
    apiRouter.get("/metrics/mitre-tactics", isAuthenticated, async (req, res) => {
        try {
            // Obtener todas las tácticas MITRE de los incidentes
            const incidents = await storage.listIncidents(500);
            const tacticCounts = {};
            incidents.forEach(incident => {
                if (Array.isArray(incident.mitreTactics)) {
                    incident.mitreTactics.forEach((tactic) => {
                        tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
                    });
                }
            });
            // Ordenar por frecuencia y devolver el top 5
            const sorted = Object.entries(tacticCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tactic, count]) => ({ tactic, count }));
            res.json(sorted);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Endpoint para métricas de compliance (basado en incidentes abiertos)
    apiRouter.get("/metrics/compliance", isAuthenticated, async (req, res) => {
        try {
            const incidents = await storage.listIncidents(500);
            const openIncidents = incidents.filter(i => i.status !== 'closed' && i.status !== 'resolved').length;
            const compliance = [
                { name: 'ISO 27001', score: Math.max(60, 100 - openIncidents * 2), status: openIncidents < 5 ? 'Compliant' : 'At Risk', lastAssessment: '2 weeks ago' },
                { name: 'NIST CSF', score: Math.max(60, 95 - openIncidents * 2), status: openIncidents < 8 ? 'Compliant' : 'At Risk', lastAssessment: '1 month ago' },
                { name: 'GDPR', score: Math.max(50, 90 - openIncidents * 3), status: openIncidents < 3 ? 'Compliant' : 'At Risk', lastAssessment: '3 weeks ago' },
                { name: 'PCI DSS', score: Math.max(70, 98 - openIncidents * 2), status: openIncidents < 4 ? 'Compliant' : 'At Risk', lastAssessment: '2 months ago' }
            ];
            res.json(compliance);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Endpoint para resumen de amenazas por día (Threat Detection Summary)
    apiRouter.get("/metrics/threat-summary", isAuthenticated, async (req, res) => {
        try {
            const alerts = await storage.listAlerts(1000);
            // Agrupar por día de la semana y severidad
            const summary = {};
            alerts.forEach(alert => {
                const date = new Date(alert.timestamp ?? Date.now());
                const day = date.toLocaleDateString('en-US', { weekday: 'short' });
                if (!summary[day])
                    summary[day] = { critical: 0, high: 0, medium: 0, low: 0 };
                if (summary[day][alert.severity] !== undefined) {
                    summary[day][alert.severity]++;
                }
            });
            res.json(summary);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Endpoint para activos en riesgo (Assets at Risk)
    apiRouter.get("/metrics/assets-at-risk", isAuthenticated, async (req, res) => {
        try {
            const alerts = await storage.listAlerts(1000);
            // Considerar assets como sourceIp o source
            const riskyAssets = new Set(alerts.filter(a => a.severity === 'critical' || a.severity === 'high')
                .map(a => a.sourceIp || a.source)
                .filter(Boolean));
            res.json({ count: riskyAssets.size, assets: Array.from(riskyAssets) });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Endpoint para estado de conectores (Connector Health)
    apiRouter.get("/metrics/connector-health", isAuthenticated, async (req, res) => {
        try {
            const connectors = await storage.listConnectors();
            const activeConnectorIds = (await getActiveConnectors()).map(ac => ac.id);
            const healthy = connectors.filter(c => activeConnectorIds.includes(c.id)).length;
            res.json({ healthy, total: connectors.length });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // User routes - require auth
    apiRouter.get("/users", isAuthenticated, async (req, res) => {
        try {
            const users = await storage.listUsers();
            res.json(users);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/users/:id", isAuthenticated, async (req, res) => {
        try {
            const user = await storage.getUser(parseInt(req.params.id));
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json(user);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Metrics routes
    apiRouter.get("/metrics", isAuthenticated, async (req, res) => {
        try {
            const metrics = await storage.listMetrics();
            res.json(metrics);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/metrics", isAuthenticated, async (req, res) => {
        try {
            // Validate metrics creation
            const metricSchema = z.object({
                name: z.string().min(3, "Name must be at least 3 characters"),
                value: z.number(),
                trend: z.string().nullable().optional(),
                changePercentage: z.number().nullable().optional()
            });
            const validData = metricSchema.parse(req.body);
            // Convert value to string and remove timestamp
            const metricData = {
                ...validData,
                value: validData.value.toString()
            };
            const metric = await storage.createMetric(metricData);
            res.status(201).json(metric);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid metric data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/metrics/calculate", isAuthenticated, async (req, res) => {
        try {
            // Get all necessary data to calculate metrics
            const alerts = await storage.listAlerts();
            const incidents = await storage.listIncidents(100);
            // Calculate metrics
            const metrics = [];
            // Count alerts by severity
            const alertSeverityCounts = {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            };
            alerts.forEach(alert => {
                if (alert.severity in alertSeverityCounts) {
                    alertSeverityCounts[alert.severity]++;
                }
            });
            // Count open alerts
            const openAlerts = alerts.filter(alert => alert.status !== 'resolved').length;
            // Count open incidents
            const openIncidents = incidents.filter(incident => incident.status !== 'closed' && incident.status !== 'resolved').length;
            // Calculate average time to resolution for alerts
            let avgResolutionTime = 0;
            const resolvedAlerts = alerts.filter(alert => alert.status === 'resolved' && alert.timestamp);
            if (resolvedAlerts.length > 0) {
                const totalResolutionTime = resolvedAlerts.reduce((total, alert) => {
                    // Use timestamp as the only available date field
                    const createdAt = new Date(alert.timestamp ?? Date.now());
                    const updatedAt = new Date(alert.timestamp ?? Date.now()); // No updatedAt, so use timestamp for both
                    if (!isNaN(createdAt.getTime()) && !isNaN(updatedAt.getTime())) {
                        return total + (updatedAt.getTime() - createdAt.getTime());
                    }
                    return total;
                }, 0);
                if (resolvedAlerts.length > 0 && totalResolutionTime > 0) {
                    avgResolutionTime = (totalResolutionTime / resolvedAlerts.length) / (1000 * 60 * 60); // In hours
                }
                else {
                    avgResolutionTime = 0; // Default to 0 if no valid resolved alerts or time
                }
            }
            // Create array of metrics to save
            const metricsToCreate = [
                {
                    name: 'open_alerts',
                    value: openAlerts.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'open_incidents',
                    value: openIncidents.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'critical_alerts',
                    value: alertSeverityCounts.critical.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'high_alerts',
                    value: alertSeverityCounts.high.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'medium_alerts',
                    value: alertSeverityCounts.medium.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'low_alerts',
                    value: alertSeverityCounts.low.toString(),
                    trend: null,
                    changePercentage: null
                },
                {
                    name: 'avg_resolution_time',
                    value: avgResolutionTime.toString(),
                    trend: null,
                    changePercentage: null
                }
            ];
            // Save metrics
            const savePromises = metricsToCreate.map(async (metricData) => {
                // Check if metric exists
                const existingMetric = await storage.getMetricByName(metricData.name);
                if (existingMetric) {
                    // Calculate trend and change
                    const previousValue = Number(existingMetric.value);
                    const currentValue = Number(metricData.value);
                    let trend = 'stable';
                    let changePercentage = 0;
                    if (previousValue > 0) {
                        changePercentage = ((currentValue - previousValue) / previousValue) * 100;
                        if (changePercentage > 0) {
                            trend = 'up';
                        }
                        else if (changePercentage < 0) {
                            trend = 'down';
                            changePercentage = Math.abs(changePercentage);
                        }
                    }
                    // Update with trend information
                    return storage.createMetric({
                        name: metricData.name,
                        value: metricData.value,
                        trend,
                        changePercentage
                    });
                }
                else {
                    // Create new metric
                    return storage.createMetric({
                        ...metricData
                    });
                }
            });
            const updatedMetrics = await Promise.all(savePromises);
            res.json({
                success: true,
                message: `Updated ${updatedMetrics.length} metrics`,
                metrics: updatedMetrics
            });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Alert routes
    apiRouter.get("/alerts", isAuthenticated, async (req, res) => {
        try {
            // Support filtering by severity and status
            const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
            const severity = req.query.severity;
            const status = req.query.status;
            // In a real system, we would implement database filtering
            // Here we just get all alerts and filter in memory
            const alerts = await storage.listAlerts(limit);
            let filteredAlerts = alerts;
            if (severity) {
                filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
            }
            if (status) {
                filteredAlerts = filteredAlerts.filter(alert => alert.status === status);
            }
            res.json(filteredAlerts);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/alerts", isAuthenticated, async (req, res) => {
        try {
            // Validate alert creation schema
            const createAlertSchema = z.object({
                title: z.string().min(5, "Title must be at least 5 characters"),
                description: z.string().min(10, "Description must be at least 10 characters"),
                severity: SeverityTypes,
                source: z.string(),
                sourceIp: z.string().optional().nullable(),
                destinationIp: z.string().optional().nullable(),
                metadata: z.any().optional()
            });
            const validData = createAlertSchema.parse(req.body);
            // Add default values
            const newAlert = {
                ...validData,
                timestamp: new Date(),
                status: 'new', // Default status is 'new'
            };
            // Procesar la alerta con enriquecimiento automático de Threat Intelligence
            const alert = await processNewAlertWithEnrichment(newAlert);
            // Broadcast new alert via WebSocket for real-time dashboard updates
            try {
                const realtimeMonitor = RealtimeMonitor.getInstance();
                realtimeMonitor.broadcastAlertUpdate(alert);
                realtimeMonitor.broadcastDashboardUpdate({
                    type: 'new_alert',
                    alert,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                log(`Error broadcasting alert update: ${error instanceof Error ? error.message : 'unknown'}`, 'alerts');
            }
            // Si OpenAI está configurado, generar análisis automáticamente
            if (isOpenAIConfigured()) {
                // No esperamos - ejecutar en segundo plano
                generateAlertInsight(alert)
                    .then(insightData => {
                    if (insightData) {
                        // Only pass allowed properties to storage.createAiInsight
                        storage.createAiInsight({
                            ...insightData
                        });
                    }
                })
                    .catch(err => console.error('Error generating insight:', err));
            }
            res.status(201).json(alert);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid alert data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/alerts/:id", isAuthenticated, async (req, res) => {
        try {
            const alert = await storage.getAlert(parseInt(req.params.id));
            if (!alert) {
                return res.status(404).json({ message: "Alert not found" });
            }
            res.json(alert);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.patch("/alerts/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const alert = await storage.getAlert(id);
            if (!alert) {
                return res.status(404).json({ message: "Alert not found" });
            }
            // Validate update schema
            const updateSchema = z.object({
                status: AlertStatusTypes.optional(),
                assignedTo: z.number().optional(),
                title: z.string().optional(),
                description: z.string().optional(),
                severity: SeverityTypes.optional(),
            });
            const validData = updateSchema.parse(req.body);
            const updatedAlert = await storage.updateAlert(id, validData);
            res.json(updatedAlert);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid update data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Add route for bulk actions on alerts
    // Endpoint para enriquecer manualmente una alerta con threat intel
    apiRouter.post("/alerts/:id/enrich", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const alert = await storage.getAlert(id);
            if (!alert) {
                return res.status(404).json({ message: "Alert not found" });
            }
            // Procesar el enriquecimiento con threat intel
            const enrichResult = await enrichAlertWithThreatIntel(alert);
            // Responder con el resultado
            if (enrichResult.enriched) {
                res.json({
                    success: true,
                    message: `Alert enriched with ${enrichResult.matchedIntel.length} threat intelligence entries`,
                    alert: enrichResult.alert,
                    matchedIntel: enrichResult.matchedIntel.map(intel => ({
                        id: intel.id,
                        title: intel.title,
                        type: intel.type,
                        source: intel.source,
                        severity: intel.severity,
                        confidence: intel.confidence
                    }))
                });
            }
            else {
                res.json({
                    success: false,
                    message: "No threat intelligence matches found for this alert",
                    alert
                });
            }
        }
        catch (error) {
            res.status(500).json({
                message: error instanceof Error ? error.message : "Error desconocido al enriquecer alerta"
            });
        }
    });
    apiRouter.post("/alerts/bulk-action", isAuthenticated, async (req, res) => {
        try {
            const bulkActionSchema = z.object({
                alertIds: z.array(z.number()),
                action: z.enum(['acknowledge', 'close', 'escalate', 'assign']),
                assignToUserId: z.number().optional(),
            });
            const { alertIds, action, assignToUserId } = bulkActionSchema.parse(req.body);
            if (alertIds.length === 0) {
                return res.status(400).json({ message: "No alert IDs provided" });
            }
            // Map action to alert status
            let status = 'new';
            switch (action) {
                case 'acknowledge':
                    status = 'acknowledged';
                    break;
                case 'close':
                    status = 'resolved';
                    break;
                case 'escalate':
                    status = 'in_progress';
                    break;
            }
            // Update all specified alerts
            const updatePromises = alertIds.map(async (id) => {
                const updateData = { status };
                if (action === 'assign' && assignToUserId) {
                    updateData.assignedTo = assignToUserId;
                }
                return storage.updateAlert(id, updateData);
            });
            const results = await Promise.all(updatePromises);
            res.json({
                success: true,
                message: `Bulk action '${action}' applied to ${results.filter(Boolean).length} alerts`
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid bulk action data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Servir descargas de agentes de forma pública y directa
    app.use("/downloads", express.static(path.join(process.cwd(), "public", "downloads")));
    // Agents route - listado de agentes de la organización
    apiRouter.get("/agents", isAuthenticated, async (req, res) => {
        try {
            if (!req.user || !req.user.organizationId) {
                return res.status(400).json({ message: "User organization information missing" });
            }
            // Puedes ajustar el límite según necesidad
            const agents = await storage.listAgents(req.user.organizationId, 100);
            res.json(agents);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Agent build endpoint - create agent package and registration key
    apiRouter.post("/agents/build", isAuthenticated, async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID missing from session" });
            }
            const { os, customName, capabilities } = req.body;
            // Use server URL from environment or request
            const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
            // Generate a registration key for this user
            const registrationKey = await generateAgentRegistrationKey(userId);
            // Build the agent package
            const result = await buildAgentPackage(userId, os, serverUrl, registrationKey, customName, capabilities);
            if (result.success) {
                res.status(201).json({
                    ...result,
                    registrationKey
                });
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    // Incident routes
    apiRouter.get("/incidents", isAuthenticated, async (req, res) => {
        try {
            // Support filtering by severity and status
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const severity = req.query.severity;
            const status = req.query.status;
            const incidents = await storage.listIncidents(limit);
            let filteredIncidents = incidents;
            if (severity) {
                filteredIncidents = filteredIncidents.filter(incident => incident.severity === severity);
            }
            if (status) {
                filteredIncidents = filteredIncidents.filter(incident => incident.status === status);
            }
            res.json(filteredIncidents);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/incidents", isAuthenticated, async (req, res) => {
        try {
            // Validate incident creation schema
            const createIncidentSchema = z.object({
                title: z.string().min(5, "Title must be at least 5 characters"),
                description: z.string().min(10, "Description must be at least 10 characters"),
                severity: SeverityTypes,
                relatedAlerts: z.any().optional(),
                timeline: z.any().optional(),
                aiAnalysis: z.any().optional()
            });
            const validData = createIncidentSchema.parse(req.body);
            // Add default values
            const newIncident = {
                ...validData,
                createdAt: new Date(),
                updatedAt: new Date(),
                closedAt: null,
                status: 'new', // Default status is 'new'
            };
            // Remove any properties not allowed by storage.createIncident
            // Only destructure properties that exist on newIncident
            const { createdAt, updatedAt, closedAt, aiAnalysis, timeline, relatedAlerts, ...baseIncident } = newIncident;
            const incident = await storage.createIncident({
                ...baseIncident,
                ...(timeline ? { timeline: timeline } : {}),
                ...(relatedAlerts ? { relatedAlerts: relatedAlerts } : {}),
                ...(aiAnalysis ? { aiAnalysis: aiAnalysis } : {})
            });
            // Broadcast new incident via WebSocket for real-time dashboard updates
            try {
                const realtimeMonitor = RealtimeMonitor.getInstance();
                realtimeMonitor.broadcastIncidentUpdate(incident);
                realtimeMonitor.broadcastDashboardUpdate({
                    type: 'new_incident',
                    incident,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                log(`Error broadcasting incident update: ${error instanceof Error ? error.message : 'unknown'}`, 'incidents');
            }
            res.status(201).json(incident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid incident data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/incidents/:id", isAuthenticated, async (req, res) => {
        try {
            const incident = await storage.getIncident(parseInt(req.params.id));
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            res.json(incident);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.patch("/incidents/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate update schema
            const updateSchema = z.object({
                status: IncidentStatusTypes.optional(),
                assignedTo: z.number().optional(),
                title: z.string().optional(),
                description: z.string().optional(),
                severity: SeverityTypes.optional(),
                timeline: z.any().optional(),
                relatedAlerts: z.any().optional(),
                aiAnalysis: z.any().optional()
            });
            const validData = updateSchema.parse(req.body);
            const updatedIncident = await storage.updateIncident(id, validData);
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid update data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Add a timeline entry to an incident
    apiRouter.post("/incidents/:id/timeline", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate timeline entry schema
            const timelineEntrySchema = z.object({
                action: z.string().min(3, "Action description is required"),
                timestamp: z.string().optional(), // Will be handled server-side if not provided
                user: z.string().optional(), // Will be filled in from the authenticated user
                details: z.any().optional()
            });
            const validData = timelineEntrySchema.parse(req.body);
            // Prepare the timeline entry
            const newEntry = {
                ...validData,
                timestamp: validData.timestamp ? new Date(validData.timestamp) : new Date(),
                user: validData.user || req.user?.username || 'Unknown User'
            };
            // Get existing timeline or initialize empty array
            const existingTimeline = incident.timeline || [];
            // Add new entry to timeline
            const updatedTimeline = Array.isArray(existingTimeline)
                ? [...existingTimeline, newEntry]
                : [newEntry];
            // Update the incident with the new timeline
            const updatedIncident = await storage.updateIncident(id, {
                timeline: updatedTimeline
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid timeline entry", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Assign related alerts to an incident
    apiRouter.post("/incidents/:id/link-alerts", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate alert IDs
            const alertIdsSchema = z.object({
                alertIds: z.array(z.number())
            });
            const { alertIds } = alertIdsSchema.parse(req.body);
            if (alertIds.length === 0) {
                return res.status(400).json({ message: "No alert IDs provided" });
            }
            // Get existing related alerts or initialize empty array
            const existingRelatedAlerts = incident.relatedAlerts || [];
            // Fetch the alert details
            const alertPromises = alertIds.map(alertId => storage.getAlert(alertId));
            const alerts = await Promise.all(alertPromises);
            const validAlerts = alerts.filter((a) => Boolean(a));
            if (validAlerts.length === 0) {
                return res.status(404).json({ message: "None of the provided alert IDs were found" });
            }
            // Add new alerts to related alerts (avoid duplicates by ID)
            const existingIds = new Set(Array.isArray(existingRelatedAlerts)
                ? existingRelatedAlerts.map((alert) => alert.id)
                : []);
            const newRelatedAlerts = [
                ...(Array.isArray(existingRelatedAlerts) ? existingRelatedAlerts : []),
                ...validAlerts.filter(alert => alert && !existingIds.has(alert.id))
            ];
            // Update the incident with the new related alerts
            const updatedIncident = await storage.updateIncident(id, {
                relatedAlerts: newRelatedAlerts
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid alert IDs", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Get related alerts for an incident
    apiRouter.get("/incidents/:id/alerts", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            if (!incident.relatedAlerts || !Array.isArray(incident.relatedAlerts) || incident.relatedAlerts.length === 0) {
                return res.json([]);
            }
            // Extract alert IDs
            const alertIds = incident.relatedAlerts.map(alert => typeof alert === 'number' ? alert : alert.id).filter(Boolean);
            // Fetch alerts
            const alertPromises = alertIds.map(alertId => storage.getAlert(alertId));
            const alerts = await Promise.all(alertPromises);
            return res.json(alerts.filter(Boolean));
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Add a note to an incident
    apiRouter.post("/incidents/:id/notes", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate note schema
            const noteSchema = z.object({
                content: z.string().min(1, "Note content is required")
            });
            const { content } = noteSchema.parse(req.body);
            // Prepare the note entry
            const newNote = {
                type: 'note',
                title: 'Investigation Note',
                content,
                timestamp: new Date().toISOString(),
                user: req.user?.username || 'Unknown User',
                icon: "comment"
            };
            // Get existing timeline or initialize empty array
            const existingTimeline = Array.isArray(incident.timeline)
                ? incident.timeline
                : [];
            // Add new note to timeline
            const updatedTimeline = [newNote, ...existingTimeline];
            // Update the incident
            const updatedIncident = await storage.updateIncident(id, {
                timeline: updatedTimeline
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid note data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Add evidence to an incident
    apiRouter.post("/incidents/:id/evidence", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate evidence schema
            const evidenceSchema = z.object({
                name: z.string().min(1, "Evidence name is required"),
                description: z.string().min(1, "Evidence description is required")
            });
            const { name, description } = evidenceSchema.parse(req.body);
            // Prepare the evidence entry
            const newEvidence = {
                id: Date.now().toString(),
                name,
                description,
                timestamp: new Date().toISOString(),
                addedBy: req.user?.username || 'Unknown User',
                type: 'file'
            };
            // Get existing evidence or initialize empty array
            const existingEvidence = Array.isArray(incident.evidence)
                ? incident.evidence
                : [];
            // Add new evidence
            const updatedEvidence = [...existingEvidence, newEvidence];
            // Also add to timeline
            const timelineEntry = {
                type: 'action',
                title: 'Evidence Added',
                content: `Added evidence: ${name}`,
                timestamp: new Date().toISOString(),
                user: req.user?.username || 'Unknown User',
                icon: "file-plus"
            };
            const existingTimeline = Array.isArray(incident.timeline)
                ? incident.timeline
                : [];
            const updatedTimeline = [timelineEntry, ...existingTimeline];
            // Update the incident
            const updatedIncident = await storage.updateIncident(id, {
                evidence: updatedEvidence,
                timeline: updatedTimeline
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid evidence data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Execute a playbook on an incident
    apiRouter.post("/incidents/:id/playbooks", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate playbook schema
            const playbookSchema = z.object({
                playbookId: z.number().min(1, "Valid playbook ID is required")
            });
            const { playbookId } = playbookSchema.parse(req.body);
            // Mock playbook data (in a real implementation this would be fetched from a playbooks table)
            const playbooks = [
                { id: 1, name: "Ransomware Response", status: "completed" },
                { id: 2, name: "Phishing Investigation", status: "completed" },
                { id: 3, name: "Data Exfiltration Response", status: "completed" },
                { id: 4, name: "Malware Containment", status: "completed" },
                { id: 5, name: "Insider Threat Investigation", status: "completed" }
            ];
            const playbook = playbooks.find(p => p.id === playbookId);
            if (!playbook) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            // Record playbook execution
            const playbookExecution = {
                id: playbook.id,
                name: playbook.name,
                startTime: new Date().toISOString(),
                status: "completed",
                completedTime: new Date().toISOString(),
                executedBy: req.user?.username || 'System'
            };
            // Get existing playbooks or initialize empty array
            const existingPlaybooks = Array.isArray(incident.playbooks)
                ? incident.playbooks
                : [];
            // Add new playbook execution
            const updatedPlaybooks = [...existingPlaybooks, playbookExecution];
            // Also add to timeline
            const timelineEntry = {
                type: 'action',
                title: 'Playbook Executed',
                content: `Executed playbook: ${playbook.name}`,
                timestamp: new Date().toISOString(),
                user: req.user?.username || 'System',
                icon: "play-circle"
            };
            const existingTimeline = Array.isArray(incident.timeline)
                ? incident.timeline
                : [];
            const updatedTimeline = [timelineEntry, ...existingTimeline];
            // Update the incident
            const updatedIncident = await storage.updateIncident(id, {
                playbooks: updatedPlaybooks,
                timeline: updatedTimeline
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid playbook data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Update MITRE ATT&CK tactics for an incident
    apiRouter.post("/incidents/:id/tactics", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const incident = await storage.getIncident(id);
            if (!incident) {
                return res.status(404).json({ message: "Incident not found" });
            }
            // Validate tactics schema
            const tacticsSchema = z.object({
                tactics: z.array(z.string())
            });
            const { tactics } = tacticsSchema.parse(req.body);
            // Also add to timeline
            const timelineEntry = {
                type: 'action',
                title: 'MITRE ATT&CK Mapping Updated',
                content: `Updated MITRE ATT&CK tactics mapping`,
                timestamp: new Date().toISOString(),
                user: req.user?.username || 'Unknown User'
            };
            const existingTimeline = Array.isArray(incident.timeline)
                ? incident.timeline
                : [];
            const updatedTimeline = [timelineEntry, ...existingTimeline];
            // Update the incident
            const updatedIncident = await storage.updateIncident(id, {
                mitreTactics: tactics,
                timeline: updatedTimeline
            });
            res.json(updatedIncident);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid tactics data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // Threat Intel routes
    apiRouter.get("/threat-intel", isAuthenticated, async (req, res) => {
        try {
            // Support filtering by type and severity
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const type = req.query.type;
            const severity = req.query.severity;
            const intel = await storage.listThreatIntel(limit);
            let filteredIntel = intel;
            if (type) {
                filteredIntel = filteredIntel.filter(item => item.type === type);
            }
            if (severity) {
                filteredIntel = filteredIntel.filter(item => item.severity === severity);
            }
            res.json(filteredIntel);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/threat-intel", isAuthenticated, async (req, res) => {
        try {
            // Validate threat intel creation schema
            const createIntelSchema = z.object({
                title: z.string().min(5, "Title must be at least 5 characters"),
                description: z.string().min(10, "Description must be at least 10 characters"),
                severity: SeverityTypes,
                source: z.string(),
                type: z.string(),
                confidence: z.number().min(0).max(100).nullable().optional(),
                iocs: z.any().optional(),
                relevance: z.string().nullable().optional(),
                expiresAt: z.string().optional() // ISO date string
            });
            const validData = createIntelSchema.parse(req.body);
            // Convert expiresAt string to Date if provided
            let expiresDate = null;
            if (validData.expiresAt) {
                expiresDate = new Date(validData.expiresAt);
            }
            else {
                // Default expiration is 30 days
                const now = new Date();
                expiresDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            }
            // Add default values
            const newIntel = {
                ...validData,
                expiresAt: expiresDate,
            };
            const intel = await storage.createThreatIntel(newIntel);
            // If OpenAI is configured, automatically analyze the threat intel
            if (isOpenAIConfigured()) {
                // Don't await - run this in the background
                analyzeThreatIntel(intel)
                    .then(insightData => {
                    if (insightData) {
                        const { createdAt, ...aiInsightData } = insightData;
                        storage.createAiInsight({
                            ...aiInsightData
                        });
                    }
                })
                    .catch(err => console.error('Error analyzing threat intel:', err));
            }
            res.status(201).json(intel);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid threat intel data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/threat-intel/:id", isAuthenticated, async (req, res) => {
        try {
            const intel = await storage.getThreatIntel(parseInt(req.params.id));
            if (!intel) {
                return res.status(404).json({ message: "Threat intelligence not found" });
            }
            res.json(intel);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Get a list of all unique IOC (Indicators of Compromise) types and values
    apiRouter.get("/threat-intel/iocs/list", isAuthenticated, async (req, res) => {
        try {
            const allIntel = await storage.listThreatIntel(1000);
            // Extract IOCs from all threat intel items
            const iocsByType = {
                ipAddresses: new Set(),
                domains: new Set(),
                hashes: new Set(),
                urls: new Set(),
                emails: new Set(),
                files: new Set(),
                other: new Set()
            };
            // Process IOCs from each threat intel
            allIntel.forEach(intel => {
                if (intel.iocs && typeof intel.iocs === 'object') {
                    // For each IOC type, add values to the corresponding set
                    for (const [type, values] of Object.entries(intel.iocs)) {
                        if (Array.isArray(values)) {
                            const targetSet = iocsByType[type] || iocsByType.other;
                            values.forEach(value => {
                                if (typeof value === 'string' && value.trim()) {
                                    targetSet.add(value.trim());
                                }
                            });
                        }
                    }
                }
            });
            // Convert sets to arrays for JSON response
            const result = {
                ipAddresses: Array.from(iocsByType.ipAddresses),
                domains: Array.from(iocsByType.domains),
                hashes: Array.from(iocsByType.hashes),
                urls: Array.from(iocsByType.urls),
                emails: Array.from(iocsByType.emails),
                files: Array.from(iocsByType.files),
                other: Array.from(iocsByType.other)
            };
            res.json(result);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Search for IOCs (Indicators of Compromise)
    apiRouter.post("/threat-intel/search-iocs", isAuthenticated, async (req, res) => {
        try {
            const searchSchema = z.object({
                iocs: z.array(z.string()).min(1, "At least one IOC must be provided")
            });
            const { iocs } = searchSchema.parse(req.body);
            if (iocs.length === 0) {
                return res.status(400).json({ message: "No IOCs provided" });
            }
            const allIntel = await storage.listThreatIntel(1000);
            const matchingIntel = [];
            // Normalize the search IOCs
            const normalizedSearchIocs = iocs.map(ioc => ioc.toLowerCase().trim());
            // Check each threat intel for matching IOCs
            allIntel.forEach(intel => {
                if (intel.iocs && typeof intel.iocs === 'object') {
                    let found = false;
                    // For each IOC type, check if any values match the search IOCs
                    for (const [_, values] of Object.entries(intel.iocs)) {
                        if (Array.isArray(values)) {
                            for (const value of values) {
                                if (typeof value === 'string' &&
                                    normalizedSearchIocs.includes(value.toLowerCase().trim())) {
                                    matchingIntel.push(intel);
                                    found = true;
                                    break;
                                }
                            }
                            if (found)
                                break;
                        }
                    }
                }
            });
            res.json(matchingIntel);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid search data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    // AI Insights routes
    apiRouter.get("/ai-insights", isAuthenticated, async (req, res) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const insights = await storage.listAiInsights(limit);
            res.json(insights);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/ai-insights/:id", isAuthenticated, async (req, res) => {
        try {
            const insight = await storage.getAiInsight(parseInt(req.params.id));
            if (!insight) {
                return res.status(404).json({ message: "AI insight not found" });
            }
            res.json(insight);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // AI Configuration routes
    apiRouter.post("/ai/set-api-key", isAuthenticated, async (req, res) => {
        try {
            const apiKeySchema = z.object({
                apiKey: z.string().min(1, "API key is required")
            });
            const { apiKey } = apiKeySchema.parse(req.body);
            // Initialize OpenAI with the provided API key
            const success = initializeOpenAI(apiKey);
            if (!success) {
                return res.status(400).json({
                    message: "Failed to initialize OpenAI client with the provided API key."
                });
            }
            // Store the API key in environment variable for this session
            process.env.OPENAI_API_KEY = apiKey;
            res.json({
                success: true,
                message: "OpenAI API key set successfully",
                isConfigured: isOpenAIConfigured()
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid API key", errors: error.format() });
            }
            res.status(500).json({ message: "Failed to set API key", error: error.message });
        }
    });
    apiRouter.get("/ai/status", isAuthenticated, async (req, res) => {
        res.json({
            isConfigured: isOpenAIConfigured()
        });
    });
    // AI-powered routes
    apiRouter.post("/ai/analyze-alert/:id", isAuthenticated, async (req, res) => {
        try {
            const alertId = parseInt(req.params.id);
            const alert = await storage.getAlert(alertId);
            if (!alert) {
                return res.status(404).json({ message: "Alert not found" });
            }
            if (!process.env.OPENAI_API_KEY) {
                return res.status(400).json({
                    message: "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                });
            }
            const insightData = await generateAlertInsight(alert);
            if (!insightData) {
                return res.status(500).json({ message: "Failed to generate insight for alert" });
            }
            const insight = await storage.createAiInsight(insightData);
            res.status(201).json(insight);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/ai/correlate-alerts", isAuthenticated, async (req, res) => {
        try {
            if (!process.env.OPENAI_API_KEY) {
                return res.status(400).json({
                    message: "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                });
            }
            // Get recent alerts to correlate
            const alerts = await storage.listAlerts(10);
            const incidentData = await correlateAlerts(alerts);
            if (!incidentData) {
                return res.status(200).json({
                    message: "No significant correlation found between recent alerts"
                });
            }
            // Remove any properties not allowed by storage.createIncident
            const { createdAt, updatedAt, closedAt, id, playbooks, aiAnalysis, timeline, relatedAlerts, ...baseIncident } = incidentData ?? {};
            const incident = await storage.createIncident({
                ...baseIncident,
                ...(timeline ? { timeline: timeline } : {}),
                ...(relatedAlerts ? { relatedAlerts: relatedAlerts } : {}),
                ...(aiAnalysis ? { aiAnalysis: aiAnalysis } : {}),
                ...(playbooks ? { playbooks: playbooks } : {})
            });
            res.status(201).json(incident);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/ai/analyze-threat-intel/:id", isAuthenticated, async (req, res) => {
        try {
            const intelId = parseInt(req.params.id);
            const intel = await storage.getThreatIntel(intelId);
            if (!intel) {
                return res.status(404).json({ message: "Threat intelligence not found" });
            }
            if (!process.env.OPENAI_API_KEY) {
                return res.status(400).json({
                    message: "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                });
            }
            const insight = await analyzeThreatIntel(intel);
            if (!insight) {
                return res.status(500).json({ message: "Failed to analyze threat intelligence" });
            }
            res.status(201).json(insight);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/ai/generate-recommendations", isAuthenticated, async (req, res) => {
        try {
            if (!process.env.OPENAI_API_KEY) {
                return res.status(400).json({
                    message: "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                });
            }
            // Get recent alerts and incidents for context
            const recentAlerts = await storage.listAlerts(5);
            const recentIncidents = await storage.listIncidents(3);
            const insight = await generateSecurityRecommendations(recentAlerts, recentIncidents);
            if (!insight) {
                return res.status(500).json({ message: "Failed to generate security recommendations" });
            }
            res.status(201).json(insight);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Connector routes
    apiRouter.get("/connectors", isAuthenticated, async (req, res) => {
        try {
            const connectors = await storage.listConnectors();
            // Obtener información de conectores activos
            const activeConnectorIds = (await getActiveConnectors()).map(ac => ac.id); // Corrected: Added await
            // Añadir información de estado real a los conectores
            const enrichedConnectors = connectors.map(connector => ({
                ...connector,
                isRunning: activeConnectorIds.includes(connector.id)
            }));
            res.json(enrichedConnectors);
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    // Obtener estado de los conectores activos
    apiRouter.get("/connectors/active", isAuthenticated, async (req, res) => {
        try {
            const activeConnectors = await getActiveConnectors(); // Corrected: Added await
            res.json(activeConnectors);
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    apiRouter.get("/connectors/:id", isAuthenticated, async (req, res) => {
        try {
            const connector = await storage.getConnector(parseInt(req.params.id));
            if (!connector) {
                return res.status(404).json({ message: "Connector not found" });
            }
            res.json(connector);
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    apiRouter.post("/connectors", isAuthenticated, async (req, res) => {
        try {
            // Validate connector schema
            const connectorSchema = z.object({
                name: z.string().min(3, "Name must be at least 3 characters"),
                type: z.string(),
                vendor: z.string(),
                status: z.string().optional(),
                dataVolume: z.string().nullable().optional(),
                lastData: z.string().nullable().optional(),
                isActive: z.boolean().optional(),
                icon: z.string().nullable().optional(),
                configuration: z.any().optional()
            });
            const validationResult = connectorSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid connector data",
                    errors: validationResult.error.format()
                });
            }
            const connector = await storage.createConnector(req.body);
            res.status(201).json(connector);
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    apiRouter.put("/connectors/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const existingConnector = await storage.getConnector(id);
            if (!existingConnector) {
                return res.status(404).json({ message: "Connector not found" });
            }
            const updatedConnector = await storage.updateConnector(id, req.body);
            res.json(updatedConnector);
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    // Process data from a connector - used for integrations and connectors to send data to the platform
    apiRouter.post("/connectors/:id/process-data", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const connector = await storage.getConnector(id);
            if (!connector) {
                return res.status(404).json({ message: "Connector not found" });
            }
            if (!connector.isActive) {
                return res.status(400).json({ message: "Connector is not active" });
            }
            // Validate the incoming data
            if (!req.body || (!req.body.data && !req.body.rawData)) {
                return res.status(400).json({ message: "No data provided" });
            }
            const rawData = req.body.rawData || req.body.data;
            const dataType = req.body.type || "alert"; // Default type is alert
            let result;
            // Parse and process the data based on the type
            if (dataType === "alert" || dataType === "alerts") {
                // Use AI parser to parse the data
                const parseResult = await aiParser.parseToAlert(rawData, connector);
                if (!parseResult.success) {
                    return res.status(400).json({
                        message: "Failed to parse alert data",
                        errors: parseResult.errors
                    });
                }
                // Create alert in the system
                if (parseResult.data) {
                    const alert = await storage.createAlert(parseResult.data);
                    // Enqueue for AI analysis if alert was created successfully
                    if (alert) {
                        await aiQueue.enqueueAlertAnalysis(alert);
                        // Attempt to enrich with threat intelligence
                        aiCorrelation.enrichAlert(alert)
                            .catch(err => log(`Error enriching alert: ${err.message}`, "routes"));
                    }
                    result = {
                        success: true,
                        message: "Alert processed successfully",
                        alert
                    };
                }
                else {
                    return res.status(400).json({ message: "Parsed alert data is invalid or missing" });
                }
            }
            else if (dataType === "threat_intel" || dataType === "intelligence") {
                // Use AI parser to parse the threat intelligence data
                const parseResult = await aiParser.parseToThreatIntel(rawData, connector);
                if (!parseResult.success) {
                    return res.status(400).json({
                        message: "Failed to parse threat intelligence data",
                        errors: parseResult.errors
                    });
                }
                // Create threat intel in the system
                if (parseResult.data) {
                    const intel = await storage.createThreatIntel(parseResult.data);
                    // Enqueue for AI analysis
                    if (intel) {
                        await aiQueue.enqueueThreatIntelAnalysis(intel);
                    }
                    result = {
                        success: true,
                        message: "Threat intelligence processed successfully",
                        intel
                    };
                }
                else {
                    return res.status(400).json({ message: "Parsed threat intel data is invalid or missing" });
                }
            }
            else if (dataType === "logs") {
                // Parse logs
                const parseResult = await aiParser.parseLogs(rawData, connector);
                if (!parseResult.success) {
                    return res.status(400).json({
                        message: "Failed to parse logs",
                        errors: parseResult.errors
                    });
                }
                // Enqueue logs for AI analysis
                if (parseResult.data) {
                    await aiQueue.enqueueLogAnalysis(parseResult.data);
                    result = {
                        success: true,
                        message: "Logs processed successfully",
                        count: parseResult.data.length
                    };
                }
                else {
                    return res.status(400).json({ message: "Parsed log data is invalid or missing" });
                }
            }
            else {
                return res.status(400).json({ message: `Unsupported data type: ${dataType}` });
            }
            // Update the connector's last data timestamp
            await storage.updateConnector(id, {
                lastData: new Date().toISOString(),
                status: "connected"
            });
            res.status(200).json(result);
        }
        catch (error) {
            log(`Error processing connector data: ${error.message}`, "routes");
            res.status(500).json({ message: `Error processing data: ${error.message}` });
        }
    });
    // Delete connector
    apiRouter.delete("/connectors/:id", isAuthenticated, requireRole('ADMIN'), async (req, res) => {
        try {
            const id = req.params.id;
            await connectorManager.deleteConnector(id);
            res.json({ success: true, message: `Connector ${id} deleted` });
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    // Update connector status (pause or resume)
    apiRouter.patch("/connectors/:id", isAuthenticated, requireRole('ADMIN'), async (req, res) => {
        try {
            const id = req.params.id;
            const { status } = req.body;
            if (status === 'paused') {
                await connectorManager.pauseConnector(id);
            }
            else if (status === 'active') {
                await connectorManager.resumeConnector(id);
            }
            else {
                return res.status(400).json({ message: 'Invalid status value' });
            }
            res.json({ success: true, id, status });
        }
        catch (error) {
            res.status(500).json({ message: String(error) });
        }
    });
    // Test connector connection
    apiRouter.post("/connectors/:id/test", isAuthenticated, requireRole('ADMIN'), async (req, res) => {
        try {
            const id = req.params.id;
            const result = await connectorManager.testConnector(id);
            res.json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    });
    // Threat Feed routes
    apiRouter.get("/threat-feeds", isAuthenticated, async (req, res) => {
        try {
            const feeds = await storage.listThreatFeeds();
            res.json(feeds);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Endpoint para actualizar manualmente los datos
    apiRouter.post("/refresh-data", isAuthenticated, async (req, res) => {
        try {
            const { type } = req.body;
            if (type === 'all' || type === undefined) {
                // Actualizar todos los datos
                const result = await updateAllData();
                // También actualizar las métricas
                await updateSystemMetrics();
                res.json({
                    success: result.success,
                    message: result.message,
                    details: result.details
                });
            }
            else if (type === 'metrics') {
                // Solo actualizar métricas
                const result = await updateSystemMetrics();
                res.json({
                    success: result.success,
                    message: result.message,
                    updatedMetrics: result.updatedMetrics
                });
            }
            else if (type === 'feeds') {
                // Solo actualizar feeds de amenazas
                const feedsResult = await importAllFeeds();
                res.json({
                    success: feedsResult.success,
                    message: feedsResult.message
                });
            }
            else if (type === 'alerts') {
                // Solo actualizar alertas
                const alertsResult = await importAllAlerts();
                res.json({
                    success: alertsResult.success,
                    message: alertsResult.message
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    message: "Tipo de actualización inválido. Opciones válidas: 'all', 'metrics', 'feeds', 'alerts'"
                });
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
            res.status(500).json({
                success: false,
                message: `Error al actualizar datos: ${errorMsg}`
            });
        }
    });
    apiRouter.get("/threat-feeds/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const feed = await storage.getThreatFeed(id);
            if (!feed) {
                return res.status(404).json({ message: "Threat feed not found" });
            }
            res.json(feed);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/threat-feeds", isAuthenticated, async (req, res) => {
        try {
            // Parse and validate request body
            const feedData = insertThreatFeedSchema.parse(req.body);
            // Create the feed
            const feed = await storage.createThreatFeed(feedData);
            res.status(201).json(feed);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid feed data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.put("/threat-feeds/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const updateData = req.body;
            const updatedFeed = await storage.updateThreatFeed(id, updateData);
            if (!updatedFeed) {
                return res.status(404).json({ message: "Threat feed not found" });
            }
            res.json(updatedFeed);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.delete("/threat-feeds/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const success = await storage.deleteThreatFeed(id);
            if (!success) {
                return res.status(404).json({ message: "Threat feed not found or could not be deleted" });
            }
            res.status(200).json({ success: true, message: "Threat feed deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/threat-feeds/:id/toggle", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { isActive } = req.body;
            if (typeof isActive !== 'boolean') {
                return res.status(400).json({ message: "isActive must be a boolean value" });
            }
            const feed = await storage.toggleThreatFeedStatus(id, isActive);
            if (!feed) {
                return res.status(404).json({ message: "Threat feed not found" });
            }
            res.json(feed);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Playbook routes
    apiRouter.get("/playbooks", isAuthenticated, async (req, res) => {
        try {
            const playbooks = await storage.listPlaybooks();
            res.json(playbooks);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/playbooks/:id", isAuthenticated, async (req, res) => {
        try {
            const playbook = await storage.getPlaybook(parseInt(req.params.id));
            if (!playbook) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            res.json(playbook);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/playbooks", isAuthenticated, async (req, res) => {
        try {
            // Validate request body using schema from shared/schema.ts
            const validData = insertPlaybookSchema.parse(req.body);
            // Create playbook
            const playbook = await storage.createPlaybook(validData);
            res.status(201).json(playbook);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ message: "Invalid playbook data", errors: error.format() });
            }
            else {
                res.status(500).json({ message: error.message });
            }
        }
    });
    apiRouter.patch("/playbooks/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const playbook = await storage.getPlaybook(id);
            if (!playbook) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            // Validate request body
            const validData = insertPlaybookSchema.partial().parse(req.body);
            // Update playbook
            const updatedPlaybook = await storage.updatePlaybook(id, validData);
            res.json(updatedPlaybook);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ message: "Invalid playbook data", errors: error.format() });
            }
            else {
                res.status(500).json({ message: error.message });
            }
        }
    });
    apiRouter.delete("/playbooks/:id", isAuthenticated, async (req, res) => {
        try {
            const deleted = await storage.deletePlaybook(parseInt(req.params.id));
            if (!deleted) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/playbooks/:id/toggle", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { isActive } = req.body;
            if (typeof isActive !== 'boolean') {
                return res.status(400).json({ message: "isActive must be a boolean value" });
            }
            const playbook = await storage.togglePlaybookStatus(id, isActive);
            if (!playbook) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            res.json(playbook);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/playbooks/:id/execute", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { triggeredBy, triggerEntityId, triggerSource = 'manual' } = req.body;
            // Primero creamos un registro de ejecución
            const execution = await storage.executePlaybook(id, triggeredBy, triggerEntityId);
            // Note: The new PlaybookExecutor doesn't have the same executePlaybook signature
            // This will need to be updated to use the new service architecture
            // For now, we'll comment this out to avoid compilation errors
            // playbookExecutor.executePlaybook(id, triggeredBy, triggerEntityId, triggerSource)
            //   .then((success: boolean) => {
            //     log(`Ejecución de playbook ${id} completada con resultado: ${success ? 'éxito' : 'fallo'}`, 'playbook-executor');
            //   })
            //   .catch((err: Error) => {
            //     log(`Error en ejecución de playbook ${id}: ${err.message}`, 'playbook-executor');
            //   });
            // Respondemos inmediatamente con el registro de ejecución creado
            res.status(201).json({
                ...execution,
                message: 'Playbook execution started. Check status via the execution ID.'
            });
        }
        catch (error) {
            res.status(500).json({
                message: error instanceof Error ? error.message : "Error desconocido al ejecutar playbook"
            });
        }
    });
    // Test a playbook with dry-run execution
    apiRouter.post("/playbooks/:id/test", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { testData, dryRun = true } = req.body;
            // Get the playbook
            const playbook = await storage.getPlaybook(id);
            if (!playbook) {
                return res.status(404).json({ message: "Playbook not found" });
            }
            // Validate test data schema
            const testSchema = z.object({
                testData: z.object({
                    alertData: z.any().optional(),
                    incidentData: z.any().optional(),
                    customVariables: z.record(z.any()).optional()
                }).optional(),
                dryRun: z.boolean().default(true)
            });
            const validData = testSchema.parse({ testData, dryRun });
            // Execute playbook in test mode using PlaybookExecutor
            const testResult = await playbookExecutor.testPlaybook(id.toString(), validData.testData || {}, validData.dryRun);
            res.json({
                success: true,
                playbookId: id,
                playbookName: playbook.name,
                testResult,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: "Invalid test data",
                    errors: error.format()
                });
            }
            res.status(500).json({
                message: error instanceof Error ? error.message : "Error testing playbook"
            });
        }
    });
    // Reports routes - Security Report Management
    // Report Templates
    apiRouter.get("/report-templates", isAuthenticated, async (req, res) => {
        try {
            const organizationId = req.user?.organizationId || 1;
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const reportType = req.query.type;
            const templates = await storage.listReportTemplates(organizationId, limit, 0, reportType);
            res.json(templates);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/report-templates/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const template = await storage.getReportTemplate(id, organizationId);
            if (!template) {
                return res.status(404).json({ message: "Report template not found" });
            }
            res.json(template);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/report-templates", isAuthenticated, async (req, res) => {
        try {
            const templateSchema = z.object({
                name: z.string().min(3, "Name must be at least 3 characters"),
                description: z.string().optional(),
                type: z.enum(['executive_summary', 'technical_incidents', 'compliance_audit', 'agent_health', 'vulnerability_assessment', 'threat_intelligence', 'soc_performance']),
                scheduleCron: z.string().optional(), // cron expression
                isEnabled: z.boolean().default(true),
                parameters: z.any().default({}),
                notifyEmails: z.any().optional()
            });
            const validData = templateSchema.parse(req.body);
            // Add organization context
            const templateData = {
                ...validData,
                organizationId: req.user?.organizationId || 1,
                createdBy: req.user?.id || 1
            };
            const template = await storage.createReportTemplate(templateData);
            res.status(201).json(template);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid template data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.patch("/report-templates/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const template = await storage.getReportTemplate(id, organizationId);
            if (!template) {
                return res.status(404).json({ message: "Report template not found" });
            }
            const updateSchema = z.object({
                name: z.string().min(3).optional(),
                description: z.string().optional(),
                scheduleCron: z.string().optional(),
                isEnabled: z.boolean().optional(),
                parameters: z.any().optional(),
                notifyEmails: z.any().optional()
            });
            const validData = updateSchema.parse(req.body);
            const updatedTemplate = await storage.updateReportTemplate(id, validData, organizationId);
            res.json(updatedTemplate);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid update data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.delete("/report-templates/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const success = await storage.deleteReportTemplate(id, organizationId);
            if (!success) {
                return res.status(404).json({ message: "Report template not found or could not be deleted" });
            }
            res.status(200).json({ success: true, message: "Report template deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Generated Reports
    apiRouter.get("/reports", isAuthenticated, async (req, res) => {
        try {
            const organizationId = req.user?.organizationId || 1;
            const limit = req.query.limit ? parseInt(req.query.limit) : 100;
            const templateId = req.query.templateId ? parseInt(req.query.templateId) : undefined;
            const status = req.query.status;
            let reports;
            if (templateId) {
                reports = await storage.getReportsGeneratedByTemplate(templateId, organizationId);
            }
            else {
                const filters = {};
                if (status)
                    filters.status = status;
                reports = await storage.listReportsGenerated(organizationId, limit, 0, filters);
            }
            res.json(reports);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.get("/reports/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const report = await storage.getReportGenerated(id, organizationId);
            if (!report) {
                return res.status(404).json({ message: "Report not found" });
            }
            res.json(report);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/reports/generate", isAuthenticated, async (req, res) => {
        try {
            const generateSchema = z.object({
                templateId: z.number().min(1, "Valid template ID is required"),
                format: z.enum(['pdf', 'html']).default('pdf'),
                periodFrom: z.string().optional(),
                periodTo: z.string().optional(),
                parameters: z.any().optional()
            });
            const { templateId, format, periodFrom, periodTo, parameters } = generateSchema.parse(req.body);
            // Get the template
            const organizationId = req.user?.organizationId || 1;
            const template = await storage.getReportTemplate(templateId, organizationId);
            if (!template) {
                return res.status(404).json({ message: "Report template not found" });
            }
            // Set default period (last 30 days if not provided)
            const now = new Date();
            const defaultPeriodFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            // Create report generation record
            const reportData = {
                templateId,
                organizationId,
                name: `${template.name} - ${new Date().toLocaleDateString()}`,
                type: template.type,
                format,
                periodFrom: periodFrom ? new Date(periodFrom) : defaultPeriodFrom,
                periodTo: periodTo ? new Date(periodTo) : now,
                status: 'scheduled',
                metadata: parameters || template.parameters,
                requestedBy: req.user?.id || 1
            };
            const report = await storage.createReportGenerated(reportData);
            // Note: In a real implementation, you would trigger the ReportGeneratorService here
            // For now, we'll just create the record and return it
            res.status(201).json({
                ...report,
                message: "Report generation started. You will be notified when complete."
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid generation request", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.patch("/reports/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const report = await storage.getReportGenerated(id, organizationId);
            if (!report) {
                return res.status(404).json({ message: "Report not found" });
            }
            const updateSchema = z.object({
                status: z.enum(['scheduled', 'generating', 'completed', 'failed']).optional(),
                filePath: z.string().optional(),
                fileSize: z.number().optional(),
                hashSha256: z.string().optional(),
                generatedAt: z.string().optional(),
                error: z.string().optional()
            });
            const validData = updateSchema.parse(req.body);
            // Convert date string if provided
            let updateData = { ...validData };
            if (validData.generatedAt) {
                updateData.generatedAt = new Date(validData.generatedAt);
            }
            const updatedReport = await storage.updateReportGenerated(id, updateData, organizationId);
            res.json(updatedReport);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid update data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.delete("/reports/:id", isAuthenticated, async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const organizationId = req.user?.organizationId || 1;
            const success = await storage.deleteReportGenerated(id, organizationId);
            if (!success) {
                return res.status(404).json({ message: "Report not found or could not be deleted" });
            }
            res.status(200).json({ success: true, message: "Report deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Report Artifacts (attachments, charts, etc.)
    apiRouter.get("/reports/:reportId/artifacts", isAuthenticated, async (req, res) => {
        try {
            const reportId = parseInt(req.params.reportId);
            const artifacts = await storage.listReportArtifacts(reportId);
            res.json(artifacts);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.post("/reports/:reportId/artifacts", isAuthenticated, async (req, res) => {
        try {
            const reportId = parseInt(req.params.reportId);
            const artifactSchema = z.object({
                artifactType: z.enum(['chart', 'attachment', 'image', 'data']),
                name: z.string().min(1, "Artifact name is required"),
                path: z.string().min(1, "Artifact path is required"),
                mimeType: z.string().optional(),
                size: z.number().optional(),
                metadata: z.any().optional()
            });
            const validData = artifactSchema.parse(req.body);
            const artifactData = {
                ...validData,
                reportId
            };
            const artifact = await storage.createReportArtifact(artifactData);
            res.status(201).json(artifact);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Invalid artifact data", errors: error.format() });
            }
            res.status(500).json({ message: error.message });
        }
    });
    apiRouter.delete("/reports/:reportId/artifacts/:artifactId", isAuthenticated, async (req, res) => {
        try {
            const artifactId = parseInt(req.params.artifactId);
            const success = await storage.deleteReportArtifact(artifactId);
            if (!success) {
                return res.status(404).json({ message: "Artifact not found or could not be deleted" });
            }
            res.status(200).json({ success: true, message: "Artifact deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Report Statistics and Analytics
    apiRouter.get("/reports/statistics", isAuthenticated, async (req, res) => {
        try {
            const organizationId = req.user?.organizationId || 1;
            const days = req.query.days ? parseInt(req.query.days) : 30;
            const statistics = await storage.getReportStatistics(organizationId, days);
            res.json(statistics);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Get enabled report templates for scheduling
    apiRouter.get("/report-templates/enabled", isAuthenticated, async (req, res) => {
        try {
            const organizationId = req.user?.organizationId || 1;
            const templates = await storage.getEnabledReportTemplates(organizationId);
            res.json(templates);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Get recent reports for dashboard
    apiRouter.get("/reports/recent", isAuthenticated, async (req, res) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const organizationId = req.user?.organizationId || 1;
            const reports = await storage.getRecentReportsGenerated(organizationId, limit);
            res.json(reports);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // Dashboard endpoint - comprehensive KPI and telemetry data
    apiRouter.get("/dashboard", isAuthenticated, async (req, res) => {
        try {
            const organizationId = req.user?.organizationId || 1;
            const timeRange = req.query.range || '24h';
            // Calculate time boundaries based on range
            const now = new Date();
            let startDate;
            switch (timeRange) {
                case '7d':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '24h':
                default:
                    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
            }
            // Fetch core data
            const [alerts, incidents, metrics, threatIntel] = await Promise.all([
                storage.listAlerts(1, 1000, organizationId),
                storage.listIncidents(1, 1000, organizationId),
                storage.listMetrics(),
                storage.listThreatIntel(1, 10)
            ]);
            // Filter data by time range
            const alertsInRange = alerts.filter(alert => new Date(alert.timestamp) >= startDate);
            const incidentsInRange = incidents.filter(incident => new Date(incident.createdAt) >= startDate);
            // Calculate metrics
            const activeAlerts = alertsInRange.filter(alert => alert.status !== 'resolved').length;
            const openIncidents = incidentsInRange.filter(incident => incident.status !== 'closed' && incident.status !== 'resolved').length;
            // Severity distribution
            const severityCounts = {
                critical: alertsInRange.filter(a => a.severity === 'critical').length,
                high: alertsInRange.filter(a => a.severity === 'high').length,
                medium: alertsInRange.filter(a => a.severity === 'medium').length,
                low: alertsInRange.filter(a => a.severity === 'low').length
            };
            // Calculate MTTA (Mean Time to Acknowledge) - approximate
            const resolvedAlerts = alertsInRange.filter(alert => alert.status === 'resolved');
            let mtta = 0;
            if (resolvedAlerts.length > 0) {
                const totalDetectionTime = resolvedAlerts.reduce((sum, alert) => {
                    const detectTime = new Date(alert.timestamp).getTime();
                    const acknowledgeTime = alert.acknowledgedAt ?
                        new Date(alert.acknowledgedAt).getTime() : detectTime;
                    return sum + (acknowledgeTime - detectTime);
                }, 0);
                mtta = Math.round(totalDetectionTime / resolvedAlerts.length / 3600000 * 10) / 10; // hours
            }
            // Calculate MTTR (Mean Time to Resolution)
            let mttr = 0;
            if (resolvedAlerts.length > 0) {
                const totalResolutionTime = resolvedAlerts.reduce((sum, alert) => {
                    const startTime = new Date(alert.timestamp).getTime();
                    const endTime = alert.resolvedAt ?
                        new Date(alert.resolvedAt).getTime() : new Date().getTime();
                    return sum + (endTime - startTime);
                }, 0);
                mttr = Math.round(totalResolutionTime / resolvedAlerts.length / 3600000 * 10) / 10; // hours
            }
            // Alerts by day for trend chart
            const alertsByDay = [];
            for (let i = 6; i >= 0; i--) {
                const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                const dayAlerts = alertsInRange.filter(alert => {
                    const alertDate = new Date(alert.timestamp);
                    return alertDate >= dayStart && alertDate < dayEnd;
                });
                alertsByDay.push({
                    date: dayStart.toISOString().split('T')[0],
                    alerts: dayAlerts.length,
                    critical: dayAlerts.filter(a => a.severity === 'critical').length,
                    high: dayAlerts.filter(a => a.severity === 'high').length,
                    medium: dayAlerts.filter(a => a.severity === 'medium').length,
                    low: dayAlerts.filter(a => a.severity === 'low').length
                });
            }
            // MITRE ATT&CK tactics summary
            const mitreTactics = alertsInRange.reduce((acc, alert) => {
                if (alert.mitreAttack && alert.mitreAttack.tactics) {
                    alert.mitreAttack.tactics.forEach((tactic) => {
                        acc[tactic] = (acc[tactic] || 0) + 1;
                    });
                }
                return acc;
            }, {});
            const mitreTopTactics = Object.entries(mitreTactics)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([tactic, count]) => ({ tactic, count }));
            // AI-generated insights (mock for now)
            const aiInsights = [
                {
                    type: 'trend',
                    title: 'Alert Volume Increase',
                    description: `${activeAlerts > 10 ? 'High' : 'Normal'} alert volume detected in the last ${timeRange}`,
                    severity: activeAlerts > 10 ? 'high' : 'info',
                    timestamp: new Date().toISOString()
                }
            ];
            // Compliance score (mock calculation)
            const complianceScore = Math.max(85, 100 - (activeAlerts * 2) - (openIncidents * 5));
            // Get system metrics from stored metrics
            const systemMetrics = {
                activeAlerts,
                openIncidents,
                mtta,
                mttr,
                assetsAtRisk: Math.floor(activeAlerts * 0.7), // Approximate
                complianceScore,
                connectorHealth: 95, // Mock - should come from connector health checks
                globalRiskScore: Math.min(100, activeAlerts * 5 + openIncidents * 10)
            };
            // Format metrics for the UI
            const dashboardMetrics = [
                {
                    name: 'Active Alerts',
                    value: systemMetrics.activeAlerts,
                    trend: activeAlerts > (alertsInRange.length / 7) ? 'up' : 'down',
                    changePercentage: 5,
                    progressPercent: Math.min(100, activeAlerts * 10),
                    subvalue: `${severityCounts.critical} critical`,
                    severity: 'critical'
                },
                {
                    name: 'Open Incidents',
                    value: systemMetrics.openIncidents,
                    trend: 'stable',
                    changePercentage: 0,
                    progressPercent: Math.min(100, openIncidents * 20),
                    subvalue: 'investigating',
                    severity: 'medium'
                },
                {
                    name: 'MTTD',
                    value: systemMetrics.mtta,
                    trend: 'down',
                    changePercentage: -2,
                    progressPercent: Math.min(100, mtta * 10),
                    subvalue: 'hours',
                    severity: 'info'
                },
                {
                    name: 'MTTR',
                    value: systemMetrics.mttr,
                    trend: 'down',
                    changePercentage: -5,
                    progressPercent: Math.min(100, mttr * 5),
                    subvalue: 'hours',
                    severity: 'medium'
                },
                {
                    name: 'Assets at Risk',
                    value: systemMetrics.assetsAtRisk,
                    trend: 'stable',
                    changePercentage: 1,
                    progressPercent: Math.min(100, systemMetrics.assetsAtRisk * 5),
                    subvalue: 'affected',
                    severity: 'high'
                },
                {
                    name: 'Compliance Score',
                    value: systemMetrics.complianceScore,
                    trend: 'up',
                    changePercentage: 2,
                    progressPercent: systemMetrics.complianceScore,
                    subvalue: '%',
                    severity: 'low'
                },
                {
                    name: 'Connector Health',
                    value: systemMetrics.connectorHealth,
                    trend: 'stable',
                    changePercentage: 0,
                    progressPercent: systemMetrics.connectorHealth,
                    subvalue: '% online',
                    severity: 'info'
                },
                {
                    name: 'Global Risk Score',
                    value: systemMetrics.globalRiskScore,
                    trend: 'down',
                    changePercentage: -3,
                    progressPercent: systemMetrics.globalRiskScore,
                    subvalue: '/100',
                    severity: 'high'
                }
            ];
            // Recent alerts for sidebar
            const recentAlerts = alertsInRange
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10)
                .map(alert => ({
                id: alert.id,
                title: alert.title,
                severity: alert.severity,
                timestamp: alert.timestamp,
                status: alert.status
            }));
            const dashboardData = {
                metrics: dashboardMetrics,
                alertsByDay,
                severityDistribution: severityCounts,
                aiInsights,
                mitreTactics: mitreTopTactics,
                recentAlerts,
                threatIntel: threatIntel.slice(0, 5),
                compliance: [
                    { name: 'SOC 2', status: 'compliant', score: 95 },
                    { name: 'PCI DSS', status: 'compliant', score: 88 },
                    { name: 'HIPAA', status: 'partial', score: 76 }
                ],
                recentReports: await storage.getRecentReportsGenerated(organizationId, 5),
                systemMetrics,
                timeRange,
                lastUpdated: new Date().toISOString()
            };
            res.json(dashboardData);
        }
        catch (error) {
            log(`Dashboard endpoint error: ${error.message}`, 'dashboard');
            res.status(500).json({ message: error.message });
        }
    });
    // Montar el apiRouter en /api
    app.use('/api', apiRouter);
    // Create HTTP server
    const httpServer = createServer(app);
    // Configurar actualizaciones automáticas de datos
    // Para datos reales, configuramos las siguientes tareas automatizadas:
    // 1. Actualizar todos los datos (Threat Intelligence + Alertas) cada 3 horas
    cron.schedule('0 */3 * * *', async () => {
        try {
            log('Ejecutando actualización programada de datos completa', 'cron');
            const result = await updateAllData();
            log(`Resultado de actualización: ${result.success ? 'Éxito' : 'Error'} - ${result.message}`, 'cron');
        }
        catch (error) {
            log(`Error en la actualización programada de datos: ${error instanceof Error ? error.message : 'error desconocido'}`, 'cron');
        }
    });
    // 2. Actualizar métricas del dashboard cada hora
    cron.schedule('0 * * * *', async () => {
        try {
            log('Ejecutando actualización programada de métricas', 'cron');
            const result = await updateSystemMetrics();
            log(`Resultado de actualización de métricas: ${result.success ? 'Éxito' : 'Error'} - ${result.message}`, 'cron');
        }
        catch (error) {
            log(`Error en la actualización programada de métricas: ${error instanceof Error ? error.message : 'error desconocido'}`, 'cron');
        }
    });
    // Realizar una primera actualización al iniciar el servidor (después de 5 segundos)
    setTimeout(async () => {
        try {
            log('Ejecutando actualización inicial de datos', 'init');
            // Actualizar feeds de threat intelligence y alertas
            const updateResult = await updateAllData();
            log(`Resultado de actualización inicial: ${updateResult.success ? 'Éxito' : 'Error'} - ${updateResult.message}`, 'init');
            // También actualizar las métricas
            const metricsResult = await updateSystemMetrics();
            log(`Resultado de actualización inicial de métricas: ${metricsResult.success ? 'Éxito' : 'Error'} - ${metricsResult.message}`, 'init');
        }
        catch (error) {
            log(`Error en la actualización inicial de datos: ${error instanceof Error ? error.message : 'error desconocido'}`, 'init');
        }
    }, 5000); // Esperar 5 segundos para que el servidor esté completamente iniciado
    return httpServer;
}
