import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Route, Redirect, useLocation } from "wouter";
import { useEffect, useState } from "react";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: (params?: any) => React.JSX.Element;
}) {
  const { user, organization, isLoading, error, refreshAuth } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);
  const [location] = useLocation();

  // Efecto para verificar la autenticación de manera más agresiva
  useEffect(() => {
    // Verificar la autenticación inmediatamente al cargar la ruta protegida
    const checkAuth = async () => {
      try {
        await refreshAuth();
        setAuthChecked(true);
      } catch (error) {
        console.error("Error verificando autenticación:", error);
        setAuthChecked(true); // Marcar como verificado incluso en error para evitar bucle infinito
      }
    };
    
    checkAuth();
  }, [refreshAuth]);

  // Efecto para marcar la autenticación como verificada cuando termine de cargar
  useEffect(() => {
    if (!isLoading) {
      setAuthChecked(true);
    }
  }, [isLoading]);

  // Log de depuración
  useEffect(() => {
    if (error) {
      console.error("Error de autenticación:", error);
    }
  }, [error]);

  // Log para seguimiento del ciclo de vida de autenticación
  useEffect(() => {
    console.log(`ProtectedRoute (${path}): isLoading=${isLoading}, authChecked=${authChecked}, user=${user ? 'existe' : 'no existe'}`);
  }, [isLoading, authChecked, user, path]);

  return (
    <Route path={path}>
      {(params) => {
        // Siempre mostrar un loader mientras se está verificando la autenticación
        if (isLoading || !authChecked) {
          return (
            <div className="flex items-center justify-center min-h-screen bg-background">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Verificando sesión...</p>
              </div>
            </div>
          );
        }
        
        // Si no hay usuario autenticado, redirigir al login
        if (!user || !user.id) {
          console.log(`Redirigiendo a auth desde ${path} por falta de usuario autenticado`);
          // Redirigir a la página de autenticación
          if (path !== '/auth') {
            return <Redirect to={`/auth?redirect=${encodeURIComponent(location)}`} />;
          }
        }
        
        // Redirigir a dashboard si intenta acceder a auth estando logueado
        if (path === '/auth' && user && user.id) {
          const searchParams = new URLSearchParams(window.location.search);
          let redirectTo = searchParams.get('redirect');
          
          // Evitar redirección cíclica
          if (!redirectTo || redirectTo === '/auth' || redirectTo.startsWith('/auth')) {
            redirectTo = '/dashboard';
          }
          return <Redirect to={redirectTo} />;
        }
        
        // Preparar las props adecuadas para el componente
        const userProps = user ? {
          name: user.name || user.username || 'Usuario',
          initials: (user.name || user.username || 'U').substring(0, 1).toUpperCase(),
          role: user.role || 'Usuario'
        } : null;
        
        const orgProps = organization ? {
          name: organization.name || 'Organización'
        } : null;
        
        // Si hay usuario, renderizar el componente protegido con todas las props necesarias
        return <Component 
          {...params} 
          user={userProps} 
          organization={orgProps} 
        />;
      }}
    </Route>
  );
}