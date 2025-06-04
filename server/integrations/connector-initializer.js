/**
 * Inicialización centralizada de conectores
 * Este archivo exporta una función que inicializa todos los conectores
 * cuando se inicia el servidor
 */
import express from 'express';
import { connectorManager } from './connectors/connector-manager';
import { log } from '../vite';
/**
 * Inicializa todos los conectores cuando se inicia el servidor
 * @param app Aplicación Express donde se montarán los endpoints de conectores
 */
export async function initializeConnectors(app) {
    try {
        log('Inicializando conectores...', 'connectors');
        // Inicializar el gestor de conectores
        await connectorManager.initialize(app);
        // Configurar rutas para gestión de conectores
        setupConnectorRoutes(app);
        log('Conectores inicializados correctamente', 'connectors');
    }
    catch (error) {
        log(`Error inicializando conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
        throw error;
    }
}
/**
 * Configura rutas para gestión de conectores
 * @param app Aplicación Express
 */
function setupConnectorRoutes(app) {
    const router = express.Router();
    // Ruta para listar todos los conectores
    router.get('/', async (_req, res) => {
        try {
            const raw = connectorManager.getAllConnectors();
            const connectors = Array.isArray(raw)
                ? raw
                : raw instanceof Map
                    ? Array.from(raw.values())
                    : Object.values(raw);
            // NEW: response shape expected by the frontend
            res.json({
                connectors,
                pagination: {
                    limit: connectors.length,
                    offset: 0,
                    total: connectors.length
                }
            });
        }
        catch (error) {
            res.status(500).json({
                error: `Error obteniendo conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`
            });
        }
    });
    // Ruta para ejecutar un conector
    router.post('/:id/execute', async (req, res) => {
        try {
            const id = req.params.id;
            const result = await connectorManager.executeConnector(id);
            res.json({ success: true, data: result });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: `Error ejecutando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
            });
        }
    });
    // Ruta para detener un conector
    router.post('/:id/stop', async (req, res) => {
        try {
            const id = req.params.id;
            await connectorManager.stopConnector(id);
            res.json({ success: true, message: 'Conector detenido' });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: `Error deteniendo conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
            });
        }
    });
    // Ruta para probar un conector
    router.post('/:id/test', async (req, res) => {
        try {
            const id = req.params.id;
            const result = await connectorManager.testConnector(id);
            res.json(result);
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: `Error probando conector: ${error instanceof Error ? error.message : 'Error desconocido'}`
            });
        }
    });
    // Montar el router en la aplicación
    app.use('/api/connectors', router);
}
/**
 * Detiene todos los conectores cuando se cierra el servidor
 */
export async function shutdownConnectors() {
    try {
        log('Deteniendo conectores...', 'connectors');
        await connectorManager.shutdown();
        log('Conectores detenidos correctamente', 'connectors');
    }
    catch (error) {
        log(`Error deteniendo conectores: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'connectors');
        throw error;
    }
}
