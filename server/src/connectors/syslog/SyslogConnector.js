import dgram from "dgram";
import net from "net";
import tls from "tls";
import { parseSyslog } from "./Parser";
import { EventService } from "../../services/eventService";
export default class SyslogConnector {
    name = "Syslog";
    config;
    udpServer = null;
    tcpServer = null;
    tlsServer = null;
    eventService = new EventService();
    async init(config) {
        this.config = config;
    }
    async start() {
        // UDP
        this.udpServer = dgram.createSocket("udp4");
        this.udpServer.on("message", (msg, rinfo) => this.handleRaw(msg.toString(), rinfo.address));
        this.udpServer.bind(this.config.udpPort, () => console.log(`Syslog UDP listening on ${this.config.udpPort}`));
        // TCP
        if (this.config.tcpPort) {
            this.tcpServer = net.createServer((socket) => {
                socket.on("data", (data) => this.handleRaw(data.toString(), socket.remoteAddress || ''));
            });
            this.tcpServer.listen(this.config.tcpPort, () => console.log(`Syslog TCP listening on ${this.config.tcpPort}`));
        }
        // TLS
        if (this.config.tls && this.tlsServer === null) {
            this.tlsServer = tls.createServer(this.config.tlsOptions || {}, (socket) => {
                socket.on("data", (data) => this.handleRaw(data.toString(), socket.remoteAddress || ''));
            });
            this.tlsServer.listen(this.config.tcpPort, () => console.log(`Syslog TLS listening on ${this.config.tcpPort}`));
        }
    }
    async stop() {
        this.udpServer?.close();
        this.tcpServer?.close();
        this.tlsServer?.close();
    }
    async process(rawEvent) {
        // not used; handled inline
        return [];
    }
    async handleRaw(raw, remote) {
        try {
            const parsed = parseSyslog(raw, remote);
            const eventType = this.config.mapping?.[parsed.appName] || parsed.appName;
            const severityMap = {
                'debug': 'debug', 'info': 'info', 'notice': 'info', 'warning': 'warn', 'err': 'error', 'crit': 'critical'
            };
            const sev = severityMap[parsed.severity.toLowerCase()] || 'info';
            const event = {
                id: crypto.randomUUID(),
                agentId: remote,
                severity: sev,
                category: eventType,
                engine: this.name,
                timestamp: parsed.timestamp.getTime(),
                host: parsed.host,
                message: parsed.message,
                extensions: parsed.extensions || {}
            };
            await this.eventService.create(event);
        }
        catch (err) {
            console.error('Syslog parse error', err);
        }
    }
}
