/**
 * Índice de colectores
 * Exporta todos los colectores disponibles para cada sistema operativo
 */

import * as os from 'os';

// Importar colectores específicos según el sistema operativo
const platform = os.platform();

// Tipo para definir la interfaz de un colector
export interface Collector {
  name: string;
  description: string;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
}

// Cargar colectores según la plataforma
let collectors: Collector[] = [];

// Cargar colectores de Windows
if (platform === 'win32') {
  try {
    collectors = require('./windows').collectors;
  } catch (error) {
    console.error('Error al cargar colectores para Windows:', error);
  }
}
// Cargar colectores de macOS
else if (platform === 'darwin') {
  try {
    collectors = require('./macos').collectors;
  } catch (error) {
    console.error('Error al cargar colectores para macOS:', error);
  }
}
// Cargar colectores de Linux
else if (platform === 'linux') {
  try {
    collectors = require('./linux').collectors;
  } catch (error) {
    console.error('Error al cargar colectores para Linux:', error);
  }
}

// Exportar los colectores
export { collectors };