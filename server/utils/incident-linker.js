/**
 * Utilidad para vinculación automática de alertas a incidentes
 * Maneja la creación automática de incidentes y vinculación de alertas
 */
import { storage } from '../storage';
import { log } from '../vite';
/**
 * Crea un incidente si es necesario y vincula la alerta al mismo
 * @param alert - La alerta que puede necesitar ser vinculada a un incidente
 */
export async function createIncidentIfNeededAndLinkAlert(alert) {
    try {
        // Solo crear incidentes para alertas de severidad alta o crítica
        if (!['high', 'critical'].includes(alert.severity.toLowerCase())) {
            return;
        }
        // Verificar si ya existe un incidente relacionado basado en:
        // - Misma fuente y tipo de alerta
        // - Timeframe reciente (últimas 2 horas)
        const existingIncidents = await storage.listIncidents();
        const recentTimeframe = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 horas atrás
        // Buscar incidente existente que pueda estar relacionado
        const relatedIncident = existingIncidents.find(incident => incident.status !== 'closed' &&
            incident.severity === alert.severity &&
            incident.createdAt &&
            new Date(incident.createdAt) >= recentTimeframe &&
            (incident.title.includes(alert.source) ||
                incident.description.includes(alert.source)));
        if (relatedIncident) {
            // Vincular alerta al incidente existente
            const currentAlerts = relatedIncident.relatedAlerts || [];
            if (!currentAlerts.includes(alert.id)) {
                currentAlerts.push(alert.id);
                await storage.updateIncident(relatedIncident.id, {
                    relatedAlerts: currentAlerts,
                    updatedAt: new Date()
                });
                log(`Alert ${alert.id} linked to existing incident ${relatedIncident.id}`, 'incident-linker');
            }
        }
        else {
            // Crear nuevo incidente
            const newIncident = {
                title: `Incident: ${alert.title}`,
                description: `Automatic incident created from critical alert: ${alert.description}`,
                severity: alert.severity,
                status: 'new',
                relatedAlerts: [alert.id],
                timeline: [{
                        timestamp: new Date().toISOString(),
                        action: 'incident_created',
                        details: `Incident automatically created from alert ${alert.id}`,
                        user: 'system'
                    }],
                organizationId: alert.organizationId
            };
            const createdIncident = await storage.createIncident(newIncident);
            log(`New incident ${createdIncident.id} created and linked to alert ${alert.id}`, 'incident-linker');
        }
    }
    catch (error) {
        log(`Error creating/linking incident for alert ${alert.id}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'incident-linker');
    }
}
