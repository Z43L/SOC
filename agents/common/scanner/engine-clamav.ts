import { ScanEngine, ScanResult, ScanTarget } from './types';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';

export default class ClamAVEngine implements ScanEngine {
  name = 'ClamAV';

  async init(): Promise<void> {
    // Optional: update database before first scan
    // spawn('freshclam');
  }

  async scan(target: ScanTarget): Promise<ScanResult[]> {
    if (!target.path) return [];
    return new Promise((resolve, reject) => {
      const args = ['--no-summary', target.path].filter((arg): arg is string => arg !== undefined);
      const proc: ChildProcess = spawn('clamscan', args);
      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { console.error(data.toString()); });
      proc.on('error', (err: Error) => reject(err));
      proc.on('close', async () => {
        const results: ScanResult[] = [];
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          if (line.endsWith(' FOUND')) {
            const [filePath, rest] = line.split(': ');
            const malwareFamily = rest.replace(' FOUND', '');
            let fileHash: string | undefined;
            try {
              const buf = fs.readFileSync(filePath);
              fileHash = crypto.createHash('sha256').update(buf).digest('hex');
            } catch {}
            results.push({
              id: crypto.randomUUID(),
              agentId: process.env.AGENT_ID || 'unknown',
              severity: 'high',
              category: 'malware',
              engine: this.name,
              malwareFamily,
              path: filePath,
              description: `Detected ${malwareFamily}`,
              timestamp: Date.now(),
              fileHash,
            });
          }
        }
        resolve(results);
      });
    });
  }
}
