/**
 * Integración de los colectores con el agente Windows
 */

import { Collector, collectors as availableCollectors } from '../collectors/index';

/**
 * Inicializa los colectores en el agente Windows
 * @param eventCallback Función de callback para procesar eventos de los colectores
 * @returns Lista de colectores inicializados
 */
export async function initializeCollectors(
  eventCallback: (event: any) => void
): Promise<Collector[]> {
  console.log('Inicializando colectores para Windows...');
  
  const activeCollectors: Collector[] = [];
  
  // Registrar callback para cada colector
  for (const collector of availableCollectors) {
    try {
      // Intentar registrar el callback
      if (typeof (collector as any).registerEventCallback === 'function') {
        (collector as any).registerEventCallback(eventCallback);
      }
      
      // Iniciar el colector
      const started = await collector.start();
      
      if (started) {
        console.log(`Colector "${collector.name}" iniciado correctamente`);
        activeCollectors.push(collector);
      } else {
        console.warn(`No se pudo iniciar el colector "${collector.name}"`);
      }
    } catch (error) {
      console.error(`Error al inicializar colector "${collector.name}":`, error);
    }
  }
  
  console.log(`${activeCollectors.length} colectores inicializados correctamente`);
  return activeCollectors;
}

/**
 * Detiene todos los colectores activos
 * @param collectors Lista de colectores a detener
 */
export async function stopCollectors(collectors: Collector[]): Promise<void> {
  console.log('Deteniendo colectores...');
  
  for (const collector of collectors) {
    try {
      await collector.stop();
      console.log(`Colector "${collector.name}" detenido correctamente`);
    } catch (error) {
      console.error(`Error al detener colector "${collector.name}":`, error);
    }
  }
  
  console.log('Todos los colectores detenidos');
}