/**
 * Servicio de logging simple para la aplicación
 */
class Logger {
    info(message) {
        console.log(`[INFO] ${message}`);
    }
    warn(message) {
        console.warn(`[WARN] ${message}`);
    }
    error(message) {
        console.error(`[ERROR] ${message}`);
    }
    debug(message) {
        console.debug(`[DEBUG] ${message}`);
    }
}
const logger = new Logger();
export default logger;
