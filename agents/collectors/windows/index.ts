/**
 * Colectores para Windows
 */

import { Collector } from '../types';
import { eventLogCollector } from './event-log';
import { processCollector } from './process';
import { registryCollector } from './registry';
import { servicesCollector } from './services';

// Exportar todos los colectores de Windows
export const windowsCollectors: Collector[] = [
  eventLogCollector,
  processCollector,
  registryCollector,
  servicesCollector
];

// Exportar colectores individuales para uso directo
export {
  eventLogCollector,
  processCollector,
  registryCollector,
  servicesCollector
};