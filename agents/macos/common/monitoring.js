"use strict";
/**
 * Módulo de monitoreo común para todos los agentes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSystemMetricsEvent = createSystemMetricsEvent;
exports.createFileEvent = createFileEvent;
exports.createSuspiciousProcessEvent = createSuspiciousProcessEvent;
exports.createSuspiciousConnectionEvent = createSuspiciousConnectionEvent;
exports.createMalwareDetectionEvent = createMalwareDetectionEvent;
exports.createVulnerabilityEvent = createVulnerabilityEvent;
/**
 * Convertir métricas del sistema a un evento para enviar al servidor
 */
function createSystemMetricsEvent(metrics) {
    return {
        eventType: 'system',
        severity: 'info',
        timestamp: new Date(),
        message: `System metrics: CPU ${metrics.cpuUsage.toFixed(1)}%, Memory ${metrics.memoryUsage.toFixed(1)}%, Disk ${metrics.diskUsage.toFixed(1)}%`,
        details: metrics
    };
}
/**
 * Convertir un evento de archivo a un evento para enviar al servidor
 */
function createFileEvent(fileEvent) {
    let message = `File ${fileEvent.action}: ${fileEvent.path}`;
    if (fileEvent.action === 'rename' && fileEvent.oldPath) {
        message = `File renamed from ${fileEvent.oldPath} to ${fileEvent.path}`;
    }
    // Determinar severidad basada en el tipo de acción
    let severity = 'info';
    // Acciones de borrado o modificación en directorios sensibles son de mayor severidad
    const sensitiveDirectories = [
        '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin',
        '/boot', '/lib', '/lib64', 'C:\\Windows\\System32',
        'C:\\Program Files', 'C:\\Program Files (x86)'
    ];
    const isSensitiveDirectory = sensitiveDirectories.some(dir => fileEvent.path.startsWith(dir));
    if (fileEvent.action === 'delete' && isSensitiveDirectory) {
        severity = 'high';
    }
    else if (fileEvent.action === 'modify' && isSensitiveDirectory) {
        severity = 'medium';
    }
    else if (fileEvent.action === 'permission_change' && isSensitiveDirectory) {
        severity = 'medium';
    }
    return {
        eventType: 'file',
        severity,
        timestamp: fileEvent.timestamp,
        message,
        details: fileEvent
    };
}
/**
 * Convertir información de un proceso sospechoso a un evento
 */
function createSuspiciousProcessEvent(process, reason) {
    return {
        eventType: 'process',
        severity: 'medium',
        timestamp: new Date(),
        message: `Suspicious process detected: ${process.name} (PID: ${process.pid}) - ${reason}`,
        details: {
            process,
            reason
        }
    };
}
/**
 * Convertir una conexión de red sospechosa a un evento
 */
function createSuspiciousConnectionEvent(connection, reason) {
    return {
        eventType: 'network',
        severity: 'medium',
        timestamp: new Date(),
        message: `Suspicious network connection detected from ${connection.localAddress}:${connection.localPort} to ${connection.remoteAddress}:${connection.remotePort} (${connection.protocol}) - ${reason}`,
        details: {
            connection,
            reason
        }
    };
}
/**
 * Convertir un hallazgo de malware a un evento
 */
function createMalwareDetectionEvent(detection) {
    let severity;
    // Determinar severidad basada en la confianza de la detección
    if (detection.confidence >= 0.9) {
        severity = 'critical';
    }
    else if (detection.confidence >= 0.7) {
        severity = 'high';
    }
    else if (detection.confidence >= 0.5) {
        severity = 'medium';
    }
    else {
        severity = 'low';
    }
    let status = '';
    if (detection.quarantined) {
        status = ' - Quarantined';
    }
    else if (detection.deleted) {
        status = ' - Deleted';
    }
    return {
        eventType: 'malware',
        severity,
        timestamp: new Date(),
        message: `Malware detected: ${detection.malwareName} in ${detection.filePath} (Confidence: ${(detection.confidence * 100).toFixed(1)}%)${status}`,
        details: detection
    };
}
/**
 * Convertir una vulnerabilidad detectada a un evento
 */
function createVulnerabilityEvent(vulnerability) {
    const fixInfo = vulnerability.fixAvailable
        ? ` - Fix available in version ${vulnerability.fixVersion}`
        : ' - No fix available';
    return {
        eventType: 'vulnerability',
        severity: vulnerability.severity,
        timestamp: new Date(),
        message: `Vulnerability detected: ${vulnerability.cveId} in ${vulnerability.softwareName} ${vulnerability.version} - ${vulnerability.description}${fixInfo}`,
        details: vulnerability
    };
}
