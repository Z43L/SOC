import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { 
  users, type InsertUser,
  alerts, type InsertAlert,
  incidents, type InsertIncident,
  threatIntel, type InsertThreatIntel,
  aiInsights, type InsertAiInsight, 
  metrics, type InsertMetric
} from "@shared/schema";
import { storage } from "./storage";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function initializeDatabase() {
  console.log("Initializing database with sample data...");
  
  try {
    // Ensure there is a plan for the test organization
    let plansList = await storage.listPlans();
    let defaultPlan = plansList.find(p => p.name.toLowerCase() === 'free');
    if (!defaultPlan) {
      defaultPlan = await storage.createPlan({
        name: "Free",
        description: "Default free plan",
        priceMonthly: 0,
        priceYearly: 0,
        features: JSON.stringify([]),
        maxUsers: 10,
        maxAgents: 5,
        maxAlerts: 100,
        isActive: true
      });
    }
    // Create a test organization
    const orgName = 'Test Organization';
    let testOrg = (await storage.listOrganizations()).find(o => o.name === orgName);
    if (!testOrg) {
      testOrg = await storage.createOrganization({
        name: orgName,
        planId: defaultPlan.id,
        subscriptionStatus: 'active',
        email: 'test-org@example.com',
        contactName: 'Test Org',
        contactEmail: 'test-org@example.com',
        settings: JSON.stringify({ theme: 'light' })
      });
    }
    
    // Crear un usuario de prueba
    const testUser: InsertUser = {
      name: "Z43L",
      username: "Z43L", 
      password: await hashPassword("password123"),
      email: "z43l@example.com",
      role: "Administrator",
      organizationId: testOrg.id
    };
    
    // Comprobar si el usuario ya existe
    const existingUser = await storage.getUserByUsername(testUser.username);
    if (!existingUser) {
      await storage.createUser(testUser);
      console.log("Sample user created");
    } else {
      console.log("Sample user already exists");
    }
    
    // NO Crear métricas de ejemplo
    // const sampleMetrics: InsertMetric[] = [
    //   { name: 'Active Alerts', value: 18, trend: 'up', changePercentage: 15 },
    //   { name: 'Open Incidents', value: 5, trend: 'stable', changePercentage: 0 },
    //   { name: 'Global Risk Score', value: 68, trend: 'down', changePercentage: 12 },
    //   { name: 'Assets at Risk', value: 12, trend: 'up', changePercentage: 8 },
    //   { name: 'MTTD', value: 32, trend: 'down', changePercentage: 22 },
    //   { name: 'MTTR', value: 4, trend: 'down', changePercentage: 15 },
    //   { name: 'Compliance Score', value: 81, trend: 'up', changePercentage: 3 },
    //   { name: 'Connector Health', value: 92, trend: 'stable', changePercentage: 0 }
    // ];
    
    // Comprobar si ya hay métricas
    const existingMetrics = await storage.listMetrics();
    if (existingMetrics.length === 0) {
    //   for (const metric of sampleMetrics) {
    //     await storage.createMetric(metric);
    //   }
      console.log("No sample metrics created, will rely on real data.");
    } else {
      console.log("Metrics already exist, skipping creation of samples.");
    }
    
    // NO Crear alertas de ejemplo
    // const sampleAlerts: InsertAlert[] = [
    //   {
    //     title: 'Ransomware Behavior Detected',
    //     description: 'Multiple file encryption attempts from endpoint WIN-SRV-04',
    //     severity: 'critical',
    //     source: 'Endpoint Security',
    //     sourceIp: '192.168.1.104',
    //     status: 'new',
    //     metadata: { detectionEngine: 'AI', detectionTime: new Date().toISOString() }
    //   },
    //   {
    //     title: 'Brute Force Attack',
    //     description: 'Multiple failed login attempts to admin console',
    //     severity: 'high',
    //     source: 'SIEM',
    //     sourceIp: '203.0.113.45',
    //     status: 'in_progress',
    //     assignedTo: 1,
    //     metadata: { attempts: 58, lastAttempt: new Date().toISOString() }
    //   }
    // ];
    
    // Comprobar si ya hay alertas
    const existingAlerts = await storage.listAlerts();
    if (existingAlerts.length === 0) {
    //   for (const alert of sampleAlerts) {
    //     await storage.createAlert(alert);
    //   }
      console.log("No sample alerts created, will rely on real data.");
    } else {
      console.log("Alerts already exist, skipping creation of samples.");
    }
    
    // NO Crear insights AI de ejemplo
    // const sampleInsights: InsertAiInsight[] = [
    //   {
    //     title: 'Potential Data Exfiltration',
    //     description: 'Unusual outbound traffic patterns detected from host 192.168.2.45',
    //     type: 'detection',
    //     severity: 'high',
    //     confidence: 85,
    //     status: 'new',
    //     relatedEntities: { 
    //       hosts: ['192.168.2.45'], 
    //       ports: [443, 8080], 
    //       destinations: ['203.0.113.12'] 
    //     }
    //   }
    // ];
    
    // Comprobar si ya hay insights
    const existingInsights = await storage.listAiInsights();
    if (existingInsights.length === 0) {
    //   for (const insight of sampleInsights) {
    //     await storage.createAiInsight(insight);
    //   }
      console.log("No sample AI insights created, will rely on real data.");
    } else {
      console.log("AI insights already exist, skipping creation of samples.");
    }
    
    // NO Crear intel de amenazas de ejemplo
    // const sampleThreatIntel: InsertThreatIntel[] = [
    //   {
    //     type: 'apt',
    //     title: 'New APT Campaign Targeting Financial Sector',
    //     description: 'Multiple C2 servers linked to known threat actor observed in recent attacks.',
    //     source: 'Threat Intelligence Feed',
    //     severity: 'critical',
    //     confidence: 92,
    //     iocs: { 
    //       ips: ['185.142.236.100', '198.51.100.23'], 
    //       domains: ['analytics-metrics.com', 'cloud-service-update.net'], 
    //       hashes: ['7ad32a5f1f9e9d10e67678fe8b0ce92178df43f88ce4b16692035798be541'] 
    //     },
    //     relevance: 'high'
    //   }
    // ];
    
    // Comprobar si ya hay threat intel
    const existingThreatIntel = await storage.listThreatIntel();
    if (existingThreatIntel.length === 0) {
    //   for (const intel of sampleThreatIntel) {
    //     await storage.createThreatIntel(intel);
    //   }
      console.log("No sample threat intelligence created, will rely on real data.");
    } else {
      console.log("Threat intelligence data already exists, skipping creation of samples.");
    }
    
    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Ejecutar el script de inicialización
initializeDatabase().then(() => {
  console.log("Database setup finished");
  // No cerramos la conexión porque es compartida con la aplicación
});

export { initializeDatabase };