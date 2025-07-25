import { ScanEngine, ScanResult, ScanTarget } from './types';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';

export default class TrivyEngine implements ScanEngine {
  name = 'Trivy';

  async init(): Promise<void> {
    // Optional: update vulnerability database
  }

  async scan(target: ScanTarget): Promise<ScanResult[]> {
    if (!target.path) return [];
    return new Promise((resolve, reject) => {
      const args = ['fs', '--quiet', '--format', 'json', target.path].filter((arg): arg is string => arg !== undefined);
      const proc: ChildProcess = spawn('trivy', args, { stdio: ['pipe', 'pipe', 'pipe'] } as any);
      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (!msg.includes('No vulnerabilities found')) console.error(msg);
      });
      proc.on('error', (err: Error) => reject(err));
      proc.on('close', () => {
        try {
          const json = JSON.parse(stdout);
          const results: ScanResult[] = [];
          if (Array.isArray(json.Results)) {
            for (const resGroup of json.Results) {
              if (!Array.isArray(resGroup.Vulnerabilities)) continue;
              for (const vuln of resGroup.Vulnerabilities) {
                const pkgName = vuln.PkgName;
                const version = vuln.InstalledVersion;
                const cve = vuln.VulnerabilityID;
                const severity: ScanResult['severity'] = ['CRITICAL', 'HIGH'].includes(vuln.Severity) ? 'critical' : ['MEDIUM'].includes(vuln.Severity) ? 'medium' : 'low';
                results.push({
                  id: crypto.randomUUID(),
                  agentId: process.env.AGENT_ID || 'unknown',
                  severity,
                  category: 'vulnerability',
                  engine: this.name,
                  cveId: cve,
                  description: `${pkgName}@${version} - ${vuln.Title}`,
                  timestamp: Date.now(),
                });
              }
            }
          }
          resolve(results);
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}
