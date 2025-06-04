/**
 * Conector para recibir eventos vía webhook
 */

import { BaseConnector } from './base-connector';
import { WebhookConfig, HealthCheckResult } from './interfaces';
import { log } from '../../vite';

export class WebhookConnector extends BaseConnector {
  private webhookPath: string;
  private verifySignature: boolean;
  private signatureHeader?: string;
  private signatureSecret?: string;

  constructor(config: WebhookConfig) {
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
  protected async doStart(): Promise<void> {
    log(`Iniciando webhook en path: ${this.webhookPath}`, 'webhook-connector');
    // Registrar endpoint en Express para recibir webhook events
    const app = (global as any).expressApp as import('express').Express;
    app.post(this.webhookPath, (req, res) => {
      this.processWebhookEvent(req.body, req.headers as Record<string, string>);
      res.sendStatus(200);
    });
    log(`Webhook ${this.id} activo en ${this.webhookPath}`, 'webhook-connector');
  }

  /**
   * Detiene el conector webhook
   */
  protected async doStop(): Promise<void> {
    log(`Deteniendo webhook ${this.id}`, 'webhook-connector');
    // No es trivial remover rutas de Express, se puede reiniciar servidor o ignorar llamadas futuras
    log(`Webhook ${this.id} detenido`, 'webhook-connector');
  }

  /**
   * Verifica la salud del conector webhook
   */
  protected async doHealthCheck(): Promise<HealthCheckResult> {
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
    } catch (error) {
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
  protected async doTestConnection(): Promise<{ success: boolean; message: string }> {
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
    } catch (error) {
      return {
        success: false,
        message: `Error al probar conexión: ${error}`
      };
    }
  }

  /**
   * Procesa un evento webhook recibido
   */
  public processWebhookEvent(payload: any, headers: Record<string, string>): void {
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
    } catch (error) {
      this.emitError(`Error procesando webhook: ${error}`);
    }
  }

  /**
   * Valida la firma del webhook
   */
  private validateSignature(payload: any, headers: Record<string, string>): boolean {
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
  protected validateConfig(): void {
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
  public getWebhookConfig(): WebhookConfig {
    return this.config as WebhookConfig;
  }

  /**
   * Obtiene el path del webhook
   */
  public getWebhookPath(): string {
    return this.webhookPath;
  }
}
