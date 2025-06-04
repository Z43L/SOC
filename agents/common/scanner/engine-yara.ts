import { ScanEngine, ScanResult, ScanTarget } from './types';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { logger } from '../logger';

export default class YaraEngine implements ScanEngine {
  name = 'YARA';
  rulesDir = process.env.YARA_RULES_DIR || '/etc/agent/yara-rules';

  async init(): Promise<void> {
    // Optional: verify rules directory exists or create default rules
  }

  async scan(target: ScanTarget): Promise<ScanResult[]> {
    if (!target.path) return [];
    return new Promise((resolve, reject) => {
      const args = ['-r', this.rulesDir, target.path].filter((arg): arg is string => arg !== undefined);
      const proc: ChildProcess = spawn('yara', args);
      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { logger.error(data.toString()); });
      proc.on('error', (err: Error) => reject(err));
      proc.on('close', async () => {
        const results: ScanResult[] = [];
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          const [ruleName, filePath] = line.split(' ');
          let fileHash: string | undefined;
          try { fileHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); } catch {}
          results.push({
            id: crypto.randomUUID(),
            agentId: process.env.AGENT_ID || 'unknown',
            severity: 'medium',
            category: 'malware',
            engine: this.name,
            malwareFamily: ruleName,
            path: filePath,
            description: `YARA rule ${ruleName} matched`,
            timestamp: Date.now(),
            fileHash,
          });
        }
        resolve(results);
      });
    });
  }
}
