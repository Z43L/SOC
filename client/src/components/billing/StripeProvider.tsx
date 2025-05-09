import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { ReactNode } from 'react';

// Cargar Stripe usando la clave pública
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

// Proveedor de Stripe para componentes hijos
interface StripeProviderProps {
  children: ReactNode;
  clientSecret?: string;
}

export function StripeProvider({ children, clientSecret }: StripeProviderProps) {
  if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
    console.warn("Falta la clave pública de Stripe (VITE_STRIPE_PUBLIC_KEY)");
    return <>{children}</>;
  }

  const options = clientSecret 
    ? {
        clientSecret,
        appearance: {
          theme: 'stripe',
        },
      } 
    : undefined;

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}

export default StripeProvider;