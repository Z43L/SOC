import { z } from 'zod';
import { BaseAction } from '../BaseAction';
import { ActionContext, ActionResult } from '../ActionInterface';

// IP blocking action
export class BlockIpAction extends BaseAction {
  readonly name = 'block_ip';
  readonly description = 'Block IP address in firewall';
  readonly category = 'remediation' as const;
  
  readonly parameterSchema = z.object({
    ipAddress: z.string().ip(), // IP address to block
    duration: z.number().int().positive().optional(), // Duration in minutes (0 = permanent)
    reason: z.string().min(1), // Reason for blocking
    firewallType: z.enum(['palo_alto', 'fortinet', 'checkpoint', 'cisco', 'iptables']).default('iptables'),
    ruleGroup: z.string().optional(), // Firewall rule group/policy
    priority: z.number().int().min(1).max(1000).default(100), // Rule priority
    direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
  });

  async execute(params: Record<string, any>, context: ActionContext): Promise<ActionResult> {
    try {
      // Validate parameters
      const validation = this.validateParameters(params);
      if (!validation.success) {
        return this.error(`Invalid parameters: ${validation.error.message}`);
      }

      const validParams = validation.data;
      this.log(context, `Blocking IP ${validParams.ipAddress} on ${validParams.firewallType} firewall`);

      // Check if IP is in whitelist (prevent blocking critical IPs)
      if (await this.isWhitelistedIp(validParams.ipAddress, context)) {
        return this.error(`Cannot block whitelisted IP: ${validParams.ipAddress}`);
      }

      // Create firewall rule
      const ruleResult = await this.createBlockRule(validParams, context);

      // Log the action for audit
      this.log(context, 
        `IP ${validParams.ipAddress} blocked successfully. Rule ID: ${ruleResult.ruleId}. ` +
        `Duration: ${validParams.duration ? `${validParams.duration} minutes` : 'permanent'}`
      );

      return this.success(
        `IP ${validParams.ipAddress} blocked successfully`,
        {
          blockedIp: validParams.ipAddress,
          ruleId: ruleResult.ruleId,
          firewallType: validParams.firewallType,
          duration: validParams.duration,
          expiresAt: validParams.duration ? new Date(Date.now() + validParams.duration * 60000).toISOString() : null,
          reason: validParams.reason,
        }
      );

    } catch (error) {
      this.log(context, `Failed to block IP: ${error.message}`, 'error');
      return this.error(`Failed to block IP: ${error.message}`);
    }
  }

  private async isWhitelistedIp(ipAddress: string, context: ActionContext): Promise<boolean> {
    // Check against common whitelisted IP ranges
    const whitelistedRanges = [
      '127.0.0.0/8',    // Localhost
      '10.0.0.0/8',     // RFC 1918 - Private networks
      '172.16.0.0/12',  // RFC 1918 - Private networks
      '192.168.0.0/16', // RFC 1918 - Private networks
    ];

    // In a real implementation, this would check against a database of whitelisted IPs
    // For simulation, just check if it's a private IP
    const isPrivate = whitelistedRanges.some(range => {
      // Simple check - in real implementation use proper CIDR matching
      return ipAddress.startsWith('127.') || 
             ipAddress.startsWith('10.') || 
             ipAddress.startsWith('192.168.') ||
             (ipAddress.startsWith('172.') && parseInt(ipAddress.split('.')[1]) >= 16 && parseInt(ipAddress.split('.')[1]) <= 31);
    });

    if (isPrivate) {
      this.log(context, `IP ${ipAddress} is in private range - blocking may be restricted`, 'warn');
    }

    return false; // For demo purposes, don't actually block anything
  }

  private async createBlockRule(params: any, context: ActionContext): Promise<{ ruleId: string }> {
    // Simulate firewall API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log the action details
    this.log(context, `Creating ${params.firewallType} firewall rule:`);
    this.log(context, `  - IP: ${params.ipAddress}`);
    this.log(context, `  - Direction: ${params.direction}`);
    this.log(context, `  - Priority: ${params.priority}`);
    this.log(context, `  - Reason: ${params.reason}`);
    
    if (params.ruleGroup) {
      this.log(context, `  - Rule Group: ${params.ruleGroup}`);
    }
    
    // In a real implementation, this would call the appropriate firewall API
    switch (params.firewallType) {
      case 'palo_alto':
        await this.createPaloAltoRule(params, ruleId, context);
        break;
      case 'fortinet':
        await this.createFortinetRule(params, ruleId, context);
        break;
      case 'checkpoint':
        await this.createCheckpointRule(params, ruleId, context);
        break;
      case 'cisco':
        await this.createCiscoRule(params, ruleId, context);
        break;
      case 'iptables':
        await this.createIptablesRule(params, ruleId, context);
        break;
    }
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.02) { // 2% failure rate
      throw new Error('Firewall API temporarily unavailable');
    }
    
    return { ruleId };
  }

  private async createPaloAltoRule(params: any, ruleId: string, context: ActionContext): Promise<void> {
    this.log(context, `Creating Palo Alto rule ${ruleId} for IP ${params.ipAddress}`);
    // Simulate Palo Alto API call
  }

  private async createFortinetRule(params: any, ruleId: string, context: ActionContext): Promise<void> {
    this.log(context, `Creating Fortinet rule ${ruleId} for IP ${params.ipAddress}`);
    // Simulate Fortinet API call
  }

  private async createCheckpointRule(params: any, ruleId: string, context: ActionContext): Promise<void> {
    this.log(context, `Creating Check Point rule ${ruleId} for IP ${params.ipAddress}`);
    // Simulate Check Point API call
  }

  private async createCiscoRule(params: any, ruleId: string, context: ActionContext): Promise<void> {
    this.log(context, `Creating Cisco rule ${ruleId} for IP ${params.ipAddress}`);
    // Simulate Cisco API call
  }

  private async createIptablesRule(params: any, ruleId: string, context: ActionContext): Promise<void> {
    this.log(context, `Creating iptables rule ${ruleId} for IP ${params.ipAddress}`);
    // Simulate iptables command execution
  }
}