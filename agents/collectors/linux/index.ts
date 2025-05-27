/**
 * Colectores para Linux
 */

import { Collector } from '../index';
import { journaldCollector } from './journald';
import { processCollector } from './process';
import { networkCollector } from './network';
import { fileSystemCollector } from './filesystem';
import { moduleCollector } from './module';

// Exportar todos los colectores para Linux
export const collectors: Collector[] = [
  journaldCollector,
  processCollector,
  networkCollector,
  fileSystemCollector,
  moduleCollector
];