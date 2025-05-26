/**
 * Motor avanzado de correlación con IA para conectar eventos, IoCs y amenazas
 * 
 * Este módulo implementa:
 * 1. Correlación avanzada entre eventos, IoCs y datos de threat intelligence
 * 2. Detección de patrones complejos que serían difíciles de identificar con reglas estáticas
 * 3. Puntuación de riesgo dinámica basada en múltiples fuentes
 */

import { 
  Alert, 
  ThreatIntel, 
  Incident, 
  AiInsight,
  SeverityTypes,
  Connector,
  ConnectorStatusType
} from "@shared/schema";
import { storage } from "../storage";
import { log } from "../vite";
import { AIModelType } from "../advanced-ai-service";
import { aiQueue } from "./ai-processing-queue";

// Interfaz para correlación contextual entre entidades
interface CorrelationContext {
  // Entidades principales
  alerts: Alert[];
  threatIntel: ThreatIntel[];
  insights: AiInsight[];
  connectors: Connector[];
  
  // Información contextual
  timeWindow: {
    start: Date;
    end: Date;
  };
  
  // Indicadores de compromiso extraídos
  iocs: {
    ips: Set<string>;
    domains: Set<string>;
    hashes: Set<string>;
    urls: Set<string>;
    emails: Set<string>;
    usernames: Set<string>;
  };
  
  // Elementos relacionados
  relatedEntities: {
    // TTPs (Tácticas, Técnicas y Procedimientos)
    mitreTactics: Set<string>;
    // Nombres de actores de amenazas relacionados
    threatActors: Set<string>;
    // Campañas relacionadas
    campaigns: Set<string>;
    // Malware relacionado
    malwareFamily: Set<string>;
  };
  
  // Metadatos del entorno
  environment: {
    assets: Map<string, any>; // Activos afectados
    users: Map<string, any>;  // Usuarios afectados
    networks: Set<string>;    // Redes afectadas
  };
}

// Resultado de la correlación de amenazas
interface CorrelationResult {
  // Si se ha identificado una amenaza coordenada
  threatDetected: boolean;
  
  // Nivel de confianza en la correlación (0-1)
  confidence: number;
  
  // Severidad calculada
  severity: string;
  
  // Título sugerido para el incidente
  title: string;
  
  // Descripción detallada
  description: string;
  
  // IDs de alertas relacionadas
  relatedAlertIds: number[];
  
  // IDs de inteligencia de amenazas relacionada
  relatedIntelIds: number[];
  
  // Análisis detallado
  analysis: {
    attackPattern: string;
    attackPhase: string;
    recommendations: string[];
    riskAssessment: string;
    evidenceSummary: string;
    mitreTactics: string[];
  };
  
  // Línea temporal reconstruida
  timeline: Array<{
    timestamp: Date;
    description: string;
    severity: string;
    entityId?: number;
    entityType?: string;
  }>;
}

// Resultado del análisis de riesgo
interface RiskAnalysisResult {
  score: number;         // 0-100
  confidence: number;    // 0-1
  factors: {
    [key: string]: {
      impact: number;    // Contribución al score (-10 a +10)
      description: string;
    }
  };
  recommendations: string[];
}

/**
 * Motor principal de correlación avanzada con IA
 */
export class AICorrelationEngine {
  private static instance: AICorrelationEngine;
  
  // Modelo preferido para correlación
  private defaultModel: AIModelType = AIModelType.AUTO;
  
  // Umbrales de correlación
  private thresholds = {
    minCorrelationConfidence: 0.65,
    minRiskScore: 60,
    timeWindowHours: 24
  };
  
  // Factores de riesgo para puntuación
  private riskFactors = {
    severityWeights: {
      critical: 1.0,
      high: 0.75,
      medium: 0.5,
      low: 0.25
    },
    // Puntos adicionales por TTPs de MITRE ATT&CK
    mitreTacticWeights: {
      'TA0001': 8, // Initial Access
      'TA0002': 7, // Execution
      'TA0003': 5, // Persistence
      'TA0004': 6, // Privilege Escalation
      'TA0005': 5, // Defense Evasion
      'TA0006': 7, // Credential Access
      'TA0007': 6, // Discovery
      'TA0008': 7, // Lateral Movement
      'TA0009': 6, // Collection
      'TA0010': 5, // Exfiltration
      'TA0011': 8, // Command and Control
      'TA0040': 9, // Impact
      'TA0043': 4  // Reconnaissance
    },
    // Incremento por actores de amenazas conocidos
    knownThreatActorBonus: 10,
    // Incremento por múltiples fuentes
    multipleSourceBonus: 5,
    // Incremento por volumen de alertas
    alertVolumeThresholds: [
      { count: 3, bonus: 2 },
      { count: 5, bonus: 5 },
      { count: 10, bonus: 8 }
    ]
  };
  
  private constructor() {
    log("Motor de correlación avanzada con IA inicializado", "ai-correlation");
  }
  
  // Patrón Singleton para asegurar una única instancia
  public static getInstance(): AICorrelationEngine {
    if (!AICorrelationEngine.instance) {
      AICorrelationEngine.instance = new AICorrelationEngine();
    }
    return AICorrelationEngine.instance;
  }
  
  /**
   * Configura el motor de correlación
   */
  public configure(config: {
    defaultModel?: AIModelType;
    thresholds?: Partial<typeof this.thresholds>;
    riskFactors?: Partial<typeof this.riskFactors>;
  }): void {
    if (config.defaultModel) {
      this.defaultModel = config.defaultModel;
    }
    
    if (config.thresholds) {
      this.thresholds = { ...this.thresholds, ...config.thresholds };
    }
    
    if (config.riskFactors) {
      this.riskFactors = { ...this.riskFactors, ...config.riskFactors };
    }
    
    log("Configuración del motor de correlación actualizada", "ai-correlation");
  }
  
  /**
   * Analiza un grupo de alertas para identificar patrones y correlaciones
   */
  public async analyzeAlertGroup(alerts: Alert[]): Promise<CorrelationResult | null> {
    if (!alerts || alerts.length < 2) {
      log("Se requieren al menos 2 alertas para la correlación", "ai-correlation");
      return null;
    }
    
    try {
      // 1. Construir contexto de correlación
      const context = await this.buildCorrelationContext(alerts);
      
      // 2. Enviar a la cola de procesamiento de IA
      log(`Encolando correlación para ${alerts.length} alertas`, "ai-correlation");
      const queueId = await aiQueue.enqueueAlertCorrelation(alerts, this.defaultModel);
      
      if (!queueId) {
        log("No se pudo encolar la correlación de alertas", "ai-correlation");
        return null;
      }
      
      // 3. Mientras tanto, calcular riesgo basado en métodos heurísticos
      const riskAnalysis = this.performRiskAnalysis(context);
      
      // 4. Verificar si el riesgo calculado supera el umbral
      if (riskAnalysis.score >= this.thresholds.minRiskScore) {
        log(`Nivel de riesgo elevado (${riskAnalysis.score}) detectado en grupo de alertas`, "ai-correlation");
        
        // Crear una correlación preliminar basada en heurísticas
        // mientras el análisis de IA se completa en segundo plano
        const preliminaryResult: CorrelationResult = {
          threatDetected: true,
          confidence: riskAnalysis.confidence,
          severity: this.calculateGroupSeverity(alerts),
          title: `Posible amenaza detectada: ${this.generateCorrelationTitle(context)}`,
          description: `Análisis preliminar basado en indicadores de riesgo. Análisis detallado de IA en proceso.`,
          relatedAlertIds: alerts.map(a => a.id),
          relatedIntelIds: context.threatIntel.map(ti => ti.id),
          analysis: {
            attackPattern: "En análisis",
            attackPhase: "En análisis",
            recommendations: riskAnalysis.recommendations,
            riskAssessment: `Puntuación de riesgo: ${riskAnalysis.score}/100. ${this.formatRiskFactors(riskAnalysis.factors)}`,
            evidenceSummary: this.summarizeEvidence(context),
            mitreTactics: Array.from(context.relatedEntities.mitreTactics)
          },
          timeline: this.reconstructTimeline(context)
        };
        
        return preliminaryResult;
      }
      
      // Si el riesgo no supera el umbral, esperaremos al análisis de IA completo
      log("Nivel de riesgo por debajo del umbral, esperando análisis de IA completo", "ai-correlation");
      return null;
      
    } catch (error) {
      log(`Error en análisis de correlación: ${error.message}`, "ai-correlation");
      return null;
    }
  }
  
  /**
   * Busca automáticamente patrones de correlación entre alertas recientes
   */
  public async findCorrelationPatterns(timeWindowHours: number = this.thresholds.timeWindowHours): Promise<Incident[]> {
    try {
      // 1. Obtener alertas recientes
      const since = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000));
      const alerts = await storage.listAlerts();
      
      // Filtrar alertas recientes que no estén resueltas
      const recentAlerts = alerts.filter(alert => 
        alert.status !== 'resolved' && 
        alert.timestamp && 
        new Date(alert.timestamp) >= since
      );
      
      if (recentAlerts.length < 2) {
        log("Insuficientes alertas recientes para buscar correlaciones", "ai-correlation");
        return [];
      }
      
      log(`Buscando correlaciones entre ${recentAlerts.length} alertas recientes`, "ai-correlation");
      
      // 2. Agrupar alertas por criterios de similitud
      const alertGroups = this.groupRelatedAlerts(recentAlerts);
      
      // 3. Analizar cada grupo
      const incidents: Incident[] = [];
      
      for (const [groupKey, alertGroup] of Object.entries(alertGroups)) {
        if (alertGroup.length < 2) continue;
        
        log(`Analizando grupo "${groupKey}" con ${alertGroup.length} alertas`, "ai-correlation");
        
        // Evitar grupos demasiado grandes para el análisis
        const analyzeGroup = alertGroup.slice(0, 10); // Limitar a 10 alertas para el análisis
        
        const result = await this.analyzeAlertGroup(analyzeGroup);
        
        if (result && result.threatDetected && result.confidence >= this.thresholds.minCorrelationConfidence) {
          // Crear incidente a partir del resultado
          const incident: Incident = {
            title: result.title,
            description: result.description,
            severity: result.severity as SeverityTypes,
            status: 'new',
            relatedAlerts: result.relatedAlertIds,
            timeline: result.timeline.map(t => ({
              timestamp: t.timestamp.toISOString(),
              description: t.description
            })),
            aiAnalysis: {
              attackPattern: result.analysis.attackPattern,
              recommendations: result.analysis.recommendations,
              riskAssessment: result.analysis.riskAssessment,
              mitreTactics: result.analysis.mitreTactics,
              confidence: result.confidence
            },
            mitreTactics: result.analysis.mitreTactics
          };
          
          incidents.push(incident);
        }
      }
      
      log(`Se encontraron ${incidents.length} incidentes potenciales mediante correlación`, "ai-correlation");
      return incidents;
      
    } catch (error) {
      log(`Error buscando patrones de correlación: ${error.message}`, "ai-correlation");
      return [];
    }
  }
  
  /**
   * Enriquece un alerta con contexto de threat intelligence y análisis de IA
   */
  public async enrichAlert(alert: Alert): Promise<Alert> {
    try {
      // 1. Buscar IoCs relacionados en la alerta
      const iocs = this.extractIoCs(alert);
      
      if (Object.values(iocs).every(arr => arr.length === 0)) {
        log(`No se encontraron IoCs para enriquecer la alerta ${alert.id}`, "ai-correlation");
        return alert;
      }
      
      // 2. Buscar threat intel relacionada con estos IoCs
      const relatedIntel = await this.findRelatedThreatIntel(iocs);
      
      if (relatedIntel.length === 0) {
        log(`No se encontró inteligencia de amenazas relacionada para la alerta ${alert.id}`, "ai-correlation");
        return alert;
      }
      
      // 3. Encolar para análisis de IA
      const queueId = await aiQueue.enqueueAlertAnalysis(alert, this.defaultModel);
      
      if (!queueId) {
        log(`No se pudo encolar el análisis de IA para la alerta ${alert.id}`, "ai-correlation");
      }
      
      // 4. Actualizar metadata de la alerta con contexto de threat intelligence
      const enrichedMetadata = { 
        ...alert.metadata || {},
        enrichment: {
          relatedIntelCount: relatedIntel.length,
          threatActors: Array.from(new Set(relatedIntel.map(ti => ti.metadata?.author).filter(Boolean))),
          intelSources: Array.from(new Set(relatedIntel.map(ti => ti.source).filter(Boolean))),
          firstSeenDate: new Date(Math.min(...relatedIntel.map(ti => new Date(ti.createdAt || Date.now()).getTime()))).toISOString(),
          lastUpdated: new Date().toISOString(),
          iocMatches: Object.entries(iocs).filter(([_, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.length}`)
        }
      };
      
      // 5. Actualizar la alerta en la base de datos
      const updatedAlert = await storage.updateAlert(alert.id, { 
        metadata: enrichedMetadata 
      });
      
      log(`Alerta ${alert.id} enriquecida con contexto de ${relatedIntel.length} indicadores de inteligencia`, "ai-correlation");
      return updatedAlert;
      
    } catch (error) {
      log(`Error enriqueciendo alerta ${alert.id}: ${error.message}`, "ai-correlation");
      return alert;
    }
  }
  
  /**
   * Busca patrones y predice amenazas emergentes basadas en intelligence
   */
  public async predictThreats(): Promise<AiInsight[]> {
    try {
      // Este método realiza un análisis predictivo basado en datos históricos
      // de alertas e inteligencia de amenazas para anticipar posibles amenazas emergentes
      
      // Implementación pendiente - requiere datos históricos significativos
      
      return [];
    } catch (error) {
      log(`Error prediciendo amenazas: ${error.message}`, "ai-correlation");
      return [];
    }
  }
  
  /**
   * Construye un contexto enriquecido para correlación
   */
  private async buildCorrelationContext(alerts: Alert[]): Promise<CorrelationContext> {
    // Inicializar contexto
    const context: CorrelationContext = {
      alerts,
      threatIntel: [],
      insights: [],
      connectors: [],
      timeWindow: {
        start: new Date(Math.min(...alerts.map(a => new Date(a.timestamp || Date.now()).getTime()))),
        end: new Date(Math.max(...alerts.map(a => new Date(a.timestamp || Date.now()).getTime())))
      },
      iocs: {
        ips: new Set<string>(),
        domains: new Set<string>(),
        hashes: new Set<string>(),
        urls: new Set<string>(),
        emails: new Set<string>(),
        usernames: new Set<string>()
      },
      relatedEntities: {
        mitreTactics: new Set<string>(),
        threatActors: new Set<string>(),
        campaigns: new Set<string>(),
        malwareFamily: new Set<string>()
      },
      environment: {
        assets: new Map<string, any>(),
        users: new Map<string, any>(),
        networks: new Set<string>()
      }
    };
    
    // Extraer IoCs de todas las alertas
    for (const alert of alerts) {
      // IPs de la alerta
      if (alert.sourceIp) context.iocs.ips.add(alert.sourceIp);
      if (alert.destinationIp) context.iocs.ips.add(alert.destinationIp);
      
      // Extraer otros IoCs del contenido y metadata
      const extractedIoCs = this.extractIoCs(alert);
      
      extractedIoCs.ips.forEach(ip => context.iocs.ips.add(ip));
      extractedIoCs.domains.forEach(domain => context.iocs.domains.add(domain));
      extractedIoCs.hashes.forEach(hash => context.iocs.hashes.add(hash));
      extractedIoCs.urls.forEach(url => context.iocs.urls.add(url));
      extractedIoCs.emails.forEach(email => context.iocs.emails.add(email));
      
      // Extraer información de entorno
      // (esto requeriría un modelo de assets/usuarios más completo)
      
      // Extraer TTPs (si la alerta tiene análisis de IA previo)
      if (alert.metadata?.aiAnalysis?.mitreTactics) {
        const tactics = Array.isArray(alert.metadata.aiAnalysis.mitreTactics) 
          ? alert.metadata.aiAnalysis.mitreTactics 
          : [];
        
        tactics.forEach(tactic => context.relatedEntities.mitreTactics.add(tactic));
      }
    }
    
    // Buscar threat intel relacionada con los IoCs extraídos
    if (context.iocs.ips.size > 0 || context.iocs.domains.size > 0 || 
        context.iocs.hashes.size > 0 || context.iocs.urls.size > 0) {
      const iocs = {
        ips: Array.from(context.iocs.ips),
        domains: Array.from(context.iocs.domains),
        hashes: Array.from(context.iocs.hashes),
        urls: Array.from(context.iocs.urls),
        emails: Array.from(context.iocs.emails)
      };
      
      context.threatIntel = await this.findRelatedThreatIntel(iocs);
      
      // Extraer entidades relacionadas de la threat intel
      for (const intel of context.threatIntel) {
        // Extraer actores de amenazas, campañas, etc.
        if (intel.metadata?.author) {
          context.relatedEntities.threatActors.add(intel.metadata.author);
        }
        
        if (intel.metadata?.event_tags) {
          const tags = Array.isArray(intel.metadata.event_tags) 
            ? intel.metadata.event_tags 
            : [];
          
          // Identificar campañas y familias de malware entre las etiquetas
          tags.forEach(tag => {
            // Algunas heurísticas simples para identificar tipos de etiquetas
            if (tag.toLowerCase().includes('campaign')) {
              context.relatedEntities.campaigns.add(tag);
            } else if (tag.match(/^(apt\d+|lazarus|cozy|fancy|turla|carbanak|fin\d+)/i)) {
              context.relatedEntities.threatActors.add(tag);
            } else if (tag.match(/(virus|trojan|malware|ransomware|backdoor|rootkit|worm|loader|rat|stealer)/i)) {
              context.relatedEntities.malwareFamily.add(tag);
            }
          });
        }
      }
    }
    
    // Buscar insights de IA previos para estas alertas
    const allInsights = await storage.listAiInsights();
    
    // Filtrar insights que mencionan estas alertas o sus IoCs
    context.insights = allInsights.filter(insight => {
      // Verificar si el insight está relacionado con alguna de las alertas
      if (insight.type === 'alert_analysis') {
        // Ver si hay alguna mención a los IDs de alertas
        const mentionsAlert = alerts.some(alert => 
          insight.description?.includes(`Alert ID: ${alert.id}`) ||
          insight.description?.includes(`AlertID: ${alert.id}`) ||
          insight.description?.includes(`Alert ${alert.id}`)
        );
        
        if (mentionsAlert) return true;
      }
      
      // Verificar IoCs en relatedEntities
      if (Array.isArray(insight.relatedEntities)) {
        for (const entity of insight.relatedEntities) {
          if (typeof entity === 'string') {
            // Verificar si este IoC está en nuestro contexto
            if (context.iocs.ips.has(entity)) return true;
            if (context.iocs.domains.has(entity)) return true;
            if (context.iocs.hashes.has(entity)) return true;
            if (context.iocs.urls.has(entity)) return true;
          }
        }
      }
      
      return false;
    });
    
    // Obtener información de conectores activos
    context.connectors = await storage.listConnectors();
    
    return context;
  }
  
  /**
   * Realiza un análisis de riesgo basado en heurísticas del contexto
   */
  private performRiskAnalysis(context: CorrelationContext): RiskAnalysisResult {
    let riskScore = 0;
    const factors: RiskAnalysisResult['factors'] = {};
    const recommendations: string[] = [];
    
    // 1. Evaluar severidad de las alertas
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    for (const alert of context.alerts) {
      const severity = alert.severity.toLowerCase();
      if (severity in severityCounts) {
        severityCounts[severity]++;
      }
    }
    
    let severityScore = 0;
    let totalAlerts = 0;
    
    for (const [severity, count] of Object.entries(severityCounts)) {
      if (count > 0) {
        const weight = this.riskFactors.severityWeights[severity];
        severityScore += count * weight * 10; // Base 10 points per alert, weighted by severity
        totalAlerts += count;
      }
    }
    
    // Normalizar score de severidad
    if (totalAlerts > 0) {
      severityScore = Math.min(40, severityScore); // Máximo 40 puntos por severidad
      
      factors['alertSeverity'] = {
        impact: severityScore,
        description: `${totalAlerts} alertas: ${severityCounts.critical} críticas, ${severityCounts.high} altas, ${severityCounts.medium} medias, ${severityCounts.low} bajas`
      };
      
      riskScore += severityScore;
    }
    
    // 2. Evaluar TTPs de MITRE ATT&CK
    let mitreTacticsScore = 0;
    
    for (const tactic of context.relatedEntities.mitreTactics) {
      if (tactic in this.riskFactors.mitreTacticWeights) {
        mitreTacticsScore += this.riskFactors.mitreTacticWeights[tactic];
      } else {
        mitreTacticsScore += 3; // Valor predeterminado para tácticas no catalogadas
      }
    }
    
    if (mitreTacticsScore > 0) {
      mitreTacticsScore = Math.min(30, mitreTacticsScore); // Máximo 30 puntos por TTPs
      
      factors['mitreTactics'] = {
        impact: mitreTacticsScore,
        description: `${context.relatedEntities.mitreTactics.size} tácticas MITRE ATT&CK identificadas`
      };
      
      riskScore += mitreTacticsScore;
      
      if (context.relatedEntities.mitreTactics.has('TA0001')) { // Initial Access
        recommendations.push("Fortalecer controles de acceso perimetral y filtrado de correo electrónico");
      }
      
      if (context.relatedEntities.mitreTactics.has('TA0002')) { // Execution
        recommendations.push("Revisar políticas de ejecución de aplicaciones y Application Control");
      }
      
      if (context.relatedEntities.mitreTactics.has('TA0010')) { // Exfiltration
        recommendations.push("Revisar urgentemente logs de comunicaciones salientes y DLP");
      }
    }
    
    // 3. Evaluar volumen de alertas
    let volumeBonus = 0;
    
    for (const threshold of this.riskFactors.alertVolumeThresholds) {
      if (totalAlerts >= threshold.count) {
        volumeBonus = threshold.bonus;
      }
    }
    
    if (volumeBonus > 0) {
      factors['alertVolume'] = {
        impact: volumeBonus,
        description: `Volumen elevado de alertas (${totalAlerts})`
      };
      
      riskScore += volumeBonus;
    }
    
    // 4. Evaluar actores de amenazas conocidos
    if (context.relatedEntities.threatActors.size > 0) {
      const threatActorImpact = Math.min(
        this.riskFactors.knownThreatActorBonus, 
        context.relatedEntities.threatActors.size * 2
      );
      
      factors['knownThreatActors'] = {
        impact: threatActorImpact,
        description: `${context.relatedEntities.threatActors.size} actores de amenazas conocidos identificados`
      };
      
      riskScore += threatActorImpact;
      
      recommendations.push("Revisar boletines de seguridad recientes para estos actores de amenazas");
    }
    
    // 5. Evaluar diversidad de fuentes
    const sources = new Set(context.alerts.map(a => a.source));
    
    if (sources.size > 1) {
      const multiSourceImpact = Math.min(this.riskFactors.multipleSourceBonus, sources.size * 1.5);
      
      factors['multipleSources'] = {
        impact: multiSourceImpact,
        description: `Alertas de ${sources.size} fuentes diferentes: ${Array.from(sources).join(', ')}`
      };
      
      riskScore += multiSourceImpact;
    }
    
    // Calcular confianza basada en la diversidad de evidencia
    const evidencePoints = [
      context.alerts.length > 0,
      context.threatIntel.length > 0,
      context.relatedEntities.mitreTactics.size > 0,
      context.relatedEntities.threatActors.size > 0,
      context.iocs.ips.size > 0 || context.iocs.domains.size > 0 || context.iocs.hashes.size > 0
    ].filter(Boolean).length;
    
    const confidence = Math.min(0.95, evidencePoints / 5);
    
    // Recomendaciones generales
    if (recommendations.length === 0) {
      recommendations.push("Continuar monitorizando y recopilar más información");
    }
    
    if (riskScore >= 60) {
      recommendations.push("Iniciar investigación detallada del incidente");
    }
    
    if (riskScore >= 80) {
      recommendations.push("Considerar medidas de contención inmediatas");
    }
    
    return {
      score: Math.min(100, Math.round(riskScore)),
      confidence,
      factors,
      recommendations
    };
  }
  
  /**
   * Agrupa alertas relacionadas según criterios de similitud
   */
  private groupRelatedAlerts(alerts: Alert[]): Record<string, Alert[]> {
    const groups: Record<string, Alert[]> = {};
    
    // 1. Agrupar por IP de origen
    for (const alert of alerts) {
      if (alert.sourceIp) {
        const key = `source_ip:${alert.sourceIp}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(alert);
      }
    }
    
    // 2. Agrupar por IP de destino
    for (const alert of alerts) {
      if (alert.destinationIp) {
        const key = `dest_ip:${alert.destinationIp}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(alert);
      }
    }
    
    // 3. Agrupar por fuente (origen de la alerta)
    for (const alert of alerts) {
      const key = `source:${alert.source}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(alert);
    }
    
    // 4. Agrupar por severidad
    for (const alert of alerts) {
      const key = `severity:${alert.severity}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(alert);
    }
    
    // 5. Agrupar por similitud semántica en el título (simplificado)
    const titleWords: Record<string, Alert[]> = {};
    
    for (const alert of alerts) {
      const words = alert.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4); // Sólo palabras significativas
      
      for (const word of words) {
        const key = `title_word:${word}`;
        if (!titleWords[key]) titleWords[key] = [];
        titleWords[key].push(alert);
      }
    }
    
    // Añadir grupos por palabras clave solo si tienen más de una alerta
    for (const [key, wordAlerts] of Object.entries(titleWords)) {
      if (wordAlerts.length > 1) {
        groups[key] = wordAlerts;
      }
    }
    
    // Filtrar grupos demasiado pequeños
    return Object.fromEntries(
      Object.entries(groups).filter(([_, groupAlerts]) => groupAlerts.length >= 2)
    );
  }
  
  /**
   * Calcula la severidad para un grupo de alertas
   */
  private calculateGroupSeverity(alerts: Alert[]): string {
    // Contar ocurrencias de cada severidad
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    for (const alert of alerts) {
      const severity = alert.severity.toLowerCase();
      if (severity in severityCounts) {
        severityCounts[severity]++;
      }
    }
    
    // Determinar la severidad predominante
    if (severityCounts.critical > 0) {
      return 'critical';
    }
    
    if (severityCounts.high > alerts.length / 3) {
      return 'high';
    }
    
    if (severityCounts.medium > alerts.length / 2) {
      return 'medium';
    }
    
    return 'low';
  }
  
  /**
   * Genera un título descriptivo para la correlación
   */
  private generateCorrelationTitle(context: CorrelationContext): string {
    // Componentes para generar el título
    let components: string[] = [];
    
    // 1. Actores de amenazas
    if (context.relatedEntities.threatActors.size > 0) {
      const actors = Array.from(context.relatedEntities.threatActors).slice(0, 2);
      components.push(actors.join('/'));
    }
    
    // 2. Técnicas o tácticas más destacadas
    if (context.relatedEntities.mitreTactics.size > 0) {
      const tactics = Array.from(context.relatedEntities.mitreTactics)
        .map(t => t.replace('TA', 'T'))
        .slice(0, 2);
      components.push(tactics.join('/'));
    }
    
    // 3. Familia de malware si está disponible
    if (context.relatedEntities.malwareFamily.size > 0) {
      const family = Array.from(context.relatedEntities.malwareFamily)[0];
      components.push(family);
    }
    
    // 4. Patrones de alerta
    const sources = new Set(context.alerts.map(a => a.source));
    if (sources.size === 1) {
      components.push(Array.from(sources)[0]);
    }
    
    // 5. Agregar destinos si hay IPs de destino
    if (context.iocs.ips.size > 0) {
      components.push(`${context.iocs.ips.size} IPs`);
    }
    
    if (components.length === 0) {
      // Si no hay suficientes componentes, usar un título genérico
      return "Múltiples alertas correlacionadas";
    }
    
    return `Posible actividad maliciosa: ${components.join(' - ')}`;
  }
  
  /**
   * Formatea los factores de riesgo para mostrar
   */
  private formatRiskFactors(factors: RiskAnalysisResult['factors']): string {
    return Object.entries(factors)
      .map(([factor, data]) => `${factor}: ${data.impact > 0 ? '+' : ''}${data.impact} (${data.description})`)
      .join('. ');
  }
  
  /**
   * Crea un resumen de evidencia para el reporte
   */
  private summarizeEvidence(context: CorrelationContext): string {
    const parts = [];
    
    parts.push(`${context.alerts.length} alertas en un periodo de ${this.calculateTimespan(context.timeWindow.start, context.timeWindow.end)}`);
    
    if (context.threatIntel.length > 0) {
      parts.push(`${context.threatIntel.length} indicadores de inteligencia de amenazas relacionados`);
    }
    
    if (context.iocs.ips.size > 0 || context.iocs.domains.size > 0 || context.iocs.hashes.size > 0) {
      const iocCounts = [];
      if (context.iocs.ips.size > 0) iocCounts.push(`${context.iocs.ips.size} IPs`);
      if (context.iocs.domains.size > 0) iocCounts.push(`${context.iocs.domains.size} dominios`);
      if (context.iocs.hashes.size > 0) iocCounts.push(`${context.iocs.hashes.size} hashes`);
      
      parts.push(`IoCs: ${iocCounts.join(', ')}`);
    }
    
    if (context.relatedEntities.mitreTactics.size > 0) {
      parts.push(`${context.relatedEntities.mitreTactics.size} tácticas MITRE ATT&CK identificadas`);
    }
    
    return parts.join('. ') + '.';
  }
  
  /**
   * Reconstruye una línea temporal basada en el contexto
   */
  private reconstructTimeline(context: CorrelationContext): CorrelationResult['timeline'] {
    const timeline: CorrelationResult['timeline'] = [];
    
    // Añadir alertas a la línea temporal
    for (const alert of context.alerts) {
      if (alert.timestamp) {
        timeline.push({
          timestamp: new Date(alert.timestamp),
          description: `Alerta detectada: ${alert.title}`,
          severity: alert.severity,
          entityId: alert.id,
          entityType: 'alert'
        });
      }
    }
    
    // Añadir intel si tiene fechas
    for (const intel of context.threatIntel) {
      if (intel.createdAt) {
        timeline.push({
          timestamp: new Date(intel.createdAt),
          description: `Inteligencia de amenazas: ${intel.title}`,
          severity: intel.severity,
          entityId: intel.id,
          entityType: 'intel'
        });
      }
    }
    
    // Ordenar por fecha
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return timeline;
  }
  
  /**
   * Calcula el tiempo transcurrido entre dos fechas
   */
  private calculateTimespan(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 60) {
      return `${diffMins} minutos`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours} horas${mins > 0 ? ` ${mins} minutos` : ''}`;
    } else {
      const days = Math.floor(diffMins / 1440);
      const hours = Math.floor((diffMins % 1440) / 60);
      return `${days} días${hours > 0 ? ` ${hours} horas` : ''}`;
    }
  }
  
  /**
   * Extrae indicadores de compromiso (IoCs) de una alerta
   */
  private extractIoCs(alert: Alert): {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  } {
    const result = {
      ips: [] as string[],
      domains: [] as string[],
      hashes: [] as string[],
      urls: [] as string[],
      emails: [] as string[]
    };
    
    // Incluir IPs de la alerta
    if (alert.sourceIp) result.ips.push(alert.sourceIp);
    if (alert.destinationIp) result.ips.push(alert.destinationIp);
    
    // Texto a analizar
    const textToAnalyze = [
      alert.title,
      alert.description
    ].join(' ');
    
    // Extraer IPs
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const ips = textToAnalyze.match(ipRegex) || [];
    result.ips.push(...ips);
    
    // Extraer dominios
    const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/gi;
    const domains = textToAnalyze.match(domainRegex) || [];
    result.domains.push(...domains);
    
    // Extraer hashes (MD5, SHA1, SHA256)
    const md5Regex = /\b[a-f0-9]{32}\b/gi;
    const sha1Regex = /\b[a-f0-9]{40}\b/gi;
    const sha256Regex = /\b[a-f0-9]{64}\b/gi;
    
    const md5s = textToAnalyze.match(md5Regex) || [];
    const sha1s = textToAnalyze.match(sha1Regex) || [];
    const sha256s = textToAnalyze.match(sha256Regex) || [];
    
    result.hashes.push(...md5s, ...sha1s, ...sha256s);
    
    // Extraer URLs
    const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
    const urls = textToAnalyze.match(urlRegex) || [];
    result.urls.push(...urls);
    
    // Extraer emails
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = textToAnalyze.match(emailRegex) || [];
    result.emails.push(...emails);
    
    // Extraer IoCs de la metadata si existe
    if (alert.metadata) {
      try {
        if (typeof alert.metadata === 'string') {
          const parsed = JSON.parse(alert.metadata);
          this.extractIoCsFromObject(parsed, result);
        } else if (typeof alert.metadata === 'object') {
          this.extractIoCsFromObject(alert.metadata, result);
        }
      } catch (error) {
        // Ignorar errores al analizar metadata
      }
    }
    
    // Eliminar duplicados
    return {
      ips: [...new Set(result.ips)],
      domains: [...new Set(result.domains)],
      hashes: [...new Set(result.hashes)],
      urls: [...new Set(result.urls)],
      emails: [...new Set(result.emails)]
    };
  }
  
  /**
   * Extrae IoCs recursivamente de un objeto
   */
  private extractIoCsFromObject(obj: any, result: {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  }): void {
    if (!obj || typeof obj !== 'object') return;
    
    // Buscar en propiedades comunes de IoCs
    const iocProperties = ['ips', 'ip', 'ipAddresses', 'domains', 'domain', 'hashes', 'hash', 'urls', 'url', 'emails', 'email', 'iocs'];
    
    for (const prop of iocProperties) {
      if (prop in obj) {
        const value = obj[prop];
        
        if (Array.isArray(value)) {
          // Es un array, procesarlo según el tipo
          if (prop.includes('ip')) {
            result.ips.push(...value.filter(v => typeof v === 'string'));
          } else if (prop.includes('domain')) {
            result.domains.push(...value.filter(v => typeof v === 'string'));
          } else if (prop.includes('hash')) {
            result.hashes.push(...value.filter(v => typeof v === 'string'));
          } else if (prop.includes('url')) {
            result.urls.push(...value.filter(v => typeof v === 'string'));
          } else if (prop.includes('email')) {
            result.emails.push(...value.filter(v => typeof v === 'string'));
          } else if (prop === 'iocs') {
            // Intentar procesar sub-objetos de IoCs
            for (const ioc of value) {
              if (typeof ioc === 'object') {
                this.extractIoCsFromObject(ioc, result);
              } else if (typeof ioc === 'string') {
                // Intentar clasificar el IoC automáticamente
                if (ioc.match(/^[0-9.]+$/)) {
                  result.ips.push(ioc);
                } else if (ioc.match(/^[a-f0-9]{32}$/i)) {
                  result.hashes.push(ioc);
                } else if (ioc.match(/^[a-f0-9]{40}$/i)) {
                  result.hashes.push(ioc);
                } else if (ioc.match(/^[a-f0-9]{64}$/i)) {
                  result.hashes.push(ioc);
                } else if (ioc.match(/^https?:/i)) {
                  result.urls.push(ioc);
                } else if (ioc.includes('@')) {
                  result.emails.push(ioc);
                } else if (ioc.includes('.')) {
                  result.domains.push(ioc);
                }
              }
            }
          }
        } else if (typeof value === 'string') {
          // Es un string, procesarlo según el tipo de propiedad
          if (prop.includes('ip')) {
            result.ips.push(value);
          } else if (prop.includes('domain')) {
            result.domains.push(value);
          } else if (prop.includes('hash')) {
            result.hashes.push(value);
          } else if (prop.includes('url')) {
            result.urls.push(value);
          } else if (prop.includes('email')) {
            result.emails.push(value);
          }
        } else if (typeof value === 'object') {
          // Es un objeto, intentar procesarlo recursivamente
          this.extractIoCsFromObject(value, result);
        }
      }
    }
    
    // Recorrer todas las propiedades para búsqueda recursiva
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'object') {
        this.extractIoCsFromObject(obj[key], result);
      }
    }
  }
  
  /**
   * Encuentra inteligencia de amenazas relacionada con un conjunto de IoCs
   */
  private async findRelatedThreatIntel(iocs: {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  }): Promise<ThreatIntel[]> {
    const allIntel = await storage.listThreatIntel();
    const matchingIntel: ThreatIntel[] = [];
    
    // Esta es una implementación básica que busca coincidencias en el contenido
    // En un sistema real, se debería utilizar una base de datos más eficiente para estas búsquedas
    
    for (const intel of allIntel) {
      let matched = false;
      
      // Buscar IoCs en el título y descripción
      const textContent = [intel.title, intel.description].join(' ').toLowerCase();
      
      // Comprobar IPs
      for (const ip of iocs.ips) {
        if (textContent.includes(ip)) {
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        // Comprobar dominios
        for (const domain of iocs.domains) {
          if (textContent.includes(domain.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      
      if (!matched) {
        // Comprobar hashes
        for (const hash of iocs.hashes) {
          if (textContent.includes(hash.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      
      if (!matched && intel.metadata && typeof intel.metadata === 'object') {
        // Buscar en metadata
        try {
          const metadata = typeof intel.metadata === 'string' ? JSON.parse(intel.metadata) : intel.metadata;
          
          // Buscar en IoCs específicos si existen
          if (metadata.iocs) {
            if (Array.isArray(metadata.iocs.ips)) {
              for (const ip of iocs.ips) {
                if (metadata.iocs.ips.includes(ip)) {
                  matched = true;
                  break;
                }
              }
            }
            
            if (!matched && Array.isArray(metadata.iocs.domains)) {
              for (const domain of iocs.domains) {
                if (metadata.iocs.domains.some((d: string) => d.toLowerCase() === domain.toLowerCase())) {
                  matched = true;
                  break;
                }
              }
            }
            
            if (!matched && Array.isArray(metadata.iocs.hashes)) {
              for (const hash of iocs.hashes) {
                if (metadata.iocs.hashes.some((h: string) => h.toLowerCase() === hash.toLowerCase())) {
                  matched = true;
                  break;
                }
              }
            }
          }
        } catch (error) {
          // Ignorar errores al procesar metadata
        }
      }
      
      if (matched) {
        matchingIntel.push(intel);
      }
    }
    
    return matchingIntel;
  }
}

// Exportar una instancia única
export const aiCorrelation = AICorrelationEngine.getInstance();