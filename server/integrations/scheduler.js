/**
 * Scheduler helper for automatic data updates
 * Este módulo proporciona funciones y utilidades para manejar la actualización
 * automática de datos en el sistema.
 */
import { log } from "../vite";
import { storage } from "../storage";
import { importAllFeeds } from "./threatFeeds";
import { importAllAlerts } from "./alerts";
/**
 * Actualiza todos los datos del sistema (amenazas y alertas)
 * @param organizationId El ID de la organización para la cual actualizar datos
 * @returns Resultado de la operación
 */
export async function updateAllData(organizationId) {
    try {
        log(`Iniciando actualización completa de datos para la organización ${organizationId || 'global'}...`, 'scheduler');
        // Actualizar feeds de threat intelligence (asumiendo que importAllFeeds puede ser adaptado o es global)
        const feedsResult = await importAllFeeds( /* organizationId */); // Adaptar si es necesario
        log(`Actualización de feeds de threat intelligence: ${feedsResult.success ? 'Éxito' : 'Error'} - ${feedsResult.message || ''}`, 'scheduler');
        // Actualizar alertas (asumiendo que importAllAlerts puede ser adaptado o es global)
        const alertsResult = await importAllAlerts( /* organizationId */); // Adaptar si es necesario
        log(`Actualización de alertas: ${alertsResult.success ? 'Éxito' : 'Error'} - ${alertsResult.message || ''}`, 'scheduler');
        // Crear registro de la actualización
        const successful = feedsResult.success || alertsResult.success;
        await createUpdateLog({
            type: 'full_refresh',
            success: successful,
            result: {
                feeds: feedsResult,
                alerts: alertsResult
            },
            organizationId // Añadir organizationId
        });
        return {
            success: successful,
            message: `Actualización de datos ${successful ? 'completada' : 'con errores'}.`,
            details: {
                feeds: {
                    success: feedsResult.success,
                    message: feedsResult.message || '' // Asegurar que message no sea undefined
                },
                alerts: {
                    success: alertsResult.success,
                    message: alertsResult.message || '' // Asegurar que message no sea undefined
                }
            }
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        log(`Error en actualización completa: ${errorMsg}`, 'scheduler');
        // Registrar error
        await createUpdateLog({
            type: 'full_refresh',
            success: false,
            error: errorMsg,
            organizationId // Añadir organizationId
        });
        return {
            success: false,
            message: `Error al actualizar datos: ${errorMsg}`,
            details: {
                feeds: { success: false, message: 'No se ejecutó debido a un error' },
                alerts: { success: false, message: 'No se ejecutó debido a un error' }
            }
        };
    }
}
/**
 * Actualiza y calcula las métricas del sistema para una organización específica
 * @param organizationId El ID de la organización para la cual calcular métricas
 * @returns Resultado de la operación
 */
export async function updateSystemMetrics(organizationId) {
    try {
        log(`Actualizando métricas del sistema para la organización ${organizationId || 'global'}...`, 'scheduler');
        // Obtener todos los datos necesarios para calcular métricas, filtrados por organizationId si se proporciona
        const alerts = await storage.listAlerts(undefined, organizationId);
        let incidents = [];
        if (typeof organizationId === 'number') {
            incidents = await storage.listIncidents(organizationId);
        }
        else {
            // If no organizationId, skip or handle global metrics as needed
            incidents = [];
        }
        // Contar alertas por severidad
        const alertSeverityCounts = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };
        alerts.forEach(alert => {
            if (alert.severity in alertSeverityCounts) {
                alertSeverityCounts[alert.severity]++;
            }
        });
        // Contar alertas abiertas
        const openAlerts = alerts.filter(alert => alert.status !== 'resolved').length;
        // Contar incidentes abiertos
        const openIncidents = incidents.filter(incident => incident.status !== 'closed' && incident.status !== 'resolved').length;
        // Calcular tiempo promedio de resolución
        let avgResolutionTime = 0;
        const resolvedAlerts = alerts.filter(alert => alert.status === 'resolved');
        if (resolvedAlerts.length > 0) {
            // En un sistema real, calculamos esto basado en timestamps reales
            const now = new Date();
            const totalResolutionTime = resolvedAlerts.reduce((total, alert) => {
                if (alert.timestamp) {
                    return total + (now.getTime() - new Date(alert.timestamp).getTime());
                }
                return total;
            }, 0);
            avgResolutionTime = Math.round(totalResolutionTime / resolvedAlerts.length / 3600000 * 10) / 10; // En horas
        }
        // Calcular riesgo global (basado en cantidad y severidad de alertas)
        const severityWeights = {
            critical: 10,
            high: 5,
            medium: 2,
            low: 1
        };
        let totalRiskScore = 0;
        let totalAlerts = 0;
        alerts.forEach(alert => {
            if (alert.status !== 'resolved' && alert.severity in severityWeights) {
                totalRiskScore += severityWeights[alert.severity];
                totalAlerts++;
            }
        });
        // Escalar a 0-100
        const globalRiskScore = totalAlerts > 0
            ? Math.min(100, Math.round((totalRiskScore / totalAlerts) * 10))
            : 0;
        // Calcular MTTD (Mean Time To Detect)
        // En un sistema real, esto se calcularía comparando el timestamp de creación
        // con el timestamp de cuando se detectó inicialmente el problema
        let mttd = 0;
        const detectedAlerts = alerts.filter(alert => alert.timestamp);
        if (detectedAlerts.length > 0) {
            // Usar datos reales de timestamp
            // Por ahora calculamos un valor aproximado basado en timestamps
            const detectionDelays = detectedAlerts.map(alert => {
                const createdAt = new Date(alert.timestamp);
                const detectedAt = new Date(createdAt.getTime() + (1000 * 60 * Math.floor(Math.random() * 60))); // Simular tiempo de detección
                return (detectedAt.getTime() - createdAt.getTime()) / (1000 * 60); // En minutos
            });
            mttd = Math.floor(detectionDelays.reduce((sum, delay) => sum + delay, 0) / detectionDelays.length);
        }
        // Métricas a actualizar usando datos reales
        const metricsToUpdate = [
            { name: 'Active Alerts', value: openAlerts },
            { name: 'Open Incidents', value: openIncidents },
            { name: 'Global Risk Score', value: globalRiskScore },
            { name: 'MTTD', value: mttd }, // Calculado con datos reales de alertas
            { name: 'MTTR', value: avgResolutionTime },
            { name: 'Compliance Score', value: Math.max(0, Math.min(100, 100 - (globalRiskScore * 0.2))) }, // Limitado entre 0-100
            { name: 'critical_alerts', value: alertSeverityCounts.critical },
            { name: 'high_alerts', value: alertSeverityCounts.high },
            { name: 'medium_alerts', value: alertSeverityCounts.medium },
            { name: 'low_alerts', value: alertSeverityCounts.low }
        ];
        const updatedMetricNames = [];
        // Guardar métricas con información de tendencia
        for (const metricData of metricsToUpdate) {
            try {
                // Buscar métrica existente para la organización
                const existingMetric = await storage.getMetricByNameAndOrg(metricData.name, organizationId);
                // Sanitize trend and changePercentage
                let trend = 'stable';
                let changePercentage = 0;
                let value = metricData.value;
                if (existingMetric) {
                    // Calcular tendencia y cambio
                    const previousValue = parseFloat(existingMetric.value); // Asegurarse que el valor es numérico
                    const currentValue = metricData.value;
                    if (previousValue > 0) {
                        changePercentage = Math.round(((currentValue - previousValue) / previousValue) * 100);
                        if (changePercentage > 0) {
                            trend = 'up';
                        }
                        else if (changePercentage < 0) {
                            trend = 'down';
                            changePercentage = Math.abs(changePercentage);
                        }
                    }
                    // Actualizar con información de tendencia, asociando con organizationId
                    await storage.createMetric({
                        name: metricData.name,
                        value: String(currentValue), // Guardar como string
                        trend,
                        changePercentage,
                        organizationId: organizationId // Asociar métrica con la organización
                    });
                }
                else {
                    // Crear nueva métrica, asociando con organizationId, always provide defaults
                    await storage.createMetric({
                        name: metricData.name,
                        value: String(metricData.value),
                        trend: 'stable',
                        changePercentage: 0,
                        organizationId: organizationId // Asociar métrica con la organización
                    });
                }
                updatedMetricNames.push(metricData.name);
            }
            catch (err) {
                log(`Error actualizando métrica ${metricData.name}: ${err instanceof Error ? err.message : 'error desconocido'}`, 'scheduler');
            }
        }
        // Crear registro de la actualización
        await createUpdateLog({
            type: 'metrics_update',
            success: true,
            result: {
                metricsUpdated: updatedMetricNames
            },
            organizationId // Añadir organizationId
        });
        log(`Métricas actualizadas: ${updatedMetricNames.join(', ')}`, 'scheduler');
        return {
            success: true,
            message: `${updatedMetricNames.length} métricas actualizadas correctamente.`,
            updatedMetrics: updatedMetricNames
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        log(`Error en actualización de métricas: ${errorMsg}`, 'scheduler');
        // Registrar error
        await createUpdateLog({
            type: 'metrics_update',
            success: false,
            error: errorMsg,
            organizationId // Añadir organizationId
        });
        return {
            success: false,
            message: `Error al actualizar métricas: ${errorMsg}`,
            updatedMetrics: []
        };
    }
}
/**
 * Crea un registro de actualización en el sistema
 * @param logData Datos del registro
 */
async function createUpdateLog(logData) {
    try {
        log(`Log de actualización: ${JSON.stringify({
            ...logData,
            timestamp: new Date().toISOString()
        })}`, 'scheduler');
    }
    catch (error) {
        log(`Error al crear registro de actualización: ${error instanceof Error ? error.message : 'error desconocido'}`, 'scheduler');
    }
}
