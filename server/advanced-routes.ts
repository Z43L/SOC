import { Router } from "express";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { log } from "./vite";
import { advancedCorrelation } from "./integrations/advanced-correlation-algorithms";
import { structuredDataParser, DataFormat } from "./integrations/structured-data-parser";
import { TaxiiConnector, createTaxiiConnector } from "./integrations/taxii-connector";

// Middleware de autenticación
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};

// Crear router para endpoints avanzados
export const advancedRouter = Router();

// Endpoint for structured data parsing
advancedRouter.post("/parse-structured-data", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      data: z.string().min(10, "Data must be at least 10 characters"),
      format: z.string().optional(),
      useAI: z.boolean().optional()
    });
    
    const { data, format, useAI = false } = schema.parse(req.body);
    
    // Parsear usando el analizador estructurado
    const formatType = format ? 
      (DataFormat[format.toUpperCase() as keyof typeof DataFormat] || DataFormat.UNKNOWN) : 
      undefined;
    
    const result = await structuredDataParser.parse(data, {
      format: formatType,
      useAI
    });
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid parameters",
        errors: error.format()
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: `Error parsing structured data: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Advanced correlation algorithms endpoint
advancedRouter.post("/correlate", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      alertIds: z.array(z.number()).min(2, "At least 2 alert IDs are required"),
      options: z.object({
        timeWindowHours: z.number().optional(),
        confidenceThreshold: z.number().optional(),
        generateIncidents: z.boolean().optional(),
        maxIncidents: z.number().optional()
      }).optional()
    });
    
    const { alertIds, options = {} } = schema.parse(req.body);
    
    // Obtener alertas
    const alerts = [];
    for (const id of alertIds) {
      const alert = await storage.getAlert(id);
      if (alert) {
        alerts.push(alert);
      }
    }
    
    if (alerts.length < 2) {
      return res.status(400).json({ 
        success: false,
        message: "At least 2 valid alerts are required for correlation"
      });
    }
    
    // Obtener inteligencia de amenazas para contexto
    const threatIntel = await storage.listThreatIntel();
    
    // Realizar correlación avanzada
    const result = await advancedCorrelation.correlate(alerts, threatIntel);
    
    // Si se solicita, generar incidentes automáticamente
    const incidents = [];
    if (options.generateIncidents) {
      const maxIncidents = options.maxIncidents || 3;
      const incidentSuggestions = result.incidentSuggestions
        .sort((a, b) => (b.aiAnalysis?.confidence || 0) - (a.aiAnalysis?.confidence || 0))
        .slice(0, maxIncidents);
      
      for (const suggestion of incidentSuggestions) {
        try {
          const incident = await storage.createIncident(suggestion as any);
          if (incident) {
            incidents.push(incident);
          }
        } catch (error) {
          log(`Error creando incidente desde sugerencia: ${error instanceof Error ? error.message : String(error)}`, "advanced-correlation");
        }
      }
    }
    
    res.json({
      success: true,
      patterns: result.patterns,
      incidentSuggestions: result.incidentSuggestions,
      generatedIncidents: incidents,
      analysisTimestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid parameters",
        errors: error.format()
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: `Error performing advanced correlation: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Advanced incident generation from correlation
advancedRouter.post("/generate-incidents", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      timeWindowHours: z.number().optional(),
      maxIncidents: z.number().optional()
    });
    
    const { timeWindowHours = 24, maxIncidents = 5 } = schema.parse(req.body);
    
    // Ejecutar análisis y generación de incidentes
    const incidents = await advancedCorrelation.analyzeAndSuggestIncidents(timeWindowHours);
    
    // Limitar a la cantidad solicitada
    const limitedIncidents = incidents.slice(0, maxIncidents);
    
    res.json({
      success: true,
      message: `Generated ${limitedIncidents.length} incidents from correlation analysis`,
      incidents: limitedIncidents,
      analysisTimeWindowHours: timeWindowHours
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: `Error generating incidents: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// TAXII connector routes
const taxiiRouter = Router();
advancedRouter.use("/taxii", taxiiRouter);

// Test TAXII connection
taxiiRouter.post("/test-connection", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      apiRoot: z.string().url("API Root must be a valid URL"),
      collectionId: z.string(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      version: z.enum(['2.0', '2.1'])
    });
    
    const taxiiConfig = schema.parse(req.body);
    
    // Crear conector TAXII temporal para probar
    const taxiiConnector = createTaxiiConnector(taxiiConfig);
    
    // Intentar obtener información del servidor
    const serverInfo = await taxiiConnector.getServerInformation();
    
    // Intentar obtener colecciones
    const collections = await taxiiConnector.getCollections();
    
    // Comprobar si la colección especificada existe
    const collectionExists = collections.some(c => c.id === taxiiConfig.collectionId);
    
    if (!collectionExists) {
      return res.json({
        success: false,
        message: `Collection with ID ${taxiiConfig.collectionId} not found`,
        serverInfo,
        availableCollections: collections
      });
    }
    
    res.json({
      success: true,
      message: "TAXII connection successful",
      serverInfo,
      availableCollections: collections
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: `Error testing TAXII connection: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Import intelligence from TAXII
taxiiRouter.post("/import-intelligence", isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      connectorId: z.number(),
      options: z.object({
        limit: z.number().optional(),
        types: z.array(z.string()).optional(),
        since: z.string().optional(),
      }).optional()
    });
    
    const { connectorId, options = {} } = schema.parse(req.body);
    
    // Obtener el conector
    const connector = await storage.getConnector(connectorId);
    if (!connector) {
      return res.status(404).json({
        success: false,
        message: "Connector not found"
      });
    }
    
    // Verificar que es un conector TAXII
    if (connector.type !== 'taxii') {
      return res.status(400).json({
        success: false,
        message: "Connector is not a TAXII connector"
      });
    }
    
    // Crear conector TAXII
    const taxiiConnector = createTaxiiConnector(connector.configuration as any, connectorId);
    
    // Parsear fecha "desde" si se proporciona
    let sinceDate: Date | undefined = undefined;
    if (options.since) {
      try {
        sinceDate = new Date(options.since);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid 'since' date format"
        });
      }
    }
    
    // Importar inteligencia
    const importResult = await taxiiConnector.importIntelligence({
      limit: options.limit,
      types: options.types,
      since: sinceDate
    });
    
    // Actualizar estado del conector
    await storage.updateConnector(connectorId, {
      lastSuccessfulConnection: new Date(),
      lastData: `Imported ${importResult.imported} items with ${importResult.errors} errors`,
      status: importResult.success ? 'connected' : 'error'
    });
    
    res.json({
      success: importResult.success,
      message: importResult.message,
      imported: importResult.imported,
      errors: importResult.errors
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: `Error importing TAXII intelligence: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Get TAXII collections
taxiiRouter.get("/collections", isAuthenticated, async (req, res) => {
  try {
    const { apiRoot, version, username, password, apiKey } = req.query;
    
    if (!apiRoot || typeof apiRoot !== 'string') {
      return res.status(400).json({
        success: false,
        message: "API Root URL is required"
      });
    }
    
    if (!version || (version !== '2.0' && version !== '2.1')) {
      return res.status(400).json({
        success: false,
        message: "Valid TAXII version (2.0 or 2.1) is required"
      });
    }
    
    // Crear config TAXII
    const taxiiConfig = {
      apiRoot,
      version: version as '2.0' | '2.1',
      collectionId: 'default', // Valor temporal
      username: typeof username === 'string' ? username : undefined,
      password: typeof password === 'string' ? password : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined
    };
    
    // Crear conector TAXII temporal
    const taxiiConnector = createTaxiiConnector(taxiiConfig);
    
    // Obtener colecciones
    const collections = await taxiiConnector.getCollections();
    
    res.json({
      success: true,
      collections
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: `Error listing TAXII collections: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});