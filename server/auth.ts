import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { InsertOrganization, User as DbUser } from "@shared/schema";

// Extend Express.User with the shared User type
declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "soc-intelligence-session-secret",
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días para mayor duración
      secure: false, // Importante: false para desarrollo local sin HTTPS
      sameSite: 'lax',
      httpOnly: true,
      path: '/'
    },
    name: 'soc.sid' // Nombre explícito para la cookie
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Obtener el plan seleccionado si está presente
      const selectedPlan = req.body.selectedPlan || 'free';
      console.log('Plan seleccionado:', selectedPlan);
      
      // Buscar el plan en la base de datos
      const plans = await storage.listPlans();
      let plan = plans.find(p => p.name.toLowerCase() === selectedPlan.toLowerCase());
      
      // Si no se encuentra el plan, usamos el plan gratuito
      if (!plan) {
        plan = plans.find(p => p.name.toLowerCase() === 'free');
      }
      
      // Si no hay plan gratuito, creamos uno básico
      if (!plan) {
        plan = await storage.createPlan({
          name: "Free",
          description: "Plan gratuito con funcionalidades básicas",
          priceMonthly: 0,
          priceYearly: 0,
          features: JSON.stringify(["Alertas básicas", "1 Conector", "Dashboard básico"]),
          maxUsers: 2,
          maxAgents: 1,
          maxAlerts: 100,
          isActive: true
        });
      }
      
      // 2. Crear la organización para el nuevo usuario
      const organizationData: InsertOrganization = {
        name: req.body.organizationName || `${req.body.name}'s Organization`,
        planId: plan.id,
        subscriptionStatus: selectedPlan.toLowerCase() === 'free' ? 'active' : 'trial',
        email: req.body.email, // Campo de email para facturación
        contactName: req.body.name,
        contactEmail: req.body.email,
        settings: JSON.stringify({
          theme: "light",
          notifications: true,
          language: "es"
        })
      };
      
      // Eliminar campos que no están en InsertOrganization
      delete (organizationData as any).techContactName;
      delete (organizationData as any).techContactEmail;
      delete (organizationData as any).billingEmail;
      
      const newOrganization = await storage.createOrganization(organizationData);
      
      // 3. Crear el usuario asociado a la organización
      const userPayload = {
        ...req.body,
        password: await hashPassword(req.body.password),
        organizationId: newOrganization.id,
        role: req.body.role || 'Security Analyst'
      };
      const user = await storage.createUser(userPayload);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          user,
          organization: newOrganization
        });
      });
    } catch (error) {
      console.error("Error en registro:", error);
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    try {
      // Asignar explícitamente el usuario a la sesión
      (req.session as any).user = req.user;
      
      // Forzar el guardado de la sesión antes de responder
      req.session.save(async (err) => {
        if (err) {
          console.error("Error guardando la sesión:", err);
          return res.status(500).json({ error: 'Error de sesión', details: err.message });
        }
        
        // Obtener la organización del usuario
        if (!req.user || !req.user.organizationId) {
          return res.status(400).json({ error: 'User organization information missing' });
        }
        
        try {
          const organization = await storage.getOrganization(req.user.organizationId);
          
          // Incluir información del ID de sesión para depuración
          console.log(`Sesión creada con éxito: ${req.sessionID} para usuario ${req.user.username}`);
          
          return res.status(200).json({
            user: req.user,
            organization,
            sessionID: req.sessionID
          });
        } catch (orgError) {
          console.error("Error obteniendo organización:", orgError);
          return res.status(500).json({ error: 'Error obteniendo datos de organización' });
        }
      });
    } catch (error) {
      console.error("Error general en login:", error);
      return res.status(500).json({ error: 'Error de servidor en login' });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    // Verificación detallada de autenticación con diagnóstico
    console.log(`Sesión en /api/user: ${req.sessionID}, autenticado: ${req.isAuthenticated()}`);
    console.log(`Cookie de sesión presente: ${Boolean(req.headers.cookie)}`);
    
    if (!req.isAuthenticated()) {
      console.log("Usuario no autenticado en /api/user");
      return res.status(401).json({ 
        error: 'No autenticado',
        details: 'La sesión no está activa o ha expirado'
      });
    }
    
    console.log(`Usuario autenticado en /api/user: ${req.user.username} (ID: ${req.user.id})`);
    
    // Obtener la información de la organización asociada al usuario
    try {
      if (!req.user || !req.user.organizationId) {
        return res.status(400).json({ error: 'User organization information missing' });
      }
      
      const organization = await storage.getOrganization(req.user.organizationId);
      
      // Si se encuentra la organización, devolver usuario + organización
      if (organization) {
        return res.json({
          user: req.user,
          organization
        });
      }
      
      // Si no hay organización, solo devolver el usuario
      res.json({
        user: req.user,
        organization: null
      });
    } catch (error) {
      console.error("Error obteniendo datos de organización:", error);
      res.json({
        user: req.user,
        organization: null
      });
    }
  });
}

// Authentication middleware
export const checkAuth: import("express").RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};