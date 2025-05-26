import { ScanEngine, ScanResult, ScanTarget } from './types';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

export default class TrivyEngine implements ScanEngine {
  name = 'Trivy';

  async scan(target: ScanTarget): Promise<ScanResult[]> {
    if (!target.path) return [];
    return new Promise((resolve, reject) => {
      const args = ['fs', '--quiet', '--format', 'json', target.path];
      const proc = spawn('trivy', args, { maxBuffer: 10 * 1024 * 1024 });
      let stdout = '';
      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => {
        const msg = data.toString();
        if (!msg.includes('No vulnerabilities found')) console.error(msg);
      });
      proc.on('error', err => reject(err));
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
