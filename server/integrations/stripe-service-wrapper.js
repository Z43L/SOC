import Stripe from 'stripe';
// Inicializar Stripe con la clave secreta
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
/**
 * Crear una sesión de checkout con Payment Intent
 */
export async function createCheckoutSession(planId, priceId, amount, customerId, metadata) {
    try {
        // Si no hay customer, crear uno nuevo
        if (!customerId) {
            const customerParams = {
                metadata: { planId: planId.toString(), ...metadata }
            };
            const customer = await stripe.customers.create(customerParams);
            customerId = customer.id;
        }
        // Crear un PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, // en centavos
            currency: 'usd',
            customer: customerId,
            metadata: { planId: planId.toString(), ...metadata },
            payment_method_types: ['card'],
        });
        return { clientSecret: paymentIntent.client_secret };
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        throw error;
    }
}
/**
 * Crear una suscripción para un cliente
 */
export async function createSubscription(customerId, priceId, metadata) {
    try {
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata
        });
        return subscription;
    }
    catch (error) {
        console.error('Error creating subscription:', error);
        throw error;
    }
}
/**
 * Crear un portal de cliente
 */
export async function createCustomerPortalSession(customerId, returnUrl) {
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl
        });
        return { url: session.url };
    }
    catch (error) {
        console.error('Error creating customer portal:', error);
        throw error;
    }
}
/**
 * Actualizar una suscripción
 */
export async function updateSubscription(subscriptionId, items, metadata) {
    try {
        const subscription = await stripe.subscriptions.update(subscriptionId, {
            items,
            metadata
        });
        return subscription;
    }
    catch (error) {
        console.error('Error updating subscription:', error);
        throw error;
    }
}
/**
 * Cancelar una suscripción
 */
export async function cancelSubscription(subscriptionId) {
    try {
        const subscription = await stripe.subscriptions.cancel(subscriptionId);
        return subscription;
    }
    catch (error) {
        console.error('Error canceling subscription:', error);
        throw error;
    }
}
/**
 * Comprobar si Stripe está configurado
 */
export function isStripeConfigured() {
    return !!process.env.STRIPE_SECRET_KEY;
}
