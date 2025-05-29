/**
 * Rutas REST para gestión de conectores de datos
 */
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { connectorManager } from '../integrations/connectors/connector-manager';
import { credentialsManager } from '../integrations/connectors/credentials-manager';
import { db } from '../db';
import { isAuthenticated, requireRole } from '../middleware/auth';
import { log } from '../vite';
const router = Router();
// Esquemas de validación con Zod
const connectorBaseSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['syslog', 'api', 'webhook', 'file']),
    subtype: z.string().optional()
});
const syslogConfigSchema = connectorBaseSchema.extend({
    type: z.literal('syslog'),
    protocol: z.enum(['udp', 'tcp']),
    port: z.number().int().min(1).max(65535),
    bindAddress: z.string().ip().optional(),
    parser: z.enum(['rfc5424', 'rfc3164', 'custom']).optional()
});
const apiConfigSchema = connectorBaseSchema.extend({
    type: z.literal('api'),
    url: z.string().url(),
    method: z.enum(['GET', 'POST']),
    headers: z.record(z.string()).optional(),
    interval: z.number().int().min(30), // mínimo 30 segundos
    oauth: z.object({
        tokenUrl: z.string().url(),
        scope: z.string().optional()
    }).optional(),
    pagination: z.object({
        type: z.enum(['offset', 'cursor', 'nextUrl']),
        paramName: z.string()
    }).optional()
});
const webhookConfigSchema = connectorBaseSchema.extend({
    type: z.literal('webhook'),
    path: z.string().regex(/^\/[a-zA-Z0-9\/_-]+$/),
    verifySignature: z.boolean().optional(),
    signatureHeader: z.string().optional(),
    signatureSecret: z.string().optional()
});
const credentialsSchema = z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    privateKey: z.string().optional(),
    certificate: z.string().optional(),
    customFields: z.record(z.string()).optional()
});
// Middleware para verificar permisos de organización
const requireOrgAccess = async (req, res, next) => {
    try {
        const connectorId = req.params.id;
        if (connectorId) {
            const result = await db.query('SELECT org_id FROM connectors WHERE id = $1', [connectorId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conector no encontrado' });
            }
            const connectorOrgId = result.rows[0].org_id;
            if (req.user?.orgId !== connectorOrgId) {
                return res.status(403).json({ error: 'No tienes acceso a este conector' });
            }
        }
        next();
    }
    catch (error) {
        log(`Error verificando acceso a conector: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
/**
 * GET /api/connectors
 * Lista todos los conectores de la organización
 */
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const { type, status, limit = 50, offset = 0 } = req.query;
        let query = `
      SELECT 
        id, name, type, subtype, status, 
        last_event_at, error_message, events_per_min,
        created_at, updated_at
      FROM connectors 
      WHERE org_id = $1
    `;
        const params = [req.user?.orgId];
        let paramCount = 1;
        if (type) {
            query += ` AND type = $${++paramCount}`;
            params.push(type);
        }
        if (status) {
            query += ` AND status = $${++paramCount}`;
            params.push(status);
        }
        query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(Number(limit), Number(offset));
        const result = await db.query(query, params);
        // Obtener métricas en tiempo real de conectores activos
        const connectorsWithMetrics = result.rows.map(connector => {
            const activeConnector = connectorManager.getConnector(connector.id);
            if (activeConnector) {
                const metrics = activeConnector.getMetrics();
                return {
                    ...connector,
                    realTimeMetrics: {
                        eventsPerMinute: metrics.eventsPerMinute,
                        errorsPerMinute: metrics.errorsPerMinute,
                        avgLatency: metrics.avgLatency,
                        uptime: metrics.uptime
                    }
                };
            }
            return connector;
        });
        res.json({
            connectors: connectorsWithMetrics,
            pagination: {
                limit: Number(limit),
                offset: Number(offset),
                total: result.rows.length
            }
        });
    }
    catch (error) {
        log(`Error listando conectores: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error listando conectores' });
    }
});
/**
 * POST /api/connectors
 * Crea un nuevo conector
 */
router.post('/', isAuthenticated, requireRole('admin'), async (req, res) => {
    try {
        const { credentials, ...configData } = req.body;
        // Validar configuración según tipo
        let validatedConfig;
        switch (configData.type) {
            case 'syslog':
                validatedConfig = syslogConfigSchema.parse(configData);
                break;
            case 'api':
                validatedConfig = apiConfigSchema.parse(configData);
                break;
            case 'webhook':
                validatedConfig = webhookConfigSchema.parse(configData);
                break;
            default:
                return res.status(400).json({ error: 'Tipo de conector no soportado' });
        }
        // Validar credenciales si se proporcionan
        let encryptedCredentials;
        if (credentials) {
            const validatedCredentials = credentialsSchema.parse(credentials);
            if (!credentialsManager.validateCredentials(validatedCredentials, validatedConfig.type)) {
                return res.status(400).json({ error: 'Credenciales incompletas para este tipo de conector' });
            }
            encryptedCredentials = credentialsManager.encryptCredentials(validatedCredentials);
        }
        // Verificar límites de la organización (máximo 100 conectores por ahora)
        const countResult = await db.query('SELECT COUNT(*) FROM connectors WHERE org_id = $1', [req.user?.orgId]);
        if (Number(countResult.rows[0].count) >= 100) {
            return res.status(403).json({ error: 'Has alcanzado el límite máximo de conectores para tu plan' });
        }
        const connectorConfig = {
            id: uuidv4(),
            orgId: req.user?.orgId,
            ...validatedConfig,
            ...encryptedCredentials && { encryptedCredentials }
        };
        const connectorId = await connectorManager.createConnector(connectorConfig);
        res.status(201).json({
            id: connectorId,
            message: 'Conector creado exitosamente'
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Datos de configuración inválidos',
                details: error.errors
            });
        }
        log(`Error creando conector: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error creando conector' });
    }
});
/**
 * GET /api/connectors/:id
 * Obtiene detalles de un conector específico
 */
router.get('/:id', isAuthenticated, requireOrgAccess, async (req, res) => {
    try {
        const result = await db.query(`
      SELECT 
        id, name, type, subtype, config, status,
        last_event_at, error_message, events_per_min,
        created_at, updated_at
      FROM connectors 
      WHERE id = $1
    `, [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conector no encontrado' });
        }
        const connector = result.rows[0];
        // Obtener métricas en tiempo real si está activo
        const activeConnector = connectorManager.getConnector(req.params.id);
        if (activeConnector) {
            const metrics = activeConnector.getMetrics();
            const health = await activeConnector.healthCheck();
            connector.realTimeMetrics = metrics;
            connector.healthStatus = health;
        }
        // Obtener logs recientes
        const logsResult = await db.query(`
      SELECT ts, level, message 
      FROM connector_logs 
      WHERE connector_id = $1 
      ORDER BY ts DESC 
      LIMIT 200
    `, [req.params.id]);
        connector.recentLogs = logsResult.rows;
        res.json(connector);
    }
    catch (error) {
        log(`Error obteniendo conector ${req.params.id}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error obteniendo conector' });
    }
});
/**
 * PATCH /api/connectors/:id
 * Actualiza la configuración de un conector
 */
router.patch('/:id', isAuthenticated, requireRole('admin'), requireOrgAccess, async (req, res) => {
    try {
        const { credentials, status, ...configUpdates } = req.body;
        // Si se incluye status, manejar pausa/activación
        if (status && ['active', 'paused'].includes(status)) {
            await connectorManager.toggleConnector(req.params.id, status);
        }
        // Si hay actualizaciones de configuración
        if (Object.keys(configUpdates).length > 0 || credentials) {
            const updateConfig = { ...configUpdates };
            if (credentials) {
                const validatedCredentials = credentialsSchema.parse(credentials);
                updateConfig.credentials = validatedCredentials;
            }
            await connectorManager.updateConnector(req.params.id, updateConfig);
        }
        res.json({ message: 'Conector actualizado exitosamente' });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Datos de actualización inválidos',
                details: error.errors
            });
        }
        log(`Error actualizando conector ${req.params.id}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error actualizando conector' });
    }
});
/**
 * DELETE /api/connectors/:id
 * Elimina un conector
 */
router.delete('/:id', isAuthenticated, requireRole('admin'), requireOrgAccess, async (req, res) => {
    try {
        await connectorManager.deleteConnector(req.params.id);
        res.json({ message: 'Conector eliminado exitosamente' });
    }
    catch (error) {
        log(`Error eliminando conector ${req.params.id}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error eliminando conector' });
    }
});
/**
 * POST /api/connectors/:id/test
 * Prueba la conectividad de un conector
 */
router.post('/:id/test', isAuthenticated, requireOrgAccess, async (req, res) => {
    try {
        const activeConnector = connectorManager.getConnector(req.params.id);
        if (!activeConnector) {
            return res.status(404).json({ error: 'Conector no está activo o no existe' });
        }
        const testResult = await activeConnector.testConnection();
        res.json(testResult);
    }
    catch (error) {
        log(`Error probando conector ${req.params.id}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error probando conectividad' });
    }
});
/**
 * GET /api/connectors/schema/:type
 * Obtiene el esquema JSON Schema para un tipo de conector específico
 */
router.get('/schema/:type', isAuthenticated, async (req, res) => {
    try {
        const { type } = req.params;
        const schemas = {
            syslog: {
                type: "object",
                required: ["name", "type", "protocol", "port"],
                properties: {
                    name: { type: "string", minLength: 1, maxLength: 255 },
                    type: { type: "string", enum: ["syslog"] },
                    protocol: { type: "string", enum: ["udp", "tcp"] },
                    port: { type: "integer", minimum: 1, maximum: 65535 },
                    bindAddress: { type: "string", format: "ipv4", default: "0.0.0.0" },
                    parser: { type: "string", enum: ["rfc5424", "rfc3164", "custom"], default: "rfc5424" }
                }
            },
            api: {
                type: "object",
                required: ["name", "type", "url", "method", "interval"],
                properties: {
                    name: { type: "string", minLength: 1, maxLength: 255 },
                    type: { type: "string", enum: ["api"] },
                    url: { type: "string", format: "uri" },
                    method: { type: "string", enum: ["GET", "POST"] },
                    interval: { type: "integer", minimum: 30, description: "Intervalo en segundos" },
                    headers: { type: "object", additionalProperties: { type: "string" } },
                    oauth: {
                        type: "object",
                        properties: {
                            tokenUrl: { type: "string", format: "uri" },
                            scope: { type: "string" }
                        }
                    }
                }
            },
            webhook: {
                type: "object",
                required: ["name", "type", "path"],
                properties: {
                    name: { type: "string", minLength: 1, maxLength: 255 },
                    type: { type: "string", enum: ["webhook"] },
                    path: { type: "string", pattern: "^/[a-zA-Z0-9/_-]+$" },
                    verifySignature: { type: "boolean", default: false },
                    signatureHeader: { type: "string", default: "X-Signature" },
                    signatureSecret: { type: "string" }
                }
            }
        };
        const schema = schemas[type];
        if (!schema) {
            return res.status(404).json({ error: 'Esquema no encontrado para este tipo' });
        }
        res.json(schema);
    }
    catch (error) {
        log(`Error obteniendo esquema para tipo ${req.params.type}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error obteniendo esquema' });
    }
});
/**
 * GET /api/connectors/:id/logs
 * Obtiene logs recientes de un conector con paginación
 */
router.get('/:id/logs', isAuthenticated, requireOrgAccess, async (req, res) => {
    try {
        const { limit = 100, offset = 0, level } = req.query;
        let query = `
      SELECT ts, level, message 
      FROM connector_logs 
      WHERE connector_id = $1
    `;
        const params = [req.params.id];
        let paramCount = 1;
        if (level) {
            query += ` AND level = $${++paramCount}`;
            params.push(level);
        }
        query += ` ORDER BY ts DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(Number(limit), Number(offset));
        const result = await db.query(query, params);
        res.json({
            logs: result.rows,
            pagination: {
                limit: Number(limit),
                offset: Number(offset),
                total: result.rows.length
            }
        });
    }
    catch (error) {
        log(`Error obteniendo logs del conector ${req.params.id}: ${error}`, 'connector-routes');
        res.status(500).json({ error: 'Error obteniendo logs' });
    }
});
export default router;
