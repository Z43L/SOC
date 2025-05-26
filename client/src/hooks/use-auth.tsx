import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser, Organization } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AuthData {
  user: SelectUser;
  organization: Organization | null;
}

interface RegisterResponse {
  user: SelectUser;
  organization: Organization;
}

type AuthContextType = {
  user: SelectUser | null;
  organization: Organization | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<AuthData, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<RegisterResponse, Error, InsertUser>;
  refreshAuth: () => Promise<void>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  // Estado local para un manejo más preciso del estado de carga
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  
  const {
    data: authData,
    error,
    isLoading: queryLoading,
    refetch
  } = useQuery<AuthData | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ 
      on401: "returnNull",
      credentials: 'include', 
    }),
    staleTime: 1000 * 60 * 5, // 5 minutos
    refetchOnWindowFocus: true,
    retry: 2,
    onSettled: () => {
      // Asegurarse de que isAuthenticating se establezca en false cuando la consulta concluya
      setIsAuthenticating(false);
    }
  });

  // Combinar isLoading del hook y nuestro estado local
  const isLoading = queryLoading || isAuthenticating;

  // Función para refrescar manualmente la autenticación
  const refreshAuth = async () => {
    try {
      setIsAuthenticating(true);
      await refetch();
    } catch (error) {
      console.error("Error al refrescar la autenticación:", error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Refrescar la autenticación periódicamente para mantener la sesión activa
  useEffect(() => {
    // Realizar una verificación inicial al cargar
    refreshAuth();

    const interval = setInterval(() => {
      refreshAuth();
    }, 10 * 60 * 1000); // Cada 10 minutos
    
    return () => clearInterval(interval);
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      setIsAuthenticating(true);
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
          credentials: "include",
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Error en la autenticación");
        }

        return await res.json();
      } catch (error) {
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    onSuccess: (data: AuthData) => {
      if (!data?.user) {
        toast({
          title: "Login failed",
          description: "Invalid user data received from server",
          variant: "destructive",
        });
        return;
      }
      queryClient.setQueryData(["/api/user"], data);
      queryClient.invalidateQueries();
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.name}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      setIsAuthenticating(true);
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
          credentials: "include",
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Error en el registro");
        }

        return await res.json();
      } catch (error) {
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    onSuccess: (data: RegisterResponse) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: "Registration successful",
        description: `Welcome, ${data.user.name}! Your organization ${data.organization.name} has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      setIsAuthenticating(true);
      try {
        const res = await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Error al cerrar sesión");
        }
      } finally {
        setIsAuthenticating(false);
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: authData?.user ?? null,
        organization: authData?.organization ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}