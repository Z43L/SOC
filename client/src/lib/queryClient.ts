import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorText;
    try {
      // Intentar obtener el texto o JSON del error
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonError = await res.json();
        errorText = jsonError.error || jsonError.message || res.statusText;
      } else {
        errorText = await res.text() || res.statusText;
      }
    } catch (e) {
      errorText = res.statusText;
    }
    throw new Error(`${res.status}: ${errorText}`);
  }
}

export const apiRequest = async (
  method: string, 
  url: string, 
  body?: any, 
  options?: RequestInit
) => {
  const defaultHeaders: HeadersInit = body ? {
    'Content-Type': 'application/json',
  } : {};
  
  // Asegurar que las credenciales siempre se incluyan para enviar cookies
  const fetchOptions: RequestInit = {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // Crítico para sesiones - siempre incluir cookies
    ...options,
  };

  // Forzar credentials: include incluso si options intenta sobreescribirlo
  fetchOptions.credentials = "include";

  console.log(`[API REQUEST] ${method} ${url}`);

  try {
    const res = await fetch(url, fetchOptions);
    
    // Log para debug
    console.log(`[API RESPONSE] ${method} ${url}: ${res.status}`);
    
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`[API ERROR] (${method} ${url}):`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn = <T>(options: {
  on401?: UnauthorizedBehavior;
  credentials?: RequestCredentials;
} = {}): QueryFunction<T> =>
  async ({ queryKey }) => {
    const fetchOptions: RequestInit = {
      credentials: "include", // Siempre "include" para garantizar envío de cookies
      cache: "no-cache",
      headers: {
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      }
    };

    console.log(`[QUERY] Ejecutando query ${queryKey[0]}`);

    try {
      // Agregar timestamp para evitar caché
      const url = typeof queryKey[0] === 'string' ? 
        `${queryKey[0]}${queryKey[0].includes('?') ? '&' : '?'}_ts=${Date.now()}` : 
        queryKey[0];
        
      const res = await fetch(url as string, fetchOptions);
      
      console.log(`[QUERY RESPONSE] ${url}: ${res.status}`);
      
      if (res.status === 401) {
        console.warn(`[AUTH ERROR] 401 en ${url}`);
        if (options.on401 === "returnNull") {
          console.log("[AUTH] Retornando null por opción on401=returnNull");
          return null as unknown as T;
        }
        throw new Error('Unauthorized');
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error(`[QUERY ERROR] (${queryKey[0]}):`, error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ 
        on401: "returnNull",
      }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5,
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: 1,
    },
  },
});
