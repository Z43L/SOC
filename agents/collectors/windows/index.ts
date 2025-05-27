/**
 * Colectores para Windows
 */

import { Collector } from '../index';
import { eventLogCollector } from './event-log';
import { wmiProcessCollector } from './wmi-process';
import { networkCollector } from './network';
import { registryCollector } from './registry';
import { fileWatcherCollector } from './file-watcher';
import { sysmonCollector } from './sysmon';

// Exportar todos los colectores para Windows
export const collectors: Collector[] = [
  eventLogCollector,
  wmiProcessCollector,
  networkCollector,
  registryCollector,
  fileWatcherCollector,
  sysmonCollector
];