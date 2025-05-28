// Simple key=value parser
function parseExtensions(extStr) {
    const parts = extStr.trim().split(/\s+/);
    const obj = {};
    for (const part of parts) {
        const [key, value] = part.split('=', 2);
        if (key && value !== undefined)
            obj[key] = value;
    }
    return obj;
}
export function parseSyslog(raw, remoteAddress) {
    // Detect CEF
    if (raw.startsWith('CEF:')) {
        const parts = raw.split('|');
        // CEF:Version|Vendor|Product|Signature|Name|Severity|Extension
        const [header, vendor, product, signatureId, name, severityId, ext] = parts;
        return {
            facility: 'CEF',
            severity: severityId,
            host: remoteAddress || '',
            appName: product,
            timestamp: new Date(),
            message: name,
            extensions: parseExtensions(ext || ''),
        };
    }
    // Basic RFC 3164/5424: <PRI>Timestamp Host App[PID]: Message
    // We'll fallback to entire raw message
    return {
        facility: 'syslog',
        severity: 'info',
        host: remoteAddress || '',
        appName: 'syslog',
        timestamp: new Date(),
        message: raw,
        extensions: {},
    };
}
