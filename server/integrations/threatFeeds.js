// Integraciones con feeds de amenazas reales
import fetch from 'node-fetch';
import { storage } from '../storage';
import { log } from '../vite';
// URLs base para feeds de APIs públicas
const THREAT_URLS = {
    otx: 'https://otx.alienvault.com/api/v1',
    cisa: 'https://www.cisa.gov/sites/default/files/feeds',
    threatFox: 'https://threatfox-api.abuse.ch/api/v1',
    abuseipdb: 'https://api.abuseipdb.com/api/v2',
    misp: process.env.MISP_URL || 'https://misp.example.org/api'
};
/**
 * Obtener datos de OTX AlienVault utilizando API key almacenada
 * Este es un feed que proporciona información de ciberamenazas de OTX AlienVault
 */
export async function fetchOTXData() {
    try {
        // Buscar la configuración del feed de OTX en la base de datos
        const otxFeeds = await storage.listThreatFeeds();
        const otxFeed = otxFeeds.find(feed => feed.type.toLowerCase() === 'otx' &&
            feed.isActive &&
            feed.apiKey);
        let apiKey = process.env.OTX_API_KEY;
        let useSubscribed = false;
        // Si encontramos un feed configurado y activo, usamos su API key
        if (otxFeed?.apiKey) {
            log('Usando API key de feed OTX AlienVault desde la base de datos', 'threatFeeds');
            apiKey = otxFeed.apiKey;
            useSubscribed = true;
        }
        else if (apiKey) {
            log('Usando API key de OTX AlienVault desde variables de entorno', 'threatFeeds');
            useSubscribed = true;
        }
        else {
            log('No se encontró API key para OTX AlienVault, usando datos públicos limitados', 'threatFeeds');
        }
        // Si tenemos API key, consultar pulsos suscritos (más relevantes para el usuario)
        const url = useSubscribed
            ? `${THREAT_URLS.otx}/pulses/subscribed?limit=10`
            : `${THREAT_URLS.otx}/pulses/getall?limit=5`;
        const headers = {};
        if (useSubscribed) {
            headers['X-OTX-API-KEY'] = apiKey;
        }
        const response = await fetch(url, { headers });
        if (!response.ok) {
            return {
                success: false,
                message: `Error HTTP: ${response.status}`
            };
        }
        const responseData = await response.json();
        // Transformar datos a nuestro formato
        const threatIntelItems = responseData.results.map((pulse) => ({
            type: pulse.tags?.[0] || 'malware',
            title: pulse.name,
            description: pulse.description,
            source: 'OTX AlienVault',
            severity: determineSeverity(pulse),
            confidence: pulse.TLP === 'RED' ? 90 : (pulse.TLP === 'AMBER' ? 75 : 60),
            iocs: extractIOCs(pulse),
            relevance: 'high',
            createdAt: new Date(pulse.created)
        }));
        // Almacenar en la base de datos
        const savedItems = await Promise.all(threatIntelItems.map(item => storage.createThreatIntel(item)));
        return {
            success: true,
            data: savedItems,
            message: `Importadas ${savedItems.length} amenazas desde OTX AlienVault`
        };
    }
    catch (error) {
        console.error('Error fetching OTX data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
/**
 * Obtener vulnerabilidades recientes de CISA
 */
export async function fetchCISAVulnerabilities() {
    try {
        // En producción, usaríamos el feed JSON real de CISA
        // Simulamos una respuesta para la demostración
        const response = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
        if (!response.ok) {
            return {
                success: false,
                message: `Error HTTP: ${response.status}`
            };
        }
        const responseData = await response.json();
        // Transformar datos a nuestro formato (limitado a 5 para demostración)
        const vulnerabilities = responseData.vulnerabilities?.slice(0, 5);
        if (!vulnerabilities || vulnerabilities.length === 0) {
            return {
                success: false,
                message: 'No se encontraron vulnerabilidades'
            };
        }
        const threatIntelItems = vulnerabilities.map((vuln) => ({
            type: 'vulnerability',
            title: `${vuln.cveID} - ${vuln.vendorProject}`,
            description: vuln.shortDescription,
            source: 'CISA KEV',
            severity: 'high', // CISA KEV solo lista vulnerabilidades de alta gravedad
            confidence: 95, // Alta confianza al venir de CISA
            iocs: {
                cve: vuln.cveID,
                affected: vuln.vendorProject,
                requiredAction: vuln.requiredAction,
                dueDate: vuln.dueDate
            },
            relevance: 'high',
            createdAt: new Date(vuln.dateAdded)
        }));
        // Almacenar en la base de datos
        const savedItems = await Promise.all(threatIntelItems.map(item => storage.createThreatIntel(item)));
        return {
            success: true,
            data: savedItems,
            message: `Importadas ${savedItems.length} vulnerabilidades desde CISA KEV`
        };
    }
    catch (error) {
        console.error('Error fetching CISA vulnerabilities:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
/**
 * Obtener datos de ThreatFox (malware, botnet)
 */
export async function fetchThreatFoxData() {
    try {
        // ThreatFox permite consultas sin API key pero es mejor registrarse
        const requestBody = {
            query: 'get_recent',
            days: 1
        };
        const response = await fetch(THREAT_URLS.threatFox, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            return {
                success: false,
                message: `Error HTTP: ${response.status}`
            };
        }
        const data = await response.json();
        if (!data.data) {
            return {
                success: false,
                message: 'No hay datos disponibles en ThreatFox'
            };
        }
        // Convertir a nuestro formato (limitado a 5 entradas)
        const responseData = data;
        const entries = Object.values(responseData.data).slice(0, 5);
        const threatIntelItems = entries.map((entry) => ({
            type: entry.malware_printable ? 'malware' : 'botnet',
            title: `${entry.malware_printable || 'Malware desconocido'} IOC`,
            description: `IOC para ${entry.malware_printable || 'malware desconocido'} reportado por ${entry.reporter}`,
            source: 'ThreatFox',
            severity: determineSeverityFromThreatFox(entry),
            confidence: Number(entry.confidence) || 70,
            iocs: {
                [entry.ioc_type_name === 'ip:port' ? 'ips' :
                    entry.ioc_type_name === 'domain' ? 'domains' :
                        entry.ioc_type_name === 'md5_hash' ? 'hashes' : 'other']: entry.ioc,
                malware: entry.malware_printable,
                tags: entry.tags
            },
            relevance: 'medium',
            createdAt: new Date(entry.first_seen * 1000) // ThreatFox usa timestamp UNIX
        }));
        // Almacenar en la base de datos
        const savedItems = await Promise.all(threatIntelItems.map(item => storage.createThreatIntel(item)));
        return {
            success: true,
            data: savedItems,
            message: `Importados ${savedItems.length} indicadores desde ThreatFox`
        };
    }
    catch (error) {
        console.error('Error fetching ThreatFox data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
/**
 * Función para determinar la severidad basada en datos de OTX
 */
function determineSeverity(pulse) {
    if (pulse.TLP === 'RED')
        return 'critical';
    if (pulse.TLP === 'AMBER')
        return 'high';
    const tags = pulse.tags || [];
    if (tags.some((tag) => tag.toLowerCase().includes('apt') ||
        tag.toLowerCase().includes('zero-day') ||
        tag.toLowerCase().includes('ransomware'))) {
        return 'critical';
    }
    if (tags.some((tag) => tag.toLowerCase().includes('malware') ||
        tag.toLowerCase().includes('backdoor'))) {
        return 'high';
    }
    return 'medium';
}
/**
 * Función para determinar la severidad basada en datos de ThreatFox
 */
function determineSeverityFromThreatFox(entry) {
    const confidence = Number(entry.confidence) || 0;
    const tags = entry.tags || [];
    if (confidence > 80 || tags.includes('ransomware')) {
        return 'critical';
    }
    if (confidence > 60 ||
        tags.some((tag) => tag.includes('botnet') || tag.includes('banker'))) {
        return 'high';
    }
    return 'medium';
}
/**
 * Extraer IOCs de pulsos OTX
 */
function extractIOCs(pulse) {
    const result = {};
    if (pulse.indicators) {
        const ips = pulse.indicators
            .filter((i) => i.type === 'IPv4' || i.type === 'IPv6')
            .map((i) => i.indicator);
        const domains = pulse.indicators
            .filter((i) => i.type === 'domain' || i.type === 'hostname')
            .map((i) => i.indicator);
        const hashes = pulse.indicators
            .filter((i) => ['FileHash-MD5', 'FileHash-SHA1', 'FileHash-SHA256'].includes(i.type))
            .map((i) => i.indicator);
        const urls = pulse.indicators
            .filter((i) => i.type === 'URL')
            .map((i) => i.indicator);
        if (ips.length > 0)
            result.ips = ips;
        if (domains.length > 0)
            result.domains = domains;
        if (hashes.length > 0)
            result.hashes = hashes;
        if (urls.length > 0)
            result.urls = urls;
    }
    return result;
}
/**
 * Obtener datos de MISP utilizando la API key almacenada
 * Este es un feed avanzado de inteligencia de amenazas usado por organizaciones de seguridad
 */
export async function fetchMISPData() {
    try {
        // Buscar la configuración del feed de MISP en la base de datos
        const mispFeeds = await storage.listThreatFeeds();
        const mispFeed = mispFeeds.find(feed => feed.type.toLowerCase() === 'misp' &&
            feed.isActive &&
            feed.apiKey);
        let apiKey = process.env.MISP_API_KEY;
        let mispUrl = process.env.MISP_URL || THREAT_URLS.misp;
        // Si encontramos un feed configurado y activo, usamos su API key
        if (mispFeed?.apiKey) {
            log('Usando API key de feed MISP desde la base de datos', 'threatFeeds');
            apiKey = mispFeed.apiKey;
            if (mispFeed.configuration &&
                typeof mispFeed.configuration === 'object' &&
                'url' in mispFeed.configuration) {
                mispUrl = mispFeed.configuration.url;
            }
        }
        else if (apiKey) {
            log('Usando API key de MISP desde variables de entorno', 'threatFeeds');
        }
        else {
            log('No se encontró API key para MISP, omitiendo este feed', 'threatFeeds');
            return {
                success: false,
                message: 'No se encontró API key para MISP'
            };
        }
        // Endpoint para obtener eventos de MISP 
        const url = `${mispUrl}/events/restSearch`;
        const headers = {
            'Authorization': apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        // Filtros para los últimos eventos (30 días)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const payload = {
            returnFormat: 'json',
            limit: 10,
            timestamp: thirtyDaysAgo.toISOString().split('T')[0],
            published: true,
            to_ids: true
        };
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            return {
                success: false,
                message: `Error HTTP desde MISP: ${response.status}`
            };
        }
        const responseData = await response.json();
        if (!responseData.response || !Array.isArray(responseData.response)) {
            return {
                success: false,
                message: 'Respuesta de MISP no contiene eventos'
            };
        }
        // Transformar eventos de MISP a nuestro formato
        const threatIntelItems = responseData.response.map((event) => {
            // Extraer IOCs de los atributos
            const iocs = {
                ips: [],
                domains: [],
                hashes: [],
                urls: []
            };
            // Si hay atributos, procesarlos
            if (event.Attribute && Array.isArray(event.Attribute)) {
                event.Attribute.forEach((attr) => {
                    if (attr.type === 'ip-src' || attr.type === 'ip-dst') {
                        iocs.ips.push(attr.value);
                    }
                    else if (attr.type === 'domain' || attr.type === 'hostname') {
                        iocs.domains.push(attr.value);
                    }
                    else if (attr.type.startsWith('hash') || attr.type === 'md5' || attr.type === 'sha1' || attr.type === 'sha256') {
                        iocs.hashes.push(attr.value);
                    }
                    else if (attr.type === 'url' || attr.type === 'uri') {
                        iocs.urls.push(attr.value);
                    }
                });
            }
            // Determinar el tipo basado en etiquetas
            let threatType = 'malware';
            if (event.Tag && Array.isArray(event.Tag)) {
                const tags = event.Tag.map((t) => t.name.toLowerCase());
                if (tags.some(t => t.includes('apt'))) {
                    threatType = 'apt';
                }
                else if (tags.some(t => t.includes('ransomware'))) {
                    threatType = 'ransomware';
                }
                else if (tags.some(t => t.includes('phishing'))) {
                    threatType = 'phishing';
                }
            }
            // Determinar severidad basada en el nivel de amenaza
            let severity = 'medium';
            if (event.threat_level_id === '1') {
                severity = 'critical';
            }
            else if (event.threat_level_id === '2') {
                severity = 'high';
            }
            else if (event.threat_level_id === '4') {
                severity = 'low';
            }
            return {
                type: threatType,
                title: event.info || `Evento MISP ${event.id}`,
                description: event.Event?.description || event.info || `Evento de inteligencia de amenazas desde MISP (ID: ${event.id})`,
                source: 'MISP',
                severity,
                confidence: 85, // MISP es de alta confianza como plataforma
                iocs: Object.fromEntries(Object.entries(iocs).filter(([_, v]) => Array.isArray(v) && v.length > 0)),
                relevance: 'high',
                createdAt: new Date(event.date)
            };
        });
        // Almacenar en la base de datos
        const savedItems = await Promise.all(threatIntelItems.map(item => storage.createThreatIntel(item)));
        return {
            success: true,
            data: savedItems,
            message: `Importados ${savedItems.length} eventos desde MISP`
        };
    }
    catch (error) {
        console.error('Error fetching MISP data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
/**
 * Obtener datos de AbuseIPDB utilizando API key almacenada
 * Para obtener reportes de direcciones IP maliciosas
 */
export async function fetchAbuseIPDBData() {
    try {
        // Buscar la configuración del feed de AbuseIPDB en la base de datos
        const abuseipdbFeeds = await storage.listThreatFeeds();
        const abuseipdbFeed = abuseipdbFeeds.find(feed => feed.type.toLowerCase() === 'abuseipdb' &&
            feed.isActive &&
            feed.apiKey);
        let apiKey = process.env.ABUSEIPDB_KEY;
        // Si encontramos un feed configurado y activo, usamos su API key
        if (abuseipdbFeed?.apiKey) {
            log('Usando API key de feed AbuseIPDB desde la base de datos', 'threatFeeds');
            apiKey = abuseipdbFeed.apiKey;
        }
        else if (apiKey) {
            log('Usando API key de AbuseIPDB desde variables de entorno', 'threatFeeds');
        }
        else {
            log('No se encontró API key para AbuseIPDB, omitiendo este feed', 'threatFeeds');
            return {
                success: false,
                message: 'No se encontró API key para AbuseIPDB'
            };
        }
        // Endpoint para blacklist de IPs con mayor confianza
        const url = `${THREAT_URLS.abuseipdb}/blacklist?confidenceMinimum=90&limit=100`;
        const headers = {
            'Key': apiKey,
            'Accept': 'application/json'
        };
        const response = await fetch(url, { headers });
        if (!response.ok) {
            return {
                success: false,
                message: `Error HTTP desde AbuseIPDB: ${response.status}`
            };
        }
        const responseData = await response.json();
        if (!responseData.data || !Array.isArray(responseData.data)) {
            return {
                success: false,
                message: 'Respuesta de AbuseIPDB no contiene datos'
            };
        }
        // Agrupar las IPs en bloques para no crear demasiados registros individuales
        const ipGroups = {};
        const maxItemsPerGroup = 25;
        // Agrupar por tipo de abuso reportado
        responseData.data.forEach((item) => {
            const categories = (item.abuseCategories || []).join(',');
            const groupKey = categories || 'general';
            if (!ipGroups[groupKey]) {
                ipGroups[groupKey] = [];
            }
            if (ipGroups[groupKey].length < maxItemsPerGroup) {
                ipGroups[groupKey].push(item);
            }
        });
        // Crear inteligencia de amenazas para cada grupo
        const threatIntelItems = [];
        for (const [category, ips] of Object.entries(ipGroups)) {
            const categoryName = getCategoryName(category);
            const title = `IPs maliciosas (${categoryName})`;
            const ipList = ips.map(ip => ip.ipAddress);
            const countryList = [...new Set(ips.map(ip => ip.countryCode))];
            const confidenceScores = ips.map(ip => ip.abuseConfidenceScore);
            const avgConfidence = confidenceScores.reduce((sum, val) => sum + val, 0) / confidenceScores.length;
            let severity = 'medium';
            if (category.includes('ransomware') || category.includes('ddos') || avgConfidence > 95) {
                severity = 'critical';
            }
            else if (avgConfidence > 90) {
                severity = 'high';
            }
            threatIntelItems.push({
                type: 'blacklist',
                title,
                description: `Grupo de ${ipList.length} direcciones IP reportadas por actividad maliciosa (${categoryName}) desde ${countryList.join(', ')}`,
                source: 'AbuseIPDB',
                severity,
                confidence: Math.round(avgConfidence),
                iocs: {
                    ips: ipList,
                    categories: category.split(','),
                    countries: countryList
                },
                relevance: 'medium',
                createdAt: new Date()
            });
        }
        // Almacenar en la base de datos
        const savedItems = await Promise.all(threatIntelItems.map(item => storage.createThreatIntel(item)));
        return {
            success: true,
            data: savedItems,
            message: `Importados ${savedItems.length} conjuntos de IPs maliciosas desde AbuseIPDB (total: ${responseData.data.length} IPs)`
        };
    }
    catch (error) {
        console.error('Error fetching AbuseIPDB data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
/**
 * Obtener nombre legible para categorías de abuso
 */
function getCategoryName(categoryCode) {
    const categories = {
        '1': 'DNS Compromise',
        '2': 'DNS Poisoning',
        '3': 'Fraud Orders',
        '4': 'DDoS Attack',
        '5': 'FTP Brute-Force',
        '6': 'Ping of Death',
        '7': 'Phishing',
        '8': 'Fraud VoIP',
        '9': 'Open Proxy',
        '10': 'Web Spam',
        '11': 'Email Spam',
        '12': 'Blog Spam',
        '13': 'VPN IP',
        '14': 'Port Scan',
        '15': 'Hacking',
        '16': 'SQL Injection',
        '17': 'Spoofing',
        '18': 'Brute-Force',
        '19': 'Bad Web Bot',
        '20': 'Exploited Host',
        '21': 'Web App Attack',
        '22': 'SSH',
        '23': 'IoT Targeted',
        'general': 'Actividad Maliciosa General'
    };
    if (categoryCode.includes(',')) {
        return 'Múltiples Vectores de Ataque';
    }
    return categories[categoryCode] || 'Actividad Maliciosa';
}
/**
 * Importar todos los feeds activos disponibles
 */
export async function importAllFeeds() {
    try {
        // Obtenemos todos los feeds configurados y activos
        const activeFeeds = await storage.listThreatFeeds();
        const activeFeedTypes = activeFeeds
            .filter(feed => feed.isActive)
            .map(feed => feed.type.toLowerCase());
        log(`Feeds activos encontrados: ${activeFeedTypes.join(', ')}`, 'threatFeeds');
        // Inicializar resultados
        const results = {};
        // Obtener datos de OTX AlienVault (siempre se ejecuta con o sin API)
        results.otx = await fetchOTXData();
        // Obtener datos de CISA KEV (no requiere API key)
        results.cisa = await fetchCISAVulnerabilities();
        // Obtener datos de ThreatFox (no requiere API key)
        results.threatfox = await fetchThreatFoxData();
        // Ejecutar otros feeds solo si están activos o disponibles
        if (activeFeedTypes.includes('misp') || process.env.MISP_API_KEY) {
            results.misp = await fetchMISPData();
        }
        if (activeFeedTypes.includes('abuseipdb') || process.env.ABUSEIPDB_KEY) {
            results.abuseipdb = await fetchAbuseIPDBData();
        }
        // Contar elementos totales importados
        const totalItems = Object.values(results)
            .filter(result => result.success)
            .reduce((total, result) => {
            return total + (result.data?.length || 0);
        }, 0);
        return {
            success: totalItems > 0,
            message: `Importados ${totalItems} elementos de amenazas desde feeds externos`,
            data: results
        };
    }
    catch (error) {
        console.error('Error importing threat feeds:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}
