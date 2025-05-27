/**
 * Colectores para macOS
 */

import { Collector } from '../index';
import { unifiedLoggingCollector } from './unified-logging';
import { fseventsCollector } from './fsevents';
import { processCollector } from './process';
import { networkCollector } from './network';
import { tccCollector } from './tcc-amfi';

// Exportar todos los colectores para macOS
export const collectors: Collector[] = [
  unifiedLoggingCollector,
  fseventsCollector,
  processCollector,
  networkCollector,
  tccCollector
];