import { Router } from "express";
import { stripeService } from "./stripe-service";
import { storage } from "../../storage";
import { z } from "zod";
import Stripe from "stripe";
import { log } from "../../vite";
const router = Router();
// Middleware para deshabilitar el caché en todas las rutas de facturación
const disableCache = (req, res, next) => {
    // Esta función asegura que todas las respuestas son únicas y no serán cacheadas
    // 1. Limpiar cualquier cabecera de caché que pueda estar presente
    res.removeHeader('ETag');
    res.removeHeader('Last-Modified');
    res.removeHeader('If-Modified-Since');
    res.removeHeader('If-None-Match');
    res.removeHeader('Cache-Control');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    // 2. Establecer cabeceras para prevenir caché en todos los niveles
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    // 3. Establecer cabeceras para forzar validación
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Vary', '*');
    // 4. Agregar cabeceras de unicidad
    const timestamp = Date.now().toString();
    const uuid = require('crypto').randomUUID ? require('crypto').randomUUID() : Math.random().toString(36).substring(2);
    res.setHeader('X-Response-ID', `${timestamp}-${uuid}`);
    res.setHeader('X-Response-Time', timestamp);
    // 5. Establecer un valor de ETag único para cada solicitud
    res.setHeader('ETag', `"${timestamp}-${uuid}"`);
    next();
};
// Middleware mejorado para verificar autenticación con mayor robustez
const isAuthenticated = (req, res, next) => {
    // Verificación básica de autenticación
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    // Verificación alternativa si el método principal falla
    if (req.user && req.user.id) {
        log("Usando verificación alternativa de autenticación", 'stripe-routes');
        return next();
    }
    // Si hay una cookie de sesión pero la autenticación falla, intentar recuperar la sesión
    if (req.headers.cookie && req.headers.cookie.includes('connect.sid')) {
        log("Detectada cookie de sesión pero usuario no autenticado", 'stripe-routes');
    }
    log("Acceso no autorizado a ruta de facturación", 'stripe-routes');
    return res.status(401).json({
        success: false,
        message: "No autenticado",
        code: "AUTH_REQUIRED",
        redirectTo: "/auth"
    });
};
// Aplicar middleware de caché a todas las rutas
router.use(disableCache);
// Log de depuración para todas las rutas
router.use((req, res, next) => {
    log(`Acceso a ruta de facturación: ${req.method} ${req.path}`, 'stripe-routes');
    next();
});
// Generador de ID único para respuestas
const generateResponseId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
};
// Obtener todos los planes disponibles
router.get("/plans", isAuthenticated, disableCache, async (req, res) => {
    try {
        log(`Solicitando planes para usuario: ${req.user?.id || 'desconocido'}`, 'stripe-routes');
        // Generar un identificador único para esta solicitud
        const requestId = generateResponseId();
        log(`ID de solicitud de planes: ${requestId}`, 'stripe-routes');
        // Obtener planes desde el almacenamiento - CORREGIDO: usamos listPlans() en lugar de getPlans()
        const plans = await storage.listPlans();
        log(`Planes recuperados: ${plans ? plans.length : 0}`, 'stripe-routes');
        if (!plans || !Array.isArray(plans)) {
            // Si no hay planes o la respuesta no es un array, devolver un array vacío
            log(`No se encontraron planes o formato incorrecto, devolviendo array vacío`, 'stripe-routes');
            return res.json({
                success: true,
                data: [],
                plans: [],
                _requestId: requestId,
                timestamp: Date.now(),
                nonce: Math.random().toString(36).substring(2)
            });
        }
        // Validar y formatear cada plan para asegurar consistencia
        const formattedPlans = plans.map(plan => ({
            id: plan.id,
            name: plan.name || 'Plan sin nombre',
            description: plan.description || 'Sin descripción',
            priceMonthly: plan.priceMonthly || 0,
            priceYearly: plan.priceYearly || 0,
            features: Array.isArray(plan.features) ? plan.features : [],
            limits: {
                users: plan.maxUsers || -1,
                agents: plan.maxAgents || -1,
                alertsPerMonth: plan.maxAlerts || -1
            },
            isPopular: Boolean(plan.name && plan.name.includes('Pro')),
            stripePriceIdMonthly: plan.stripePriceIdMonthly || null,
            stripePriceIdYearly: plan.stripePriceIdYearly || null
        }));
        // Devolver respuesta con estructura consistente y tokens de unicidad
        res.json({
            success: true,
            data: formattedPlans,
            plans: formattedPlans,
            _requestId: requestId,
            timestamp: Date.now(),
            nonce: Math.random().toString(36).substring(2)
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        log(`Error obteniendo planes: ${errorMessage}`, 'stripe-routes');
        console.error("Error fetching plans:", error);
        // Proporcionar datos de fallback en lugar de respuesta de error
        // Esto evita mostrar errores en la interfaz de usuario
        try {
            const fallbackPlans = [];
            // Intenta obtener al menos el plan gratuito
            try {
                const freePlan = await storage.getPlan(1);
                if (freePlan) {
                    fallbackPlans.push({
                        id: freePlan.id,
                        name: freePlan.name || 'Plan Gratuito',
                        description: freePlan.description || 'Plan básico gratuito',
                        priceMonthly: 0,
                        priceYearly: 0,
                        features: freePlan.features || ["Características básicas"]
                    });
                }
            }
            catch (innerError) {
                log(`Error obteniendo plan gratuito: ${innerError instanceof Error ? innerError.message : 'Error desconocido'}`, 'stripe-routes');
            }
            // Si no pudimos obtener ningún plan, crear uno simulado
            if (fallbackPlans.length === 0) {
                fallbackPlans.push({
                    id: 1,
                    name: 'Plan Gratuito',
                    description: 'Plan básico gratuito',
                    priceMonthly: 0,
                    priceYearly: 0,
                    features: ["Características básicas"]
                });
            }
            res.json({
                success: true,
                data: fallbackPlans,
                plans: fallbackPlans,
                timestamp: Date.now(),
                _requestId: generateResponseId(),
                _isFallback: true,
                message: "Mostrando planes básicos debido a un error temporal."
            });
        }
        catch (fallbackError) {
            // Si falla el fallback, entonces enviamos el error original
            res.status(500).json({
                success: false,
                message: "Error al obtener planes",
                details: errorMessage,
                timestamp: Date.now(),
                errorId: generateResponseId()
            });
        }
    }
});
// Obtener la suscripción actual del usuario
router.get("/subscription", isAuthenticated, disableCache, async (req, res) => {
    try {
        log(`Solicitando suscripción para usuario: ${req.user?.id || 'desconocido'}`, 'stripe-routes');
        // Generar ID de solicitud único para logging
        const requestId = generateResponseId();
        log(`ID de solicitud de suscripción: ${requestId}`, 'stripe-routes');
        if (!req.user || !req.user.id) {
            log('Usuario no identificado en solicitud de suscripción', 'stripe-routes');
            return res.status(401).json({
                success: false,
                error: "Usuario no autenticado",
                timestamp: new Date().toISOString(),
                _requestId: requestId
            });
        }
        const userId = req.user.id;
        log(`Obteniendo suscripción para usuario ${userId}`, 'stripe-routes');
        // Intentar obtener la suscripción del usuario (sin reintentos en bucle)
        try {
            const subscription = await stripeService.getUserSubscription(userId);
            if (!subscription) {
                log(`No se encontró suscripción para usuario ${userId}, generando datos de fallback`, 'stripe-routes');
                throw new Error("No se encontró información de suscripción");
            }
            // Normalizar el formato de la suscripción para asegurar consistencia
            const formattedSubscription = {
                id: subscription.id,
                status: subscription.status || 'inactive',
                currentPeriodEnd: subscription.currentPeriodEnd || new Date(),
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
                planId: subscription.planId || null,
                plan: subscription.plan || null
            };
            // Asegurar respuesta única cada vez añadiendo un timestamp dinámico
            return res.json({
                success: true,
                data: formattedSubscription,
                _requestId: requestId,
                _responseId: generateResponseId(),
                timestamp: new Date().toISOString()
            });
        }
        catch (subscriptionError) {
            // En caso de error, generamos datos de fallback inmediatamente
            log(`Error obteniendo suscripción: ${subscriptionError instanceof Error ? subscriptionError.message : 'Error desconocido'}`, 'stripe-routes');
            throw subscriptionError; // Re-lanzar para que sea manejado por el catch exterior
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        log(`Error en la solicitud de suscripción: ${message}`, 'stripe-routes');
        // Proporcionar datos de fallback en caso de error
        try {
            const requestId = generateResponseId();
            // Obtener el plan gratuito como fallback
            let defaultPlan = null;
            try {
                defaultPlan = await storage.getPlan(1);
            }
            catch (planError) {
                log(`Error obteniendo plan fallback: ${planError instanceof Error ? planError.message : 'Error desconocido'}`, 'stripe-routes');
            }
            // Si no pudimos obtener el plan, crear uno simulado
            if (!defaultPlan) {
                defaultPlan = {
                    id: 1,
                    name: 'Plan Gratuito',
                    description: 'Plan básico sin costo',
                    priceMonthly: 0,
                    priceYearly: 0,
                    features: ["Características básicas"]
                };
            }
            // Obtener planes disponibles si es posible
            let availablePlans = [];
            try {
                const plans = await storage.listPlans();
                if (plans && Array.isArray(plans) && plans.length > 0) {
                    availablePlans = plans;
                }
            }
            catch (plansError) {
                log(`Error obteniendo planes disponibles: ${plansError instanceof Error ? plansError.message : 'Error desconocido'}`, 'stripe-routes');
            }
            // Asegurar que tengamos al menos un plan disponible (el gratuito)
            if (availablePlans.length === 0) {
                availablePlans.push(defaultPlan);
            }
            // Devolver respuesta exitosa con datos de fallback
            return res.status(200).json({
                success: true,
                data: {
                    id: null,
                    status: 'inactive',
                    currentPeriodEnd: new Date(),
                    cancelAtPeriodEnd: false,
                    planId: 1,
                    plan: defaultPlan
                },
                showSubscriptionOptions: true,
                availablePlans: availablePlans,
                _requestId: requestId,
                _responseId: generateResponseId(),
                timestamp: new Date().toISOString(),
                message: "Mostrando información básica debido a un error temporal.",
                _isFallback: true
            });
        }
        catch (fallbackError) {
            // Si falla el fallback, enviamos una respuesta genérica
            // Esto debería suceder muy raramente
            return res.status(200).json({
                success: true,
                data: {
                    id: null,
                    status: 'inactive',
                    currentPeriodEnd: new Date(),
                    cancelAtPeriodEnd: false,
                    planId: 1,
                    plan: {
                        id: 1,
                        name: 'Plan Básico',
                        description: 'Plan básico por defecto',
                        priceMonthly: 0,
                        priceYearly: 0
                    }
                },
                showSubscriptionOptions: true,
                _responseId: generateResponseId(),
                timestamp: new Date().toISOString(),
                message: "Información de facturación no disponible temporalmente."
            });
        }
    }
});
// Crear una sesión de checkout para un nuevo plan
router.post("/create-checkout-session", isAuthenticated, async (req, res) => {
    try {
        // Validar los datos recibidos
        const schema = z.object({
            planId: z.number(),
            isYearly: z.boolean().default(false)
        });
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: "Datos inválidos",
                details: result.error.format()
            });
        }
        // @ts-ignore - req.user existe por Passport
        const userId = req.user?.id;
        // @ts-ignore - req.user existe por Passport
        const email = req.user?.email;
        if (!userId || !email) {
            return res.status(401).json({
                success: false,
                error: "Usuario no autenticado o sin email"
            });
        }
        const { planId, isYearly } = result.data;
        const session = await stripeService.createCheckoutSession(userId, email, planId, isYearly);
        res.json({
            success: true,
            url: session.url,
            sessionId: session.id
        });
    }
    catch (error) {
        log(`Error creando sesión de checkout: ${error.message}`, 'stripe-routes');
        res.status(500).json({
            success: false,
            error: "Error al crear la sesión de checkout"
        });
    }
});
// Crear una sesión de portal de cliente para gestionar suscripción
router.post("/create-billing-portal-session", isAuthenticated, async (req, res) => {
    try {
        // @ts-ignore - req.user existe por Passport
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Usuario no autenticado"
            });
        }
        const session = await stripeService.createBillingPortalSession(userId);
        res.json({
            success: true,
            url: session.url
        });
    }
    catch (error) {
        log(`Error creando sesión de portal: ${error.message}`, 'stripe-routes');
        res.status(500).json({
            success: false,
            error: "Error al crear la sesión del portal de facturación"
        });
    }
});
// Webhook para eventos de Stripe
router.post("/webhook", disableCache, async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // Establecer encabezados adicionales para prevenir caché específicamente en webhooks
    res.setHeader('X-Webhook-Timestamp', Date.now().toString());
    res.setHeader('X-No-Cache', Math.random().toString(36).substring(2));
    if (!endpointSecret) {
        log("STRIPE_WEBHOOK_SECRET no está configurado", 'stripe-routes');
        return res.status(500).send('Webhook secret not configured');
    }
    let event;
    try {
        // Validar la firma del webhook
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: '2023-10-16',
        });
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    }
    catch (err) {
        log(`Error validando firma de webhook: ${err.message}`, 'stripe-routes');
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Procesar el evento
    try {
        await stripeService.handleWebhookEvent(event);
        // Respuesta con propiedades únicas para prevenir caché
        res.json({
            received: true,
            timestamp: Date.now(),
            requestId: `webhook-${Date.now()}-${Math.random().toString(36).substring(2)}`,
            processedAt: new Date().toISOString()
        });
    }
    catch (error) {
        log(`Error procesando webhook: ${error.message}`, 'stripe-routes');
        res.status(500).json({
            error: "Error procesando webhook",
            timestamp: Date.now(),
            errorId: `err-${Date.now()}-${Math.random().toString(36).substring(2)}`
        });
    }
});
// Ruta para historial de facturación
router.get("/billing-history", isAuthenticated, async (req, res) => {
    try {
        // @ts-ignore - req.user existe por Passport
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Usuario no autenticado"
            });
        }
        const history = await storage.getBillingHistory(userId);
        res.json({
            success: true,
            data: history,
            timestamp: Date.now() // Añadir timestamp para forzar contenido único
        });
    }
    catch (error) {
        log(`Error obteniendo historial de facturación: ${error.message}`, 'stripe-routes');
        res.status(500).json({
            success: false,
            error: "Error al obtener el historial de facturación"
        });
    }
});
export default router;
