/**
 * Colectores para Windows
 */

import { Collector } from '../types';
import { eventLogCollector } from './event-log';

// Exportar todos los colectores para Windows
export const collectors: Collector[] = [
  eventLogCollector
];