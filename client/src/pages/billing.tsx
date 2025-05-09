import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Check, CreditCard, Gift, Package, Star } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';
import Layout from '@/components/layout/Layout';
import { Plan, Organization } from '@shared/schema';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function BillingPage() {
  const { toast } = useToast();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [customerPortalUrl, setCustomerPortalUrl] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Obtener los planes disponibles
  const { data: plans, isLoading: isLoadingPlans } = useQuery<Plan[]>({
    queryKey: ['/api/plans'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/plans');
      return await res.json();
    }
  });

  // Obtener la organización actual
  const { data: organization, isLoading: isLoadingOrg } = useQuery<Organization>({
    queryKey: ['/api/organization/current'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organization/current');
      return await res.json();
    }
  });

  // Cambiar plan
  const changePlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest('POST', '/api/billing/change-plan', {
        planId,
        billingCycle
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organization/current'] });
      toast({
        title: 'Plan actualizado',
        description: 'Tu plan ha sido actualizado correctamente.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al cambiar de plan',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Generar enlace de checkout
  const generateCheckoutMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest('POST', '/api/billing/checkout', {
        planId,
        billingCycle,
        successUrl: window.location.origin + '/billing?success=true',
        cancelUrl: window.location.origin + '/billing'
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        setCheckoutUrl(data.url);
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al generar enlace de pago',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Generar enlace de portal de cliente
  const generatePortalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/billing/portal', {
        returnUrl: window.location.origin + '/billing'
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        setCustomerPortalUrl(data.url);
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al generar portal de cliente',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Actualizar el plan seleccionado cuando se carga la organización
  useEffect(() => {
    if (organization?.plan_id) {
      setSelectedPlan(organization.plan_id);
      setBillingCycle(organization.billing_cycle as 'monthly' | 'yearly' || 'monthly');
    }
  }, [organization]);

  // Mostrar mensaje de éxito si viene de pago exitoso
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      toast({
        title: 'Pago procesado correctamente',
        description: 'Tu suscripción ha sido actualizada.',
      });
      // Limpiar URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refrescar datos
      queryClient.invalidateQueries({ queryKey: ['/api/organization/current'] });
    }
  }, [toast]);

  const currentPlan = plans?.find(p => p.id === organization?.plan_id);
  const isLoading = isLoadingPlans || isLoadingOrg;

  // Calcular si un plan es el actual
  const isCurrentPlan = (planId: number) => {
    return organization?.plan_id === planId;
  };

  // Gestionar la actualización del plan
  const handlePlanChange = (planId: number) => {
    if (isCurrentPlan(planId)) return;

    setSelectedPlan(planId);
    
    const newPlan = plans?.find(p => p.id === planId);
    const currentPlan = plans?.find(p => p.id === organization?.plan_id);
    
    // Si el plan actual es gratuito y el nuevo es de pago, redirigir a Stripe
    if (currentPlan?.price_monthly === 0 && newPlan?.price_monthly && newPlan.price_monthly > 0) {
      generateCheckoutMutation.mutate(planId);
    } else {
      // Para cambios entre planes no gratuitos o al plan gratuito
      changePlanMutation.mutate(planId);
    }
  };

  // Obtener características del plan
  const getPlanFeatures = (plan: Plan | undefined) => {
    if (!plan) return [];
    
    const features = plan.features as Record<string, any>;
    const featureItems = [];
    
    if (features.basic_dashboard) featureItems.push('Dashboard básico');
    if (features.threat_intelligence) featureItems.push('Inteligencia de amenazas');
    if (features.integrations) featureItems.push(`${features.integrations} integraciones`);
    if (features.soar) featureItems.push('Automatización y respuesta (SOAR)');
    if (features.support === '24/7') featureItems.push('Soporte 24/7');
    if (features.support === 'business-hours') featureItems.push('Soporte en horario laboral');
    if (features.custom_integrations) featureItems.push('Integraciones personalizadas');

    return featureItems;
  };

  const getSubscriptionStatus = (status: string | undefined) => {
    if (!status) return { label: 'Desconocido', color: 'default' };
    
    switch (status) {
      case 'active':
        return { label: 'Activa', color: 'success' as const };
      case 'past_due':
        return { label: 'Pago pendiente', color: 'warning' as const };
      case 'canceled':
        return { label: 'Cancelada', color: 'destructive' as const };
      case 'pending':
        return { label: 'Pendiente', color: 'default' as const };
      default:
        return { label: status, color: 'default' as const };
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 max-w-6xl">
        <h1 className="text-3xl font-bold mb-8">Facturación y Suscripciones</h1>

        {organization && currentPlan && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Plan Actual: {currentPlan.name}</span>
                <Badge 
                  variant={getSubscriptionStatus(organization.subscription_status).color}
                >
                  {getSubscriptionStatus(organization.subscription_status).label}
                </Badge>
              </CardTitle>
              <CardDescription>
                Organización: {organization.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-medium mb-2">Detalles de la suscripción</h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    Ciclo de facturación: {organization.billing_cycle === 'monthly' ? 'Mensual' : 'Anual'}
                  </p>
                  {organization.subscription_start_date && (
                    <p className="text-sm text-muted-foreground mb-1">
                      Fecha de inicio: {new Date(organization.subscription_start_date).toLocaleDateString()}
                    </p>
                  )}
                  {organization.subscription_end_date && (
                    <p className="text-sm text-muted-foreground mb-1">
                      Fecha de renovación: {new Date(organization.subscription_end_date).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="font-medium mb-2">Características</h3>
                  <ul className="space-y-1">
                    {getPlanFeatures(currentPlan).map((feature, index) => (
                      <li key={index} className="text-sm flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Limitaciones</h3>
                  <ul className="space-y-1">
                    <li className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">Usuarios: </span>
                      {currentPlan.max_users === -1 ? 'Ilimitados' : currentPlan.max_users}
                    </li>
                    <li className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">Agentes: </span>
                      {currentPlan.max_agents === -1 ? 'Ilimitados' : currentPlan.max_agents}
                    </li>
                    <li className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">Alertas: </span>
                      {currentPlan.max_alerts === -1 ? 'Ilimitadas' : currentPlan.max_alerts}
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div></div>
              {organization.stripe_customer_id && (
                <Button
                  variant="outline"
                  onClick={() => generatePortalMutation.mutate()}
                  disabled={generatePortalMutation.isPending}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Gestionar método de pago
                </Button>
              )}
            </CardFooter>
          </Card>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Planes Disponibles</h2>

          <div className="flex items-center space-x-2">
            <Switch
              id="billing-cycle"
              checked={billingCycle === 'yearly'}
              onCheckedChange={(checked) => setBillingCycle(checked ? 'yearly' : 'monthly')}
            />
            <Label htmlFor="billing-cycle" className="flex items-center gap-2">
              <span>Facturación anual</span>
              <Badge variant="outline" className="text-xs">Ahorra 15%</Badge>
            </Label>
          </div>
        </div>

        {plans && !isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.filter(plan => plan.is_active).map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative overflow-hidden ${isCurrentPlan(plan.id) ? 'border-primary' : ''}`}
              >
                {isCurrentPlan(plan.id) && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs">
                    Plan Actual
                  </div>
                )}

                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {plan.name}
                    {plan.name === 'Enterprise' && <Star className="h-4 w-4 text-yellow-400" />}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="mb-4">
                    <p className="text-3xl font-bold">
                      {formatCurrency(billingCycle === 'monthly' ? plan.price_monthly / 100 : plan.price_yearly / 100 / 12)}
                      <span className="text-sm font-normal text-muted-foreground"> /mes</span>
                    </p>
                    {billingCycle === 'yearly' && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(plan.price_yearly / 100)} facturados anualmente
                      </p>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <ul className="space-y-2">
                    {getPlanFeatures(plan).map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Separator className="my-4" />

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Usuarios</span>
                      <span className="text-sm font-medium">
                        {plan.max_users === -1 ? 'Ilimitados' : plan.max_users}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Agentes</span>
                      <span className="text-sm font-medium">
                        {plan.max_agents === -1 ? 'Ilimitados' : plan.max_agents}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Alertas/mes</span>
                      <span className="text-sm font-medium">
                        {plan.max_alerts === -1 ? 'Ilimitadas' : plan.max_alerts}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isCurrentPlan(plan.id) ? "outline" : "default"}
                    disabled={
                      isCurrentPlan(plan.id) || 
                      changePlanMutation.isPending || 
                      generateCheckoutMutation.isPending
                    }
                    onClick={() => handlePlanChange(plan.id)}
                  >
                    {isCurrentPlan(plan.id) 
                      ? 'Plan Actual' 
                      : (plan.price_monthly === 0 || (currentPlan && currentPlan.price_monthly > 0)) 
                        ? 'Cambiar Plan' 
                        : 'Suscribirse'}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-[450px] animate-pulse bg-muted/10"></Card>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Al cambiar a un plan de menor nivel, algunas características podrían quedar deshabilitadas. 
              Todos los cambios de plan se aplican inmediatamente.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </Layout>
  );
}