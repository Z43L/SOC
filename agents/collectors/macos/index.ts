/**
 * Colectores para macOS
 * Implementación básica - extensible en futuras versiones
 */

import { Collector } from '../types';

// Colector básico para macOS
export const basicMacOSCollector: Collector = {
  name: 'macos-basic',
  description: 'Colector básico para sistemas macOS',
  compatibleSystems: ['darwin'],
  
  async start(): Promise<boolean> {
    // Implementación básica - expandir según necesidades
    return true;
  },
  
  async stop(): Promise<boolean> {
    return true;
  }
};