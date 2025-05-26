import { FC, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, CreditCard, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import PlanCard from "@/components/billing/PlanCard";
import BillingHistory from "@/components/billing/BillingHistory";
import CurrentSubscription from "@/components/billing/CurrentSubscription";
// import { useMockBillingData, MockPlan, MOCK_PLANS, DEFAULT_SUBSCRIPTION } from "@/components/billing/MockBillingData";

const BillingPage: FC = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const { user, organization, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [networkStatus, setNetworkStatus] = useState<{
    online: boolean;
    lastChecked: Date | null;
  }>({
    online: navigator.onLine,
    lastChecked: null
  });
  
  const [useMockData] = useState<boolean>(false); // Ensures real data is used
  const [apiErrorCount, setApiErrorCount] = useState<number>(0);

  // Obtener datos simulados (se usarán siempre)
  // const { 
  //   plans: mockPlans, 
  //   subscription: mockSubscription, 
  //   isLoading: mockLoading,
  //   subscribeToPlan: mockSubscribeToPlan,
  //   manageBilling: mockManageBilling
  // } = useMockBillingData();

  // Fallback de seguridad: si por alguna razón mockPlans está vacío, usamos los planes predefinidos
  // const [localMockPlans, setLocalMockPlans] = useState<MockPlan[]>(MOCK_PLANS);
  // const [localMockSubscription, setLocalMockSubscription] = useState(DEFAULT_SUBSCRIPTION);
  
  // Aseguramos que siempre haya planes disponibles
  // useEffect(() => {
  //   if (!mockPlans || mockPlans.length === 0) {
  //     setLocalMockPlans(MOCK_PLANS);
  //   } else {
  //     setLocalMockPlans(mockPlans);
  //   }
    
  //   if (!mockSubscription) {
  //     setLocalMockSubscription(DEFAULT_SUBSCRIPTION);
  //   } else {
  //     setLocalMockSubscription(mockSubscription);
  //   }
  // }, [mockPlans, mockSubscription]);

  // Manejo de parámetros de URL después de regresar de Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      window.history.replaceState({}, document.title, window.location.pathname);
      toast({
        title: "Suscripción actualizada",
        description: "Tu suscripción ha sido actualizada correctamente.",
      });
      // No recargar la página completa ya que estamos usando datos simulados
    }
  }, [toast]);

  // Observar cambios en el estado de la conexión
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus(prev => ({ 
        online: true, 
        lastChecked: new Date() 
      }));
      // Attempt to refetch data when connection is restored
      if (!useMockData) {
        refetchPlans();
        refetchSubscription();
      }
    };
    
    const handleOffline = () => {
      setNetworkStatus(prev => ({ 
        online: false, 
        lastChecked: new Date() 
      }));
      
      toast({
        title: "Sin conexión",
        description: "Tu dispositivo no está conectado a Internet. Usando datos locales.",
        variant: "warning"
      });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast, useMockData]); // Added useMockData and refetch functions to dependency array

  // Las consultas reales están completamente desactivadas
  const queryClient = useQueryClient();
  const { 
    data: plansData, 
    isLoading: isLoadingPlans,
    error: plansError,
    refetch: refetchPlans
  } = useQuery({
    queryKey: ['/api/billing/plans'],
    // queryFn se define abajo, dependiendo de useMockData
    enabled: !useMockData // Solo se activa si useMockData es false
  });

  const { 
    data: subscriptionData, 
    isLoading: isLoadingSubscription,
    error: subscriptionError,
    refetch: refetchSubscription
  } = useQuery({
    queryKey: ['/api/billing/subscription'],
    // queryFn se define abajo, dependiendo de useMockData
    enabled: !useMockData // Solo se activa si useMockData es false
  });

  // Definir queryFn para plansData y subscriptionData
  useEffect(() => {
    if (!useMockData) {
      queryClient.setQueryDefaults(['/api/billing/plans'], {
        queryFn: async () => {
          const timestamp = new Date().getTime();
          const response = await fetch(`/api/billing/plans?_nocache=${timestamp}`);
          if (!response.ok) {
            throw new Error("Error fetching plans");
          }
          return response.json();
        }
      });
      queryClient.setQueryDefaults(['/api/billing/subscription'], {
        queryFn: async () => {
          const timestamp = new Date().getTime();
          const response = await fetch(`/api/billing/subscription?_nocache=${timestamp}`);
          if (!response.ok) {
            throw new Error("Error fetching subscription data");
          }
          return response.json();
        }
      });
      // Refetch data when not using mock data
      refetchPlans();
      refetchSubscription();
    }
  }, [useMockData, queryClient, refetchPlans, refetchSubscription]);

  // Función para simular recargar datos
  const refreshData = () => {
    setIsLoading(true);
    
    if (useMockData) {
      // Simulamos un tiempo de carga
      setTimeout(() => {
        // Asegurar que tenemos datos simulados
        // setLocalMockPlans(MOCK_PLANS);
        // setLocalMockSubscription(DEFAULT_SUBSCRIPTION);
        
        toast({
          title: "Datos actualizados (Modo Simulado)",
          description: "La información de facturación se ha actualizado correctamente en modo simulado.",
        });
        setIsLoading(false);
      }, 1000);
    } else {
      // Refetch real data
      Promise.all([refetchPlans(), refetchSubscription()])
        .then(() => {
          toast({
            title: "Datos actualizados",
            description: "La información de facturación se ha actualizado correctamente.",
          });
        })
        .catch(() => {
          toast({
            title: "Error al actualizar",
            description: "No se pudo actualizar la información de facturación.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  // Handler para suscribirse a un plan
  const handleSubscribe = async (planId: number, isYearly: boolean) => {
    if (useMockData) {
      // Mantener la lógica de simulación si useMockData es true
      // try {
      //   setRedirecting(true);
      //   if (mockSubscribeToPlan) {
      //     await mockSubscribeToPlan(planId, isYearly);
      //   } else {
      //     const selectedPlan = MOCK_PLANS.find(plan => plan.id === planId);
      //     if (selectedPlan) {
      //       await new Promise<void>((resolve) => setTimeout(() => {
      //         setLocalMockSubscription({
      //           id: `mock-subscription-${Date.now()}`,
      //           status: 'active',
      //           currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + (isYearly ? 12 : 1))),
      //           cancelAtPeriodEnd: false,
      //           planId: selectedPlan.id,
      //           plan: selectedPlan
      //         });
      //         resolve();
      //       }, 1000));
      //     }
      //   }
      //   toast({
      //     title: "Suscripción actualizada (Modo Simulado)",
      //     description: "Tu suscripción ha sido actualizada correctamente en modo simulado.",
      //   });
      //   setRedirecting(false);
      // } catch (error) {
      //   toast({
      //     title: "Error (Modo Simulado)",
      //     description: "Error al procesar la suscripción en modo simulado.",
      //     variant: "destructive"
      //   });
      //   setRedirecting(false);
      // }
      return; // Mock data path should not be taken
    }

    // Lógica para datos reales
    setRedirecting(true);
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Asegúrate de incluir el token de autenticación si es necesario
          // 'Authorization': `Bearer ${yourAuthToken}` 
        },
        body: JSON.stringify({ planId, isYearly }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const session = await response.json();

      if (session.url) {
        window.location.href = session.url; // Redirigir a Stripe
      } else {
        throw new Error('No session URL returned from Stripe');
      }
    } catch (error) {
      console.error("Error subscribing to plan:", error);
      toast({
        title: "Error de Suscripción",
        description: (error instanceof Error && error.message) || "No se pudo iniciar el proceso de suscripción. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
      setRedirecting(false);
    }
  };

  // Handler para gestionar la facturación (siempre usa la versión simulada)
  const handleManageBilling = async () => {
    if (useMockData) {
      // try {
      //   setRedirecting(true);
        
      //   if (mockManageBilling) {
      //     await mockManageBilling();
      //   } else {
      //     // Simulación directa
      //     await new Promise<void>((resolve) => setTimeout(() => {
      //       setLocalMockSubscription({
      //         ...localMockSubscription,
      //         cancelAtPeriodEnd: !localMockSubscription.cancelAtPeriodEnd
      //       });
      //       resolve();
      //     }, 1000));
      //   }
        
      //   toast({
      //     title: "Gestión de facturación",
      //     description: "Configuración actualizada correctamente (modo simulado).",
      //   });
      //   setRedirecting(false);
      // } catch (error) {
      //   toast({
      //     title: "Error",
      //     description: "Error al procesar la solicitud en modo simulado.",
      //     variant: "destructive"
      //   });
      //   setRedirecting(false);
      // }
      return; // Mock data path should not be taken
    }

    // Lógica para datos reales
    setRedirecting(true);
    try {
      const response = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Asegúrate de incluir el token de autenticación si es necesario
          // 'Authorization': `Bearer ${yourAuthToken}`
        },
        // body: JSON.stringify({ customerId: organization?.stripeCustomerId }), // O el identificador necesario
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create portal session');
      }

      const session = await response.json();

      if (session.url) {
        window.location.href = session.url; // Redirigir al portal de Stripe
      } else {
        throw new Error('No portal session URL returned from Stripe');
      }
    } catch (error) {
      console.error("Error managing billing:", error);
      toast({
        title: "Error de Gestión de Facturación",
        description: (error instanceof Error && error.message) || "No se pudo abrir el portal de facturación. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
      setRedirecting(false); // Solo si no hay redirección
    }
  };

  // Preparar datos (usando datos simulados o reales)
  const combinedIsLoading = useMockData ? (redirecting || authLoading || isLoading) : (isLoadingPlans || isLoadingSubscription || redirecting || authLoading || isLoading);
  const plans = useMockData ? [] : (plansData?.data || []);
  const subscription = useMockData ? null : (subscriptionData?.data || null);

  // Preparar datos de usuario para el sidebar
  const userProps = user ? {
    name: user.name || user.username || 'Usuario',
    initials: (user.name || user.username || 'U').substring(0, 1).toUpperCase(),
    role: user.role || 'Usuario'
  } : {
    name: 'Usuario',
    initials: 'U',
    role: 'Usuario'
  };

  // Preparar datos de organización
  const orgProps = organization ? {
    name: organization.name || 'Organización'
  } : {
    name: 'Organización'
  };

  // Si está cargando, mostrar loader
  if (combinedIsLoading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={userProps} activeSection="billing" />
        
        <MainContent pageTitle="Facturación y Suscripción" organization={orgProps}>
          <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Cargando información de facturación...</p>
            </div>
          </div>
        </MainContent>
      </div>
    );
  }

  // Renderizado normal con datos simulados
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={userProps} activeSection="billing" />
      
      <MainContent pageTitle="Facturación y Suscripción" organization={orgProps}>
        {/* Current Subscription Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Suscripción Actual</h2>
          <CurrentSubscription 
            currentPlan={subscription?.plan}
            subscriptionStatus={subscription?.status || 'active'}
            onManageBilling={handleManageBilling}
          />
        </div>

        <Separator className="my-8" />
        
        {/* Available Plans */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Planes Disponibles</h2>
          {plans?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan: any) => (
                <PlanCard 
                  key={plan.id}
                  plan={plan}
                  isCurrentPlan={subscription?.planId === plan.id}
                  onSubscribe={(isYearly) => handleSubscribe(plan.id, isYearly)}
                />
              ))}
            </div>
          ) : (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertTitle>No hay planes disponibles</AlertTitle>
              <AlertDescription>
                No se encontraron planes disponibles. Por favor, intenta nuevamente más tarde.
              </AlertDescription>
            </Alert>
          )}
        </div>
        
        {/* Billing History (siempre simplificado) */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Historial de Facturación</h2>
          <BillingHistory />
        </div>
        
        {/* Support Section */}
        <div className="mb-8">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>¿Necesitas ayuda?</AlertTitle>
            <AlertDescription>
              Si tienes preguntas sobre tu facturación o suscripción, contacta a nuestro equipo de soporte en{" "}
              <a href="mailto:support@socsaas.com" className="font-medium underline hover:text-primary">
                support@socsaas.com
              </a>
            </AlertDescription>
          </Alert>
        </div>
      </MainContent>
    </div>
  );
};

export default BillingPage;