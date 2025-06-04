import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  planId: number;
  status: string;
}

interface PlanListProps {
  plans: Plan[];
  currentSubscription?: Subscription | null;
  onSubscribe: (planId: number, isYearly: boolean) => void;
  isRedirecting: boolean;
}

export function PlanList({ plans, currentSubscription, onSubscribe, isRedirecting }: PlanListProps) {
  const formatPrice = (price: number) => {
    return (price / 100).toFixed(2);
  };

  const isPlanActive = (planId: number) => {
    return (
      currentSubscription?.planId === planId && 
      currentSubscription?.status === 'active'
    );
  };

  if (plans.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">No hay planes disponibles en este momento.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <Card key={plan.id} className={`p-6 flex flex-col ${plan.name.includes('Pro') ? 'border-primary' : ''}`}>
          {plan.name.includes('Pro') && (
            <div className="bg-primary text-primary-foreground px-3 py-1 text-xs rounded-full w-fit mb-4">
              Popular
            </div>
          )}
          <h3 className="text-xl font-bold">{plan.name}</h3>
          <p className="text-muted-foreground mt-1 mb-4">{plan.description}</p>
          
          <div className="mt-2 mb-4">
            <span className="text-2xl font-bold">
              ${formatPrice(plan.priceMonthly)}
            </span>
            <span className="text-muted-foreground">/mes</span>
          </div>
          
          <ul className="space-y-2 mb-6 flex-grow">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center">
                <svg
                  className="h-4 w-4 text-primary mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
          
          <div className="mt-auto space-y-3">
            <Button
              variant="default"
              className="w-full"
              onClick={() => onSubscribe(plan.id, false)}
              disabled={isRedirecting || isPlanActive(plan.id)}
            >
              {isRedirecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isPlanActive(plan.id) ? (
                'Plan Actual'
              ) : (
                'Suscribirse Mensualmente'
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onSubscribe(plan.id, true)}
              disabled={isRedirecting || isPlanActive(plan.id)}
            >
              {isRedirecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isPlanActive(plan.id) ? (
                'Plan Actual'
              ) : (
                'Suscribirse Anualmente (2 meses gratis)'
              )}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}