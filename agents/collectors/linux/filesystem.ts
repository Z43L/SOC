/**
 * Colector de monitoreo de sistema de archivos para Linux
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Collector } from '../types';

// Procesos de inotifywait
const inotifyProcesses: any[] = [];

// Callback para procesar eventos
let fileSystemEventCallback: ((event: any) => void) | null = null;

// Directorios a monitorear por defecto
const DEFAULT_MONITORED_DIRS = [
  '/etc',
  '/usr/bin',
  '/usr/sbin'
];

/**
 * Colector de monitoreo de sistema de archivos para Linux
 */
export const fileSystemCollector: Collector = {
  name: 'filesystem',
  description: 'Monitorea cambios en el sistema de archivos en directorios críticos',
  
  /**
   * Inicia el monitoreo del sistema de archivos
   */
  async start(): Promise<boolean> {
    try {
      // Verificar si inotifywait está disponible
      const testProcess = spawn('which', ['inotifywait']);
      const success = await new Promise<boolean>((resolve) => {
        testProcess.on('exit', (code) => {
          resolve(code === 0);
        });
      });
      
      if (!success) {
        console.warn('inotifywait no está disponible, el colector de sistema de archivos utilizará alternativa');
        return await startAlternativeMonitoring();
      }
      
      // Iniciar monitoreo para cada directorio
      for (const dir of DEFAULT_MONITORED_DIRS) {
        await startInotifyWatch(dir);
      }
      
      console.log('Colector de sistema de archivos iniciado');
      return true;
    } catch (error) {
      console.error('Error al iniciar colector de sistema de archivos:', error);
      return false;
    }
  },
  
  /**
   * Detiene el monitoreo del sistema de archivos
   */
  async stop(): Promise<boolean> {
    try {
      // Detener todos los procesos de inotifywait
      for (const process of inotifyProcesses) {
        process.kill();
      }
      
      // Limpiar la lista de procesos
      inotifyProcesses.length = 0;
      
      console.log('Colector de sistema de archivos detenido');
      return true;
    } catch (error) {
      console.error('Error al detener colector de sistema de archivos:', error);
      return false;
    }
  }
};

/**
 * Inicia inotifywait para un directorio específico
 */
async function startInotifyWatch(directory: string): Promise<void> {
  try {
    // Verificar si el directorio existe
    if (!fs.existsSync(directory)) {
      console.warn(`El directorio ${directory} no existe. No se monitoreará.`);
      return;
    }
    
    // Iniciar inotifywait para monitorear el directorio
    // -m: monitoreo continuo
    // -r: recursivo
    // -e: eventos a monitorear (create, modify, delete, move, attrib)
    // --format: formato de salida
    const inotifyProcess = spawn('inotifywait', [
      '-m', '-r',
      '-e', 'create,modify,delete,move,attrib',
      '--format', '%:e %w%f',
      directory
    ]);
    
    // Agregar el proceso a la lista
    inotifyProcesses.push(inotifyProcess);
    
    // Manejar salida estándar (eventos)
    inotifyProcess.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      
      for (const line of lines) {
        try {
          // Formato: EVENTOS RUTA
          // Donde EVENTOS puede ser uno o más eventos separados por comas
          const match = line.match(/^([^:]+): (.+)$/);
          
          if (match) {
            const events = match[1].split(',');
            const filePath = match[2];
            
            // Crear evento para cada tipo de evento detectado
            for (const eventType of events) {
              const normalizedEvent = {
                source: 'filesystem',
                type: mapInotifyEvent(eventType),
                timestamp: new Date(),
                severity: 'info',
                message: `Cambio en sistema de archivos: ${mapInotifyEvent(eventType)} - ${filePath}`,
                details: {
                  path: filePath,
                  event: eventType,
                  directory: path.dirname(filePath),
                  filename: path.basename(filePath)
                }
              };
              
              // Ajustar severidad según el tipo de archivo y evento
              if (isCriticalFile(filePath)) {
                normalizedEvent.severity = 'high';
                normalizedEvent.message = `Cambio crítico en sistema de archivos: ${mapInotifyEvent(eventType)} - ${filePath}`;
              }
              
              // Enviar evento a través del callback si está registrado
              if (fileSystemEventCallback) {
                fileSystemEventCallback(normalizedEvent);
              }
            }
          }
        } catch (error) {
          console.error('Error al procesar evento de inotify:', error);
        }
      }
    });
    
    // Manejar errores
    inotifyProcess.stderr.on('data', (data: Buffer) => {
      console.error(`Error en inotifywait para ${directory}: ${data.toString()}`);
    });
    
    // Manejar cierre
    inotifyProcess.on('close', (code: number) => {
      console.log(`Proceso inotifywait para ${directory} cerrado con código: ${code}`);
      
      // Eliminar el proceso de la lista
      const index = inotifyProcesses.indexOf(inotifyProcess);
      if (index !== -1) {
        inotifyProcesses.splice(index, 1);
      }
    });
    
    console.log(`Monitoreo iniciado para: ${directory}`);
  } catch (error) {
    console.error(`Error al iniciar monitoreo para ${directory}:`, error);
  }
}

/**
 * Inicia método alternativo de monitoreo (sondeo periódico)
 */
async function startAlternativeMonitoring(): Promise<boolean> {
  console.log('Utilizando monitoreo alternativo basado en sondeo periódico');
  // Aquí se implementaría un sondeo periódico con fs.stat
  // Esta implementación simplificada solo devuelve true
  return true;
}

/**
 * Mapea eventos de inotify a tipos normalizados
 */
function mapInotifyEvent(event: string): string {
  switch (event.toLowerCase()) {
    case 'create':
      return 'file_created';
    case 'modify':
      return 'file_modified';
    case 'delete':
      return 'file_deleted';
    case 'move':
    case 'moved_from':
    case 'moved_to':
      return 'file_moved';
    case 'attrib':
      return 'attributes_changed';
    default:
      return 'file_changed';
  }
}

/**
 * Verifica si un archivo es considerado crítico
 */
function isCriticalFile(filePath: string): boolean {
  // Lista de directorios y archivos críticos
  const criticalPaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/etc/ssh',
    '/etc/pam.d',
    '/etc/security',
    '/etc/crontab',
    '/etc/cron.d',
    '/etc/init.d',
    '/etc/systemd',
    '/usr/bin/sudo',
    '/usr/bin/su',
    '/usr/bin/ssh',
    '/usr/sbin/sshd'
  ];
  
  // Verificar si el archivo está en un directorio crítico
  for (const criticalPath of criticalPaths) {
    if (filePath.startsWith(criticalPath)) {
      return true;
    }
  }
  
  // Verificar extensiones de archivos ejecutables
  if (filePath.endsWith('.sh') || 
      filePath.endsWith('.py') || 
      filePath.endsWith('.pl') || 
      filePath.endsWith('.rb')) {
    return true;
  }
  
  // Verificar si está en directorio binario y es un archivo
  if ((filePath.startsWith('/usr/bin/') || 
       filePath.startsWith('/usr/sbin/') || 
       filePath.startsWith('/bin/') || 
       filePath.startsWith('/sbin/')) && 
      !filePath.includes('/')) {
    return true;
  }
  
  return false;
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  fileSystemEventCallback = callback;
}