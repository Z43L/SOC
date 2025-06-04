import Stripe from 'stripe';

// Verifica que tengamos clave de Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe key: STRIPE_SECRET_KEY');
}

// Inicializa el cliente de Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Define planes con precios actualizados
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    priceId: null // Plan gratuito, no necesita ID de precio de Stripe
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 5,
    priceId: null // Debe configurarse en la consola de Stripe
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 20,
    priceId: null // Debe configurarse en la consola de Stripe
  }
};

/**
 * Crear una sesión de checkout de Stripe para la suscripción
 */
export async function createCheckoutSession(
  planType: keyof typeof SUBSCRIPTION_PLANS,
  successUrl: string,
  cancelUrl: string,
  customerId?: string
): Promise<{ url: string }> {
  // Si es plan Free, simplemente redirige a la página de éxito
  if (planType === 'FREE') {
    return { url: successUrl };
  }

  const plan = SUBSCRIPTION_PLANS[planType];
  
  if (!plan.priceId) {
    throw new Error(`No Stripe price ID configured for plan ${planType}`);
  }

  // Crear sesión de checkout
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId || undefined,
  });

  return { url: session.url || cancelUrl };
}

/**
 * Crear un portal de cliente de Stripe para gestionar suscripciones
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

/**
 * Webhook para manejar eventos de Stripe
 */
export async function handleStripeWebhookEvent(
  signature: string,
  rawBody: Buffer
): Promise<{ type: string, data: any }> {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    throw new Error(`Webhook Error: ${err.message}`);
  }

  return { 
    type: event.type,
    data: event.data.object
  };
}