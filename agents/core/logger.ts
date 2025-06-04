/**
 * Utilidad de logging para el agente
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { format } from 'util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  level: LogLevel;
  filePath?: string;
  maxSizeBytes?: number;
  maxAgeDays?: number;
  enableConsole?: boolean;
  rotationCount?: number;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

/**
 * Clase para gestión de logs
 */
export class Logger {
  private options: LogOptions;
  private writeStream: fs.WriteStream | null = null;
  private currentSize = 0;
  private levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(options: LogOptions) {
    this.options = {
      level: options.level || 'info',
      filePath: options.filePath,
      maxSizeBytes: options.maxSizeBytes || 52428800, // 50 MB por defecto
      maxAgeDays: options.maxAgeDays || 30,
      enableConsole: options.enableConsole !== false,
      rotationCount: options.rotationCount || 5
    };

    // Inicializar archivo de log si se especifica ruta
    if (this.options.filePath) {
      this.initLogFile();
    }
  }

  /**
   * Inicializa el archivo de logs
   */
  private initLogFile(): void {
    if (!this.options.filePath) return;

    try {
      // Crear directorio si no existe
      const directory = path.dirname(this.options.filePath);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      // Obtener tamaño actual si el archivo existe
      if (fs.existsSync(this.options.filePath)) {
        const stats = fs.statSync(this.options.filePath);
        this.currentSize = stats.size;

        // Verificar si necesitamos rotar por tamaño
        if (this.currentSize >= (this.options.maxSizeBytes || 0)) {
          this.rotateLogFile();
        } else {
          // Verificar si necesitamos rotar por antigüedad
          const maxAgeDays = this.options.maxAgeDays || 30;
          const fileTime = stats.mtime.getTime();
          const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
          
          if (Date.now() - fileTime > maxAgeMs) {
            this.rotateLogFile();
          }
        }
      }

      // Abrir stream para escritura
      this.writeStream = fs.createWriteStream(this.options.filePath, { flags: 'a' });
      this.writeStream.on('error', (error) => {
        console.error('Error writing to log file:', error);
        this.writeStream = null;
      });
    } catch (error) {
      console.error('Error initializing log file:', error);
    }
  }

  /**
   * Rota los archivos de log
   */
  private rotateLogFile(): void {
    if (!this.options.filePath) return;

    try {
      // Cerrar stream actual si existe
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }

      const rotationCount = this.options.rotationCount || 5;
      const filePath = this.options.filePath;

      // Eliminar archivo más antiguo si existe
      const oldestRotated = `${filePath}.${rotationCount}.gz`;
      if (fs.existsSync(oldestRotated)) {
        fs.unlinkSync(oldestRotated);
      }

      // Rotar archivos existentes
      for (let i = rotationCount - 1; i >= 1; i--) {
        const oldFile = `${filePath}.${i}.gz`;
        const newFile = `${filePath}.${i + 1}.gz`;
        
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }

      // Comprimir archivo actual
      if (fs.existsSync(filePath)) {
        const input = fs.readFileSync(filePath);
        const compressed = zlib.gzipSync(input);
        fs.writeFileSync(`${filePath}.1.gz`, compressed);
        fs.unlinkSync(filePath);
      }

      // Reiniciar tamaño
      this.currentSize = 0;
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  /**
   * Registra un mensaje en el nivel debug
   */
  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Registra un mensaje en el nivel info
   */
  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Registra un mensaje en el nivel warn
   */
  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Registra un mensaje en el nivel error
   */
  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Registra un mensaje con el nivel especificado
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    // Verificar si el nivel de log actual permite este mensaje
    if (this.levelPriority[level] < this.levelPriority[this.options.level]) {
      return;
    }

    // Formatear mensaje
    const formattedMessage = args.length > 0 ? format(message, ...args) : message;
    
    // Crear entrada de log
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: formattedMessage
    };

    // Convertir a texto
    const logText = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
    
    // Mostrar en consola si está habilitado
    if (this.options.enableConsole) {
      const consoleMethod = level === 'error' ? console.error :
                           level === 'warn' ? console.warn :
                           level === 'debug' ? console.debug :
                           console.log;
      
      consoleMethod(`[${level.toUpperCase()}] ${formattedMessage}`);
    }
    
    // Escribir a archivo si está configurado
    if (this.writeStream) {
      this.writeStream.write(logText);
      this.currentSize += logText.length;
      
      // Verificar rotación
      if (this.currentSize >= (this.options.maxSizeBytes || 0)) {
        this.rotateLogFile();
        this.initLogFile();
      }
    }
  }

  /**
   * Cierra el logger y los recursos asociados
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}