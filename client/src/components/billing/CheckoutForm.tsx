import { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CheckoutFormProps {
  returnUrl: string;
}

const CheckoutForm = ({ returnUrl }: CheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js no ha cargado
      // Asegúrate de deshabilitar el botón de envío del formulario hasta que Stripe.js haya cargado
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Confirmar el pago
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    setIsLoading(false);

    if (error) {
      // Mostrar mensaje de error al usuario
      setErrorMessage(error.message || 'Ocurrió un error al procesar el pago');
      toast({
        title: 'Error de pago',
        description: error.message || 'Ocurrió un error al procesar el pago',
        variant: 'destructive',
      });
    } else {
      // El pago se procesará en el servidor
      toast({
        title: 'Procesando pago',
        description: 'Tu pago está siendo procesado. Serás redirigido en breve.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {errorMessage && (
        <div className="text-sm text-red-500 mt-2">
          {errorMessage}
        </div>
      )}
      
      <Button 
        type="submit" 
        className="w-full"
        disabled={!stripe || isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Procesando...
          </>
        ) : (
          'Pagar ahora'
        )}
      </Button>
    </form>
  );
};

export default CheckoutForm;