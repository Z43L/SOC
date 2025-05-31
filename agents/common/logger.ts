/**
 * Simple logging utility for agents
 * Can be used as a bridge between console.log and more sophisticated loggers
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface SimpleLoggerOptions {
  level?: LogLevel;
  enableConsole?: boolean;
  prefix?: string;
}

/**
 * Simple logger that provides consistent logging interface
 */
export class SimpleLogger {
  private level: LogLevel;
  private enableConsole: boolean;
  private prefix: string;
  
  private readonly levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(options: SimpleLoggerOptions = {}) {
    this.level = options.level || 'info';
    this.enableConsole = options.enableConsole !== false;
    this.prefix = options.prefix || 'SOC-Agent';
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    // Check if this message should be logged based on level
    if (this.levelPriority[level] < this.levelPriority[this.level]) {
      return;
    }

    if (!this.enableConsole) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = args.length > 0 ? 
      message.replace(/%[sdj%]/g, (x) => {
        const arg = args.shift();
        switch (x) {
          case '%s': return String(arg);
          case '%d': return String(Number(arg));
          case '%j': return JSON.stringify(arg);
          case '%%': return '%';
          default: return x;
        }
      }) : message;

    const logLine = `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${formattedMessage}`;
    
    // Use appropriate console method
    switch (level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      case 'debug':
        console.debug(logLine);
        break;
      default:
        console.log(logLine);
    }
  }
}

// Export a default logger instance
export const logger = new SimpleLogger();