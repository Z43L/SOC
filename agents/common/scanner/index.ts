// scanner plugin registry
import { registerEngine, getEngines } from './types';
import ClamAVEngine from './engine-clamav';
import YaraEngine from './engine-yara';
import TrivyEngine from './engine-trivy';

// Initialize and register all engines
export async function initScanner(): Promise<void> {
  const engines = [new ClamAVEngine(), new YaraEngine(), new TrivyEngine()];
  for (const eng of engines) {
    if (eng.init) {
      await eng.init();
    }
    registerEngine(eng);
  }
}

// Expose scanner function
import { ScanTarget, ScanResult } from './types';

/**
 * Perform scan across all registered engines
 */
export async function scanAll(target: ScanTarget): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (const eng of getEngines()) {
    try {
      const res = await eng.scan(target);
      results.push(...res);
    } catch (err) {
      console.error(`Engine ${eng.name} scan failed:`, err);
    }
  }
  return results;
}
