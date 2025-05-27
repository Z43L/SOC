/**
 * Exportación de colectores para Linux
 */

// Re-exportar colectores individuales
export * from './journald';
export * from './process';
export * from './network';
export * from './filesystem';
export * from './module';

// Importar colectores para exportarlos directamente
import { JournaldCollector } from './journald';
import { ProcessCollector } from './process';
import { NetworkCollector } from './network';
import { FileSystemCollector } from './filesystem';
import { ModuleCollector } from './module';

// Crear instancias por defecto para compatibilidad
export const journaldCollector = new JournaldCollector({
  eventCallback: () => {} // Placeholder, se reemplazará al usar el colector
});

export const processCollector = new ProcessCollector({
  eventCallback: () => {} // Placeholder, se reemplazará al usar el colector
});

export const networkCollector = new NetworkCollector({
  eventCallback: () => {} // Placeholder, se reemplazará al usar el colector
});

export const fileSystemCollector = new FileSystemCollector({
  eventCallback: () => {}, // Placeholder, se reemplazará al usar el colector
  directories: ['/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin'] 
});

export const moduleCollector = new ModuleCollector({
  eventCallback: () => {} // Placeholder, se reemplazará al usar el colector
});