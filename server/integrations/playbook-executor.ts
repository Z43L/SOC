import { storage } from '../storage';
import { PlaybookExecution, Playbook } from '@shared/schema';
import fetch from 'node-fetch';
import logger from './logger';

// Definición de tipos para los pasos del playbook
export interface PlaybookStep {
  id: string;
  name: string;
  type: PlaybookStepType;
  config: Record<string, any>;
  condition?: PlaybookStepCondition;
  onSuccess?: string[]; // IDs de los siguientes pasos a ejecutar en caso de éxito
  onFailure?: string[]; // IDs de los siguientes pasos a ejecutar en caso de fallo
}

export interface PlaybookStepCondition {
  type: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  field: string;
  value: any;
}

// Tipos de pasos que soportamos en los playbooks
export enum PlaybookStepType {
  // Pasos de integración con sistemas EDR
  EDR_ISOLATE_HOST = 'edr_isolate_host', // Aislar un host en la red
  EDR_UNISOLATE_HOST = 'edr_unisolate_host', // Eliminar el aislamiento de un host
  EDR_SCAN_HOST = 'edr_scan_host', // Iniciar un escaneo en un host
  EDR_GET_PROCESS_LIST = 'edr_get_process_list', // Obtener lista de procesos
  EDR_KILL_PROCESS = 'edr_kill_process', // Matar un proceso
  
  // Pasos de integración con firewalls
  FIREWALL_BLOCK_IP = 'firewall_block_ip', // Bloquear una IP
  FIREWALL_UNBLOCK_IP = 'firewall_unblock_ip', // Desbloquear una IP
  FIREWALL_BLOCK_DOMAIN = 'firewall_block_domain', // Bloquear un dominio
  FIREWALL_UNBLOCK_DOMAIN = 'firewall_unblock_domain', // Desbloquear un dominio
  
  // Pasos de integración con sistemas de identidad
  IDENTITY_DISABLE_USER = 'identity_disable_user', // Deshabilitar una cuenta de usuario
  IDENTITY_ENABLE_USER = 'identity_enable_user', // Habilitar una cuenta de usuario
  IDENTITY_RESET_PASSWORD = 'identity_reset_password', // Resetear la contraseña de un usuario
  IDENTITY_ADD_TO_GROUP = 'identity_add_to_group', // Añadir usuario a un grupo
  IDENTITY_REMOVE_FROM_GROUP = 'identity_remove_from_group', // Eliminar usuario de un grupo
  
  // Pasos de notificación
  NOTIFY_EMAIL = 'notify_email', // Enviar email
  NOTIFY_SLACK = 'notify_slack', // Enviar mensaje a Slack
  NOTIFY_SMS = 'notify_sms', // Enviar SMS
  
  // Pasos de enriquecimiento y análisis
  ENRICH_IOC = 'enrich_ioc', // Enriquecer un IOC
  AI_ANALYZE_ALERT = 'ai_analyze_alert', // Analizar alerta con IA
  LOOKUP_THREAT_INTEL = 'lookup_threat_intel', // Buscar datos en plataformas de intel
  
  // Flujo de control
  CONDITION = 'condition', // Paso de control condicional
  WAIT = 'wait', // Esperar un tiempo determinado
  PARALLEL = 'parallel', // Ejecutar pasos en paralelo
  CALL_API = 'call_api', // Llamar a una API externa
}

// Clase principal para la ejecución de playbooks
export class PlaybookExecutor {
  private executionId: number;
  private playbook: Playbook;
  private logs: any[] = [];
  private context: Record<string, any> = {};
  private triggerEntity: any | null = null;
  
  constructor(executionId: number, playbook: Playbook) {
    this.executionId = executionId;
    this.playbook = playbook;
  }
  
  // Inicializa el contexto de ejecución con datos para el paso desencadenante
  async initialize(triggerEntityId?: number, triggerType?: string): Promise<void> {
    if (triggerEntityId && triggerType) {
      if (triggerType === 'alert') {
        this.triggerEntity = await storage.getAlert(triggerEntityId);
      } else if (triggerType === 'incident') {
        this.triggerEntity = await storage.getIncident(triggerEntityId);
      }
      
      // Inicializar el contexto con los datos de la entidad desencadenante
      if (this.triggerEntity) {
        this.context = {
          trigger: {
            type: triggerType,
            entity: this.triggerEntity
          }
        };
      }
    }
    
    // Registrar el inicio de la ejecución
    this.logInfo(`Playbook execution started: ${this.playbook.name}`);
  }
  
  // Ejecuta el playbook completo
  async execute(): Promise<boolean> {
    try {
      // Verificar si el playbook tiene pasos
      if (!this.playbook.steps || !Array.isArray(this.playbook.steps) || this.playbook.steps.length === 0) {
        this.logError('Playbook does not have any steps defined');
        await this.finishExecution(false, 'Playbook does not have any steps defined');
        return false;
      }
      
      // Obtener el primer paso
      const firstSteps = this.findStartingSteps();
      if (firstSteps.length === 0) {
        this.logError('No starting steps found in playbook');
        await this.finishExecution(false, 'No starting steps found in playbook');
        return false;
      }
      
      // Ejecutar los pasos de inicio
      let success = true;
      for (const step of firstSteps) {
        const stepResult = await this.executeStep(step);
        success = success && stepResult;
      }
      
      // Finalizar la ejecución
      await this.finishExecution(success);
      return success;
    } catch (error) {
      this.logError(`Error executing playbook: ${error.message}`);
      await this.finishExecution(false, error.message);
      return false;
    }
  }
  
  // Identifica los pasos iniciales del playbook
  private findStartingSteps(): PlaybookStep[] {
    // Considerar pasos iniciales aquellos que no son referenciados como siguientes
    // pasos en ningún otro paso
    const allStepIds = this.playbook.steps.map(step => step.id);
    const nextStepIds = new Set<string>();
    
    for (const step of this.playbook.steps as PlaybookStep[]) {
      if (step.onSuccess) {
        step.onSuccess.forEach(id => nextStepIds.add(id));
      }
      if (step.onFailure) {
        step.onFailure.forEach(id => nextStepIds.add(id));
      }
    }
    
    return (this.playbook.steps as PlaybookStep[]).filter(step => 
      !nextStepIds.has(step.id) || 
      // Si todos los pasos tienen referencias, considerar como iniciales los que tengan ciertos tipos
      ['CONDITION', 'TRIGGER'].includes(step.type.toUpperCase())
    );
  }
  
  // Ejecuta un paso individual del playbook
  private async executeStep(step: PlaybookStep): Promise<boolean> {
    try {
      this.logInfo(`Executing step: ${step.name} (${step.type})`);
      
      // Evaluar condición si existe
      if (step.condition) {
        const conditionMet = this.evaluateCondition(step.condition);
        if (!conditionMet) {
          this.logInfo(`Condition not met for step: ${step.name} - skipping`);
          return true; // Continuar con la ejecución, pero saltar este paso
        }
      }
      
      // Ejecutar según el tipo de paso
      let result = false;
      
      switch (step.type) {
        // Implementación de pasos de integración con EDR
        case PlaybookStepType.EDR_ISOLATE_HOST:
          result = await this.executeEdrIsolateHost(step);
          break;
          
        case PlaybookStepType.EDR_UNISOLATE_HOST:
          result = await this.executeEdrUnisolateHost(step);
          break;
          
        case PlaybookStepType.EDR_SCAN_HOST:
          result = await this.executeEdrScanHost(step);
          break;
          
        case PlaybookStepType.EDR_GET_PROCESS_LIST:
          result = await this.executeEdrGetProcessList(step);
          break;
          
        case PlaybookStepType.EDR_KILL_PROCESS:
          result = await this.executeEdrKillProcess(step);
          break;
          
        // Implementación de pasos de integración con firewalls
        case PlaybookStepType.FIREWALL_BLOCK_IP:
          result = await this.executeFirewallBlockIp(step);
          break;
          
        case PlaybookStepType.FIREWALL_UNBLOCK_IP:
          result = await this.executeFirewallUnblockIp(step);
          break;
          
        case PlaybookStepType.FIREWALL_BLOCK_DOMAIN:
          result = await this.executeFirewallBlockDomain(step);
          break;
          
        case PlaybookStepType.FIREWALL_UNBLOCK_DOMAIN:
          result = await this.executeFirewallUnblockDomain(step);
          break;
          
        // Implementación de pasos de integración con sistemas de identidad
        case PlaybookStepType.IDENTITY_DISABLE_USER:
          result = await this.executeIdentityDisableUser(step);
          break;
          
        case PlaybookStepType.IDENTITY_ENABLE_USER:
          result = await this.executeIdentityEnableUser(step);
          break;
          
        case PlaybookStepType.IDENTITY_RESET_PASSWORD:
          result = await this.executeIdentityResetPassword(step);
          break;
          
        case PlaybookStepType.IDENTITY_ADD_TO_GROUP:
          result = await this.executeIdentityAddToGroup(step);
          break;
          
        case PlaybookStepType.IDENTITY_REMOVE_FROM_GROUP:
          result = await this.executeIdentityRemoveFromGroup(step);
          break;
          
        // Implementación de pasos de notificación
        case PlaybookStepType.NOTIFY_EMAIL:
          result = await this.executeNotifyEmail(step);
          break;
          
        case PlaybookStepType.NOTIFY_SLACK:
          result = await this.executeNotifySlack(step);
          break;
          
        case PlaybookStepType.NOTIFY_SMS:
          result = await this.executeNotifySms(step);
          break;
          
        // Implementación de pasos de enriquecimiento y análisis
        case PlaybookStepType.ENRICH_IOC:
          result = await this.executeEnrichIoc(step);
          break;
          
        case PlaybookStepType.AI_ANALYZE_ALERT:
          result = await this.executeAiAnalyzeAlert(step);
          break;
          
        case PlaybookStepType.LOOKUP_THREAT_INTEL:
          result = await this.executeLookupThreatIntel(step);
          break;
          
        // Implementación de pasos de flujo de control
        case PlaybookStepType.CONDITION:
          result = await this.executeCondition(step);
          break;
          
        case PlaybookStepType.WAIT:
          result = await this.executeWait(step);
          break;
          
        case PlaybookStepType.PARALLEL:
          result = await this.executeParallel(step);
          break;
          
        case PlaybookStepType.CALL_API:
          result = await this.executeCallApi(step);
          break;
          
        default:
          this.logWarning(`Unsupported step type: ${step.type}`);
          result = false;
      }
      
      // Determinar los siguientes pasos a ejecutar
      const nextSteps = result 
        ? step.onSuccess || []
        : step.onFailure || [];
      
      // Ejecutar los siguientes pasos
      for (const nextStepId of nextSteps) {
        const nextStep = (this.playbook.steps as PlaybookStep[]).find(s => s.id === nextStepId);
        if (nextStep) {
          await this.executeStep(nextStep);
        } else {
          this.logWarning(`Next step not found: ${nextStepId}`);
        }
      }
      
      return result;
    } catch (error) {
      this.logError(`Error executing step ${step.name}: ${error.message}`);
      return false;
    }
  }
  
  // Evalúa una condición de un paso
  private evaluateCondition(condition: PlaybookStepCondition): boolean {
    try {
      // Extraer el valor del campo del contexto
      const fieldPath = condition.field.split('.');
      let value = this.context;
      
      for (const path of fieldPath) {
        if (value === undefined || value === null) {
          return false; // El campo no existe
        }
        value = value[path];
      }
      
      // Evaluar según el tipo de condición
      switch (condition.type) {
        case 'equals':
          return value === condition.value;
        case 'contains':
          if (typeof value === 'string') {
            return value.includes(String(condition.value));
          } else if (Array.isArray(value)) {
            return value.includes(condition.value);
          }
          return false;
        case 'greater_than':
          return Number(value) > Number(condition.value);
        case 'less_than':
          return Number(value) < Number(condition.value);
        case 'exists':
          return value !== undefined && value !== null;
        default:
          return false;
      }
    } catch (error) {
      this.logError(`Error evaluating condition: ${error.message}`);
      return false;
    }
  }
  
  // Finaliza la ejecución del playbook
  private async finishExecution(success: boolean, errorMessage?: string): Promise<void> {
    const endTime = new Date();
    const status = success ? 'completed' : 'failed';
    
    // Actualizar la ejecución del playbook
    await storage.updatePlaybookExecution(this.executionId, {
      status,
      completedAt: endTime,
      error: errorMessage,
      results: { 
        success, 
        logs: this.logs,
        context: this.context 
      },
    });
    
    // Incrementar el contador de ejecuciones del playbook
    await storage.incrementPlaybookExecutionCount(this.playbook.id);
    
    // Calcular y actualizar el tiempo promedio de ejecución
    // Esto se hace en el método incrementPlaybookExecutionCount
    
    this.logInfo(`Playbook execution finished with status: ${status}`);
  }
  
  // Métodos de logging
  private logInfo(message: string): void {
    const log = { level: 'info', message, timestamp: new Date().toISOString() };
    this.logs.push(log);
    logger.info(`[PlaybookExecution:${this.executionId}] ${message}`);
  }
  
  private logWarning(message: string): void {
    const log = { level: 'warning', message, timestamp: new Date().toISOString() };
    this.logs.push(log);
    logger.warn(`[PlaybookExecution:${this.executionId}] ${message}`);
  }
  
  private logError(message: string): void {
    const log = { level: 'error', message, timestamp: new Date().toISOString() };
    this.logs.push(log);
    logger.error(`[PlaybookExecution:${this.executionId}] ${message}`);
  }
  
  private logDebug(message: string): void {
    const log = { level: 'debug', message, timestamp: new Date().toISOString() };
    this.logs.push(log);
    logger.debug(`[PlaybookExecution:${this.executionId}] ${message}`);
  }
  
  // Implementaciones de ejecución de los diferentes tipos de pasos
  // Estas son las implementaciones reales de integración con sistemas externos
  
  // EDR - Endpoint Detection and Response
  private async executeEdrIsolateHost(step: PlaybookStep): Promise<boolean> {
    try {
      const { host, edrSystem } = step.config;
      this.logInfo(`Isolating host '${host}' in EDR system '${edrSystem}'`);
      
      // Obtener la configuración del conector EDR correspondiente
      const edrConnector = await this.getConnectorByName(edrSystem);
      if (!edrConnector) {
        this.logError(`EDR connector '${edrSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del EDR para aislar el host
      const response = await this.callExternalApi({
        url: `${edrConnector.configuration.baseUrl}/api/v1/hosts/${host}/actions/isolate`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${edrConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comment: `Isolated by SOC-Inteligente SOAR playbook: ${this.playbook.name}`,
          isolationType: 'full'
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully isolated host '${host}'`);
        
        // Guardar el resultado en el contexto para usarlo en pasos posteriores
        this.context.edrActions = this.context.edrActions || {};
        this.context.edrActions.isolateHost = {
          host,
          edrSystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to isolate host '${host}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing EDR isolate host: ${error.message}`);
      return false;
    }
  }
  
  private async executeEdrUnisolateHost(step: PlaybookStep): Promise<boolean> {
    try {
      const { host, edrSystem } = step.config;
      this.logInfo(`Removing isolation for host '${host}' in EDR system '${edrSystem}'`);
      
      // Obtener la configuración del conector EDR correspondiente
      const edrConnector = await this.getConnectorByName(edrSystem);
      if (!edrConnector) {
        this.logError(`EDR connector '${edrSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del EDR para eliminar el aislamiento
      const response = await this.callExternalApi({
        url: `${edrConnector.configuration.baseUrl}/api/v1/hosts/${host}/actions/unisolate`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${edrConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comment: `Isolation removed by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully removed isolation for host '${host}'`);
        
        // Guardar el resultado en el contexto
        this.context.edrActions = this.context.edrActions || {};
        this.context.edrActions.unisolateHost = {
          host,
          edrSystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to remove isolation for host '${host}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing EDR unisolate host: ${error.message}`);
      return false;
    }
  }
  
  private async executeEdrScanHost(step: PlaybookStep): Promise<boolean> {
    try {
      const { host, edrSystem, scanType = 'full' } = step.config;
      this.logInfo(`Initiating ${scanType} scan for host '${host}' in EDR system '${edrSystem}'`);
      
      // Obtener la configuración del conector EDR correspondiente
      const edrConnector = await this.getConnectorByName(edrSystem);
      if (!edrConnector) {
        this.logError(`EDR connector '${edrSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del EDR para iniciar el escaneo
      const response = await this.callExternalApi({
        url: `${edrConnector.configuration.baseUrl}/api/v1/hosts/${host}/actions/scan`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${edrConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scanType,
          priority: 'high',
          comment: `Scan initiated by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully initiated scan for host '${host}'`);
        
        // Guardar el resultado en el contexto
        this.context.edrActions = this.context.edrActions || {};
        this.context.edrActions.scanHost = {
          host,
          edrSystem,
          scanType,
          success: true,
          timestamp: new Date().toISOString(),
          scanId: response.data.scanId,
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to initiate scan for host '${host}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing EDR scan host: ${error.message}`);
      return false;
    }
  }
  
  private async executeEdrGetProcessList(step: PlaybookStep): Promise<boolean> {
    try {
      const { host, edrSystem } = step.config;
      this.logInfo(`Getting process list for host '${host}' from EDR system '${edrSystem}'`);
      
      // Obtener la configuración del conector EDR correspondiente
      const edrConnector = await this.getConnectorByName(edrSystem);
      if (!edrConnector) {
        this.logError(`EDR connector '${edrSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del EDR para obtener la lista de procesos
      const response = await this.callExternalApi({
        url: `${edrConnector.configuration.baseUrl}/api/v1/hosts/${host}/processes`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${edrConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.success) {
        this.logInfo(`Successfully retrieved process list for host '${host}'`);
        
        // Guardar el resultado en el contexto
        this.context.edrActions = this.context.edrActions || {};
        this.context.edrActions.processList = {
          host,
          edrSystem,
          success: true,
          timestamp: new Date().toISOString(),
          processes: response.data.processes,
          count: response.data.processes.length
        };
        
        return true;
      } else {
        this.logError(`Failed to get process list for host '${host}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing EDR get process list: ${error.message}`);
      return false;
    }
  }
  
  private async executeEdrKillProcess(step: PlaybookStep): Promise<boolean> {
    try {
      const { host, edrSystem, processId } = step.config;
      this.logInfo(`Killing process '${processId}' on host '${host}' in EDR system '${edrSystem}'`);
      
      // Obtener la configuración del conector EDR correspondiente
      const edrConnector = await this.getConnectorByName(edrSystem);
      if (!edrConnector) {
        this.logError(`EDR connector '${edrSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del EDR para matar el proceso
      const response = await this.callExternalApi({
        url: `${edrConnector.configuration.baseUrl}/api/v1/hosts/${host}/processes/${processId}/actions/terminate`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${edrConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comment: `Process terminated by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully terminated process '${processId}' on host '${host}'`);
        
        // Guardar el resultado en el contexto
        this.context.edrActions = this.context.edrActions || {};
        this.context.edrActions.killProcess = {
          host,
          edrSystem,
          processId,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to terminate process '${processId}' on host '${host}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing EDR kill process: ${error.message}`);
      return false;
    }
  }
  
  // Firewall
  private async executeFirewallBlockIp(step: PlaybookStep): Promise<boolean> {
    try {
      const { ip, firewallSystem, duration = '24h', reason } = step.config;
      this.logInfo(`Blocking IP '${ip}' in firewall system '${firewallSystem}' for duration '${duration}'`);
      
      // Obtener la configuración del conector de firewall correspondiente
      const firewallConnector = await this.getConnectorByName(firewallSystem);
      if (!firewallConnector) {
        this.logError(`Firewall connector '${firewallSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del firewall para bloquear la IP
      const response = await this.callExternalApi({
        url: `${firewallConnector.configuration.baseUrl}/api/v1/blocklist/ip`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firewallConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ip,
          duration,
          reason: reason || `Blocked by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully blocked IP '${ip}'`);
        
        // Guardar el resultado en el contexto
        this.context.firewallActions = this.context.firewallActions || {};
        this.context.firewallActions.blockIp = {
          ip,
          firewallSystem,
          duration,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to block IP '${ip}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing firewall block IP: ${error.message}`);
      return false;
    }
  }
  
  private async executeFirewallUnblockIp(step: PlaybookStep): Promise<boolean> {
    try {
      const { ip, firewallSystem } = step.config;
      this.logInfo(`Unblocking IP '${ip}' in firewall system '${firewallSystem}'`);
      
      // Obtener la configuración del conector de firewall correspondiente
      const firewallConnector = await this.getConnectorByName(firewallSystem);
      if (!firewallConnector) {
        this.logError(`Firewall connector '${firewallSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del firewall para desbloquear la IP
      const response = await this.callExternalApi({
        url: `${firewallConnector.configuration.baseUrl}/api/v1/blocklist/ip/${ip}`,
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${firewallConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.success) {
        this.logInfo(`Successfully unblocked IP '${ip}'`);
        
        // Guardar el resultado en el contexto
        this.context.firewallActions = this.context.firewallActions || {};
        this.context.firewallActions.unblockIp = {
          ip,
          firewallSystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to unblock IP '${ip}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing firewall unblock IP: ${error.message}`);
      return false;
    }
  }
  
  private async executeFirewallBlockDomain(step: PlaybookStep): Promise<boolean> {
    try {
      const { domain, firewallSystem, duration = '24h', reason } = step.config;
      this.logInfo(`Blocking domain '${domain}' in firewall system '${firewallSystem}' for duration '${duration}'`);
      
      // Obtener la configuración del conector de firewall correspondiente
      const firewallConnector = await this.getConnectorByName(firewallSystem);
      if (!firewallConnector) {
        this.logError(`Firewall connector '${firewallSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del firewall para bloquear el dominio
      const response = await this.callExternalApi({
        url: `${firewallConnector.configuration.baseUrl}/api/v1/blocklist/domain`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firewallConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          domain,
          duration,
          reason: reason || `Blocked by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully blocked domain '${domain}'`);
        
        // Guardar el resultado en el contexto
        this.context.firewallActions = this.context.firewallActions || {};
        this.context.firewallActions.blockDomain = {
          domain,
          firewallSystem,
          duration,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to block domain '${domain}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing firewall block domain: ${error.message}`);
      return false;
    }
  }
  
  private async executeFirewallUnblockDomain(step: PlaybookStep): Promise<boolean> {
    try {
      const { domain, firewallSystem } = step.config;
      this.logInfo(`Unblocking domain '${domain}' in firewall system '${firewallSystem}'`);
      
      // Obtener la configuración del conector de firewall correspondiente
      const firewallConnector = await this.getConnectorByName(firewallSystem);
      if (!firewallConnector) {
        this.logError(`Firewall connector '${firewallSystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del firewall para desbloquear el dominio
      const response = await this.callExternalApi({
        url: `${firewallConnector.configuration.baseUrl}/api/v1/blocklist/domain/${encodeURIComponent(domain)}`,
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${firewallConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.success) {
        this.logInfo(`Successfully unblocked domain '${domain}'`);
        
        // Guardar el resultado en el contexto
        this.context.firewallActions = this.context.firewallActions || {};
        this.context.firewallActions.unblockDomain = {
          domain,
          firewallSystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to unblock domain '${domain}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing firewall unblock domain: ${error.message}`);
      return false;
    }
  }
  
  // Identity Management
  private async executeIdentityDisableUser(step: PlaybookStep): Promise<boolean> {
    try {
      const { username, identitySystem, reason } = step.config;
      this.logInfo(`Disabling user '${username}' in identity system '${identitySystem}'`);
      
      // Obtener la configuración del conector de identidad correspondiente
      const identityConnector = await this.getConnectorByName(identitySystem);
      if (!identityConnector) {
        this.logError(`Identity connector '${identitySystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del sistema de identidad para deshabilitar al usuario
      const response = await this.callExternalApi({
        url: `${identityConnector.configuration.baseUrl}/api/v1/users/${username}/disable`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${identityConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: reason || `Disabled by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully disabled user '${username}'`);
        
        // Guardar el resultado en el contexto
        this.context.identityActions = this.context.identityActions || {};
        this.context.identityActions.disableUser = {
          username,
          identitySystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to disable user '${username}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing identity disable user: ${error.message}`);
      return false;
    }
  }
  
  private async executeIdentityEnableUser(step: PlaybookStep): Promise<boolean> {
    try {
      const { username, identitySystem, reason } = step.config;
      this.logInfo(`Enabling user '${username}' in identity system '${identitySystem}'`);
      
      // Obtener la configuración del conector de identidad correspondiente
      const identityConnector = await this.getConnectorByName(identitySystem);
      if (!identityConnector) {
        this.logError(`Identity connector '${identitySystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del sistema de identidad para habilitar al usuario
      const response = await this.callExternalApi({
        url: `${identityConnector.configuration.baseUrl}/api/v1/users/${username}/enable`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${identityConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: reason || `Enabled by SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully enabled user '${username}'`);
        
        // Guardar el resultado en el contexto
        this.context.identityActions = this.context.identityActions || {};
        this.context.identityActions.enableUser = {
          username,
          identitySystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to enable user '${username}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing identity enable user: ${error.message}`);
      return false;
    }
  }
  
  private async executeIdentityResetPassword(step: PlaybookStep): Promise<boolean> {
    try {
      const { username, identitySystem, sendEmail = true } = step.config;
      this.logInfo(`Resetting password for user '${username}' in identity system '${identitySystem}'`);
      
      // Obtener la configuración del conector de identidad correspondiente
      const identityConnector = await this.getConnectorByName(identitySystem);
      if (!identityConnector) {
        this.logError(`Identity connector '${identitySystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del sistema de identidad para resetear la contraseña
      const response = await this.callExternalApi({
        url: `${identityConnector.configuration.baseUrl}/api/v1/users/${username}/reset-password`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${identityConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sendEmail,
          requestedBy: `SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully reset password for user '${username}'`);
        
        // Guardar el resultado en el contexto
        this.context.identityActions = this.context.identityActions || {};
        this.context.identityActions.resetPassword = {
          username,
          identitySystem,
          success: true,
          timestamp: new Date().toISOString(),
          temporaryPassword: response.data.temporaryPassword, // Algunos sistemas generan contraseñas temporales
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to reset password for user '${username}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing identity reset password: ${error.message}`);
      return false;
    }
  }
  
  private async executeIdentityAddToGroup(step: PlaybookStep): Promise<boolean> {
    try {
      const { username, groupName, identitySystem } = step.config;
      this.logInfo(`Adding user '${username}' to group '${groupName}' in identity system '${identitySystem}'`);
      
      // Obtener la configuración del conector de identidad correspondiente
      const identityConnector = await this.getConnectorByName(identitySystem);
      if (!identityConnector) {
        this.logError(`Identity connector '${identitySystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del sistema de identidad para añadir al usuario al grupo
      const response = await this.callExternalApi({
        url: `${identityConnector.configuration.baseUrl}/api/v1/groups/${groupName}/members`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${identityConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          requestedBy: `SOC-Inteligente SOAR playbook: ${this.playbook.name}`
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully added user '${username}' to group '${groupName}'`);
        
        // Guardar el resultado en el contexto
        this.context.identityActions = this.context.identityActions || {};
        this.context.identityActions.addToGroup = {
          username,
          groupName,
          identitySystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to add user '${username}' to group '${groupName}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing identity add to group: ${error.message}`);
      return false;
    }
  }
  
  private async executeIdentityRemoveFromGroup(step: PlaybookStep): Promise<boolean> {
    try {
      const { username, groupName, identitySystem } = step.config;
      this.logInfo(`Removing user '${username}' from group '${groupName}' in identity system '${identitySystem}'`);
      
      // Obtener la configuración del conector de identidad correspondiente
      const identityConnector = await this.getConnectorByName(identitySystem);
      if (!identityConnector) {
        this.logError(`Identity connector '${identitySystem}' not found`);
        return false;
      }
      
      // Realizar la llamada a la API del sistema de identidad para eliminar al usuario del grupo
      const response = await this.callExternalApi({
        url: `${identityConnector.configuration.baseUrl}/api/v1/groups/${groupName}/members/${username}`,
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${identityConnector.configuration.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.success) {
        this.logInfo(`Successfully removed user '${username}' from group '${groupName}'`);
        
        // Guardar el resultado en el contexto
        this.context.identityActions = this.context.identityActions || {};
        this.context.identityActions.removeFromGroup = {
          username,
          groupName,
          identitySystem,
          success: true,
          timestamp: new Date().toISOString(),
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to remove user '${username}' from group '${groupName}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing identity remove from group: ${error.message}`);
      return false;
    }
  }
  
  // Notification
  private async executeNotifyEmail(step: PlaybookStep): Promise<boolean> {
    try {
      const { to, subject, body, cc, bcc } = step.config;
      this.logInfo(`Sending email notification to '${to}'`);
      
      // Verificar configuración de email
      const emailConfig = await this.getEmailConfiguration();
      if (!emailConfig) {
        this.logError(`Email configuration not found`);
        return false;
      }
      
      // Realizar la llamada a la API del servicio de email
      const response = await this.callExternalApi({
        url: `${emailConfig.baseUrl}/api/send-email`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          body,
          from: emailConfig.fromEmail,
          isHtml: true
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully sent email notification to '${to}'`);
        
        // Guardar el resultado en el contexto
        this.context.notificationActions = this.context.notificationActions || {};
        this.context.notificationActions.email = {
          to,
          subject,
          success: true,
          timestamp: new Date().toISOString(),
          messageId: response.data.messageId
        };
        
        return true;
      } else {
        this.logError(`Failed to send email notification to '${to}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing email notification: ${error.message}`);
      return false;
    }
  }
  
  private async executeNotifySlack(step: PlaybookStep): Promise<boolean> {
    try {
      const { channel, message, attachments } = step.config;
      this.logInfo(`Sending Slack notification to channel '${channel}'`);
      
      // Verificar configuración de Slack
      const slackConfig = await this.getSlackConfiguration();
      if (!slackConfig) {
        this.logError(`Slack configuration not found`);
        return false;
      }
      
      // Realizar la llamada a la API de Slack
      const response = await this.callExternalApi({
        url: 'https://slack.com/api/chat.postMessage',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackConfig.botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          text: message,
          attachments
        })
      });
      
      if (response.success && response.data.ok) {
        this.logInfo(`Successfully sent Slack notification to channel '${channel}'`);
        
        // Guardar el resultado en el contexto
        this.context.notificationActions = this.context.notificationActions || {};
        this.context.notificationActions.slack = {
          channel,
          success: true,
          timestamp: new Date().toISOString(),
          messageTs: response.data.ts
        };
        
        return true;
      } else {
        this.logError(`Failed to send Slack notification to channel '${channel}': ${response.data?.error || response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing Slack notification: ${error.message}`);
      return false;
    }
  }
  
  private async executeNotifySms(step: PlaybookStep): Promise<boolean> {
    try {
      const { phoneNumber, message } = step.config;
      this.logInfo(`Sending SMS notification to '${phoneNumber}'`);
      
      // Verificar configuración de SMS
      const smsConfig = await this.getSmsConfiguration();
      if (!smsConfig) {
        this.logError(`SMS configuration not found`);
        return false;
      }
      
      // Realizar la llamada a la API del servicio de SMS
      const response = await this.callExternalApi({
        url: `${smsConfig.baseUrl}/api/send-sms`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${smsConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: phoneNumber,
          body: message,
          from: smsConfig.fromNumber
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully sent SMS notification to '${phoneNumber}'`);
        
        // Guardar el resultado en el contexto
        this.context.notificationActions = this.context.notificationActions || {};
        this.context.notificationActions.sms = {
          phoneNumber,
          success: true,
          timestamp: new Date().toISOString(),
          messageId: response.data.messageId
        };
        
        return true;
      } else {
        this.logError(`Failed to send SMS notification to '${phoneNumber}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error executing SMS notification: ${error.message}`);
      return false;
    }
  }
  
  // Enriquecimiento y análisis
  private async executeEnrichIoc(step: PlaybookStep): Promise<boolean> {
    try {
      const { ioc, iocType } = step.config;
      this.logInfo(`Enriching IOC '${ioc}' of type '${iocType}'`);
      
      // Realizar la llamada al servicio interno de enriquecimiento de IOCs
      const response = await this.callExternalApi({
        url: `http://localhost:5000/api/iocs/enrich`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: ioc,
          type: iocType
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully enriched IOC '${ioc}'`);
        
        // Guardar el resultado en el contexto
        this.context.analysisActions = this.context.analysisActions || {};
        this.context.analysisActions.enrichIoc = {
          ioc,
          iocType,
          success: true,
          timestamp: new Date().toISOString(),
          enrichment: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to enrich IOC '${ioc}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error enriching IOC: ${error.message}`);
      return false;
    }
  }
  
  private async executeAiAnalyzeAlert(step: PlaybookStep): Promise<boolean> {
    try {
      const { alertId } = step.config;
      this.logInfo(`Analyzing alert with ID '${alertId}' using AI`);
      
      // Obtener la alerta
      const alert = await storage.getAlert(alertId);
      if (!alert) {
        this.logError(`Alert with ID '${alertId}' not found`);
        return false;
      }
      
      // Realizar la llamada al servicio interno de análisis con IA
      const response = await this.callExternalApi({
        url: `http://localhost:5000/api/alerts/${alertId}/analyze`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.success) {
        this.logInfo(`Successfully analyzed alert with ID '${alertId}'`);
        
        // Guardar el resultado en el contexto
        this.context.analysisActions = this.context.analysisActions || {};
        this.context.analysisActions.aiAnalyzeAlert = {
          alertId,
          success: true,
          timestamp: new Date().toISOString(),
          analysis: response.data,
          threatLevel: response.data.threatLevel
        };
        
        return true;
      } else {
        this.logError(`Failed to analyze alert with ID '${alertId}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error analyzing alert with AI: ${error.message}`);
      return false;
    }
  }
  
  private async executeLookupThreatIntel(step: PlaybookStep): Promise<boolean> {
    try {
      const { indicator, type } = step.config;
      this.logInfo(`Looking up threat intelligence for indicator '${indicator}' of type '${type}'`);
      
      // Realizar la llamada al servicio interno de búsqueda de inteligencia de amenazas
      const response = await this.callExternalApi({
        url: `http://localhost:5000/api/threat-intel/lookup`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          indicator,
          type
        })
      });
      
      if (response.success) {
        this.logInfo(`Successfully looked up threat intelligence for indicator '${indicator}'`);
        
        // Guardar el resultado en el contexto
        this.context.analysisActions = this.context.analysisActions || {};
        this.context.analysisActions.lookupThreatIntel = {
          indicator,
          type,
          success: true,
          timestamp: new Date().toISOString(),
          results: response.data.results,
          matchCount: response.data.results.length
        };
        
        return true;
      } else {
        this.logError(`Failed to look up threat intelligence for indicator '${indicator}': ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error looking up threat intelligence: ${error.message}`);
      return false;
    }
  }
  
  // Flujo de control
  private async executeCondition(step: PlaybookStep): Promise<boolean> {
    // Este paso siempre es exitoso, ya que solo controla el flujo
    // La evaluación de la condición se realiza en el método executeStep
    return true;
  }
  
  private async executeWait(step: PlaybookStep): Promise<boolean> {
    try {
      const { duration } = step.config; // Duración en milisegundos
      this.logInfo(`Waiting for ${duration} milliseconds`);
      
      await new Promise(resolve => setTimeout(resolve, duration));
      
      this.logInfo(`Wait completed for ${duration} milliseconds`);
      return true;
    } catch (error) {
      this.logError(`Error during wait: ${error.message}`);
      return false;
    }
  }
  
  private async executeParallel(step: PlaybookStep): Promise<boolean> {
    try {
      const { steps } = step.config;
      this.logInfo(`Executing ${steps.length} steps in parallel`);
      
      if (!Array.isArray(steps) || steps.length === 0) {
        this.logWarning('No steps provided for parallel execution');
        return true;
      }
      
      // Obtener los pasos a ejecutar en paralelo
      const stepsToExecute = steps
        .map(stepId => (this.playbook.steps as PlaybookStep[]).find(s => s.id === stepId))
        .filter(Boolean) as PlaybookStep[];
      
      // Ejecutar todos los pasos en paralelo
      const results = await Promise.all(
        stepsToExecute.map(step => this.executeStep(step))
      );
      
      // Considerar exitoso si al menos un paso tuvo éxito
      const success = results.some(result => result);
      
      this.logInfo(`Completed parallel execution: ${results.filter(Boolean).length}/${results.length} steps succeeded`);
      return success;
    } catch (error) {
      this.logError(`Error during parallel execution: ${error.message}`);
      return false;
    }
  }
  
  private async executeCallApi(step: PlaybookStep): Promise<boolean> {
    try {
      const { url, method = 'GET', headers = {}, body, timeout = 10000 } = step.config;
      this.logInfo(`Calling external API: ${method} ${url}`);
      
      // Realizar la llamada a la API externa
      const response = await this.callExternalApi({
        url,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        timeout
      });
      
      if (response.success) {
        this.logInfo(`Successfully called external API: ${method} ${url}`);
        
        // Guardar el resultado en el contexto
        this.context.apiCalls = this.context.apiCalls || {};
        this.context.apiCalls[`${method}_${url}`] = {
          url,
          method,
          success: true,
          timestamp: new Date().toISOString(),
          statusCode: response.statusCode,
          response: response.data
        };
        
        return true;
      } else {
        this.logError(`Failed to call external API: ${method} ${url} - ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`Error calling external API: ${error.message}`);
      return false;
    }
  }
  
  // Métodos auxiliares
  private async getConnectorByName(name: string): Promise<any> {
    const connectors = await storage.listConnectors();
    return connectors.find(connector => connector.name === name);
  }
  
  private async getEmailConfiguration(): Promise<any> {
    // Obtener configuración de email de algún lugar (base de datos, archivo de configuración, etc.)
    const connectors = await storage.listConnectors();
    const emailConnector = connectors.find(connector => connector.type === 'EMAIL');
    
    if (emailConnector && emailConnector.configuration) {
      return emailConnector.configuration;
    }
    
    // Configuración por defecto (no recomendado para producción)
    return {
      baseUrl: 'https://api.sendgrid.com/v3',
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: 'notifications@soc-inteligente.com'
    };
  }
  
  private async getSlackConfiguration(): Promise<any> {
    // Obtener configuración de Slack de algún lugar (base de datos, archivo de configuración, etc.)
    const connectors = await storage.listConnectors();
    const slackConnector = connectors.find(connector => connector.type === 'SLACK');
    
    if (slackConnector && slackConnector.configuration) {
      return slackConnector.configuration;
    }
    
    // Configuración por defecto (no recomendado para producción)
    return {
      botToken: process.env.SLACK_BOT_TOKEN,
      defaultChannel: process.env.SLACK_CHANNEL_ID
    };
  }
  
  private async getSmsConfiguration(): Promise<any> {
    // Obtener configuración de SMS de algún lugar (base de datos, archivo de configuración, etc.)
    const connectors = await storage.listConnectors();
    const smsConnector = connectors.find(connector => connector.type === 'SMS');
    
    if (smsConnector && smsConnector.configuration) {
      return smsConnector.configuration;
    }
    
    // Configuración por defecto (no recomendado para producción)
    return {
      baseUrl: 'https://api.twilio.com/2010-04-01',
      apiKey: process.env.TWILIO_AUTH_TOKEN,
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    };
  }
  
  private async callExternalApi({ url, method, headers, body, timeout = 10000 }: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }): Promise<{ success: boolean; statusCode?: number; data?: any; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        // Si la respuesta no es JSON, usar el texto
        responseData = await response.text();
      }
      
      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          data: responseData
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP error: ${response.status} ${response.statusText}`,
          data: responseData
        };
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${timeout}ms`
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Objeto principal para ejecutar playbooks
export const playbookExecutorService = {
  /**
   * Ejecuta un playbook con el ID especificado
   */
  async executePlaybook(playbookId: number, triggeredBy?: number, triggerEntityId?: number, triggerSource?: string): Promise<boolean> {
    try {
      logger.info(`[PlaybookExecutor] Starting execution of playbook ${playbookId}`);
      
      // Obtener el playbook
      const playbook = await storage.getPlaybook(playbookId);
      if (!playbook) {
        logger.error(`[PlaybookExecutor] Playbook with ID ${playbookId} not found`);
        return false;
      }
      
      // Crear un registro de ejecución
      const execution = await storage.executePlaybook(playbookId, triggeredBy, triggerEntityId);
      
      // Crear y configurar el executor
      const executor = new PlaybookExecutor(execution.id, playbook);
      await executor.initialize(triggerEntityId, triggerSource);
      
      // Ejecutar el playbook
      const result = await executor.execute();
      
      logger.info(`[PlaybookExecutor] Playbook ${playbookId} execution completed with result: ${result}`);
      return result;
    } catch (error) {
      logger.error(`[PlaybookExecutor] Error executing playbook ${playbookId}: ${error.message}`);
      return false;
    }
  }
};