/**
 * Servicio de logging simple para la aplicación
 */

interface LoggerInterface {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

class Logger implements LoggerInterface {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
  
  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }
  
  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }
  
  debug(message: string): void {
    console.debug(`[DEBUG] ${message}`);
  }
}

const logger = new Logger();
export default logger;