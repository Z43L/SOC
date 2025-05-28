/**
 * Syslog Connector Implementation
 * Allows receiving logs from systems via the Syslog protocol (UDP, TCP, TLS)
 */
import { BaseConnector } from './base';
import { log } from '../../vite';
import { storage } from '../../storage';
import * as dgram from 'dgram';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import { DataProcessor } from './data-processor';
import { connectorQueue } from './queue-processor';
/**
 * Syslog Connector Class
 */
export class SyslogConnector extends BaseConnector {
    server = null;
    dataProcessor;
    messageBuffer = [];
    rateTracker = new Map();
    isRunning = false;
    constructor(connector) {
        super(connector);
        this.dataProcessor = new DataProcessor(connector);
    }
    /**
     * Validate configuration method - required by BaseConnector
     */
    validateConfig() {
        const config = this.config;
        if (!config.protocol) {
            log('Syslog connector missing protocol configuration', 'connector');
            return false;
        }
        if (!['udp', 'tcp', 'tls'].includes(config.protocol)) {
            log(`Unsupported protocol: ${config.protocol}`, 'connector');
            return false;
        }
        if (!config.port || config.port < 1 || config.port > 65535) {
            log('Invalid port configuration, using default 514', 'connector');
            this.config.port = 514;
        }
        // Validate TLS certificates if needed
        if (config.protocol === 'tls') {
            if (!config.tlsCert || !config.tlsKey) {
                log('TLS protocol requires certificate and key files', 'connector');
                return false;
            }
        }
        return true;
    }
    /**
     * Start the Syslog server
     */
    async start() {
        const startTime = Date.now();
        try {
            if (this.isRunning) {
                return {
                    success: true,
                    message: 'Syslog connector is already running',
                    metrics: {
                        itemsProcessed: 0,
                        bytesProcessed: 0,
                        executionTime: Date.now() - startTime
                    }
                };
            }
            const config = this.config;
            const port = config.port || 514;
            const host = config.host || '0.0.0.0';
            switch (config.protocol) {
                case 'udp':
                    await this.startUDPServer(host, port);
                    break;
                case 'tcp':
                    await this.startTCPServer(host, port);
                    break;
                case 'tls':
                    await this.startTLSServer(host, port);
                    break;
                default:
                    throw new Error(`Unsupported protocol: ${config.protocol}`);
            }
            this.isRunning = true;
            this.state.lastRun = new Date();
            this.state.lastSuccess = new Date();
            this.state.consecutiveErrors = 0;
            // Start batch processing if enabled
            if (config.batchProcessing?.enabled) {
                this.startBatchProcessing();
            }
            log(`Syslog connector started on ${host}:${port} (${config.protocol})`, 'connector');
            return {
                success: true,
                message: `Syslog server started on ${host}:${port} using ${config.protocol}`,
                metrics: {
                    itemsProcessed: 0,
                    bytesProcessed: 0,
                    executionTime: Date.now() - startTime
                }
            };
        }
        catch (error) {
            this.state.lastError = new Date();
            this.state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.state.consecutiveErrors++;
            log(`Failed to start Syslog connector: ${this.state.errorMessage}`, 'connector');
            return {
                success: false,
                message: `Failed to start Syslog connector: ${this.state.errorMessage}`,
                metrics: {
                    itemsProcessed: 0,
                    bytesProcessed: 0,
                    executionTime: Date.now() - startTime
                }
            };
        }
    }
    /**
     * Stop the Syslog server
     */
    async stop() {
        const startTime = Date.now();
        try {
            if (!this.isRunning || !this.server) {
                return {
                    success: true,
                    message: 'Syslog connector is not running',
                    metrics: {
                        itemsProcessed: 0,
                        bytesProcessed: 0,
                        executionTime: Date.now() - startTime
                    }
                };
            }
            // Process remaining messages in buffer
            if (this.messageBuffer.length > 0) {
                await this.processBatch();
            }
            // Close the server
            if (this.server instanceof dgram.Socket) {
                this.server.close();
            }
            else {
                this.server.close();
            }
            this.server = null;
            this.isRunning = false;
            log('Syslog connector stopped', 'connector');
            return {
                success: true,
                message: 'Syslog connector stopped successfully',
                metrics: {
                    itemsProcessed: 0,
                    bytesProcessed: 0,
                    executionTime: Date.now() - startTime
                }
            };
        }
        catch (error) {
            log(`Error stopping Syslog connector: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            return {
                success: false,
                message: `Error stopping Syslog connector: ${error instanceof Error ? error.message : 'Unknown error'}`,
                metrics: {
                    itemsProcessed: 0,
                    bytesProcessed: 0,
                    executionTime: Date.now() - startTime
                }
            };
        }
    }
    /**
     * Execute method - required by BaseConnector
     */
    async execute() {
        // For Syslog connectors, execution means ensuring the server is running
        if (!this.isRunning) {
            return await this.start();
        }
        return {
            success: true,
            message: 'Syslog connector is running',
            metrics: {
                itemsProcessed: this.state.dataProcessed,
                bytesProcessed: this.state.bytesProcessed,
                executionTime: 0
            }
        };
    }
    /**
     * Test connection method
     */
    async testConnection() {
        // For Syslog, we test if we can bind to the port
        const config = this.config;
        const port = config.port || 514;
        const host = config.host || '0.0.0.0';
        try {
            if (config.protocol === 'udp') {
                const testSocket = dgram.createSocket('udp4');
                await new Promise((resolve, reject) => {
                    testSocket.bind(port + 1000, host, () => {
                        testSocket.close();
                        resolve();
                    });
                    testSocket.on('error', reject);
                });
            }
            else {
                const testServer = net.createServer();
                await new Promise((resolve, reject) => {
                    testServer.listen(port + 1000, host, () => {
                        testServer.close();
                        resolve();
                    });
                    testServer.on('error', reject);
                });
            }
            return true;
        }
        catch (error) {
            log(`Syslog connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            return false;
        }
    }
    /**
     * Start UDP server
     */
    async startUDPServer(host, port) {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket('udp4');
            socket.on('message', (msg, rinfo) => {
                this.handleMessage(msg.toString(), rinfo.address);
            });
            socket.on('error', (error) => {
                log(`UDP Syslog server error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                reject(error);
            });
            socket.bind(port, host, () => {
                this.server = socket;
                resolve();
            });
        });
    }
    /**
     * Start TCP server
     */
    async startTCPServer(host, port) {
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket) => {
                let buffer = '';
                socket.on('data', (data) => {
                    buffer += data.toString();
                    // Process complete messages (separated by newlines)
                    const messages = buffer.split('\n');
                    buffer = messages.pop() || ''; // Keep incomplete message in buffer
                    messages.forEach(message => {
                        if (message.trim()) {
                            this.handleMessage(message.trim(), socket.remoteAddress || 'unknown');
                        }
                    });
                });
                socket.on('error', (error) => {
                    log(`TCP Syslog client error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                });
            });
            server.on('error', (error) => {
                log(`TCP Syslog server error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                reject(error);
            });
            server.listen(port, host, () => {
                this.server = server;
                resolve();
            });
        });
    }
    /**
     * Start TLS server
     */
    async startTLSServer(host, port) {
        return new Promise((resolve, reject) => {
            const config = this.config;
            if (!config.tlsCert || !config.tlsKey) {
                reject(new Error('TLS certificate and key are required for TLS protocol'));
                return;
            }
            let tlsOptions;
            try {
                tlsOptions = {
                    cert: fs.readFileSync(config.tlsCert),
                    key: fs.readFileSync(config.tlsKey),
                };
                if (config.tlsCA) {
                    tlsOptions.ca = fs.readFileSync(config.tlsCA);
                }
            }
            catch (error) {
                reject(new Error(`Failed to read TLS certificates: ${error instanceof Error ? error.message : 'Unknown error'}`));
                return;
            }
            const server = tls.createServer(tlsOptions, (socket) => {
                let buffer = '';
                socket.on('data', (data) => {
                    buffer += data.toString();
                    const messages = buffer.split('\n');
                    buffer = messages.pop() || '';
                    messages.forEach(message => {
                        if (message.trim()) {
                            this.handleMessage(message.trim(), socket.remoteAddress || 'unknown');
                        }
                    });
                });
                socket.on('error', (error) => {
                    log(`TLS Syslog client error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                });
            });
            server.on('error', (error) => {
                log(`TLS Syslog server error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                reject(error);
            });
            server.listen(port, host, () => {
                this.server = server;
                resolve();
            });
        });
    }
    /**
     * Handle incoming syslog message
     */
    async handleMessage(rawMessage, sourceIp) {
        try {
            const parsedMessage = this.parseSyslogMessage(rawMessage, sourceIp);
            // Apply filtering
            if (!this.shouldProcessMessage(parsedMessage)) {
                return;
            }
            // Update metrics
            this.state.dataProcessed++;
            this.state.bytesProcessed += rawMessage.length;
            const config = this.config;
            // Batch processing
            if (config.batchProcessing?.enabled) {
                this.messageBuffer.push(parsedMessage);
                if (this.messageBuffer.length >= (config.batchProcessing.batchSize || 100)) {
                    await this.processBatch();
                }
            }
            else {
                // Process immediately
                await this.processMessage(parsedMessage);
            }
        }
        catch (error) {
            log(`Error handling syslog message: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            this.state.consecutiveErrors++;
        }
    }
    /**
     * Parse syslog message according to RFC 3164/5424
     */
    parseSyslogMessage(rawMessage, sourceIp) {
        // Basic RFC 3164 parsing
        const priorityMatch = rawMessage.match(/^<(\d+)>/);
        let priority = 0;
        let message = rawMessage;
        if (priorityMatch) {
            priority = parseInt(priorityMatch[1]);
            message = rawMessage.substring(priorityMatch[0].length);
        }
        const facility = Math.floor(priority / 8);
        const severity = priority % 8;
        // Parse timestamp, hostname, and message
        const parts = message.trim().split(' ');
        let timestamp = new Date();
        let hostname = 'unknown';
        let appName = '';
        let procId = '';
        let msgId = '';
        let messageText = message;
        if (parts.length >= 3) {
            // Try to parse timestamp (RFC 3164 format)
            const timestampStr = `${parts[0]} ${parts[1]} ${parts[2]}`;
            const parsedTime = new Date(timestampStr);
            if (!isNaN(parsedTime.getTime())) {
                timestamp = parsedTime;
                hostname = parts[3] || 'unknown';
                messageText = parts.slice(4).join(' ');
            }
            else {
                hostname = parts[0];
                messageText = parts.slice(1).join(' ');
            }
        }
        // Extract app name and process ID if present
        const appMatch = messageText.match(/^([^\[\s]+)(\[(\d+)\])?:\s*(.*)/);
        if (appMatch) {
            appName = appMatch[1];
            procId = appMatch[3] || '';
            messageText = appMatch[4];
        }
        return {
            facility,
            severity,
            timestamp,
            hostname,
            appName,
            procId,
            msgId,
            message: messageText,
            rawMessage,
            sourceIp
        };
    }
    /**
     * Check if message should be processed based on filters
     */
    shouldProcessMessage(message) {
        const config = this.config;
        const filtering = config.filtering;
        if (!filtering)
            return true;
        // Include patterns
        if (filtering.include && filtering.include.length > 0) {
            const matchesInclude = filtering.include.some(pattern => new RegExp(pattern, 'i').test(message.message) ||
                new RegExp(pattern, 'i').test(message.hostname) ||
                new RegExp(pattern, 'i').test(message.appName));
            if (!matchesInclude)
                return false;
        }
        // Exclude patterns
        if (filtering.exclude && filtering.exclude.length > 0) {
            const matchesExclude = filtering.exclude.some(pattern => new RegExp(pattern, 'i').test(message.message) ||
                new RegExp(pattern, 'i').test(message.hostname) ||
                new RegExp(pattern, 'i').test(message.appName));
            if (matchesExclude)
                return false;
        }
        // Facility filter
        if (filtering.facilities && filtering.facilities.length > 0) {
            if (!filtering.facilities.includes(message.facility))
                return false;
        }
        // Severity filter
        if (filtering.severities && filtering.severities.length > 0) {
            if (!filtering.severities.includes(message.severity))
                return false;
        }
        // Source filter
        if (filtering.sources && filtering.sources.length > 0) {
            const matchesSource = filtering.sources.some(source => message.hostname === source || message.sourceIp === source);
            if (!matchesSource)
                return false;
        }
        return true;
    }
    /**
     * Process a single syslog message
     */
    async processMessage(message) {
        try {
            // Apply custom parsing rules
            const parsedData = await this.applyParsingRules(message);
            // Check for alert generation
            await this.checkAlertRules(message, parsedData);
            // Queue for further processing if needed
            await connectorQueue.enqueue(this.connector.id, {
                ...parsedData,
                originalMessage: message
            }, {
                vendor: 'syslog',
                product: this.connector.name,
                format: 'syslog'
            }, this.getSeverityPriority(message.severity) > 5 ? 'high' : 'medium');
        }
        catch (error) {
            log(`Error processing syslog message: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            throw error;
        }
    }
    /**
     * Process messages in batch
     */
    async processBatch() {
        if (this.messageBuffer.length === 0)
            return;
        const messages = [...this.messageBuffer];
        this.messageBuffer = [];
        try {
            await Promise.all(messages.map(message => this.processMessage(message)));
            log(`Processed batch of ${messages.length} syslog messages`, 'connector');
        }
        catch (error) {
            log(`Error processing syslog batch: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            // Re-add messages to buffer for retry
            this.messageBuffer.unshift(...messages);
            throw error;
        }
    }
    /**
     * Apply custom parsing rules to extract structured data
     */
    async applyParsingRules(message) {
        const config = this.config;
        const rules = config.parsers?.rules || [];
        let parsedData = {
            facility: message.facility,
            severity: message.severity,
            timestamp: message.timestamp,
            hostname: message.hostname,
            appName: message.appName,
            procId: message.procId,
            sourceIp: message.sourceIp,
            message: message.message
        };
        for (const rule of rules) {
            if (!rule.enabled)
                continue;
            try {
                const regex = new RegExp(rule.pattern, 'g');
                const matches = regex.exec(message.message);
                if (matches) {
                    for (const [fieldName, captureGroup] of Object.entries(rule.fields)) {
                        const groupIndex = parseInt(captureGroup);
                        if (matches[groupIndex]) {
                            parsedData[fieldName] = matches[groupIndex];
                        }
                    }
                }
            }
            catch (error) {
                log(`Error applying parsing rule ${rule.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            }
        }
        return parsedData;
    }
    /**
     * Check alert generation rules and create alerts
     */
    async checkAlertRules(message, parsedData) {
        const config = this.config;
        const rules = config.alertGeneration?.rules || [];
        if (!config.alertGeneration?.enabled)
            return;
        for (const rule of rules) {
            if (!rule.enabled)
                continue;
            try {
                // Check if message matches rule pattern
                const regex = new RegExp(rule.pattern, 'i');
                if (!regex.test(message.message))
                    continue;
                // Check conditions
                if (rule.conditions) {
                    if (rule.conditions.facility && !rule.conditions.facility.includes(message.facility))
                        continue;
                    if (rule.conditions.severity && !rule.conditions.severity.includes(message.severity))
                        continue;
                    // Rate limiting
                    if (rule.conditions.rateLimit) {
                        const key = `${rule.name}-${message.hostname}-${message.sourceIp}`;
                        if (!this.checkRateLimit(key, rule.conditions.rateLimit))
                            continue;
                    }
                }
                // Create alert
                const alert = {
                    title: rule.title,
                    description: rule.description,
                    severity: rule.severity,
                    source: `Syslog-${message.hostname}`,
                    sourceIp: message.sourceIp,
                    status: 'new',
                    organizationId: this.connector.organizationId,
                    metadata: {
                        syslogFacility: message.facility,
                        syslogSeverity: message.severity,
                        hostname: message.hostname,
                        appName: message.appName,
                        procId: message.procId,
                        ruleName: rule.name,
                        originalMessage: message.rawMessage,
                        parsedData
                    }
                };
                await storage.createAlert(alert);
                log(`Created alert from syslog rule: ${rule.name}`, 'connector');
            }
            catch (error) {
                log(`Error checking alert rule ${rule.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
            }
        }
    }
    /**
     * Check rate limiting for alert rules
     */
    checkRateLimit(key, rateLimit) {
        const now = Date.now();
        const tracker = this.rateTracker.get(key);
        if (!tracker || now - tracker.lastReset > rateLimit.timeWindow * 1000) {
            this.rateTracker.set(key, { count: 1, lastReset: now });
            return true;
        }
        if (tracker.count >= rateLimit.count) {
            return false;
        }
        tracker.count++;
        return true;
    }
    /**
     * Get priority based on syslog severity
     */
    getSeverityPriority(severity) {
        // Syslog severity: 0=Emergency, 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notice, 6=Info, 7=Debug
        // Higher severity gets higher priority (lower number)
        return Math.max(1, 8 - severity);
    }
    /**
     * Start batch processing timer
     */
    startBatchProcessing() {
        const config = this.config;
        const interval = (config.batchProcessing?.flushInterval || 30) * 1000;
        setInterval(async () => {
            if (this.messageBuffer.length > 0) {
                try {
                    await this.processBatch();
                }
                catch (error) {
                    log(`Error in batch processing timer: ${error instanceof Error ? error.message : 'Unknown error'}`, 'connector');
                }
            }
        }, interval);
    }
    /**
     * Get connector status and metrics
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            protocol: this.config.protocol,
            port: this.config.port,
            messagesProcessed: this.state.dataProcessed,
            bytesProcessed: this.state.bytesProcessed,
            bufferSize: this.messageBuffer.length,
            consecutiveErrors: this.state.consecutiveErrors,
            lastRun: this.state.lastRun,
            lastSuccess: this.state.lastSuccess,
            lastError: this.state.lastError,
            errorMessage: this.state.errorMessage
        };
    }
}
