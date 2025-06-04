import { z } from 'zod';
import { BaseAction } from '../BaseAction';
import { ActionContext, ActionResult } from '../ActionInterface';

// Host isolation action
export class IsolateHostAction extends BaseAction {
  readonly name = 'isolate_host';
  readonly description = 'Isolate host from network';
  readonly category = 'remediation' as const;
  
  readonly parameterSchema = z.object({
    hostname: z.string().min(1).optional(),
    ipAddress: z.string().ip().optional(),
    macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
    edrAgent: z.enum(['crowdstrike', 'sentinelone', 'carbon_black', 'defender', 'cylance']).default('crowdstrike'),
    isolationType: z.enum(['network', 'full', 'custom']).default('network'),
    reason: z.string().min(1),
    duration: z.number().int().positive().optional(), // Duration in hours (0 = indefinite)
    allowedIps: z.array(z.string().ip()).optional(), // IPs still allowed during isolation
    allowedPorts: z.array(z.number().int().min(1).max(65535)).optional(), // Ports still allowed
  }).refine(data => data.hostname || data.ipAddress || data.macAddress, {
    message: "At least one of hostname, ipAddress, or macAddress must be provided"
  });

  async execute(params: Record<string, any>, context: ActionContext): Promise<ActionResult> {
    try {
      // Validate parameters
      const validation = this.validateParameters(params);
      if (!validation.success) {
        return this.error(`Invalid parameters: ${validation.error.message}`);
      }

      const validParams = validation.data;
      const hostIdentifier = validParams.hostname || validParams.ipAddress || validParams.macAddress;
      
      this.log(context, `Isolating host ${hostIdentifier} using ${validParams.edrAgent} EDR`);

      // Check if host is critical (prevent isolation of critical infrastructure)
      if (await this.isCriticalHost(validParams, context)) {
        return this.error(`Cannot isolate critical host: ${hostIdentifier}`);
      }

      // Perform host isolation
      const isolationResult = await this.performHostIsolation(validParams, context);

      this.log(context, 
        `Host ${hostIdentifier} isolated successfully. ` +
        `Isolation ID: ${isolationResult.isolationId}. ` +
        `Type: ${validParams.isolationType}. ` +
        `Duration: ${validParams.duration ? `${validParams.duration} hours` : 'indefinite'}`
      );

      return this.success(
        `Host ${hostIdentifier} isolated successfully`,
        {
          hostIdentifier,
          isolationId: isolationResult.isolationId,
          edrAgent: validParams.edrAgent,
          isolationType: validParams.isolationType,
          duration: validParams.duration,
          expiresAt: validParams.duration ? new Date(Date.now() + validParams.duration * 3600000).toISOString() : null,
          reason: validParams.reason,
          allowedIps: validParams.allowedIps,
          allowedPorts: validParams.allowedPorts,
        }
      );

    } catch (error) {
      this.log(context, `Failed to isolate host: ${error.message}`, 'error');
      return this.error(`Failed to isolate host: ${error.message}`);
    }
  }

  private async isCriticalHost(params: any, context: ActionContext): Promise<boolean> {
    // Check against critical host patterns
    const criticalPatterns = [
      /^dc\d+/i,           // Domain controllers
      /^mail/i,            // Mail servers
      /^dns/i,             // DNS servers
      /^dhcp/i,            // DHCP servers
      /^proxy/i,           // Proxy servers
      /^firewall/i,        // Firewalls
      /^backup/i,          // Backup servers
    ];

    if (params.hostname) {
      const isCritical = criticalPatterns.some(pattern => pattern.test(params.hostname));
      if (isCritical) {
        this.log(context, `Host ${params.hostname} matches critical host pattern`, 'warn');
        return true;
      }
    }

    // In a real implementation, this would check against a database of critical hosts
    return false;
  }

  private async performHostIsolation(params: any, context: ActionContext): Promise<{ isolationId: string }> {
    // Simulate EDR API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const isolationId = `isolation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log isolation details
    this.log(context, `Performing ${params.edrAgent} host isolation:`);
    this.log(context, `  - Host: ${params.hostname || params.ipAddress || params.macAddress}`);
    this.log(context, `  - Type: ${params.isolationType}`);
    this.log(context, `  - Reason: ${params.reason}`);
    
    if (params.allowedIps?.length) {
      this.log(context, `  - Allowed IPs: ${params.allowedIps.join(', ')}`);
    }
    
    if (params.allowedPorts?.length) {
      this.log(context, `  - Allowed Ports: ${params.allowedPorts.join(', ')}`);
    }
    
    // Call appropriate EDR agent API
    switch (params.edrAgent) {
      case 'crowdstrike':
        await this.isolateViaCrowdStrike(params, isolationId, context);
        break;
      case 'sentinelone':
        await this.isolateViaSentinelOne(params, isolationId, context);
        break;
      case 'carbon_black':
        await this.isolateViaCarbonBlack(params, isolationId, context);
        break;
      case 'defender':
        await this.isolateViaDefender(params, isolationId, context);
        break;
      case 'cylance':
        await this.isolateViaCylance(params, isolationId, context);
        break;
    }
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.03) { // 3% failure rate
      throw new Error('EDR agent communication failed');
    }
    
    return { isolationId };
  }

  private async isolateViaCrowdStrike(params: any, isolationId: string, context: ActionContext): Promise<void> {
    this.log(context, `Initiating CrowdStrike isolation ${isolationId}`);
    // Simulate CrowdStrike Falcon API call
    // POST /devices/entities/devices-actions/v2
  }

  private async isolateViaSentinelOne(params: any, isolationId: string, context: ActionContext): Promise<void> {
    this.log(context, `Initiating SentinelOne isolation ${isolationId}`);
    // Simulate SentinelOne API call
    // POST /web/api/v2.1/agents/actions/disconnect
  }

  private async isolateViaCarbonBlack(params: any, isolationId: string, context: ActionContext): Promise<void> {
    this.log(context, `Initiating Carbon Black isolation ${isolationId}`);
    // Simulate Carbon Black API call
    // PUT /api/v1/sensor/{sensor_id}/network-isolation
  }

  private async isolateViaDefender(params: any, isolationId: string, context: ActionContext): Promise<void> {
    this.log(context, `Initiating Microsoft Defender isolation ${isolationId}`);
    // Simulate Microsoft Defender ATP API call
    // POST /api/machines/{machine_id}/isolate
  }

  private async isolateViaCylance(params: any, isolationId: string, context: ActionContext): Promise<void> {
    this.log(context, `Initiating Cylance isolation ${isolationId}`);
    // Simulate Cylance API call
    // PUT /devices/v2/{device_id}
  }
}