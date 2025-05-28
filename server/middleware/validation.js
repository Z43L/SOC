import { z } from 'zod';
// Middleware genérico para validar el cuerpo de la petición
export const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            const validatedData = schema.parse(req.body);
            req.body = validatedData;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: "Datos de entrada inválidos",
                    errors: error.format(),
                    code: "VALIDATION_ERROR"
                });
            }
            return res.status(500).json({
                message: "Error interno del servidor",
                code: "INTERNAL_ERROR"
            });
        }
    };
};
// Middleware para validar parámetros de la URL
export const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            const validatedParams = schema.parse(req.params);
            req.params = validatedParams;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: "Parámetros de URL inválidos",
                    errors: error.format(),
                    code: "VALIDATION_ERROR"
                });
            }
            return res.status(500).json({
                message: "Error interno del servidor",
                code: "INTERNAL_ERROR"
            });
        }
    };
};
// Middleware para validar query parameters
export const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const validatedQuery = schema.parse(req.query);
            req.query = validatedQuery;
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: "Parámetros de consulta inválidos",
                    errors: error.format(),
                    code: "VALIDATION_ERROR"
                });
            }
            return res.status(500).json({
                message: "Error interno del servidor",
                code: "INTERNAL_ERROR"
            });
        }
    };
};
