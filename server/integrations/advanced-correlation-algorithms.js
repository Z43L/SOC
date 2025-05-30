/**
 * Algoritmos avanzados de correlación para identificar patrones complejos
 *
 * Este módulo implementa algoritmos especializados para analizar y correlacionar
 * datos de seguridad, detectando patrones sutiles que pueden indicar
 * amenazas sofisticadas o campañas coordinadas.
 */
import { storage } from '../storage';
import { log } from '../vite';
import { aiCorrelation } from './ai-correlation-engine';
// Tipos de técnicas de correlación avanzada
var CorrelationTechnique;
(function (CorrelationTechnique) {
    CorrelationTechnique["TEMPORAL"] = "temporal";
    CorrelationTechnique["SPATIAL"] = "spatial";
    CorrelationTechnique["BEHAVIORAL"] = "behavioral";
    CorrelationTechnique["GRAPH_BASED"] = "graph_based";
    CorrelationTechnique["STATISTICAL"] = "statistical";
    CorrelationTechnique["HYBRID"] = "hybrid";
})(CorrelationTechnique || (CorrelationTechnique = {}));
// Clase para correlación temporal basada en secuencias de eventos
class TemporalCorrelator {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Identifica patrones temporales en alertas
     */
    async findPatterns(alertsInput) {
        const patterns = [];
        // Ordenar alertas por timestamp
        const alerts = [...alertsInput].sort((a, b) => {
            return new Date(a.timestamp || Date.now()).getTime() -
                new Date(b.timestamp || Date.now()).getTime();
        });
        if (alerts.length < 2) {
            return patterns;
        }
        // Buscar secuencias comunes de tipos de eventos
        const eventSequences = this.extractEventSequences(alerts);
        // Identificar conexiones causales potenciales
        for (const sequence of eventSequences) {
            if (sequence.events.length >= 2 && sequence.confidence > this.options.confidenceThreshold) {
                patterns.push({
                    id: `temporal_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    name: `Secuencia de eventos: ${sequence.events.slice(0, 2).join(' → ')}${sequence.events.length > 2 ? '...' : ''}`,
                    description: `Patrón temporal entre ${sequence.events.length} eventos relacionados. La secuencia ${sequence.events.join(' → ')} sugiere una posible campaña organizada.`,
                    confidence: sequence.confidence,
                    entities: sequence.alerts.map(alert => ({
                        type: 'alert',
                        id: alert.id,
                        role: 'sequence_member'
                    })),
                    technique: CorrelationTechnique.TEMPORAL,
                    rules: [
                        'temporal_sequence',
                        'causality_analysis'
                    ],
                    metadata: {
                        sequenceEvents: sequence.events,
                        timespan: this.calculateTimespan(new Date(sequence.alerts[0].timestamp || Date.now()), new Date(sequence.alerts[sequence.alerts.length - 1].timestamp || Date.now()))
                    }
                });
            }
        }
        return patterns;
    }
    /**
     * Extrae secuencias de eventos de las alertas
     */
    extractEventSequences(alerts) {
        const sequences = [];
        // Ventanas deslizantes para detectar secuencias
        for (let windowSize = 2; windowSize <= Math.min(5, alerts.length); windowSize++) {
            for (let i = 0; i <= alerts.length - windowSize; i++) {
                const windowAlerts = alerts.slice(i, i + windowSize);
                // Verificar que estén dentro del intervalo de tiempo válido
                const firstTimestamp = new Date(windowAlerts[0].timestamp || Date.now()).getTime();
                const lastTimestamp = new Date(windowAlerts[windowAlerts.length - 1].timestamp || Date.now()).getTime();
                // Comprobar si la ventana está dentro del límite de tiempo configurado
                if ((lastTimestamp - firstTimestamp) <= this.options.timeWindowHours * 60 * 60 * 1000) {
                    // Extraer eventos de la secuencia
                    const events = windowAlerts.map(a => this.normalizeEventType(a));
                    // Calcular confianza basada en varios factores
                    const timeFactor = this.calculateTimeFactor(windowAlerts);
                    const severityFactor = this.calculateSeverityFactor(windowAlerts);
                    const sourceFactor = this.calculateSourceFactor(windowAlerts);
                    const confidence = (timeFactor * 0.4) + (severityFactor * 0.4) + (sourceFactor * 0.2);
                    if (confidence > 0.5) { // Umbral mínimo para considerar una secuencia
                        sequences.push({
                            events,
                            confidence,
                            alerts: windowAlerts
                        });
                    }
                }
            }
        }
        // Ordenar por nivel de confianza
        return sequences.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Normaliza el tipo de evento de una alerta
     */
    normalizeEventType(alert) {
        // Extraer tipo de evento del título o description
        const title = alert.title.toLowerCase();
        const desc = (alert.description || '').toLowerCase();
        if (title.includes('login') || desc.includes('login') ||
            title.includes('authentication') || desc.includes('authentication')) {
            return 'authentication';
        }
        if (title.includes('malware') || desc.includes('malware') ||
            title.includes('virus') || desc.includes('virus')) {
            return 'malware';
        }
        if (title.includes('exploit') || desc.includes('exploit') ||
            title.includes('vulnerability') || desc.includes('vulnerability')) {
            return 'exploit';
        }
        if (title.includes('access') || desc.includes('access') ||
            title.includes('permission') || desc.includes('permission')) {
            return 'access';
        }
        if (title.includes('data') || desc.includes('data') ||
            title.includes('exfiltration') || desc.includes('exfiltration')) {
            return 'data_movement';
        }
        if (title.includes('scan') || desc.includes('scan') ||
            title.includes('reconnaissance') || desc.includes('reconnaissance')) {
            return 'reconnaissance';
        }
        if (title.includes('command') || desc.includes('command') ||
            title.includes('c2') || desc.includes('c2') ||
            title.includes('command and control') || desc.includes('command and control')) {
            return 'command_and_control';
        }
        if (title.includes('lateral') || desc.includes('lateral') ||
            title.includes('movement') || desc.includes('movement')) {
            return 'lateral_movement';
        }
        // Fallback: usar la fuente si se reconoce
        if (['firewall', 'waf', 'ids', 'ips', 'edr', 'xdr', 'ndr', 'dlp'].some(src => alert.source.toLowerCase().includes(src))) {
            return alert.source.toLowerCase().split(' ')[0];
        }
        return 'generic_event';
    }
    /**
     * Calcula el factor temporal (qué tan cerca están los eventos en el tiempo)
     */
    calculateTimeFactor(alerts) {
        if (alerts.length < 2)
            return 0.5;
        const timestamps = alerts.map(a => new Date(a.timestamp || Date.now()).getTime());
        const timespan = Math.max(...timestamps) - Math.min(...timestamps);
        // Normalizar a un valor entre 0 y 1 (más cercano a 1 si están más cercanos en el tiempo)
        // Usar una escala logarítmica para manejar diferentes escalas de tiempo
        const maxTimeWindow = this.options.timeWindowHours * 60 * 60 * 1000;
        return Math.max(0, Math.min(1, 1 - (Math.log(timespan + 1) / Math.log(maxTimeWindow + 1))));
    }
    /**
     * Calcula el factor de severidad (alertas más severas tienen mayor peso)
     */
    calculateSeverityFactor(alerts) {
        const severityMap = {
            'critical': 1.0,
            'high': 0.75,
            'medium': 0.5,
            'low': 0.25
        };
        let totalSeverity = 0;
        for (const alert of alerts) {
            totalSeverity += severityMap[alert.severity.toLowerCase()] || 0.5;
        }
        return totalSeverity / alerts.length;
    }
    /**
     * Calcula el factor de fuente (alertas de fuentes diversas tienen mayor peso)
     */
    calculateSourceFactor(alerts) {
        const sources = new Set(alerts.map(a => a.source));
        // Más fuentes distintas aumentan la confianza
        return Math.min(1, sources.size / 3);
    }
    /**
     * Calcula el tiempo transcurrido entre dos fechas en formato legible
     */
    calculateTimespan(start, end) {
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 60) {
            return `${diffMins} minutos`;
        }
        else if (diffMins < 1440) {
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            return `${hours} horas${mins > 0 ? ` ${mins} minutos` : ''}`;
        }
        else {
            const days = Math.floor(diffMins / 1440);
            const hours = Math.floor((diffMins % 1440) / 60);
            return `${days} días${hours > 0 ? ` ${hours} horas` : ''}`;
        }
    }
}
// Clase para correlación basada en gráficos y relaciones entre entidades
class GraphCorrelator {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Identifica patrones basados en grafos de relaciones entre entidades
     */
    async findPatterns(alerts, threatIntel) {
        const patterns = [];
        if (alerts.length < 2) {
            return patterns;
        }
        // Construir grafo de relaciones entre entidades
        const graph = await this.buildEntityGraph(alerts, threatIntel);
        // Detectar comunidades de entidades relacionadas
        const communities = this.detectCommunities(graph);
        // Generar patrones a partir de comunidades significativas
        for (const community of communities) {
            if (community.nodes.length >= 2 && community.density > 0.5) {
                // Filtrar solo las alertas de la comunidad
                const communityAlerts = alerts.filter(alert => community.nodes.some(node => node.type === 'alert' && node.id === alert.id));
                // Extraer IoCs principales
                const primaryIoCs = [];
                community.edges.forEach(edge => {
                    if (edge.type === 'shares_ioc' && edge.metadata?.ioc) {
                        primaryIoCs.push(edge.metadata.ioc);
                    }
                });
                // Crear patrón basado en comunidad
                patterns.push({
                    id: `graph_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    name: `Grupo de entidades relacionadas: ${community.name}`,
                    description: `Red de ${community.nodes.length} entidades relacionadas detectada con una densidad de conexión de ${(community.density * 100).toFixed(1)}%. ${community.edges.length} conexiones identificadas.`,
                    confidence: community.confidence,
                    entities: community.nodes.map(node => ({
                        type: node.type,
                        id: node.id,
                        role: node.role || 'member'
                    })),
                    technique: CorrelationTechnique.GRAPH_BASED,
                    rules: [
                        'entity_relationship',
                        'graph_community_detection',
                        'centrality_analysis'
                    ],
                    metadata: {
                        communityName: community.name,
                        communitySize: community.nodes.length,
                        density: community.density,
                        connections: community.edges.length,
                        centralNodes: community.centralNodes.map(n => `${n.type}:${n.id}`),
                        primaryIoCs
                    }
                });
            }
        }
        return patterns;
    }
    /**
     * Construye un grafo de relaciones entre entidades
     */
    async buildEntityGraph(alerts, threatIntel) {
        const graph = {
            nodes: [],
            edges: []
        };
        // Añadir todas las alertas como nodos
        for (const alert of alerts) {
            graph.nodes.push({
                id: alert.id,
                type: 'alert',
                data: alert
            });
        }
        // Si se proporcionó threat intel, añadirla al grafo
        if (threatIntel && threatIntel.length > 0) {
            for (const intel of threatIntel) {
                graph.nodes.push({
                    id: intel.id,
                    type: 'intel',
                    data: intel
                });
            }
        }
        else {
            // Si no se proporcionó, obtenerla de la base de datos
            const intelItems = await storage.listThreatIntel();
            for (const intel of intelItems) {
                graph.nodes.push({
                    id: intel.id,
                    type: 'intel',
                    data: intel
                });
            }
        }
        // Crear índices de búsqueda rápida por IoCs
        const ipToNodes = new Map();
        const domainToNodes = new Map();
        const hashToNodes = new Map();
        // Indexar alertas por sus IoCs
        for (const alert of alerts) {
            // IPs
            if (alert.sourceIp) {
                if (!ipToNodes.has(alert.sourceIp)) {
                    ipToNodes.set(alert.sourceIp, []);
                }
                ipToNodes.get(alert.sourceIp).push({ type: 'alert', id: alert.id });
            }
            if (alert.destinationIp) {
                if (!ipToNodes.has(alert.destinationIp)) {
                    ipToNodes.set(alert.destinationIp, []);
                }
                ipToNodes.get(alert.destinationIp).push({ type: 'alert', id: alert.id });
            }
            // Extraer IoCs de metadata
            if (alert.metadata && typeof alert.metadata === 'object' && alert.metadata.extractedIocs) {
                // IPs
                if (Array.isArray(alert.metadata.extractedIocs.ips)) {
                    for (const ip of alert.metadata.extractedIocs.ips) {
                        if (!ipToNodes.has(ip)) {
                            ipToNodes.set(ip, []);
                        }
                        ipToNodes.get(ip).push({ type: 'alert', id: alert.id });
                    }
                }
                // Dominios
                if (Array.isArray(alert.metadata.extractedIocs.domains)) {
                    for (const domain of alert.metadata.extractedIocs.domains) {
                        if (!domainToNodes.has(domain)) {
                            domainToNodes.set(domain, []);
                        }
                        domainToNodes.get(domain).push({ type: 'alert', id: alert.id });
                    }
                }
                // Hashes
                if (Array.isArray(alert.metadata.extractedIocs.hashes)) {
                    for (const hash of alert.metadata.extractedIocs.hashes) {
                        if (!hashToNodes.has(hash)) {
                            hashToNodes.set(hash, []);
                        }
                        hashToNodes.get(hash).push({ type: 'alert', id: alert.id });
                    }
                }
            }
        }
        // Indexar threat intel por sus IoCs
        for (const node of graph.nodes) {
            if (node.type === 'intel') {
                const intel = node.data;
                if (intel.iocs) {
                    // IPs
                    if (Array.isArray(intel.iocs.ips)) {
                        for (const ip of intel.iocs.ips) {
                            if (!ipToNodes.has(ip)) {
                                ipToNodes.set(ip, []);
                            }
                            ipToNodes.get(ip).push({ type: 'intel', id: intel.id });
                        }
                    }
                    // Dominios
                    if (Array.isArray(intel.iocs.domains)) {
                        for (const domain of intel.iocs.domains) {
                            if (!domainToNodes.has(domain)) {
                                domainToNodes.set(domain, []);
                            }
                            domainToNodes.get(domain).push({ type: 'intel', id: intel.id });
                        }
                    }
                    // Hashes
                    if (Array.isArray(intel.iocs.hashes)) {
                        for (const hash of intel.iocs.hashes) {
                            if (!hashToNodes.has(hash)) {
                                hashToNodes.set(hash, []);
                            }
                            hashToNodes.get(hash).push({ type: 'intel', id: intel.id });
                        }
                    }
                }
            }
        }
        // Crear aristas basadas en IoCs compartidos
        const addedEdges = new Set();
        // Función para añadir arista si no existe ya
        const addEdge = (source, target, type, weight, metadata) => {
            // Evitar autoconexiones
            if (source.type === target.type && source.id === target.id) {
                return;
            }
            // Crear ID único para esta arista
            const edgeId = `${source.type}:${source.id}-${target.type}:${target.id}-${type}`;
            const reverseEdgeId = `${target.type}:${target.id}-${source.type}:${source.id}-${type}`;
            // Comprobar si ya existe
            if (!addedEdges.has(edgeId) && !addedEdges.has(reverseEdgeId)) {
                graph.edges.push({
                    source,
                    target,
                    type,
                    weight,
                    metadata
                });
                addedEdges.add(edgeId);
            }
        };
        // Conectar nodos que comparten IPs
        for (const [ip, nodes] of ipToNodes.entries()) {
            if (nodes.length > 1) {
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        addEdge(nodes[i], nodes[j], 'shares_ioc', 1.0, // Mayor peso para IPs
                        { ioc: ip, iocType: 'ip' });
                    }
                }
            }
        }
        // Conectar nodos que comparten dominios
        for (const [domain, nodes] of domainToNodes.entries()) {
            if (nodes.length > 1) {
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        addEdge(nodes[i], nodes[j], 'shares_ioc', 0.8, // Peso para dominios
                        { ioc: domain, iocType: 'domain' });
                    }
                }
            }
        }
        // Conectar nodos que comparten hashes
        for (const [hash, nodes] of hashToNodes.entries()) {
            if (nodes.length > 1) {
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        addEdge(nodes[i], nodes[j], 'shares_ioc', 1.0, // Mayor peso para hashes
                        { ioc: hash, iocType: 'hash' });
                    }
                }
            }
        }
        // Conectar alertas con la misma fuente
        const alertsBySource = new Map();
        for (const alert of alerts) {
            if (!alertsBySource.has(alert.source)) {
                alertsBySource.set(alert.source, []);
            }
            alertsBySource.get(alert.source).push(alert);
        }
        for (const [source, sourceAlerts] of alertsBySource.entries()) {
            if (sourceAlerts.length > 1) {
                for (let i = 0; i < sourceAlerts.length; i++) {
                    for (let j = i + 1; j < sourceAlerts.length; j++) {
                        // Solo conectar si están cercanas en el tiempo
                        const timeA = new Date(sourceAlerts[i].timestamp || Date.now()).getTime();
                        const timeB = new Date(sourceAlerts[j].timestamp || Date.now()).getTime();
                        const timeDiff = Math.abs(timeA - timeB);
                        if (timeDiff <= this.options.timeWindowHours * 60 * 60 * 1000) {
                            addEdge({ type: 'alert', id: sourceAlerts[i].id }, { type: 'alert', id: sourceAlerts[j].id }, 'same_source', 0.6, // Peso para misma fuente
                            { source });
                        }
                    }
                }
            }
        }
        return graph;
    }
    /**
     * Detecta comunidades dentro del grafo
     */
    detectCommunities(graph) {
        // Si no hay suficientes nodos, no hay comunidades
        if (graph.nodes.length < 2 || graph.edges.length < 1) {
            return [];
        }
        // Algoritmo simple de detección de comunidades basado en componentes conectados
        // Para algoritmos más avanzados como Louvain o Infomap se requerirían bibliotecas adicionales
        // Crear mapa de adyacencia
        const adjacencyMap = new Map();
        // Inicializar mapa para cada nodo
        for (const node of graph.nodes) {
            const nodeKey = `${node.type}:${node.id}`;
            if (!adjacencyMap.has(nodeKey)) {
                adjacencyMap.set(nodeKey, new Set());
            }
        }
        // Añadir conexiones
        for (const edge of graph.edges) {
            const sourceKey = `${edge.source.type}:${edge.source.id}`;
            const targetKey = `${edge.target.type}:${edge.target.id}`;
            adjacencyMap.get(sourceKey).add(targetKey);
            adjacencyMap.get(targetKey).add(sourceKey);
        }
        // Algoritmo de BFS para encontrar componentes conectados
        const visited = new Set();
        const communities = [];
        for (const node of graph.nodes) {
            const nodeKey = `${node.type}:${node.id}`;
            if (!visited.has(nodeKey)) {
                // Nuevo componente conectado
                const community = new Set();
                const queue = [nodeKey];
                visited.add(nodeKey);
                community.add(nodeKey);
                while (queue.length > 0) {
                    const current = queue.shift();
                    for (const neighbor of adjacencyMap.get(current) || []) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            community.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }
                communities.push(community);
            }
        }
        // Convertir comunidades a formato de salida
        const result = [];
        for (let i = 0; i < communities.length; i++) {
            const community = communities[i];
            // Filtrar solo comunidades con suficientes nodos
            if (community.size < 2) {
                continue;
            }
            // Extraer nodos de esta comunidad
            const communityNodes = Array.from(community).map(nodeKey => {
                const [type, idStr] = nodeKey.split(':');
                return {
                    type,
                    id: parseInt(idStr),
                    role: undefined
                };
            });
            // Extraer aristas dentro de esta comunidad
            const communityEdges = graph.edges.filter(edge => community.has(`${edge.source.type}:${edge.source.id}`) &&
                community.has(`${edge.target.type}:${edge.target.id}`));
            // Calcular densidad del grafo (proporción de aristas existentes respecto al máximo posible)
            const maxEdges = communityNodes.length * (communityNodes.length - 1) / 2;
            const density = maxEdges > 0 ? communityEdges.length / maxEdges : 0;
            // Calcular centralidad simple (grado de cada nodo)
            const centralityMap = new Map();
            for (const edge of communityEdges) {
                const sourceKey = `${edge.source.type}:${edge.source.id}`;
                const targetKey = `${edge.target.type}:${edge.target.id}`;
                centralityMap.set(sourceKey, (centralityMap.get(sourceKey) || 0) + 1);
                centralityMap.set(targetKey, (centralityMap.get(targetKey) || 0) + 1);
            }
            // Obtener nodos centrales (los de mayor centralidad)
            const centralNodes = Array.from(centralityMap.entries())
                .map(([nodeKey, centrality]) => {
                const [type, idStr] = nodeKey.split(':');
                return {
                    type,
                    id: parseInt(idStr),
                    centrality
                };
            })
                .sort((a, b) => b.centrality - a.centrality)
                .slice(0, 3); // Top 3 nodos centrales
            // Determinar un nombre descriptivo para la comunidad
            let communityName = '';
            if (centralNodes.length > 0) {
                const centralNode = centralNodes[0];
                const node = graph.nodes.find(n => n.type === centralNode.type && n.id === centralNode.id);
                if (node) {
                    if (node.type === 'alert') {
                        const alert = node.data;
                        communityName = `Grupo basado en ${alert.title.substring(0, 30)}`;
                    }
                    else if (node.type === 'intel') {
                        const intel = node.data;
                        communityName = `Grupo basado en ${intel.title.substring(0, 30)}`;
                    }
                }
            }
            if (!communityName) {
                communityName = `Grupo de actividad ${i + 1}`;
            }
            // Calcular confianza basada en densidad y peso de las aristas
            const edgeWeightSum = communityEdges.reduce((sum, edge) => sum + edge.weight, 0);
            const avgEdgeWeight = communityEdges.length > 0 ? edgeWeightSum / communityEdges.length : 0;
            const confidence = (density * 0.6) + (avgEdgeWeight * 0.4);
            result.push({
                name: communityName,
                nodes: communityNodes,
                edges: communityEdges,
                density,
                confidence,
                centralNodes
            });
        }
        // Ordenar por confianza
        return result.sort((a, b) => b.confidence - a.confidence);
    }
}
// Clase principal para correlación avanzada
export class AdvancedCorrelationAlgorithms {
    defaultOptions = {
        timeWindowHours: 24,
        confidenceThreshold: 0.65,
        techniques: [
            CorrelationTechnique.TEMPORAL,
            CorrelationTechnique.GRAPH_BASED
        ],
        includeAiInsights: true,
        maxEntitiesPerPattern: 10,
        enableChaining: true
    };
    temporalCorrelator;
    graphCorrelator;
    constructor(options) {
        const mergedOptions = { ...this.defaultOptions, ...options };
        this.temporalCorrelator = new TemporalCorrelator(mergedOptions);
        this.graphCorrelator = new GraphCorrelator(mergedOptions);
    }
    /**
     * Ejecuta algoritmos avanzados de correlación en un conjunto de alertas
     */
    async correlate(alerts, threatIntel) {
        const allPatterns = [];
        // Ejecutar correlación temporal
        const temporalPatterns = await this.temporalCorrelator.findPatterns(alerts);
        allPatterns.push(...temporalPatterns);
        // Ejecutar correlación basada en grafos
        const graphPatterns = await this.graphCorrelator.findPatterns(alerts, threatIntel);
        allPatterns.push(...graphPatterns);
        // Ordenar patrones por confianza
        allPatterns.sort((a, b) => b.confidence - a.confidence);
        // Convertir patrones a sugerencias de incidentes
        const incidentSuggestions = allPatterns
            .filter(pattern => pattern.confidence >= this.defaultOptions.confidenceThreshold)
            .map(pattern => this.patternToIncident(pattern, alerts));
        return {
            patterns: allPatterns,
            incidentSuggestions
        };
    }
    /**
     * Convierte un patrón de comportamiento en una sugerencia de incidente
     */
    patternToIncident(pattern, alerts) {
        // Extraer IDs de alertas relacionadas
        const alertIds = pattern.entities
            .filter(entity => entity.type === 'alert')
            .map(entity => entity.id);
        // Encontrar las alertas correspondientes
        const relatedAlerts = alerts.filter(alert => alertIds.includes(alert.id));
        // Determinar la severidad basada en las alertas relacionadas
        const severityCount = {
            critical: relatedAlerts.filter(a => a.severity === 'critical').length,
            high: relatedAlerts.filter(a => a.severity === 'high').length,
            medium: relatedAlerts.filter(a => a.severity === 'medium').length,
            low: relatedAlerts.filter(a => a.severity === 'low').length
        };
        let severity = 'medium';
        if (severityCount.critical > 0) {
            severity = 'critical';
        }
        else if (severityCount.high > severityCount.medium + severityCount.low) {
            severity = 'high';
        }
        else if (severityCount.low > severityCount.medium + severityCount.high) {
            severity = 'low';
        }
        // Crear timeline basado en alertas
        const timeline = relatedAlerts
            .map(alert => ({
            timestamp: new Date(alert.timestamp || Date.now()).toISOString(),
            description: `Alerta detectada: ${alert.title}`
        }))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        // Extraer tácticas MITRE si están disponibles
        const mitreTactics = [];
        for (const alert of relatedAlerts) {
            if (alert.metadata?.aiAnalysis?.mitreTactics) {
                const tactics = Array.isArray(alert.metadata.aiAnalysis.mitreTactics)
                    ? alert.metadata.aiAnalysis.mitreTactics
                    : [];
                for (const tactic of tactics) {
                    if (!mitreTactics.includes(tactic)) {
                        mitreTactics.push(tactic);
                    }
                }
            }
        }
        // Crear sugerencia de incidente
        return {
            title: pattern.name,
            description: `${pattern.description}\n\nDetectado mediante algoritmo de correlación avanzada "${pattern.technique}" con un nivel de confianza del ${(pattern.confidence * 100).toFixed(1)}%.`,
            severity,
            status: 'new',
            relatedAlerts: alertIds,
            timeline,
            mitreTactics,
            aiAnalysis: {
                attackPattern: pattern.technique,
                confidence: pattern.confidence,
                riskAssessment: `Análisis de riesgo basado en correlación de ${relatedAlerts.length} alertas relacionadas.`,
                recommendations: [
                    'Investigar las conexiones entre estas alertas',
                    'Verificar si hay más sistemas afectados por los mismos IoCs',
                    'Considerar implementar bloqueos preventivos para los IoCs identificados'
                ]
            }
        };
    }
    /**
     * Analiza un conjunto de datos en busca de correlaciones
     * y sugiere posibles incidentes
     */
    async analyzeAndSuggestIncidents(timeWindowHours = 24) {
        try {
            // Obtener alertas recientes
            const since = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000));
            const alerts = await storage.listAlerts();
            // Filtrar alertas recientes que no estén resueltas
            const recentAlerts = alerts.filter(alert => alert.status !== 'resolved' &&
                alert.timestamp &&
                new Date(alert.timestamp) >= since);
            if (recentAlerts.length < 3) {
                log(`Insuficientes alertas recientes (${recentAlerts.length}) para análisis de correlación avanzada`, "advanced-correlation");
                return [];
            }
            // Obtener threat intel para contexto
            const threatIntel = await storage.listThreatIntel();
            // Ejecutar correlación avanzada
            const result = await this.correlate(recentAlerts, threatIntel);
            if (result.incidentSuggestions.length === 0) {
                log("No se encontraron sugerencias de incidentes en el análisis de correlación avanzada", "advanced-correlation");
                return [];
            }
            // Convertir sugerencias a incidentes y guardar
            const createdIncidents = [];
            for (const suggestion of result.incidentSuggestions) {
                try {
                    // Usar el motor de correlación de IA para enriquecer la sugerencia
                    // Obtener alertas relacionadas completas
                    const relatedAlerts = recentAlerts.filter(alert => suggestion.relatedAlerts?.includes(alert.id));
                    if (relatedAlerts.length > 0) {
                        // Intentar enriquecer con IA si está disponible
                        const aiResult = await aiCorrelation.analyzeAlertGroup(relatedAlerts);
                        let finalIncident;
                        if (aiResult && aiResult.confidence > suggestion.aiAnalysis?.confidence) {
                            // Si la IA produjo un resultado con mayor confianza, usarlo
                            finalIncident = {
                                title: aiResult.title,
                                description: aiResult.description,
                                severity: aiResult.severity,
                                status: 'new',
                                relatedAlerts: aiResult.relatedAlertIds,
                                timeline: aiResult.timeline.map(t => ({
                                    timestamp: typeof t.timestamp === 'string' ? t.timestamp : t.timestamp.toISOString(),
                                    description: t.description
                                })),
                                aiAnalysis: {
                                    attackPattern: aiResult.analysis.attackPattern,
                                    recommendations: aiResult.analysis.recommendations,
                                    riskAssessment: aiResult.analysis.riskAssessment,
                                    mitreTactics: aiResult.analysis.mitreTactics,
                                    confidence: aiResult.confidence
                                },
                                mitreTactics: aiResult.analysis.mitreTactics
                            };
                            log(`Sugerencia de incidente enriquecida con IA (confianza: ${aiResult.confidence})`, "advanced-correlation");
                        }
                        else {
                            // Usar nuestra sugerencia basada en algoritmos
                            finalIncident = suggestion;
                            log(`Usando sugerencia basada en algoritmos (confianza: ${suggestion.aiAnalysis?.confidence})`, "advanced-correlation");
                        }
                        // Crear el incidente
                        const incident = await storage.createIncident(finalIncident);
                        if (incident) {
                            createdIncidents.push(incident);
                            log(`Incidente creado a partir de correlación avanzada: "${incident.title}"`, "advanced-correlation");
                        }
                    }
                }
                catch (error) {
                    log(`Error creando incidente a partir de sugerencia: ${error.message}`, "advanced-correlation");
                }
            }
            return createdIncidents;
        }
        catch (error) {
            log(`Error en análisis avanzado: ${error.message}`, "advanced-correlation");
            return [];
        }
    }
}
// Exportar instancia principal
export const advancedCorrelation = new AdvancedCorrelationAlgorithms();
