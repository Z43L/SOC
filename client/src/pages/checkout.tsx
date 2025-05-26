import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import StripeProvider from '@/components/billing/StripeProvider';
import CheckoutForm from '@/components/billing/CheckoutForm';
import { formatCurrency } from '@/lib/utils';

export default function CheckoutPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [planData, setPlanData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Obtener parámetros de la URL
    const params = new URLSearchParams(window.location.search);
    const planId = params.get('planId');
    const billingCycle = params.get('billingCycle') || 'monthly';

    if (!planId) {
      setError('No se especificó un plan');
      setIsLoading(false);
      return;
    }

    const fetchCheckoutSession = async () => {
      try {
        setIsLoading(true);
        
        // Primero obtenemos los detalles del plan
        const planRes = await apiRequest('GET', `/api/plans/${planId}`);
        const planData = await planRes.json();
        setPlanData(planData);

        // Luego crear la sesión de checkout
        const res = await apiRequest('POST', '/api/billing/checkout-session', {
          planId: parseInt(planId),
          billingCycle,
          returnUrl: window.location.origin + '/billing?success=true'
        });
        
        const data = await res.json();
        
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          throw new Error(data.message || 'No se pudo crear la sesión de checkout');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
        toast({
          title: 'Error al iniciar el checkout',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCheckoutSession();
  }, [toast]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Preparando el checkout...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container mx-auto p-4 max-w-3xl">
          <Card className="my-8">
            <CardHeader>
              <CardTitle>Error al iniciar el checkout</CardTitle>
              <CardDescription>No se pudo procesar tu solicitud</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-destructive">{error}</p>
              <button 
                className="mt-4 underline text-primary"
                onClick={() => setLocation('/billing')}
              >
                Volver a la página de facturación
              </button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">Checkout de Suscripción</h1>

        <div className="grid md:grid-cols-5 gap-8">
          <div className="md:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Información de pago</CardTitle>
                <CardDescription>Introduce los detalles de tu tarjeta para completar la suscripción</CardDescription>
              </CardHeader>
              <CardContent>
                {clientSecret ? (
                  <StripeProvider clientSecret={clientSecret}>
                    <CheckoutForm 
                      returnUrl={window.location.origin + '/billing?success=true'} 
                    />
                  </StripeProvider>
                ) : (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            {planData && (
              <Card>
                <CardHeader>
                  <CardTitle>Resumen de la orden</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Plan {planData.name}</h3>
                      <p className="text-sm text-muted-foreground">{planData.description}</p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>
                          {formatCurrency(planData.price_monthly / 100)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Impuestos</span>
                        <span>$0.00</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-medium">
                        <span>Total</span>
                        <span>
                          {formatCurrency(planData.price_monthly / 100)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Al completar este pago, aceptas los términos y condiciones de servicio.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}