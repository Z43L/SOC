import Stripe from 'stripe';
import { storage } from '../../storage';
import { log } from '../../vite';
// Variable para el modo simulado
const STRIPE_MOCK_MODE = process.env.STRIPE_MOCK_MODE === 'true';
// Verificar si la clave API de Stripe es válida (no es el valor de placeholder)
const isValidStripeKey = (key) => {
    return key && key !== 'your_stripe_api_key' && key.startsWith('sk_');
};
// Inicializar Stripe con la clave secreta o usar un cliente vacío en modo simulado
const stripeApiKey = process.env.STRIPE_SECRET_KEY || '';
const isApiKeyValid = isValidStripeKey(stripeApiKey);
// Si estamos en modo simulado o la clave API no es válida, usar el cliente simulado
const useMockClient = STRIPE_MOCK_MODE || !isApiKeyValid;
if (!isApiKeyValid) {
    log('⚠️ ADVERTENCIA: La clave API de Stripe no es válida o está usando un valor de marcador de posición. Activando modo simulado automáticamente.', 'stripe');
}
const stripe = useMockClient ?
    // Cliente simulado para modo de prueba
    {
        customers: {
            create: () => Promise.resolve({ id: 'mock_customer_id' }),
            retrieve: () => Promise.resolve({ id: 'mock_customer_id', email: 'mock@example.com' })
        },
        subscriptions: {
            list: () => Promise.resolve({ data: [] }),
            create: () => Promise.resolve({ id: 'mock_subscription_id', status: 'active' })
        },
        billingPortal: {
            sessions: {
                create: () => Promise.resolve({ url: '/billing' })
            }
        },
        checkout: {
            sessions: {
                create: () => Promise.resolve({ url: '/billing?session_id=mock_session', id: 'mock_session' })
            }
        },
        webhooks: {
            constructEvent: () => ({ type: 'mock.event' })
        }
    } :
    // Cliente real de Stripe
    new Stripe(stripeApiKey, {
        apiVersion: '2023-10-16',
    });
// URL base para redireccionamiento después de pago
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
// Log de inicialización
log(`Stripe initializing in ${useMockClient ? 'MOCK' : 'PRODUCTION'} mode`, 'stripe');
export class StripeService {
    /**
     * Crear un cliente en Stripe o recuperar uno existente
     */
    async getOrCreateCustomer(userId, email) {
        try {
            // En modo simulado, crear un cliente falso
            if (useMockClient) {
                log(`[MOCK] Creating mock customer for user ${userId}`, 'stripe');
                return { id: `mock_customer_${userId}` };
            }
            // Intentar obtener el cliente de la base de datos
            const user = await storage.getUser(userId);
            if (!user)
                throw new Error('User not found');
            // Si ya tiene un stripeCustomerId, usarlo
            if (user.stripeCustomerId) {
                try {
                    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
                    if (customer && !customer.deleted) {
                        return customer;
                    }
                }
                catch (err) {
                    log(`Error recuperando cliente Stripe: ${err instanceof Error ? err.message : 'Error desconocido'}`, 'stripe');
                }
            }
            // Si no existe, crear un nuevo cliente
            const customer = await stripe.customers.create({
                email,
                metadata: {
                    userId: userId.toString()
                }
            });
            // Actualizar el usuario con el ID de cliente
            await storage.updateUserById(userId, {
                stripeCustomerId: customer.id
            });
            return customer;
        }
        catch (error) {
            log(`Error en getOrCreateCustomer: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
            if (useMockClient) {
                return { id: `mock_customer_${userId}` };
            }
            throw error;
        }
    }
    /**
     * Crear una sesión de pago en Stripe
     */
    async createCheckoutSession(userId, email, planId, isYearly) {
        try {
            // Obtener el plan
            const plan = await storage.getPlan(planId);
            if (!plan)
                throw new Error('Plan not found');
            // Obtener el cliente o crear uno nuevo
            const customer = await this.getOrCreateCustomer(userId, email);
            // Determinar el precio basado en si es anual o mensual
            const unitAmount = isYearly ? plan.priceYearly : plan.priceMonthly;
            const interval = isYearly ? 'year' : 'month';
            // Crear la sesión de checkout
            const session = await stripe.checkout.sessions.create({
                customer: customer.id,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${plan.name} Plan - ${isYearly ? 'Yearly' : 'Monthly'}`,
                                description: plan.description,
                            },
                            unit_amount: unitAmount, // En centavos
                            recurring: {
                                interval: interval,
                            },
                        },
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                subscription_data: {
                    metadata: {
                        userId: userId.toString(),
                        planId: planId.toString(),
                        isYearly: isYearly.toString(),
                    },
                },
                success_url: `${BASE_URL}/billing?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${BASE_URL}/billing`,
            });
            return session;
        }
        catch (error) {
            log(`Error en createCheckoutSession: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
            throw error;
        }
    }
    /**
     * Crear una sesión del portal de clientes de Stripe
     */
    async createBillingPortalSession(userId) {
        try {
            const user = await storage.getUser(userId);
            if (!user || !user.stripeCustomerId) {
                throw new Error('User not found or no Stripe customer ID');
            }
            const session = await stripe.billingPortal.sessions.create({
                customer: user.stripeCustomerId,
                return_url: `${BASE_URL}/billing`,
            });
            return session;
        }
        catch (error) {
            log(`Error en createBillingPortalSession: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
            throw error;
        }
    }
    /**
     * Obtener la suscripción actual del usuario
     */
    async getUserSubscription(userId) {
        try {
            log(`Iniciando getUserSubscription para usuario ${userId}`, 'stripe');
            // En modo simulado, devolver una suscripción falsa
            if (STRIPE_MOCK_MODE) {
                log(`[MOCK] Returning mock subscription for user ${userId}`, 'stripe');
                // Obtener planes reales de la base de datos si es posible
                let plan = null;
                try {
                    const plans = await storage.getPlans();
                    plan = plans && plans.length > 0 ? plans[0] : null;
                }
                catch (err) {
                    log(`Error obteniendo planes para mock: ${err instanceof Error ? err.message : 'Error desconocido'}`, 'stripe');
                    // Si no podemos obtener los planes reales, crear uno falso
                    plan = {
                        id: 1,
                        name: "Plan Básico (Simulado)",
                        description: "Plan básico simulado para desarrollo",
                        priceMonthly: 1000,
                        priceYearly: 10000,
                        features: ["Característica 1", "Característica 2"],
                        maxUsers: 5,
                        maxAgents: 3,
                        maxAlerts: 100
                    };
                }
                return {
                    id: `mock_subscription_${userId}`,
                    status: 'active',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días desde hoy
                    cancelAtPeriodEnd: false,
                    planId: plan ? plan.id : 1,
                    plan
                };
            }
            // Verificar que la API key de Stripe esté configurada
            if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'your_stripe_api_key') {
                log('STRIPE_SECRET_KEY no está configurada correctamente', 'stripe');
                // En lugar de arrojar un error, proporcionar datos de fallback
                return await this.getDefaultSubscriptionData(userId);
            }
            const user = await storage.getUser(userId);
            log(`Información de usuario recuperada: ${user ? 'encontrado' : 'no encontrado'}`, 'stripe');
            if (!user) {
                log(`Usuario no encontrado: ${userId}`, 'stripe');
                // En lugar de arrojar un error, proporcionar datos de fallback
                return await this.getDefaultSubscriptionData(userId);
            }
            // Si no tiene un ID de cliente, no tiene suscripción
            if (!user.stripeCustomerId) {
                log(`Usuario ${userId} no tiene stripeCustomerId`, 'stripe');
                // Devolver un objeto de suscripción básico para plan gratuito
                return {
                    id: null,
                    status: 'inactive',
                    currentPeriodEnd: new Date(),
                    cancelAtPeriodEnd: false,
                    planId: user.planId || 1,
                    plan: await storage.getPlan(user.planId || 1) || null
                };
            }
            // Buscar suscripciones activas para este cliente
            log(`Buscando suscripciones para cliente: ${user.stripeCustomerId}`, 'stripe');
            let subscriptions;
            try {
                subscriptions = await stripe.subscriptions.list({
                    customer: user.stripeCustomerId,
                    status: 'active',
                    limit: 1,
                    expand: ['data.default_payment_method', 'data.latest_invoice'] // Expandir datos relacionados
                });
            }
            catch (stripeError) {
                log(`Error al obtener suscripciones de Stripe: ${stripeError instanceof Error ? stripeError.message : 'Error desconocido'}`, 'stripe');
                // Si hay un error en la API de Stripe, devolver datos de usuario actuales
                return {
                    id: user.subscriptionId || null,
                    status: user.subscriptionStatus || 'inactive',
                    currentPeriodEnd: user.subscriptionEnd || new Date(),
                    cancelAtPeriodEnd: false,
                    planId: user.planId || 1,
                    plan: await storage.getPlan(user.planId || 1) || null
                };
            }
            if (subscriptions.data.length === 0) {
                log(`No se encontraron suscripciones activas para usuario ${userId}`, 'stripe');
                // Devolver información de plan actual del usuario
                return {
                    id: null,
                    status: 'inactive',
                    currentPeriodEnd: new Date(),
                    cancelAtPeriodEnd: false,
                    planId: user.planId || 1,
                    plan: await storage.getPlan(user.planId || 1) || null
                };
            }
            const subscription = subscriptions.data[0];
            const planId = Number(subscription.metadata?.planId) || user.planId || 1;
            // Obtener detalles del plan
            log(`Obteniendo detalles del plan ${planId}`, 'stripe');
            const plan = await storage.getPlan(planId).catch(err => {
                log(`Error al obtener detalles del plan ${planId}: ${err.message}`, 'stripe');
                return null;
            });
            // Si tenemos la suscripción pero no tenemos el plan, actualizar el registro en la base de datos
            if (subscription && subscription.status === 'active' && user.subscriptionStatus !== 'active') {
                try {
                    await storage.updateUserById(userId, {
                        subscriptionStatus: subscription.status,
                        subscriptionId: subscription.id,
                        subscriptionEnd: new Date(subscription.current_period_end * 1000)
                    });
                    log(`Actualizado estado de suscripción para usuario ${userId} a '${subscription.status}'`, 'stripe');
                }
                catch (updateError) {
                    log(`Error al actualizar estado de suscripción: ${updateError instanceof Error ? updateError.message : 'Error desconocido'}`, 'stripe');
                    // Continuar a pesar del error de actualización
                }
            }
            return {
                id: subscription.id,
                status: subscription.status,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                planId,
                plan,
                // Incluir algunos metadatos adicionales que pueden ser útiles para diagnosticar problemas
                _meta: {
                    hasPaymentMethod: !!subscription.default_payment_method,
                    lastUpdated: new Date().toISOString()
                }
            };
        }
        catch (error) {
            log(`Error en getUserSubscription: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
            if (STRIPE_MOCK_MODE) {
                // En modo simulado, devolver datos falsos incluso después de un error
                const freePlan = {
                    id: 1,
                    name: "Plan Básico (Simulado)",
                    description: "Plan básico simulado para desarrollo",
                    priceMonthly: 1000,
                    priceYearly: 10000,
                    features: ["Característica 1", "Característica 2"],
                    maxUsers: 5,
                    maxAgents: 3,
                    maxAlerts: 100
                };
                return {
                    id: `mock_subscription_${userId}`,
                    status: 'active',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    cancelAtPeriodEnd: false,
                    planId: 1,
                    plan: freePlan
                };
            }
            // Intentar proporcionar datos de usuario como fallback
            return this.getDefaultSubscriptionData(userId);
        }
    }
    /**
     * Obtener datos de suscripción predeterminados para casos de error
     */
    async getDefaultSubscriptionData(userId) {
        try {
            // Intentar obtener el usuario
            const user = await storage.getUser(userId).catch(() => null);
            // Obtener el plan gratuito (o el plan del usuario si está disponible)
            const planId = user?.planId || 1;
            const plan = await storage.getPlan(planId).catch(() => null);
            return {
                id: user?.subscriptionId || null,
                status: user?.subscriptionStatus || 'inactive',
                currentPeriodEnd: user?.subscriptionEnd || new Date(),
                cancelAtPeriodEnd: false,
                planId,
                plan,
                _isErrorFallback: true
            };
        }
        catch (fallbackError) {
            log(`Error al generar datos de fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Error desconocido'}`, 'stripe');
            // Último recurso - devolver un objeto mínimo
            return {
                id: null,
                status: 'inactive',
                currentPeriodEnd: new Date(),
                cancelAtPeriodEnd: false,
                planId: 1,
                plan: null,
                _isErrorFallback: true
            };
        }
    }
    /**
     * Procesar eventos de webhook de Stripe
     */
    async handleWebhookEvent(event) {
        try {
            log(`Procesando evento de Stripe: ${event.type}`, 'stripe');
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
                case 'invoice.paid':
                    await this.handleInvoicePaid(event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await this.handleInvoicePaymentFailed(event.data.object);
                    break;
                default:
                    log(`Evento de Stripe no manejado: ${event.type}`, 'stripe');
            }
        }
        catch (error) {
            log(`Error manejando webhook de Stripe: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
            throw error;
        }
    }
    /**
     * Manejar eventos de suscripción actualizada
     */
    async handleSubscriptionUpdated(subscription) {
        try {
            const userId = Number(subscription.metadata.userId);
            const planId = Number(subscription.metadata.planId);
            if (!userId || !planId) {
                log('Metadata de suscripción incompleta', 'stripe');
                return;
            }
            const user = await storage.getUser(userId);
            if (!user) {
                log(`Usuario no encontrado: ${userId}`, 'stripe');
                return;
            }
            // Actualizar el planId y el estado de la suscripción del usuario
            await storage.updateUserById(userId, {
                planId,
                subscriptionStatus: subscription.status,
                subscriptionId: subscription.id,
                subscriptionEnd: new Date(subscription.current_period_end * 1000),
            });
            log(`Suscripción actualizada para usuario ${userId}, plan ${planId}, estado: ${subscription.status}`, 'stripe');
        }
        catch (error) {
            log(`Error en handleSubscriptionUpdated: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
        }
    }
    /**
     * Manejar eventos de suscripción eliminada
     */
    async handleSubscriptionDeleted(subscription) {
        try {
            const userId = Number(subscription.metadata.userId);
            if (!userId) {
                log('Metadata de suscripción incompleta', 'stripe');
                return;
            }
            const user = await storage.getUser(userId);
            if (!user) {
                log(`Usuario no encontrado: ${userId}`, 'stripe');
                return;
            }
            // Resetear al plan gratuito (asumiendo que el ID 1 es el plan gratuito)
            await storage.updateUserById(userId, {
                planId: 1,
                subscriptionStatus: 'canceled',
                subscriptionId: null,
                subscriptionEnd: null,
            });
            log(`Suscripción cancelada para usuario ${userId}`, 'stripe');
        }
        catch (error) {
            log(`Error en handleSubscriptionDeleted: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
        }
    }
    /**
     * Manejar eventos de factura pagada
     */
    async handleInvoicePaid(invoice) {
        try {
            if (!invoice.customer)
                return;
            // Encontrar el usuario por el customerId
            const user = await storage.getUserByStripeId(invoice.customer);
            if (!user) {
                log(`Usuario no encontrado para cliente Stripe: ${invoice.customer}`, 'stripe');
                return;
            }
            // Registrar el pago en el historial de facturación
            await storage.createBillingRecord({
                userId: user.id,
                amount: invoice.amount_paid,
                description: `Invoice #${invoice.number}`,
                status: 'paid',
                invoiceId: invoice.id,
                createdAt: new Date(invoice.created * 1000),
            });
            log(`Factura pagada registrada para usuario ${user.id}: ${invoice.id}`, 'stripe');
        }
        catch (error) {
            log(`Error en handleInvoicePaid: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
        }
    }
    /**
     * Manejar eventos de pago de factura fallido
     */
    async handleInvoicePaymentFailed(invoice) {
        try {
            if (!invoice.customer)
                return;
            // Encontrar el usuario por el customerId
            const user = await storage.getUserByStripeId(invoice.customer);
            if (!user) {
                log(`Usuario no encontrado para cliente Stripe: ${invoice.customer}`, 'stripe');
                return;
            }
            // Actualizar el estado de la suscripción a past_due
            await storage.updateUserById(user.id, {
                subscriptionStatus: 'past_due',
            });
            // Registrar el intento de pago fallido en el historial de facturación
            await storage.createBillingRecord({
                userId: user.id,
                amount: invoice.amount_due,
                description: `Failed payment for Invoice #${invoice.number}`,
                status: 'failed',
                invoiceId: invoice.id,
                createdAt: new Date(invoice.created * 1000),
            });
            log(`Pago fallido registrado para usuario ${user.id}: ${invoice.id}`, 'stripe');
        }
        catch (error) {
            log(`Error en handleInvoicePaymentFailed: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'stripe');
        }
    }
}
// Exportar una instancia del servicio para uso en la aplicación
export const stripeService = new StripeService();
