/**
 * Colector de logs del sistema journald
 */

import { spawn } from 'child_process';
import { Collector } from '../index';

// Proceso del journalctl
let journalProcess: any = null;

// Callback para procesar eventos
let processEventCallback: ((event: any) => void) | null = null;

/**
 * Colector de logs del sistema utilizando journalctl
 */
export const journaldCollector: Collector = {
  name: 'journald',
  description: 'Recopila logs del sistema desde journald para unidades críticas (sshd, sudo, su)',
  
  /**
   * Inicia la recopilación de logs de journald
   */
  async start(): Promise<boolean> {
    try {
      // Verificar si journalctl está disponible
      const testProcess = spawn('which', ['journalctl']);
      const success = await new Promise<boolean>((resolve) => {
        testProcess.on('exit', (code) => {
          resolve(code === 0);
        });
      });
      
      if (!success) {
        console.warn('journalctl no está disponible, el colector journald no se iniciará');
        return false;
      }
      
      // Iniciar journalctl para seguir logs de unidades críticas
      journalProcess = spawn('journalctl', [
        '-f',                   // follow (continuo)
        '-u', 'sshd.service',   // unidad sshd
        '-u', 'sudo.service',   // unidad sudo
        '-o', 'json'            // formato JSON para facilitar el parseo
      ]);
      
      // Manejar salida estándar (logs)
      journalProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            
            // Crear objeto de evento normalizado
            const normalizedEvent = {
              source: 'journald',
              timestamp: new Date(event.__REALTIME_TIMESTAMP / 1000), // Convertir microsegundos a milisegundos
              severity: mapPriorityToSeverity(event.PRIORITY),
              message: event.MESSAGE,
              details: {
                unit: event._SYSTEMD_UNIT,
                pid: event._PID,
                uid: event._UID,
                hostname: event._HOSTNAME,
                executable: event._EXE,
                cmdline: event._CMDLINE
              }
            };
            
            // Enviar evento a través del callback si está registrado
            if (processEventCallback) {
              processEventCallback(normalizedEvent);
            }
          } catch (error) {
            console.error('Error al procesar evento de journald:', error);
          }
        }
      });
      
      // Manejar errores
      journalProcess.stderr.on('data', (data: Buffer) => {
        console.error(`Error en journalctl: ${data.toString()}`);
      });
      
      // Manejar cierre
      journalProcess.on('close', (code: number) => {
        console.log(`Proceso journalctl cerrado con código: ${code}`);
        journalProcess = null;
      });
      
      console.log('Colector journald iniciado');
      return true;
    } catch (error) {
      console.error('Error al iniciar colector journald:', error);
      return false;
    }
  },
  
  /**
   * Detiene la recopilación de logs de journald
   */
  async stop(): Promise<boolean> {
    try {
      if (journalProcess) {
        journalProcess.kill();
        journalProcess = null;
        console.log('Colector journald detenido');
      }
      return true;
    } catch (error) {
      console.error('Error al detener colector journald:', error);
      return false;
    }
  }
};

/**
 * Mapea la prioridad syslog a niveles de severidad
 */
function mapPriorityToSeverity(priority: number): string {
  // Prioridades syslog (0-7)
  // 0: emergency, 1: alert, 2: critical, 3: error,
  // 4: warning, 5: notice, 6: info, 7: debug
  switch (priority) {
    case 0:
    case 1:
    case 2:
      return 'critical';
    case 3:
      return 'high';
    case 4:
      return 'medium';
    case 5:
    case 6:
      return 'low';
    case 7:
    default:
      return 'info';
  }
}

/**
 * Registra un callback para procesar eventos
 */
export function registerEventCallback(callback: (event: any) => void) {
  processEventCallback = callback;
}