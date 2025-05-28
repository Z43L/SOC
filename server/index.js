import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import express from "express";
import cors from 'cors';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import http from 'http';
import { initWebSocket } from './socket';
import { processAlerts } from './integrations/alertWorker';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
// SOAR imports
import { PlaybookExecutor } from './src/services/playbookExecutor';
import { startAnalyticsRollupWorker } from './src/services/analyticsRollupWorker';
const app = express();
// Allow cross-origin requests from frontend and include credentials
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse = undefined;
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (path.startsWith("/api")) {
            let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
            if (capturedJsonResponse) {
                logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
            }
            if (logLine.length > 80) {
                logLine = logLine.slice(0, 79) + "…";
            }
            log(logLine);
        }
    });
    next();
});
(async () => {
    // Seed database with sample data, including test user
    // await initializeDatabase();
    // Create HTTP server for Socket.io
    const httpServer = http.createServer(app);
    // Setup routes and middleware
    await registerRoutes(app);
    // Initialize WebSocket on HTTP server
    initWebSocket(httpServer);
    
    // Initialize SOAR WebSocket service
    try {
        const { initializeWebSocket } = await import('./src/services/SoarWebSocketService.js');
        const soarWebSocket = initializeWebSocket(httpServer);
        console.log('[Server] SOAR WebSocket service initialized successfully');
    } catch (error) {
        console.error('[Server] Failed to initialize SOAR WebSocket service:', error);
    }
    app.use((err, _req, res, _next) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
        throw err;
    });
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
        await setupVite(app, httpServer);
    }
    else {
        serveStatic(app);
    }
    // ALWAYS serve the app on port 5000
    const port = 5000;
    httpServer.listen({
        port,
        host: "0.0.0.0",
        reusePort: true,
    }, async () => {
        log(`serving on port ${port}`);
        // Start the enrichment worker immediately
        processAlerts().catch(err => console.error('Error processing alerts:', err));
        // Start analytics rollup worker
        startAnalyticsRollupWorker();
        // Schedule periodic enrichment
        try {
            const enrichersPath = path.join(process.cwd(), 'server', 'enrichers.yaml');
            const enrichersYaml = fs.readFileSync(enrichersPath, 'utf8');
            const enrichersConfig = yaml.load(enrichersYaml);
            const pollInterval = enrichersConfig?.pollInterval || 60000;
            setInterval(() => {
                processAlerts().catch(err => console.error('Error processing alerts:', err));
            }, pollInterval);
        }
        catch (error) {
            console.error('Error reading enrichers config, using default interval:', error);
            setInterval(() => {
                processAlerts().catch(err => console.error('Error processing alerts:', err));
            }, 60000);
        }
        // Initialize and start all data connectors
        // TODO: Uncomment when connectors are properly configured
        /*
        try {
          const { initConnectors } = await import('./src/connectors');
          await initConnectors();
          log('All connectors initialized and started');
        } catch (err) {
          console.error('Failed to initialize connectors', err);
        }
        */
        // Initialize SOAR PlaybookExecutor
        try {
            const playbookExecutor = new PlaybookExecutor();
            log('SOAR PlaybookExecutor initialized and started');
        }
        catch (err) {
            console.error('Failed to initialize SOAR PlaybookExecutor', err);
        }
        // Initialize AI Alert Listener
        try {
            const { initAiAlertListener } = await import('./integrations/ai-alert-listener');
            initAiAlertListener();
            log('AI Alert Listener initialized and subscribed to events');
        }
        catch (err) {
            console.error('Failed to initialize AI Alert Listener', err);
        }
        // Initialize PlaybookTriggerEngine for automatic SOAR
        try {
            const { playbookTriggerEngine } = await import('./src/services/PlaybookTriggerEngine');
            log('PlaybookTriggerEngine initialized and listening for events');
        }
        catch (err) {
            console.error('Failed to initialize PlaybookTriggerEngine', err);
        }
    });
})();
