import { Router } from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SeverityTypes, AlertStatusTypes, IncidentStatusTypes, PlaybookTriggerTypes, PlaybookStatusTypes, insertThreatFeedSchema, insertPlaybookSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";
import { 
  generateAlertInsight, 
  correlateAlerts, 
  analyzeThreatIntel, 
  generateSecurityRecommendations,
  initializeOpenAI,
  isOpenAIConfigured
} from "./ai-service";
import { processNewAlertWithEnrichment, enrichAlertWithThreatIntel } from './integrations/alertEnrichment';

// Importamos el servicio avanzado de IA que soporta múltiples proveedores
import {
  AIModelType,
  AnalysisType,
  initializeOpenAI as initOpenAI,
  initializeAnthropic,
  isOpenAIConfigured as isOpenAIReady,
  isAnthropicConfigured,
  generateAlertInsight as generateAdvancedAlertInsight,
  correlateAlerts as correlateAlertsAdvanced,
  analyzeThreatIntel as analyzeThreatIntelAdvanced,
  generateSecurityRecommendations as generateAdvancedRecommendations,
  analyzeLogPatterns,
  analyzeNetworkTraffic,
  detectAnomalies
} from "./advanced-ai-service";
// Importamos los servicios de integración con datos reales
import { importAllFeeds } from "./integrations/threatFeeds";
import { importAllAlerts } from "./integrations/alerts";
// Importar node-cron para programar tareas automáticas
import cron from "node-cron";
import { log } from "./vite";
// Importar el módulo scheduler para actualizaciones automáticas
import { updateAllData, updateSystemMetrics } from "./integrations/scheduler";
// Importar módulos del sistema para manejo de archivos
import * as fs from 'fs';
import * as path from 'path';
// Importar servicios avanzados de IA
import { aiQueue } from "./integrations/ai-processing-queue";
import { aiCorrelation } from "./integrations/ai-correlation-engine";
import { aiParser } from "./integrations/ai-parser-service";
import { playbookExecutorService } from "./integrations/playbook-executor";
// Importar servicio de integración con Stripe
import { StripeService } from "./integrations/stripe-service";
import { createCheckoutSession as createStripeCheckoutSession } from "./integrations/stripe-service-wrapper";
// Importar gestión de conectores
import { 
  initializeConnectors, 
  executeConnector, 
  toggleConnector,
  getActiveConnectors
} from "./integrations/connectors";
// Importar router de funcionalidades avanzadas
import { advancedRouter } from "./advanced-routes";
import { 
  registerAgent, 
  processAgentData, 
  processAgentHeartbeat, 
  generateAgentRegistrationKey, 
  buildAgentPackage 
} from "./integrations/agents";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Initializar los conectores - para recibir datos de fuentes externas
  // Almacenamos una referencia a Express global para que los conectores puedan registrar endpoints
  (global as any).expressApp = app;
  try {
    log('Inicializando conectores...', 'routes');
    await initializeConnectors(app);
    log('Conectores inicializados correctamente', 'routes');
  } catch (error) {
    log(`Error inicializando conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'routes');
  }

  const apiRouter = Router();
  
  // Authentication middleware
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Not authenticated" });
  };
  
  // Health check endpoint - no auth required
  apiRouter.get("/health", (req, res) => {
    res.json({ status: "healthy" });
  });
  
  // User routes - require auth
  apiRouter.get("/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.listUsers();
      res.json(users);
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Metrics routes
  apiRouter.get("/metrics", isAuthenticated, async (req, res) => {
    try {
      const metrics = await storage.listMetrics();
      res.json(metrics);
    } catch (error) {
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
      
      // Add timestamps
      const metricData = {
        ...validData,
        timestamp: new Date()
      };
      
      const metric = await storage.createMetric(metricData);
      res.status(201).json(metric);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid metric data", errors: error.format() });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  // Calculate and update SOC metrics based on current system state
  apiRouter.post("/metrics/calculate", isAuthenticated, async (req, res) => {
    try {
      // Get all necessary data to calculate metrics
      const alerts = await storage.listAlerts();
      const incidents = await storage.listIncidents();
      
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
      const openIncidents = incidents.filter(incident => 
        incident.status !== 'closed' && incident.status !== 'resolved'
      ).length;
      
      // Calculate average time to resolution for alerts
      let avgResolutionTime = 0;
      const resolvedAlerts = alerts.filter(alert => alert.status === 'resolved');
      
      if (resolvedAlerts.length > 0) {
        const totalResolutionTime = resolvedAlerts.reduce((total, alert) => {
          // In a real system, we would store resolution time
          // Here we're using a placeholder value
          return total + 3600000; // 1 hour in milliseconds
        }, 0);
        avgResolutionTime = totalResolutionTime / resolvedAlerts.length / 3600000; // In hours
      }
      
      // Create array of metrics to save
      const metricsToCreate = [
        {
          name: 'open_alerts',
          value: openAlerts,
          trend: null,
          changePercentage: null
        },
        {
          name: 'open_incidents',
          value: openIncidents,
          trend: null,
          changePercentage: null
        },
        {
          name: 'critical_alerts',
          value: alertSeverityCounts.critical,
          trend: null,
          changePercentage: null
        },
        {
          name: 'high_alerts',
          value: alertSeverityCounts.high,
          trend: null,
          changePercentage: null
        },
        {
          name: 'medium_alerts',
          value: alertSeverityCounts.medium,
          trend: null,
          changePercentage: null
        },
        {
          name: 'low_alerts',
          value: alertSeverityCounts.low,
          trend: null,
          changePercentage: null
        },
        {
          name: 'avg_resolution_time',
          value: avgResolutionTime,
          trend: null,
          changePercentage: null
        }
      ];
      
      // Save metrics
      const savePromises = metricsToCreate.map(async metricData => {
        // Check if metric exists
        const existingMetric = await storage.getMetricByName(metricData.name);
        
        if (existingMetric) {
          // Calculate trend and change
          const previousValue = existingMetric.value;
          const currentValue = metricData.value;
          
          let trend = 'stable';
          let changePercentage = 0;
          
          if (previousValue > 0) {
            changePercentage = ((currentValue - previousValue) / previousValue) * 100;
            
            if (changePercentage > 0) {
              trend = 'up';
            } else if (changePercentage < 0) {
              trend = 'down';
              changePercentage = Math.abs(changePercentage);
            }
          }
          
          // Update with trend information
          return storage.createMetric({
            name: metricData.name,
            value: currentValue,
            trend,
            changePercentage,
            timestamp: new Date()
          });
        } else {
          // Create new metric
          return storage.createMetric({
            ...metricData,
            timestamp: new Date()
          });
        }
      });
      
      const updatedMetrics = await Promise.all(savePromises);
      res.json({ 
        success: true, 
        message: `Updated ${updatedMetrics.length} metrics`, 
        metrics: updatedMetrics 
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Alert routes
  apiRouter.get("/alerts", isAuthenticated, async (req, res) => {
    try {
      // Support filtering by severity and status
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const severity = req.query.severity as string | undefined;
      const status = req.query.status as string | undefined;
      
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
    } catch (error) {
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
      
      // Si OpenAI está configurado, generar análisis automáticamente
      if (isOpenAIConfigured()) {
        // No esperamos - ejecutar en segundo plano
        generateAlertInsight(alert)
          .then(insightData => {
            if (insightData) {
              storage.createAiInsight(insightData);
            }
          })
          .catch(err => console.error('Error generating insight:', err));
      }
      
      res.status(201).json(alert);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
      } else {
        res.json({
          success: false,
          message: "No threat intelligence matches found for this alert",
          alert
        });
      }
    } catch (error) {
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
        const updateData: any = { status };
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid bulk action data", errors: error.format() });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  // Incident routes
  apiRouter.get("/incidents", isAuthenticated, async (req, res) => {
    try {
      // Support filtering by severity and status
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const severity = req.query.severity as string | undefined;
      const status = req.query.status as string | undefined;
      
      const incidents = await storage.listIncidents(limit);
      
      let filteredIncidents = incidents;
      if (severity) {
        filteredIncidents = filteredIncidents.filter(incident => incident.severity === severity);
      }
      
      if (status) {
        filteredIncidents = filteredIncidents.filter(incident => incident.status === status);
      }
      
      res.json(filteredIncidents);
    } catch (error) {
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
      
      const incident = await storage.createIncident(newIncident);
      
      res.status(201).json(incident);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
        user: validData.user || req.user.username
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
    } catch (error) {
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
      const validAlerts = alerts.filter(Boolean);
      
      if (validAlerts.length === 0) {
        return res.status(404).json({ message: "None of the provided alert IDs were found" });
      }
      
      // Add new alerts to related alerts (avoid duplicates by ID)
      const existingIds = new Set(
        Array.isArray(existingRelatedAlerts) 
          ? existingRelatedAlerts.map(alert => alert.id)
          : []
      );
      
      const newRelatedAlerts = [
        ...(Array.isArray(existingRelatedAlerts) ? existingRelatedAlerts : []),
        ...validAlerts.filter(alert => !existingIds.has(alert.id))
      ];
      
      // Update the incident with the new related alerts
      const updatedIncident = await storage.updateIncident(id, {
        relatedAlerts: newRelatedAlerts
      });
      
      res.json(updatedIncident);
    } catch (error) {
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
      const alertIds = incident.relatedAlerts.map(alert => 
        typeof alert === 'number' ? alert : alert.id
      ).filter(Boolean);
      
      // Fetch alerts
      const alertPromises = alertIds.map(alertId => storage.getAlert(alertId));
      const alerts = await Promise.all(alertPromises);
      
      return res.json(alerts.filter(Boolean));
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const type = req.query.type as string | undefined;
      const severity = req.query.severity as string | undefined;
      
      const intel = await storage.listThreatIntel(limit);
      
      let filteredIntel = intel;
      if (type) {
        filteredIntel = filteredIntel.filter(item => item.type === type);
      }
      
      if (severity) {
        filteredIntel = filteredIntel.filter(item => item.severity === severity);
      }
      
      res.json(filteredIntel);
    } catch (error) {
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
      } else {
        // Default expiration is 30 days
        const now = new Date();
        expiresDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
      
      // Add default values
      const newIntel = {
        ...validData,
        createdAt: new Date(),
        expiresAt: expiresDate,
      };
      
      const intel = await storage.createThreatIntel(newIntel);
      
      // If OpenAI is configured, automatically analyze the threat intel
      if (isOpenAIConfigured()) {
        // Don't await - run this in the background
        analyzeThreatIntel(intel)
          .then(insightData => {
            if (insightData) {
              storage.createAiInsight({
                ...insightData,
                createdAt: new Date()
              });
            }
          })
          .catch(err => console.error('Error analyzing threat intel:', err));
      }
      
      res.status(201).json(intel);
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a list of all unique IOC (Indicators of Compromise) types and values
  apiRouter.get("/threat-intel/iocs/list", isAuthenticated, async (req, res) => {
    try {
      const allIntel = await storage.listThreatIntel();
      
      // Extract IOCs from all threat intel items
      const iocsByType = {
        ipAddresses: new Set<string>(),
        domains: new Set<string>(),
        hashes: new Set<string>(),
        urls: new Set<string>(),
        emails: new Set<string>(),
        files: new Set<string>(),
        other: new Set<string>()
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
    } catch (error) {
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
      
      const allIntel = await storage.listThreatIntel();
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
              if (found) break;
            }
          }
        }
      });
      
      res.json(matchingIntel);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid search data", errors: error.format() });
      }
      res.status(500).json({ message: error.message });
    }
  });
  
  // AI Insights routes
  apiRouter.get("/ai-insights", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const insights = await storage.listAiInsights(limit);
      res.json(insights);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
      
      const incident = await storage.createIncident(incidentData);
      res.status(201).json(incident);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Connector routes
  apiRouter.get("/connectors", isAuthenticated, async (req, res) => {
    try {
      const connectors = await storage.listConnectors();
      
      // Obtener información de conectores activos
      const activeConnectorIds = getActiveConnectors().map(ac => ac.id);
      
      // Añadir información de estado real a los conectores
      const enrichedConnectors = connectors.map(connector => ({
        ...connector,
        isRunning: activeConnectorIds.includes(connector.id)
      }));
      
      res.json(enrichedConnectors);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  // Obtener estado de los conectores activos
  apiRouter.get("/connectors/active", isAuthenticated, async (req, res) => {
    try {
      const activeConnectors = getActiveConnectors();
      res.json(activeConnectors);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
      } else if (dataType === "threat_intel" || dataType === "intelligence") {
        // Use AI parser to parse the threat intelligence data
        const parseResult = await aiParser.parseToThreatIntel(rawData, connector);
        
        if (!parseResult.success) {
          return res.status(400).json({ 
            message: "Failed to parse threat intelligence data", 
            errors: parseResult.errors 
          });
        }
        
        // Create threat intel in the system
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
      } else if (dataType === "logs") {
        // Parse logs
        const parseResult = await aiParser.parseLogs(rawData, connector);
        
        if (!parseResult.success) {
          return res.status(400).json({ 
            message: "Failed to parse logs", 
            errors: parseResult.errors 
          });
        }
        
        // For now, we just analyze the logs but don't store them
        // In a real system, we would store the logs
        
        // Enqueue logs for AI analysis
        await aiQueue.enqueueLogAnalysis(parseResult.data);
        
        result = {
          success: true,
          message: "Logs processed successfully",
          count: parseResult.data.length
        };
      } else {
        return res.status(400).json({ message: `Unsupported data type: ${dataType}` });
      }
      
      // Update the connector's last data timestamp
      await storage.updateConnector(id, { 
        lastData: new Date().toISOString(),
        status: "connected"
      });
      
      res.status(200).json(result);
    } catch (error) {
      log(`Error processing connector data: ${error.message}`, "routes");
      res.status(500).json({ message: `Error processing data: ${error.message}` });
    }
  });
  
  apiRouter.delete("/connectors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteConnector(id);
      
      if (!success) {
        return res.status(404).json({ message: "Connector not found or could not be deleted" });
      }
      
      res.status(200).json({ success: true, message: "Connector deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.post("/connectors/:id/toggle", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean value" });
      }
      
      const connector = await storage.toggleConnectorStatus(id, isActive);
      
      if (!connector) {
        return res.status(404).json({ message: "Connector not found" });
      }
      
      // Utilizar el gestor de conectores para activar/desactivar
      const success = await toggleConnector(id, isActive);
      
      if (!success) {
        log(`Fallo al ${isActive ? 'activar' : 'desactivar'} conector ${id} a través del gestor`, 'routes');
      }
      
      res.json(connector);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  // Ejecutar un conector manualmente
  apiRouter.post("/connectors/:id/execute", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Verificar que el conector existe
      const connector = await storage.getConnector(id);
      if (!connector) {
        return res.status(404).json({ message: "Connector not found" });
      }
      
      log(`Ejecutando manualmente el conector ${connector.name} (ID: ${id})`, 'routes');
      
      // Ejecutar el conector a través del gestor
      const result = await executeConnector(id);
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          alerts: result.alerts?.length || 0,
          threatIntel: result.threatIntel?.length || 0,
          metrics: result.metrics
        }
      });
    } catch (error) {
      log(`Error ejecutando conector manualmente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'routes');
      res.status(500).json({ message: `Error executing connector: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });
  
  // Threat Feed routes
  apiRouter.get("/threat-feeds", isAuthenticated, async (req, res) => {
    try {
      const feeds = await storage.listThreatFeeds();
      res.json(feeds);
    } catch (error) {
      res.status(500).json({ message: String(error) });
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
      } else if (type === 'metrics') {
        // Solo actualizar métricas
        const result = await updateSystemMetrics();
        res.json({
          success: result.success,
          message: result.message,
          updatedMetrics: result.updatedMetrics
        });
      } else if (type === 'feeds') {
        // Solo actualizar feeds de amenazas
        const feedsResult = await importAllFeeds();
        res.json({
          success: feedsResult.success,
          message: feedsResult.message
        });
      } else if (type === 'alerts') {
        // Solo actualizar alertas
        const alertsResult = await importAllAlerts();
        res.json({
          success: alertsResult.success,
          message: alertsResult.message
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Tipo de actualización inválido. Opciones válidas: 'all', 'metrics', 'feeds', 'alerts'"
        });
      }
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.post("/threat-feeds", isAuthenticated, async (req, res) => {
    try {
      // Parse and validate request body
      const feedData = insertThreatFeedSchema.parse(req.body);
      
      // Create the feed
      const feed = await storage.createThreatFeed(feedData);
      
      res.status(201).json(feed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid feed data", errors: error.format() });
      }
      res.status(500).json({ message: String(error) });
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  // Playbook routes
  apiRouter.get("/playbooks", isAuthenticated, async (req, res) => {
    try {
      const playbooks = await storage.listPlaybooks();
      res.json(playbooks);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.get("/playbooks/:id", isAuthenticated, async (req, res) => {
    try {
      const playbook = await storage.getPlaybook(parseInt(req.params.id));
      if (!playbook) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      res.json(playbook);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.post("/playbooks", isAuthenticated, async (req, res) => {
    try {
      // Validate request body using schema from shared/schema.ts
      const validData = insertPlaybookSchema.parse(req.body);
      
      // Create playbook
      const playbook = await storage.createPlaybook(validData);
      res.status(201).json(playbook);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid playbook data", errors: error.format() });
      } else {
        res.status(500).json({ message: String(error) });
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid playbook data", errors: error.format() });
      } else {
        res.status(500).json({ message: String(error) });
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
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
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.post("/playbooks/:id/execute", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { triggeredBy, triggerEntityId, triggerSource = 'manual' } = req.body;
      
      // Primero creamos un registro de ejecución
      const execution = await storage.executePlaybook(id, triggeredBy, triggerEntityId);
      
      // Ahora ejecutamos el playbook con nuestro servicio avanzado de ejecución
      // Esto se hace de forma asíncrona para no bloquear la respuesta HTTP
      playbookExecutorService.executePlaybook(id, triggeredBy, triggerEntityId, triggerSource)
        .then(success => {
          log(`Ejecución de playbook ${id} completada con resultado: ${success ? 'éxito' : 'fallo'}`, 'playbook-executor');
        })
        .catch(err => {
          log(`Error en ejecución de playbook ${id}: ${err.message}`, 'playbook-executor');
        });
      
      // Respondemos inmediatamente con el registro de ejecución creado
      res.status(201).json({
        ...execution,
        message: 'Playbook execution started. Check status via the execution ID.'
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Error desconocido al ejecutar playbook"
      });
    }
  });
  
  // Endpoints para importar datos reales
  // Importar todos los feeds de amenazas
  apiRouter.post("/import/threat-feeds", isAuthenticated, async (req, res) => {
    try {
      const result = await importAllFeeds();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Error desconocido importando feeds' 
      });
    }
  });
  
  // Importar todas las alertas de fuentes externas
  apiRouter.post("/import/alerts", isAuthenticated, async (req, res) => {
    try {
      const result = await importAllAlerts();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Error desconocido importando alertas' 
      });
    }
  });
  
  // Endpoint combinado para importar todos los datos
  apiRouter.post("/import/all", isAuthenticated, async (req, res) => {
    try {
      const [feedsResult, alertsResult] = await Promise.all([
        importAllFeeds(),
        importAllAlerts()
      ]);
      
      res.json({
        success: feedsResult.success || alertsResult.success,
        message: "Importación de datos completada",
        details: {
          feeds: feedsResult,
          alerts: alertsResult
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Error desconocido en la importación de datos' 
      });
    }
  });
  
  apiRouter.get("/playbook-executions", isAuthenticated, async (req, res) => {
    try {
      const playbookId = req.query.playbookId ? parseInt(req.query.playbookId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const executions = await storage.listPlaybookExecutions(playbookId, limit);
      res.json(executions);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  apiRouter.get("/playbook-executions/:id", isAuthenticated, async (req, res) => {
    try {
      const execution = await storage.getPlaybookExecution(parseInt(req.params.id));
      if (!execution) {
        return res.status(404).json({ message: "Playbook execution not found" });
      }
      res.json(execution);
    } catch (error) {
      res.status(500).json({ message: String(error) });
    }
  });
  
  // Dashboard Data route - combines multiple data points for dashboard
  apiRouter.get("/dashboard", isAuthenticated, async (req, res) => {
    try {
      // Get recent alerts and incidents for calculations
      const allAlerts = await storage.listAlerts(50);
      const allIncidents = await storage.listIncidents(50);
      
      // Calculate KPIs for dashboard
      
      // 1. Alertas Abiertas (con desglose por severidad)
      const openAlerts = allAlerts.filter(alert => alert.status !== 'resolved');
      const openAlertsBySeverity = {
        critical: openAlerts.filter(a => a.severity === 'critical').length,
        high: openAlerts.filter(a => a.severity === 'high').length,
        medium: openAlerts.filter(a => a.severity === 'medium').length,
        low: openAlerts.filter(a => a.severity === 'low').length
      };
      
      // 2. Incidentes Activos
      const activeIncidents = allIncidents.filter(inc => 
        inc.status !== 'closed' && inc.status !== 'resolved'
      );
      
      // 3. MTTD y MTTR (placeholder simulado)
      // En un sistema real estos valores se calcularían usando timestamps reales
      const mttd = Math.floor(Math.random() * 120) + 15; // 15-135 minutos
      const mttr = Math.floor(Math.random() * 24) + 4;   // 4-28 horas
      
      // 4. Activos en Riesgo (simulados)
      const assetsAtRisk = openAlertsBySeverity.critical * 2 + openAlertsBySeverity.high;
      
      // 5. Estado de Cumplimiento (simulado como porcentaje)
      const complianceScore = Math.floor(Math.random() * 20) + 80; // 80-100%
      
      // 6. Salud de Conectores 
      const totalConnectors = 12; // Valor demo
      const healthyConnectors = 11; // Valor demo
      const connectorHealth = Math.round((healthyConnectors / totalConnectors) * 100);
      
      // 7. Indicador de Riesgo Global (calculado en base a varias métricas)
      const globalRiskScore = Math.min(100, Math.max(0, 
        (openAlertsBySeverity.critical * 5) + 
        (openAlertsBySeverity.high * 2) + 
        (openAlertsBySeverity.medium * 0.5) + 
        (activeIncidents.length * 8) + 
        (mttr < 6 ? 0 : 10) - 
        (complianceScore / 10)
      ));
      
      // Preparar métricas para el dashboard
      const dashboardMetrics = [
        {
          name: 'Active Alerts',
          value: openAlerts.length,
          subvalue: `${openAlertsBySeverity.critical} critical`,
          trend: 'up',
          changePercentage: 8.5,
          progressPercent: Math.min(100, Math.round((openAlerts.length / 30) * 100))
        },
        {
          name: 'Open Incidents',
          value: activeIncidents.length,
          subvalue: `${activeIncidents.filter(i => i.severity === 'high').length} high`,
          trend: 'stable',
          changePercentage: 0,
          progressPercent: Math.min(100, Math.round((activeIncidents.length / 10) * 100))
        },
        {
          name: 'MTTD',
          value: mttd,
          subvalue: 'minutes',
          trend: 'down',
          changePercentage: 12.3,
          progressPercent: Math.min(100, Math.round((mttd / 180) * 100))
        },
        {
          name: 'MTTR',
          value: mttr,
          subvalue: 'hours',
          trend: 'stable',
          changePercentage: 2.1,
          progressPercent: Math.min(100, Math.round((mttr / 48) * 100))
        },
        {
          name: 'Assets at Risk',
          value: assetsAtRisk,
          subvalue: 'endpoints',
          trend: 'up',
          changePercentage: 3.2,
          progressPercent: Math.min(100, Math.round((assetsAtRisk / 20) * 100))
        },
        {
          name: 'Compliance Score',
          value: complianceScore,
          subvalue: '%',
          trend: 'up',
          changePercentage: 1.5,
          progressPercent: complianceScore
        },
        {
          name: 'Connector Health',
          value: connectorHealth,
          subvalue: `${healthyConnectors}/${totalConnectors}`,
          trend: 'stable',
          changePercentage: 0,
          progressPercent: connectorHealth
        },
        {
          name: 'Global Risk Score',
          value: Math.round(globalRiskScore),
          subvalue: 'medium',
          trend: globalRiskScore > 50 ? 'up' : 'down',
          changePercentage: 4.2,
          progressPercent: globalRiskScore
        }
      ];
      
      // Get actual data from storage
      // Get recent alerts for display
      const recentAlerts = await storage.listAlerts(5);
      
      // Get AI insights
      const aiInsights = await storage.listAiInsights(4);
      
      // Get threat intel
      const threatIntel = await storage.listThreatIntel(3);
      
      // Calculate severity counts for weekly data
      // In a real app, this would query based on date ranges
      const alertsByDay = [
        { critical: 5, high: 8, medium: 12, low: 4, day: 'Mon' },
        { critical: 3, high: 5, medium: 9, low: 6, day: 'Tue' },
        { critical: 8, high: 7, medium: 10, low: 5, day: 'Wed' },
        { critical: 4, high: 6, medium: 11, low: 8, day: 'Thu' },
        { critical: 12, high: 9, medium: 13, low: 4, day: 'Fri' },
        { critical: 2, high: 3, medium: 6, low: 3, day: 'Sat' },
        { critical: 1, high: 2, medium: 5, low: 4, day: 'Sun' }
      ];
      
      // MITRE ATT&CK tactics data
      const mitreTactics = [
        { id: "TA0001", name: "Initial Access", count: 12, percentage: 85 },
        { id: "TA0002", name: "Execution", count: 8, percentage: 70 },
        { id: "TA0003", name: "Persistence", count: 5, percentage: 50 },
        { id: "TA0004", name: "Privilege Escalation", count: 3, percentage: 35 },
        { id: "TA0005", name: "Defense Evasion", count: 2, percentage: 25 }
      ];
      
      // Compliance data
      const compliance = [
        { framework: "ISO 27001", score: 87, status: "compliant", lastAssessment: "2 weeks ago" },
        { framework: "NIST CSF", score: 79, status: "compliant", lastAssessment: "1 month ago" },
        { framework: "GDPR", score: 68, status: "at-risk", lastAssessment: "3 weeks ago" },
        { framework: "PCI DSS", score: 91, status: "compliant", lastAssessment: "2 months ago" }
      ];
      
      res.json({
        metrics: dashboardMetrics,
        recentAlerts,
        aiInsights,
        threatIntel,
        alertsByDay,
        mitreTactics,
        compliance
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // AI Service Management Routes
  apiRouter.get("/ai/status", isAuthenticated, (req, res) => {
    try {
      // Verificar el estado de los proveedores de IA
      const aiStatus = {
        openai: {
          configured: isOpenAIReady(),
          status: isOpenAIReady() ? "configured" : "not_configured"
        },
        anthropic: {
          configured: isAnthropicConfigured(),
          status: isAnthropicConfigured() ? "configured" : "not_configured"
        },
        default_provider: process.env.DEFAULT_AI_PROVIDER || (isOpenAIReady() ? "openai" : isAnthropicConfigured() ? "anthropic" : null)
      };
      
      res.json(aiStatus);
    } catch (error) {
      console.error("Error getting AI status:", error);
      res.status(500).json({ message: "Error getting AI status" });
    }
  });
  
  apiRouter.post("/ai/set-api-key", isAuthenticated, async (req, res) => {
    try {
      const { provider, apiKey } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({ message: "Provider and API key are required" });
      }
      
      let success = false;
      
      if (provider === "openai") {
        success = initOpenAI(apiKey);
        if (success) {
          // También inicializar el servicio antiguo para compatibilidad
          initializeOpenAI(apiKey);
          process.env.OPENAI_API_KEY = apiKey;
        }
      } else if (provider === "anthropic") {
        success = initializeAnthropic(apiKey);
        if (success) {
          process.env.ANTHROPIC_API_KEY = apiKey;
        }
      } else {
        return res.status(400).json({ message: "Invalid provider. Supported providers: openai, anthropic" });
      }
      
      if (success) {
        // Si es el primer proveedor configurado, establecerlo como predeterminado
        if (!process.env.DEFAULT_AI_PROVIDER) {
          process.env.DEFAULT_AI_PROVIDER = provider;
        }
        
        res.json({ success: true, message: `${provider} API key set successfully` });
      } else {
        res.status(400).json({ success: false, message: `Failed to set ${provider} API key` });
      }
    } catch (error) {
      console.error("Error setting API key:", error);
      res.status(500).json({ message: "Error setting API key" });
    }
  });
  
  apiRouter.post("/ai/set-default-provider", isAuthenticated, (req, res) => {
    try {
      const { provider } = req.body;
      
      if (!provider) {
        return res.status(400).json({ message: "Provider is required" });
      }
      
      // Verificar que el proveedor esté configurado
      if (provider === "openai" && !isOpenAIReady()) {
        return res.status(400).json({ message: "OpenAI is not configured. Please set API key first." });
      } else if (provider === "anthropic" && !isAnthropicConfigured()) {
        return res.status(400).json({ message: "Anthropic is not configured. Please set API key first." });
      }
      
      // Establecer proveedor predeterminado
      process.env.DEFAULT_AI_PROVIDER = provider;
      
      res.json({ success: true, message: `${provider} set as default AI provider` });
    } catch (error) {
      console.error("Error setting default provider:", error);
      res.status(500).json({ message: "Error setting default provider" });
    }
  });
  
  apiRouter.post("/ai/test", isAuthenticated, async (req, res) => {
    try {
      const { provider } = req.body;
      
      if (!provider) {
        return res.status(400).json({ message: "Provider is required" });
      }
      
      // Verificar que el proveedor esté configurado
      if (provider === "openai" && !isOpenAIReady()) {
        return res.status(400).json({ message: "OpenAI is not configured. Please set API key first." });
      } else if (provider === "anthropic" && !isAnthropicConfigured()) {
        return res.status(400).json({ message: "Anthropic is not configured. Please set API key first." });
      }
      
      // Realizar una simple prueba del servicio
      let testResult;
      const testPrompt = "Provide a very brief explanation of what a SOC (Security Operations Center) is.";
      
      if (provider === "openai") {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o"
          messages: [{ role: "user", content: testPrompt }],
          max_tokens: 100
        });
        testResult = response.choices[0].message.content;
      } else if (provider === "anthropic") {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219"
          max_tokens: 100,
          messages: [{ role: "user", content: testPrompt }]
        });
        testResult = response.content[0].text;
      }
      
      res.json({ success: true, message: `${provider} test successful`, result: testResult });
    } catch (error) {
      console.error(`Error testing ${req.body.provider}:`, error);
      res.status(500).json({ message: `Error testing ${req.body.provider}` });
    }
  });
  
  // Advanced AI Analysis Endpoints
  apiRouter.post("/ai/analyze-alert", isAuthenticated, async (req, res) => {
    try {
      const { alertId, modelType } = req.body;
      
      if (!alertId) {
        return res.status(400).json({ message: "Alert ID is required" });
      }
      
      const alert = await storage.getAlert(parseInt(alertId));
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      // Determinar el tipo de modelo a usar
      const preferredModel = modelType || AIModelType.AUTO;
      
      // Generar análisis
      const insight = await generateAdvancedAlertInsight(alert, preferredModel);
      
      if (!insight) {
        return res.status(500).json({ message: "Failed to generate alert insight" });
      }
      
      // Guardar el insight generado
      const savedInsight = await storage.createAiInsight(insight);
      
      res.json({ success: true, insight: savedInsight });
    } catch (error) {
      console.error("Error analyzing alert:", error);
      res.status(500).json({ message: "Error analyzing alert" });
    }
  });
  
  apiRouter.post("/ai/correlate-alerts", isAuthenticated, async (req, res) => {
    try {
      const { alertIds, modelType } = req.body;
      
      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({ message: "At least one alert ID is required" });
      }
      
      // Obtener alertas
      const alertPromises = alertIds.map(id => storage.getAlert(parseInt(id)));
      const alerts = (await Promise.all(alertPromises)).filter(Boolean);
      
      if (alerts.length === 0) {
        return res.status(404).json({ message: "No valid alerts found" });
      }
      
      // Determinar el tipo de modelo a usar
      const preferredModel = modelType || AIModelType.AUTO;
      
      // Generar correlación
      const incident = await correlateAlertsAdvanced(alerts, preferredModel);
      
      if (!incident) {
        return res.status(200).json({ message: "No meaningful correlation found between the alerts" });
      }
      
      // Guardar el incidente generado
      const savedIncident = await storage.createIncident(incident);
      
      res.json({ success: true, incident: savedIncident });
    } catch (error) {
      console.error("Error correlating alerts:", error);
      res.status(500).json({ message: "Error correlating alerts" });
    }
  });
  
  apiRouter.post("/ai/analyze-logs", isAuthenticated, async (req, res) => {
    try {
      const { logs, context, modelType } = req.body;
      
      if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ message: "Logs array is required" });
      }
      
      // Determinar el tipo de modelo a usar
      const preferredModel = modelType || AIModelType.AUTO;
      
      // Analizar logs
      const insight = await analyzeLogPatterns(logs, context || {}, preferredModel);
      
      if (!insight) {
        return res.status(500).json({ message: "Failed to analyze logs" });
      }
      
      // Guardar el insight generado
      const savedInsight = await storage.createAiInsight(insight);
      
      res.json({ success: true, insight: savedInsight });
    } catch (error) {
      console.error("Error analyzing logs:", error);
      res.status(500).json({ message: "Error analyzing logs" });
    }
  });
  
  // Register all routes with /api prefix
  // Montar el router de funcionalidades avanzadas
  apiRouter.use("/advanced", advancedRouter);
  
  // Rutas para agentes - algunas no requieren autenticación para permitir comunicación de agentes remotos
  
  // Endpoint para registro de agentes
  apiRouter.post("/agents/register", async (req, res) => {
    try {
      const { registrationKey, hostname, ip, os, version, capabilities } = req.body;
      
      if (!registrationKey || !hostname || !os) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required parameters" 
        });
      }
      
      const result = await registerAgent(
        registrationKey, 
        hostname, 
        ip || req.ip, 
        os, 
        version || "unknown", 
        capabilities || []
      );
      
      if (result.success) {
        res.status(201).json({
          success: true,
          data: {
            agentId: result.agentId,
            token: result.token,
            config: result.config
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Error registering agent:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint para recibir datos de agentes
  apiRouter.post("/agents/data", async (req, res) => {
    try {
      // Obtener token de autenticación
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false, 
          message: "No authentication token provided" 
        });
      }
      
      const token = authHeader.substring(7); // Quitar 'Bearer '
      const events = req.body.events || [];
      
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "No events provided or invalid format" 
        });
      }
      
      const result = await processAgentData(token, events);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Processed ${events.length} events`
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Error processing agent data:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint para recibir heartbeats de agentes
  apiRouter.post("/agents/heartbeat", async (req, res) => {
    try {
      // Obtener token de autenticación
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false, 
          message: "No authentication token provided" 
        });
      }
      
      const token = authHeader.substring(7); // Quitar 'Bearer '
      const { status, metrics } = req.body;
      
      if (!status) {
        return res.status(400).json({ 
          success: false, 
          message: "Status is required" 
        });
      }
      
      const result = await processAgentHeartbeat(token, status, metrics);
      
      if (result.success) {
        res.json({
          success: true,
          config: result.config
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Error processing agent heartbeat:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint para generar claves de registro para agentes (requiere autenticación)
  apiRouter.post("/agents/registration-key", isAuthenticated, async (req, res) => {
    try {
      // Generar clave para el usuario autenticado
      const userId = req.user!.id;
      const registrationKey = await generateAgentRegistrationKey(userId);
      
      res.json({
        success: true,
        registrationKey,
        expiresIn: "24h"
      });
    } catch (error) {
      console.error("Error generating registration key:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint para construir paquete de agente para descarga (requiere autenticación)
  apiRouter.post("/agents/build", isAuthenticated, async (req, res) => {
    try {
      const { os, customName, capabilities } = req.body;
      
      if (!os) {
        return res.status(400).json({ 
          success: false, 
          message: "Operating system (os) is required" 
        });
      }
      
      // Generar clave de registro
      const userId = req.user!.id;
      const registrationKey = await generateAgentRegistrationKey(userId);
      
      // Construir la URL del servidor
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      
      // Construir el paquete
      const result = await buildAgentPackage(
        userId,
        os,
        serverUrl,
        registrationKey,
        customName,
        capabilities
      );
      
      if (result.success) {
        // Registrar el agente en la base de datos
        const agentName = customName || `Agent-${os}-${result.agentId}`;
        const hostname = agentName;
        const osFormatted = os.charAt(0).toUpperCase() + os.slice(1);
        
        // Crear configuración de capacidades basada en los valores recibidos
        const agentCapabilities = {
          fileSystemMonitoring: capabilities?.fileSystemMonitoring ?? true,
          processMonitoring: capabilities?.processMonitoring ?? true,
          networkMonitoring: capabilities?.networkMonitoring ?? true,
          registryMonitoring: os.toLowerCase() === 'windows' ? (capabilities?.registryMonitoring ?? false) : false,
          securityLogsMonitoring: capabilities?.securityLogsMonitoring ?? true,
          malwareScanning: capabilities?.malwareScanning ?? false,
          vulnerabilityScanning: capabilities?.vulnerabilityScanning ?? false
        };
        
        // Crear el agente en la base de datos
        const agent = await storage.createAgent({
          name: agentName,
          hostname: hostname,
          operatingSystem: osFormatted,
          status: 'inactive', // Inicialmente inactivo hasta primer heartbeat
          userId: userId,
          capabilities: agentCapabilities,
          agentIdentifier: result.agentId,
          configuration: {
            serverUrl,
            registrationKey,
            capabilities: agentCapabilities
          }
        });
        
        res.json({
          success: true,
          downloadUrl: result.downloadUrl,
          registrationKey,
          agentId: result.agentId,
          agent: agent // Incluir datos del agente en la respuesta
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Error building agent package:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint para listar agentes (requiere autenticación)
  apiRouter.get("/agents", isAuthenticated, async (req, res) => {
    try {
      const agents = await storage.listAgents();
      res.json(agents);
    } catch (error) {
      console.error("Error listing agents:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Plans routes
  apiRouter.get("/plans", isAuthenticated, async (req, res) => {
    try {
      const plans = await storage.listPlans();
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  apiRouter.get("/plans/:id", isAuthenticated, async (req, res) => {
    try {
      const plan = await storage.getPlan(parseInt(req.params.id));
      if (!plan) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      res.json(plan);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  // Organization-specific routes
  apiRouter.get("/organization/current", isAuthenticated, async (req, res) => {
    try {
      // Obtener el usuario actual y su organización
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(404).json({ message: "Organización no encontrada para este usuario" });
      }
      
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }
      
      res.json(organization);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  // Billing routes
  apiRouter.post("/billing/change-plan", isAuthenticated, async (req, res) => {
    try {
      // Validar los datos de la solicitud
      const schema = z.object({
        planId: z.number(),
        billingCycle: z.enum(['monthly', 'yearly']).optional()
      });
      
      const { planId, billingCycle } = schema.parse(req.body);
      
      // Obtener el ID de la organización del usuario actual
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(404).json({ message: "Organización no encontrada para este usuario" });
      }
      
      // Verificar que el plan solicitado existe
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      
      // Cambiar el plan
      const success = await StripeService.changePlan(
        user.organizationId, 
        planId, 
        billingCycle as 'monthly' | 'yearly'
      );
      
      if (success) {
        // Obtener la organización actualizada
        const organization = await storage.getOrganization(user.organizationId);
        res.json({ success: true, organization });
      } else {
        res.status(500).json({ 
          message: "Error al cambiar el plan. Verifique la configuración de Stripe."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos de solicitud inválidos", 
          errors: error.format() 
        });
      }
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  apiRouter.post("/billing/checkout", isAuthenticated, async (req, res) => {
    try {
      // Validar los datos de la solicitud
      const schema = z.object({
        planId: z.number(),
        billingCycle: z.enum(['monthly', 'yearly']),
        successUrl: z.string().url(),
        cancelUrl: z.string().url()
      });
      
      const { planId, billingCycle, successUrl, cancelUrl } = schema.parse(req.body);
      
      // Obtener el ID de la organización del usuario actual
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(404).json({ message: "Organización no encontrada para este usuario" });
      }
      
      // Verificar que el plan solicitado existe
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      
      // Generar enlace de checkout
      const checkoutUrl = await StripeService.createCheckoutSession(
        user.organizationId,
        planId,
        billingCycle as 'monthly' | 'yearly',
        successUrl,
        cancelUrl
      );
      
      if (checkoutUrl) {
        res.json({ url: checkoutUrl });
      } else {
        res.status(500).json({ 
          message: "Error al crear sesión de checkout. Verifique la configuración de Stripe."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos de solicitud inválidos", 
          errors: error.format() 
        });
      }
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  // Endpoint para crear una sesión de checkout con PaymentIntent
  apiRouter.post("/billing/checkout-session", isAuthenticated, async (req, res) => {
    try {
      // Validar los datos de la solicitud
      const schema = z.object({
        planId: z.number(),
        billingCycle: z.enum(['monthly', 'yearly']),
        returnUrl: z.string().url()
      });
      
      const { planId, billingCycle, returnUrl } = schema.parse(req.body);
      
      // Obtener el ID de la organización del usuario actual
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(404).json({ message: "Organización no encontrada para este usuario" });
      }
      
      // Verificar que el plan solicitado existe
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      
      // Obtener la organización
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organización no encontrada" });
      }
      
      // Determinar el precio según el ciclo de facturación
      const amount = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
      
      // Crear una sesión de checkout con Payment Intent
      try {
        const { clientSecret } = await createStripeCheckoutSession(
          planId,
          billingCycle === 'monthly' ? plan.stripePriceIdMonthly || '' : plan.stripePriceIdYearly || '',
          amount,
          organization.stripeCustomerId || undefined,
          {
            organizationId: user.organizationId.toString(),
            billingCycle,
            returnUrl
          }
        );
        
        res.json({ clientSecret });
      } catch (err) {
        console.error('Error creando sesión de checkout:', err);
        res.status(500).json({ 
          message: "Error al crear sesión de checkout con Stripe. Verifique la configuración."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos de solicitud inválidos", 
          errors: error.format() 
        });
      }
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  apiRouter.post("/billing/portal", isAuthenticated, async (req, res) => {
    try {
      // Validar los datos de la solicitud
      const schema = z.object({
        returnUrl: z.string().url()
      });
      
      const { returnUrl } = schema.parse(req.body);
      
      // Obtener el ID de la organización del usuario actual
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(404).json({ message: "Organización no encontrada para este usuario" });
      }
      
      // Generar enlace al portal de cliente
      const portalUrl = await StripeService.createCustomerPortalSession(
        user.organizationId,
        returnUrl
      );
      
      if (portalUrl) {
        res.json({ url: portalUrl });
      } else {
        res.status(500).json({ 
          message: "Error al crear sesión de portal de cliente. Verifique la configuración de Stripe."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos de solicitud inválidos", 
          errors: error.format() 
        });
      }
      res.status(500).json({ message: error instanceof Error ? error.message : "Error desconocido" });
    }
  });
  
  // Webhook de Stripe
  apiRouter.post("/webhook/stripe", async (req, res) => {
    try {
      // En producción, aquí se verificaría la firma del webhook
      // const signature = req.headers['stripe-signature'];
      
      // Procesar el evento
      await StripeService.handleWebhookEvent(req.body);
      
      res.status(200).end();
    } catch (error) {
      console.error('Error al procesar webhook de Stripe:', error);
      res.status(400).end();
    }
  });

  app.use("/api", apiRouter);

  // Ruta para descargar agentes generados
  app.get("/downloads/:filename", isAuthenticated, (req, res) => {
    try {
      const filename = req.params.filename;
      
      // Validación básica del nombre de archivo para prevenir directory traversal
      if (!filename.match(/^[a-zA-Z0-9_\-\.]+$/)) {
        return res.status(400).send("Invalid filename");
      }
      
      // Ruta completa al archivo
      const downloadPath = path.join(process.cwd(), 'public', 'downloads', filename);
      
      // Verificar que el archivo existe
      if (!fs.existsSync(downloadPath)) {
        return res.status(404).send("File not found");
      }
      
      // Establecer encabezados para la descarga
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      
      // Determinar tipo MIME basado en la extensión
      if (filename.endsWith('.zip')) {
        res.setHeader('Content-Type', 'application/zip');
      } else if (filename.endsWith('.tar.gz')) {
        res.setHeader('Content-Type', 'application/gzip');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      
      // Enviar el archivo
      res.sendFile(downloadPath);
      
      log(`Agent download: ${filename}`, 'downloads');
    } catch (error) {
      console.error('Error downloading agent:', error);
      res.status(500).send("Error downloading agent");
    }
  });

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
    } catch (error) {
      log(`Error en la actualización programada de datos: ${error instanceof Error ? error.message : 'error desconocido'}`, 'cron');
    }
  });
  
  // 2. Actualizar métricas del dashboard cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      log('Ejecutando actualización programada de métricas', 'cron');
      const result = await updateSystemMetrics();
      log(`Resultado de actualización de métricas: ${result.success ? 'Éxito' : 'Error'} - ${result.message}`, 'cron');
    } catch (error) {
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
      
    } catch (error) {
      log(`Error en la actualización inicial de datos: ${error instanceof Error ? error.message : 'error desconocido'}`, 'init');
    }
  }, 5000); // Esperar 5 segundos para que el servidor esté completamente iniciado

  return httpServer;
}
