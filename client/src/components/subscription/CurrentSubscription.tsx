import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Plan {
  id: number;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

interface Subscription {
  id: string | null;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd?: boolean;
  planId: number;
  plan?: Plan | null;
}

interface CurrentSubscriptionProps {
  subscription: Subscription;
  onManageBilling: () => void;
  isRedirecting: boolean;
}

export function CurrentSubscription({ subscription, onManageBilling, isRedirecting }: CurrentSubscriptionProps) {
  const currentPlan = subscription?.plan;
  const subscriptionStatus = subscription?.status || 'inactive';
  const isActive = subscriptionStatus === 'active';
  
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch (e) {
      return 'Fecha no disponible';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalles de Suscripción</CardTitle>
      </CardHeader>
      <CardContent>
        {currentPlan ? (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Plan Actual:</span>
              <span className="font-medium">{currentPlan.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Estado:</span>
              <span>
                <Badge variant={isActive ? "default" : "destructive"}>
                  {isActive ? "Activo" : subscriptionStatus === 'past_due' ? 'Pago pendiente' : 'Inactivo'}
                </Badge>
              </span>
            </div>
            {subscription?.currentPeriodEnd && (
              <div className="flex justify-between">
                <span>Renovación:</span>
                <span className="font-medium">
                  {formatDate(subscription.currentPeriodEnd)}
                </span>
              </div>
            )}
            <div className="mt-4">
              <Button 
                onClick={onManageBilling} 
                disabled={isRedirecting}
                className="w-full md:w-auto"
              >
                {isRedirecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gestionar Suscripción
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-amber-500">
            No se pudo cargar la información del plan actual. 
            <Button variant="link" onClick={() => window.location.reload()} className="p-0 h-auto">
              Reintentar
            </Button>
          </p>
        )}
      </CardContent>
    </Card>
  );
}