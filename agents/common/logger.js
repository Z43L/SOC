/**
 * Simple logging utility for agents
 * Can be used as a bridge between console.log and more sophisticated loggers
 */
/**
 * Simple logger that provides consistent logging interface
 */
export class SimpleLogger {
    level;
    enableConsole;
    prefix;
    levelPriority = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };
    constructor(options = {}) {
        this.level = options.level || 'info';
        this.enableConsole = options.enableConsole !== false;
        this.prefix = options.prefix || 'SOC-Agent';
    }
    debug(message, ...args) {
        this.log('debug', message, ...args);
    }
    info(message, ...args) {
        this.log('info', message, ...args);
    }
    warn(message, ...args) {
        this.log('warn', message, ...args);
    }
    error(message, ...args) {
        this.log('error', message, ...args);
    }
    log(level, message, ...args) {
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
                    case '%d': return Number(arg);
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
