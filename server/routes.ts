import { Router, json, urlencoded } from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { User } from "@shared/schema"; // Import User type
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
  // Parse JSON and URL-encoded bodies for all routes
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Set up authentication
  setupAuth(app);

  // Public agent endpoints at root (bypass /api prefix)
  app.post('/agents/register', async (req, res) => {
    try {
      const { registrationKey, hostname, ip, os, version, capabilities } = req.body;
      const result = await registerAgent(registrationKey, hostname, ip, os, version, capabilities);
      res.json(result);
    } catch (error: any) {
      console.error('Error registering agent:', error);
      res.status(500).json({ success: false, message: error.message || 'Error registering agent' });
    }
  });
  app.post('/agents/data', async (req, res) => {
    try {
      const { token, events } = req.body;
      const result = await processAgentData(token, events);
      res.json(result);
    } catch (error: any) {
      console.error('Error processing agent data:', error);
      res.status(500).json({ success: false, message: error.message || 'Error processing agent data' });
    }
  });
  app.post('/agents/heartbeat', async (req, res) => {
    try {
      const { token, status, metrics } = req.body;
      const result = await processAgentHeartbeat(token, status, metrics);
      res.json(result);
    } catch (error: any) {
      console.error('Error processing agent heartbeat:', error);
      res.status(500).json({ success: false, message: error.message || 'Error processing agent heartbeat' });
    }
  });

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
  
  // Authentication middleware using passport
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  };

  // Middleware to get current organization from authenticated user
  const getCurrentOrganization = async (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      const user = req.user as User;
      if (user.organizationId) {
        const organization = await storage.getOrganization(user.organizationId);
        if (organization) {
          (req as any).organization = organization;
          return next();
        }
      }
    }
    return res.status(403).json({ message: "Forbidden: Organization not found or user not associated." });
  };
  
  // Public Agent endpoints under /api (no session auth)
  apiRouter.post('/agents/register', async (req, res) => {
    try {
      const { registrationKey, hostname, ip, os, version, capabilities } = req.body;
      const result = await registerAgent(registrationKey, hostname, ip, os, version, capabilities);
      res.json(result);
    } catch (error: any) {
      console.error('Error registering agent:', error);
      res.status(500).json({ success: false, message: error.message || 'Error registering agent' });
    }
  });
  apiRouter.post('/agents/data', async (req, res) => {
    try {
      const { token, events } = req.body;
      const result = await processAgentData(token, events);
      res.json(result);
    } catch (error: any) {
      console.error('Error processing agent data:', error);
      res.status(500).json({ success: false, message: error.message || 'Error processing agent data' });
    }
  });
  apiRouter.post('/agents/heartbeat', async (req, res) => {
    try {
      const { token, status, metrics } = req.body;
      const result = await processAgentHeartbeat(token, status, metrics);
      res.json(result);
    } catch (error: any) {
      console.error('Error processing agent heartbeat:', error);
      res.status(500).json({ success: false, message: error.message || 'Error processing agent heartbeat' });
    }
  });

  // Health check endpoint - no auth required
  apiRouter.get("/health", (req, res) => {
    res.json({ status: "healthy" });
  });
  
  // User routes - require auth
  apiRouter.get("/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.listUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Error fetching users" });
    }
  });
  
  apiRouter.get("/users/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(parseInt(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Error fetching user" });
    }
  });
  
  // Metrics routes
  apiRouter.get("/metrics", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const metrics = await storage.listMetrics(organization.id);
      res.json(metrics);
    } catch (error: any) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ message: error.message || "Error fetching metrics" });
    }
  });
  
  apiRouter.post("/metrics", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const newMetric = await storage.createMetric({ ...req.body, organizationId: organization.id });
      res.status(201).json(newMetric);
    } catch (error: any) {
      console.error("Error creating metric:", error);
      res.status(500).json({ message: error.message || "Error creating metric" });
    }
  });
  
  // Calculate and update SOC metrics based on current system state
  apiRouter.post("/metrics/calculate", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const result = await updateSystemMetrics(organization.id); 
      res.json(result);
    } catch (error: any) {
      console.error("Error calculating metrics:", error);
      res.status(500).json({ message: error.message || "Error calculating metrics" });
    }
  });
  
  // Alert routes
  apiRouter.get("/alerts", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const alerts = await storage.listAlerts(undefined, organization.id);
      res.json(alerts);
    } catch (error: any) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: error.message || "Error fetching alerts" });
    }
  });
  
  apiRouter.post("/alerts", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const newAlert = await storage.createAlert({ ...req.body, organizationId: organization.id });
      // Corrected method name to enqueueAlertAnalysis from aiQueue
      if (isOpenAIConfigured()) { 
        const alertForAI = await storage.getAlert(newAlert.id); 
        if (alertForAI) {
            // Pass organizationId as the third argument to enqueueAlertAnalysis if needed by its signature
            // For now, assuming it only needs the alert object and optionally a model preference.
            // If enqueueAlertAnalysis is updated to be org-aware, this call will need adjustment.
            aiQueue.enqueueAlertAnalysis(alertForAI); 
        } else {
            log(`Could not find alert with id ${newAlert.id} for AI processing`, 'routes');
        }
      }
      res.status(201).json(newAlert);
    } catch (error: any) { 
      console.error("Error creating alert:", error);
      res.status(500).json({ message: error.message || "Error creating alert" });
    }
  });
  
  apiRouter.get("/alerts/:id", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const alert = await storage.getAlert(parseInt(req.params.id), organization.id);
      if (alert) {
        res.json(alert);
      } else {
        res.status(404).json({ message: "Alert not found or not part of your organization" });
      }
    } catch (error: any) {
      console.error("Error fetching alert:", error);
      res.status(500).json({ message: error.message || "Error fetching alert" });
    }
  });
  
  apiRouter.patch("/alerts/:id", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Organization not found for user." });
      }
      const updatedAlert = await storage.updateAlert(parseInt(req.params.id), req.body, organization.id);
      if (updatedAlert) {
        res.json(updatedAlert);
      } else {
        res.status(404).json({ message: "Alert not found or not part of your organization" });
      }
    } catch (error: any) {
      console.error("Error updating alert:", error);
      res.status(500).json({ message: error.message || "Error updating alert" });
    }
  });

  // Agent routes (protected)
  apiRouter.get('/agents', isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: 'Forbidden: Organization context is missing.' });
      }
      const agents = await storage.listAgents(organization.id);
      res.json(agents);
    } catch (error: any) {
      console.error('Error fetching agents:', error);
      res.status(500).json({ message: error.message || 'Error fetching agents' });
    }
  });

  // Protected build endpoint for agents
  apiRouter.post("/agents/build", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const user = req.user as User;
      const { os, customName, capabilities } = req.body;

      // Construct serverUrl from request
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      
      // Generate a registration key
      const registrationKey = await generateAgentRegistrationKey(user.id);

      const result = await buildAgentPackage(
        user.id,
        os,
        serverUrl,
        registrationKey, // Now passing the resolved string
        customName,
        capabilities
      );

      if (result.success) {
        res.json({ 
          success: true, 
          downloadUrl: result.downloadUrl, 
          // It's good practice to also return the key if the client needs it for display or other purposes,
          // but ensure it's handled securely on the client-side if sensitive.
          registrationKey 
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error: any) {
      console.error("Error building agent package:", error);
      res.status(500).json({ success: false, message: error.message || "Error building agent package" });
    }
  });

  // Dashboard route
  apiRouter.get("/dashboard", isAuthenticated, getCurrentOrganization, async (req, res) => {
    try {
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(403).json({ message: "Forbidden: Organization context is missing." });
      }

      const dashboardMetrics = await storage.listMetrics(organization.id);
      const dashboardRecentAlerts = await storage.listAlerts(10, organization.id); 
      const dashboardAiInsights = await storage.listAiInsights(5, organization.id); 
      const dashboardThreatIntel = await storage.listThreatIntel(5, organization.id); 
      
      const alertsByDay = await storage.getAlertsCountByDay(organization.id, 30);
      const mitreTactics = await storage.getMitreTacticsDistribution(organization.id);
      const compliance: any[] = []; // Placeholder for compliance data

      res.json({
        metrics: dashboardMetrics,
        recentAlerts: dashboardRecentAlerts,
        aiInsights: dashboardAiInsights,
        threatIntel: dashboardThreatIntel,
        alertsByDay,
        mitreTactics,
        compliance,
      });

    } catch (error: any) {
      log(`Error fetching dashboard data: ${error.message}`, 'dashboard-route');
      res.status(500).json({ message: error.message || "Error fetching dashboard data" });
    }
  });

  // Mount the API router
  app.use("/api", apiRouter);

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
      
      const updateResult = await updateAllData();
      log(`Resultado de actualización inicial: ${updateResult.success ? 'Éxito' : 'Error'} - ${updateResult.message}`, 'init');
      
      const metricsResult = await updateSystemMetrics(); 
      log(`Resultado de actualización inicial de métricas: ${metricsResult.success ? 'Éxito' : 'Error'} - ${metricsResult.message}`, 'init');
      
    } catch (error) {
      log(`Error en la actualización inicial de datos: ${error instanceof Error ? error.message : 'error desconocido'}`, 'init');
    }
  }, 5000); // Esperar 5 segundos para que el servidor esté completamente iniciado

  return httpServer;
}
