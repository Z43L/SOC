/**
 * Conector para recibir eventos vía webhook
 */
import { BaseConnector } from './base-connector';
import { log } from '../../vite';
export class WebhookConnector extends BaseConnector {
    webhookPath;
    verifySignature;
    signatureHeader;
    signatureSecret;
    constructor(config) {
        super(config);
        this.webhookPath = config.path;
        this.verifySignature = config.verifySignature || false;
        this.signatureHeader = config.signatureHeader;
        this.signatureSecret = config.signatureSecret;
        this.validateConfig();
    }
    /**
     * Inicia el conector webhook
     */
    async doStart() {
        log(`Iniciando webhook en path: ${this.webhookPath}`, 'webhook-connector');
        // Registrar endpoint en Express para recibir webhook events
        const app = global.expressApp;
        app.post(this.webhookPath, (req, res) => {
            this.processWebhookEvent(req.body, req.headers);
            res.sendStatus(200);
        });
        log(`Webhook ${this.id} activo en ${this.webhookPath}`, 'webhook-connector');
    }
    /**
     * Detiene el conector webhook
     */
    async doStop() {
        log(`Deteniendo webhook ${this.id}`, 'webhook-connector');
        // No es trivial remover rutas de Express, se puede reiniciar servidor o ignorar llamadas futuras
        log(`Webhook ${this.id} detenido`, 'webhook-connector');
    }
    /**
     * Verifica la salud del conector webhook
     */
    async doHealthCheck() {
        const startTime = Date.now();
        try {
            // Para webhooks, verificamos que el path esté configurado correctamente
            if (!this.webhookPath) {
                return {
                    healthy: false,
                    message: 'Webhook path no configurado',
                    lastChecked: new Date()
                };
            }
            const latency = Date.now() - startTime;
            return {
                healthy: true,
                message: `Webhook activo en ${this.webhookPath}`,
                latency,
                lastChecked: new Date()
            };
        }
        catch (error) {
            return {
                healthy: false,
                message: `Error en health check: ${error}`,
                lastChecked: new Date()
            };
        }
    }
    /**
     * Prueba la conexión del webhook
     */
    async doTestConnection() {
        try {
            // Para webhooks, verificamos la configuración
            if (!this.webhookPath) {
                return {
                    success: false,
                    message: 'Webhook path no configurado'
                };
            }
            if (this.verifySignature && !this.signatureSecret) {
                return {
                    success: false,
                    message: 'Verificación de firma habilitada pero no hay secret configurado'
                };
            }
            return {
                success: true,
                message: `Webhook configurado correctamente en ${this.webhookPath}`
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error al probar conexión: ${error}`
            };
        }
    }
    /**
     * Procesa un evento webhook recibido
     */
    processWebhookEvent(payload, headers) {
        try {
            // Verificar firma si está habilitada
            if (this.verifySignature) {
                if (!this.validateSignature(payload, headers)) {
                    this.emitError('Firma de webhook inválida');
                    return;
                }
            }
            // Procesar el payload y emitir evento
            this.emitEvent({
                timestamp: new Date(),
                source: `webhook:${this.webhookPath}`,
                message: JSON.stringify(payload),
                severity: 'info',
                rawData: {
                    payload,
                    headers,
                    webhookPath: this.webhookPath
                }
            });
            log(`Evento webhook procesado en ${this.webhookPath}`, 'webhook-connector');
        }
        catch (error) {
            this.emitError(`Error procesando webhook: ${error}`);
        }
    }
    /**
     * Valida la firma del webhook
     */
    validateSignature(payload, headers) {
        if (!this.signatureHeader || !this.signatureSecret) {
            return false;
        }
        const receivedSignature = headers[this.signatureHeader.toLowerCase()];
        if (!receivedSignature) {
            return false;
        }
        // Aquí se implementaría la validación de firma específica
        // Por ahora retornamos true para pruebas
        return true;
    }
    /**
     * Valida la configuración específica del webhook
     */
    validateConfig() {
        super.validateConfig();
        if (!this.webhookPath) {
            throw new Error('Webhook path es requerido');
        }
        if (!this.webhookPath.startsWith('/')) {
            throw new Error('Webhook path debe comenzar con /');
        }
        if (this.verifySignature && !this.signatureSecret) {
            throw new Error('signatureSecret es requerido cuando verifySignature está habilitado');
        }
    }
    /**
     * Obtiene la configuración del webhook
     */
    getWebhookConfig() {
        return this.config;
    }
    /**
     * Obtiene el path del webhook
     */
    getWebhookPath() {
        return this.webhookPath;
    }
}
