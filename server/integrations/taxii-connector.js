/**
 * Conector avanzado para TAXII (Trusted Automated Exchange of Intelligence Information)
 *
 * Este conector implementa la capacidad de obtener inteligencia de amenazas desde
 * cualquier servidor TAXII 2.0 o 2.1, siguiendo el estándar OASIS para el intercambio
 * automatizado de inteligencia de amenazas.
 */
import fetch from 'node-fetch';
import { log } from '../vite';
import { storage } from '../storage';
import { aiParser } from './ai-parser-service';
import { aiQueue } from './ai-processing-queue';
// Clase principal del conector TAXII
export class TaxiiConnector {
    config;
    headers = {};
    connectorId;
    /**
     * Constructor del conector TAXII
     */
    constructor(config, connectorId) {
        this.config = config;
        this.connectorId = connectorId;
        // Configurar headers de autenticación
        this.headers = {
            'Accept': 'application/taxii+json;version=2.1',
            'Content-Type': 'application/taxii+json;version=2.1'
        };
        if (this.config.version === '2.0') {
            this.headers['Accept'] = 'application/vnd.oasis.taxii+json;version=2.0';
            this.headers['Content-Type'] = 'application/vnd.oasis.taxii+json;version=2.0';
        }
        // Configurar autenticación si es necesario
        if (config.username && config.password) {
            const authString = Buffer.from(`${config.username}:${config.password}`).toString('base64');
            this.headers['Authorization'] = `Basic ${authString}`;
        }
        else if (config.apiKey) {
            this.headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
    }
    /**
     * Obtiene información sobre el servidor TAXII
     */
    async getServerInformation() {
        try {
            const response = await fetch(this.config.apiRoot, {
                method: 'GET',
                headers: this.headers
            });
            if (!response.ok) {
                throw new Error(`Error al obtener información del servidor TAXII: ${response.statusText}`);
            }
            return await response.json();
        }
        catch (error) {
            log(`Error en la conexión con servidor TAXII: ${error.message}`, 'taxii-connector');
            throw error;
        }
    }
    /**
     * Obtiene la lista de colecciones disponibles
     */
    async getCollections() {
        try {
            const collectionsUrl = `${this.config.apiRoot}/collections/`;
            const response = await fetch(collectionsUrl, {
                method: 'GET',
                headers: this.headers
            });
            if (!response.ok) {
                throw new Error(`Error al obtener colecciones TAXII: ${response.statusText}`);
            }
            const data = await response.json();
            return this.config.version === '2.1' ? data.collections : data;
        }
        catch (error) {
            log(`Error al obtener colecciones TAXII: ${error.message}`, 'taxii-connector');
            throw error;
        }
    }
    /**
     * Obtiene objetos STIX de una colección específica
     */
    async getObjects(options = {}) {
        try {
            // Construir URL de consulta
            let objectsUrl = `${this.config.apiRoot}/collections/${this.config.collectionId}/objects/`;
            const params = [];
            if (options.added_after) {
                params.push(`added_after=${encodeURIComponent(options.added_after)}`);
            }
            if (options.limit) {
                params.push(`limit=${options.limit}`);
            }
            if (options.types && options.types.length > 0) {
                params.push(`match[type]=${options.types.join(',')}`);
            }
            if (options.next) {
                params.push(`next=${options.next}`);
            }
            if (params.length > 0) {
                objectsUrl += `?${params.join('&')}`;
            }
            // Realizar solicitud
            const response = await fetch(objectsUrl, {
                method: 'GET',
                headers: this.headers
            });
            if (!response.ok) {
                throw new Error(`Error al obtener objetos TAXII: ${response.statusText}`);
            }
            const data = await response.json();
            // Extraer objetos dependiendo de la versión
            return this.config.version === '2.1' ? data.objects : data.data;
        }
        catch (error) {
            log(`Error al obtener objetos TAXII: ${error.message}`, 'taxii-connector');
            throw error;
        }
    }
    /**
     * Convierte un objeto STIX a nuestro formato de ThreatIntel
     */
    stixToThreatIntel(stixObject) {
        // Determinar severidad basada en etiquetas o tipo
        let severity = 'medium';
        if (stixObject.labels) {
            if (stixObject.labels.some(l => l.toLowerCase().includes('critical') ||
                l.toLowerCase().includes('severe') ||
                l.toLowerCase().includes('high'))) {
                severity = 'critical';
            }
            else if (stixObject.labels.some(l => l.toLowerCase().includes('high'))) {
                severity = 'high';
            }
            else if (stixObject.labels.some(l => l.toLowerCase().includes('medium') ||
                l.toLowerCase().includes('moderate'))) {
                severity = 'medium';
            }
            else if (stixObject.labels.some(l => l.toLowerCase().includes('low'))) {
                severity = 'low';
            }
        }
        // Extraer IoCs del objeto STIX
        const iocs = {
            ips: [],
            domains: [],
            hashes: [],
            urls: [],
            emails: []
        };
        // Extraer IoCs del patrón (para indicadores)
        if (stixObject.type === 'indicator' && stixObject.pattern) {
            this.extractIoCsFromPattern(stixObject.pattern, iocs);
        }
        // Extraer IoCs de las propiedades específicas de malware, tool, etc.
        if (['malware', 'tool', 'attack-pattern'].includes(stixObject.type)) {
            this.extractIoCsFromProperties(stixObject, iocs);
        }
        // Extraer referencias MITRE ATT&CK 
        const mitreTactics = [];
        if (stixObject.kill_chain_phases) {
            for (const phase of stixObject.kill_chain_phases) {
                if (phase.kill_chain_name === 'mitre-attack') {
                    // Convertir nombres de fase a IDs de tácticas
                    const tacticMapping = {
                        'reconnaissance': 'TA0043',
                        'resource-development': 'TA0042',
                        'initial-access': 'TA0001',
                        'execution': 'TA0002',
                        'persistence': 'TA0003',
                        'privilege-escalation': 'TA0004',
                        'defense-evasion': 'TA0005',
                        'credential-access': 'TA0006',
                        'discovery': 'TA0007',
                        'lateral-movement': 'TA0008',
                        'collection': 'TA0009',
                        'command-and-control': 'TA0011',
                        'exfiltration': 'TA0010',
                        'impact': 'TA0040'
                    };
                    const tacticId = tacticMapping[phase.phase_name] || phase.phase_name;
                    mitreTactics.push(tacticId);
                }
            }
        }
        // Extraer TLP (Traffic Light Protocol)
        let tlp = 'WHITE';
        if (stixObject.object_marking_refs) {
            for (const marking of stixObject.object_marking_refs) {
                if (marking.includes('tlp:white')) {
                    tlp = 'WHITE';
                }
                else if (marking.includes('tlp:green')) {
                    tlp = 'GREEN';
                }
                else if (marking.includes('tlp:amber')) {
                    tlp = 'AMBER';
                }
                else if (marking.includes('tlp:red')) {
                    tlp = 'RED';
                }
            }
        }
        // Construir referencias externas
        const references = [];
        if (stixObject.external_references) {
            for (const ref of stixObject.external_references) {
                if (ref.url) {
                    references.push(ref.url);
                }
            }
        }
        // Construir objeto de inteligencia de amenazas
        return {
            title: stixObject.name || `${stixObject.type} de ${this.getSourceName(stixObject)}`,
            description: stixObject.description || JSON.stringify(stixObject),
            type: this.mapStixTypeToIntelType(stixObject.type),
            severity,
            source: `TAXII - ${this.getSourceName(stixObject)}`,
            confidence: stixObject.confidence ? parseFloat(stixObject.confidence) / 100 : 0.7,
            iocs,
            metadata: {
                stixId: stixObject.id,
                stixType: stixObject.type,
                created: stixObject.created,
                modified: stixObject.modified,
                tlp,
                references,
                mitreTactics,
                labels: [...(stixObject.labels || []), ...(this.config.userLabels || [])],
                rawData: stixObject
            }
        };
    }
    /**
     * Obtiene el nombre de la fuente del objeto STIX
     */
    getSourceName(stixObject) {
        if (stixObject.external_references && stixObject.external_references.length > 0) {
            return stixObject.external_references[0].source_name;
        }
        // Extraer nombre de creador del ID
        if (stixObject.id && stixObject.id.includes('--')) {
            const creatorPart = stixObject.id.split('--')[0];
            return creatorPart;
        }
        return 'Unknown Source';
    }
    /**
     * Mapea tipos STIX a nuestros tipos de intel
     */
    mapStixTypeToIntelType(stixType) {
        switch (stixType) {
            case 'indicator':
                return 'indicator';
            case 'malware':
                return 'malware';
            case 'threat-actor':
                return 'threat-actor';
            case 'attack-pattern':
                return 'attack-pattern';
            case 'tool':
                return 'tool';
            case 'vulnerability':
                return 'vulnerability';
            case 'identity':
                return 'identity';
            case 'relationship':
                return 'relationship';
            default:
                return stixType;
        }
    }
    /**
     * Extrae IoCs del patrón STIX
     */
    extractIoCsFromPattern(pattern, iocs) {
        // IPv4
        const ipv4Regex = /ipv4-addr:value\s*=\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = ipv4Regex.exec(pattern)) !== null) {
            iocs.ips.push(match[1]);
        }
        // Dominios
        const domainRegex = /domain-name:value\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = domainRegex.exec(pattern)) !== null) {
            iocs.domains.push(match[1]);
        }
        // URLs
        const urlRegex = /url:value\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = urlRegex.exec(pattern)) !== null) {
            iocs.urls.push(match[1]);
        }
        // Emails
        const emailRegex = /email-addr:value\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = emailRegex.exec(pattern)) !== null) {
            iocs.emails.push(match[1]);
        }
        // Hashes MD5
        const md5Regex = /file:hashes.md5\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = md5Regex.exec(pattern)) !== null) {
            iocs.hashes.push(match[1]);
        }
        // Hashes SHA-1
        const sha1Regex = /file:hashes.sha-1\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = sha1Regex.exec(pattern)) !== null) {
            iocs.hashes.push(match[1]);
        }
        // Hashes SHA-256
        const sha256Regex = /file:hashes.sha-256\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = sha256Regex.exec(pattern)) !== null) {
            iocs.hashes.push(match[1]);
        }
    }
    /**
     * Extrae IoCs de propiedades específicas de objetos STIX
     */
    extractIoCsFromProperties(stixObject, iocs) {
        // Extraer IPs
        if (stixObject.x_observable_properties?.ipv4_addrs) {
            stixObject.x_observable_properties.ipv4_addrs.forEach((ip) => {
                iocs.ips.push(ip);
            });
        }
        // Extraer dominios
        if (stixObject.x_observable_properties?.domain_names) {
            stixObject.x_observable_properties.domain_names.forEach((domain) => {
                iocs.domains.push(domain);
            });
        }
        // Extraer URLs
        if (stixObject.x_observable_properties?.urls) {
            stixObject.x_observable_properties.urls.forEach((url) => {
                iocs.urls.push(url);
            });
        }
        // Extraer hashes
        if (stixObject.x_observable_properties?.hashes) {
            if (stixObject.x_observable_properties.hashes.MD5) {
                iocs.hashes.push(stixObject.x_observable_properties.hashes.MD5);
            }
            if (stixObject.x_observable_properties.hashes['SHA-1']) {
                iocs.hashes.push(stixObject.x_observable_properties.hashes['SHA-1']);
            }
            if (stixObject.x_observable_properties.hashes['SHA-256']) {
                iocs.hashes.push(stixObject.x_observable_properties.hashes['SHA-256']);
            }
        }
    }
    /**
     * Importa inteligencia desde una colección TAXII completa
     */
    async importIntelligence(options = {}) {
        try {
            log(`Comenzando importación desde TAXII server ${this.config.apiRoot}`, 'taxii-connector');
            const limit = options.limit || this.config.maxItems || 100;
            const since = options.since || this.config.lastFetchTimestamp;
            const types = options.types || [
                'indicator', 'malware', 'threat-actor', 'attack-pattern',
                'tool', 'vulnerability', 'campaign'
            ];
            // Configurar parámetros de consulta
            const queryParams = {
                added_after: since ? since.toISOString() : undefined,
                limit,
                types
            };
            // Realizar la consulta
            const stixObjects = await this.getObjects(queryParams);
            if (stixObjects.length === 0) {
                return {
                    success: true,
                    message: 'No se encontraron nuevos objetos STIX para importar',
                    imported: 0,
                    errors: 0
                };
            }
            log(`Obtenidos ${stixObjects.length} objetos STIX desde el servidor TAXII`, 'taxii-connector');
            // Convertir objetos STIX a nuestro formato y guardarlos
            const intelItems = [];
            let errors = 0;
            for (const stixObject of stixObjects) {
                try {
                    // Convertir a nuestro formato
                    const intelItem = this.stixToThreatIntel(stixObject);
                    if (this.connectorId) {
                        // Usar el servicio de parseo para mejorar el resultado con IA
                        const parseResult = await aiParser.parseToThreatIntel(stixObject, {
                            id: this.connectorId,
                            name: 'TAXII Connector',
                            type: 'taxii',
                            vendor: 'OASIS',
                            isActive: true,
                            status: 'connected',
                            configuration: this.config,
                            dataVolume: stixObjects.length.toString()
                        });
                        if (parseResult.success && parseResult.data) {
                            // Conservar los IoCs y metadatos que ya extrajimos
                            intelItems.push({
                                ...parseResult.data,
                                iocs: intelItem.iocs,
                                metadata: {
                                    ...parseResult.data.metadata,
                                    ...intelItem.metadata
                                }
                            });
                        }
                        else {
                            intelItems.push(intelItem);
                        }
                    }
                    else {
                        intelItems.push(intelItem);
                    }
                }
                catch (error) {
                    log(`Error procesando objeto STIX ${stixObject.id}: ${error.message}`, 'taxii-connector');
                    errors++;
                }
            }
            // Guardar en la base de datos
            let imported = 0;
            for (const intelItem of intelItems) {
                try {
                    const item = await storage.createThreatIntel(intelItem);
                    // Encolar para análisis con IA
                    if (item) {
                        aiQueue.enqueueThreatIntelAnalysis(item)
                            .catch(err => log(`Error encolando para análisis: ${err.message}`, 'taxii-connector'));
                        imported++;
                    }
                }
                catch (error) {
                    log(`Error guardando inteligencia en la base de datos: ${error.message}`, 'taxii-connector');
                    errors++;
                }
            }
            // Actualizar timestamp de última consulta
            this.config.lastFetchTimestamp = new Date();
            return {
                success: true,
                message: `Importación completada. ${imported} objetos importados, ${errors} errores.`,
                imported,
                errors
            };
        }
        catch (error) {
            log(`Error importando inteligencia TAXII: ${error.message}`, 'taxii-connector');
            return {
                success: false,
                message: `Error importando desde TAXII: ${error.message}`,
                imported: 0,
                errors: 1
            };
        }
    }
}
// Utilidad para crear un conector TAXII desde la configuración
export function createTaxiiConnector(config, connectorId) {
    return new TaxiiConnector(config, connectorId);
}
