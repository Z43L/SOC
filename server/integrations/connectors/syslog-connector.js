/**
 * Conector Syslog UDP/TCP
 */
import dgram from 'dgram';
import net from 'net';
import { BaseConnector } from './base-connector';
import { log } from '../../vite';
export class SyslogConnector extends BaseConnector {
    server;
    syslogConfig;
    constructor(config) {
        super(config);
        this.syslogConfig = config;
        this.validateConfig();
    }
    validateConfig() {
        super.validateConfig();
        if (!this.syslogConfig.port || this.syslogConfig.port < 1 || this.syslogConfig.port > 65535) {
            throw new Error('Puerto inválido para Syslog');
        }
        if (!['udp', 'tcp'].includes(this.syslogConfig.protocol)) {
            throw new Error('Protocolo debe ser UDP o TCP');
        }
    }
    async doStart() {
        const { protocol, port, bindAddress = '0.0.0.0' } = this.syslogConfig;
        if (protocol === 'udp') {
            await this.startUdpServer(port, bindAddress);
        }
        else {
            await this.startTcpServer(port, bindAddress);
        }
        log(`Servidor Syslog ${protocol.toUpperCase()} iniciado en ${bindAddress}:${port}`, 'syslog');
    }
    async doStop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            if (this.server instanceof dgram.Socket) {
                this.server.close(() => {
                    this.server = undefined;
                    resolve();
                });
            }
            else {
                this.server.close((err) => {
                    this.server = undefined;
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            }
        });
    }
    async doHealthCheck() {
        const isListening = this.server ?
            (this.server instanceof dgram.Socket ? true : this.server.listening)
            : false;
        return {
            healthy: isListening,
            message: isListening ? 'Servidor Syslog funcionando correctamente' : 'Servidor Syslog no está escuchando',
            lastChecked: new Date()
        };
    }
    async doTestConnection() {
        try {
            // Para syslog, simplemente verificamos que podemos bind al puerto
            const testServer = this.syslogConfig.protocol === 'udp'
                ? dgram.createSocket('udp4')
                : net.createServer();
            return new Promise((resolve) => {
                const onError = (err) => {
                    resolve({
                        success: false,
                        message: `No se puede usar puerto ${this.syslogConfig.port}: ${err.message}`
                    });
                };
                const onSuccess = () => {
                    if (testServer instanceof dgram.Socket) {
                        testServer.close();
                    }
                    else {
                        testServer.close();
                    }
                    resolve({
                        success: true,
                        message: `Puerto ${this.syslogConfig.port} disponible para Syslog ${this.syslogConfig.protocol.toUpperCase()}`
                    });
                };
                testServer.on('error', onError);
                if (testServer instanceof dgram.Socket) {
                    testServer.bind(this.syslogConfig.port, () => onSuccess());
                }
                else {
                    testServer.listen(this.syslogConfig.port, () => onSuccess());
                }
            });
        }
        catch (error) {
            return {
                success: false,
                message: `Error probando conexión: ${error}`
            };
        }
    }
    /**
     * Inicia servidor UDP
     */
    async startUdpServer(port, bindAddress) {
        return new Promise((resolve, reject) => {
            this.server = dgram.createSocket('udp4');
            this.server.on('error', (err) => {
                log(`Error en servidor UDP Syslog: ${err}`, 'syslog');
                this.emitError(err);
                reject(err);
            });
            this.server.on('message', (msg, rinfo) => {
                this.processSyslogMessage(msg.toString(), `${rinfo.address}:${rinfo.port}`);
            });
            this.server.bind(port, bindAddress, () => {
                log(`Servidor Syslog UDP escuchando en ${bindAddress}:${port}`, 'syslog');
                resolve();
            });
        });
    }
    /**
     * Inicia servidor TCP
     */
    async startTcpServer(port, bindAddress) {
        return new Promise((resolve, reject) => {
            this.server = net.createServer();
            this.server.on('error', (err) => {
                log(`Error en servidor TCP Syslog: ${err}`, 'syslog');
                this.emitError(err);
                reject(err);
            });
            this.server.on('connection', (socket) => {
                socket.on('data', (data) => {
                    // TCP puede enviar múltiples mensajes concatenados
                    const messages = data.toString().split('\n').filter(msg => msg.trim());
                    messages.forEach(msg => {
                        this.processSyslogMessage(msg, socket.remoteAddress || 'unknown');
                    });
                });
                socket.on('error', (err) => {
                    log(`Error en conexión TCP Syslog: ${err}`, 'syslog');
                });
            });
            this.server.listen(port, bindAddress, () => {
                log(`Servidor Syslog TCP escuchando en ${bindAddress}:${port}`, 'syslog');
                resolve();
            });
        });
    }
    /**
     * Procesa un mensaje syslog recibido
     */
    processSyslogMessage(rawMessage, sourceIp) {
        try {
            const startTime = Date.now();
            const parsed = this.parseSyslogMessage(rawMessage);
            const latency = Date.now() - startTime;
            this.addLatency(latency);
            // Emitir evento normalizado
            this.emitEvent({
                timestamp: parsed.timestamp || new Date(),
                source: parsed.hostname || sourceIp,
                message: parsed.message,
                severity: this.mapSyslogSeverity(parsed.severity || 6),
                rawData: {
                    priority: parsed.priority,
                    facility: parsed.facility,
                    severity: parsed.severity,
                    tag: parsed.tag,
                    hostname: parsed.hostname,
                    sourceIp,
                    protocol: this.syslogConfig.protocol,
                    raw: rawMessage
                }
            });
        }
        catch (error) {
            log(`Error procesando mensaje syslog: ${error}`, 'syslog');
            this.emitError(error);
        }
    }
    /**
     * Parser básico de RFC 5424/3164
     */
    parseSyslogMessage(message) {
        const result = {
            message: message,
            raw: message
        };
        // RFC 5424: <priority>version timestamp hostname app-name procid msgid structured-data msg
        // RFC 3164: <priority>timestamp hostname tag: message
        const rfc5424Match = message.match(/^<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S*)\s*(.*)/);
        if (rfc5424Match) {
            const [, priority, version, timestamp, hostname, appName, procId, msgId, structuredData, msg] = rfc5424Match;
            result.priority = parseInt(priority);
            result.facility = Math.floor(result.priority / 8);
            result.severity = result.priority % 8;
            result.timestamp = this.parseTimestamp(timestamp);
            result.hostname = hostname !== '-' ? hostname : undefined;
            result.tag = appName !== '-' ? appName : undefined;
            result.message = msg || '';
            return result;
        }
        // RFC 3164
        const rfc3164Match = message.match(/^<(\d+)>(\S+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s*(.*)/);
        if (rfc3164Match) {
            const [, priority, timestamp, hostname, tag, msg] = rfc3164Match;
            result.priority = parseInt(priority);
            result.facility = Math.floor(result.priority / 8);
            result.severity = result.priority % 8;
            result.timestamp = this.parseTimestamp(timestamp);
            result.hostname = hostname;
            result.tag = tag;
            result.message = msg || '';
            return result;
        }
        // Fallback: solo priority
        const priorityMatch = message.match(/^<(\d+)>\s*(.*)/);
        if (priorityMatch) {
            const [, priority, msg] = priorityMatch;
            result.priority = parseInt(priority);
            result.facility = Math.floor(result.priority / 8);
            result.severity = result.priority % 8;
            result.message = msg || '';
        }
        return result;
    }
    /**
     * Parse timestamp syslog
     */
    parseTimestamp(timestamp) {
        try {
            // RFC 5424 timestamp
            if (timestamp.includes('T')) {
                return new Date(timestamp);
            }
            // RFC 3164 timestamp (Jan 01 12:00:00)
            const currentYear = new Date().getFullYear();
            const fullTimestamp = `${currentYear} ${timestamp}`;
            return new Date(fullTimestamp);
        }
        catch {
            return new Date();
        }
    }
    /**
     * Mapea severidad syslog a nuestro formato
     */
    mapSyslogSeverity(severity) {
        switch (severity) {
            case 0:
            case 1:
            case 2: return 'critical';
            case 3:
            case 4: return 'error';
            case 5: return 'warn';
            default: return 'info';
        }
    }
}
