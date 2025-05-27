import type { Request, Response, NextFunction } from 'express';

// Middleware de autenticación mejorado que ya existe en routes.ts
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  // Verificación detallada del estado de autenticación
  if (req.isAuthenticated && req.isAuthenticated()) {
    console.log(`Usuario autenticado: ${req.user?.username || 'Desconocido'} accediendo a ${req.path}`);
    return next();
  }
  
  // Si llegamos aquí, el usuario no está autenticado
  console.log(`Intento de acceso no autorizado a ${req.path}`);
  
  // Devolver una respuesta con información detallada
  return res.status(401).json({ 
    message: "No autenticado", 
    code: "AUTH_REQUIRED",
    redirectTo: "/auth",
    details: "La sesión ha expirado o no existe. Por favor inicie sesión nuevamente."
  });
};

// Middleware para verificar roles específicos
export const requireRole = (allowedRoles: string | string[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        message: "No autenticado", 
        code: "AUTH_REQUIRED"
      });
    }

    const userRole = req.user?.role || 'user';
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ 
        message: "Acceso denegado", 
        code: "INSUFFICIENT_PERMISSIONS",
        requiredRoles: roles,
        userRole
      });
    }

    next();
  };
};

// Middleware para verificar si el usuario es administrador
export const requireAdmin = requireRole('admin');

// Middleware para verificar si el usuario pertenece a la organización
export const requireOrganization = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ 
      message: "No autenticado", 
      code: "AUTH_REQUIRED"
    });
  }

  if (!req.user?.organizationId) {
    return res.status(403).json({ 
      message: "Usuario sin organización asignada", 
      code: "NO_ORGANIZATION"
    });
  }

  next();
};
