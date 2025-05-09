import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { 
  InsertAiInsight, 
  Alert, 
  Incident, 
  ThreatIntel, 
  AiInsight, 
  SeverityTypes,
  ConnectorStatusType
} from "@shared/schema";

/**
 * Tipos de modelos de IA/ML que soporta el sistema
 */
export enum AIModelType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AUTO = 'auto', // Selección automática basada en la entrada
}

/**
 * Tipos de análisis de seguridad que la IA puede realizar
 */
export enum AnalysisType {
  ALERT_ANALYSIS = 'alert_analysis',
  INCIDENT_CORRELATION = 'incident_correlation',
  THREAT_INTEL_ANALYSIS = 'threat_intel_analysis',
  SECURITY_RECOMMENDATIONS = 'security_recommendations',
  LOG_PATTERN_DETECTION = 'log_pattern_detection',
  NETWORK_TRAFFIC_ANALYSIS = 'network_traffic_analysis',
  ANOMALY_DETECTION = 'anomaly_detection',
}

/**
 * Definición de un modelo de IA
 */
interface AIModel {
  type: AIModelType;
  name: string;
  capabilities: AnalysisType[];
  costPerToken: number; // Coste estimado por token, para optimización de recursos
  maxContextSize: number; // Tamaño máximo de contexto (en tokens)
  responseTime: number; // Tiempo de respuesta estimado (milisegundos)
}

// Definición de modelos disponibles
const AVAILABLE_MODELS: AIModel[] = [
  {
    type: AIModelType.OPENAI,
    name: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    capabilities: [
      AnalysisType.ALERT_ANALYSIS,
      AnalysisType.INCIDENT_CORRELATION,
      AnalysisType.THREAT_INTEL_ANALYSIS,
      AnalysisType.SECURITY_RECOMMENDATIONS,
      AnalysisType.LOG_PATTERN_DETECTION,
      AnalysisType.NETWORK_TRAFFIC_ANALYSIS,
      AnalysisType.ANOMALY_DETECTION,
    ],
    costPerToken: 0.01,
    maxContextSize: 128000,
    responseTime: 2000,
  },
  {
    type: AIModelType.ANTHROPIC,
    name: 'claude-3-7-sonnet-20250219', // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
    capabilities: [
      AnalysisType.ALERT_ANALYSIS,
      AnalysisType.INCIDENT_CORRELATION,
      AnalysisType.THREAT_INTEL_ANALYSIS,
      AnalysisType.SECURITY_RECOMMENDATIONS,
      AnalysisType.LOG_PATTERN_DETECTION,
    ],
    costPerToken: 0.015,
    maxContextSize: 200000,
    responseTime: 2500,
  },
];

// Clientes de IA inicializados
let openAiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

/**
 * Inicializa el cliente de OpenAI
 */
export function initializeOpenAI(apiKey: string): boolean {
  try {
    openAiClient = new OpenAI({ apiKey });
    console.log("OpenAI client initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    return false;
  }
}

/**
 * Inicializa el cliente de Anthropic
 */
export function initializeAnthropic(apiKey: string): boolean {
  try {
    anthropicClient = new Anthropic({ apiKey });
    console.log("Anthropic client initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Anthropic client:", error);
    return false;
  }
}

/**
 * Comprueba si el cliente de OpenAI está configurado
 */
export function isOpenAIConfigured(): boolean {
  return openAiClient !== null;
}

/**
 * Comprueba si el cliente de Anthropic está configurado
 */
export function isAnthropicConfigured(): boolean {
  return anthropicClient !== null;
}

/**
 * Helper para asegurar que el cliente de OpenAI está inicializado
 */
function ensureOpenAIClient(): OpenAI {
  if (!openAiClient) {
    throw new Error("OpenAI client is not initialized. Please set API key first.");
  }
  return openAiClient;
}

/**
 * Helper para asegurar que el cliente de Anthropic está inicializado
 */
function ensureAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    throw new Error("Anthropic client is not initialized. Please set API key first.");
  }
  return anthropicClient;
}

/**
 * Selecciona el modelo más apropiado para un tipo de análisis dado
 */
function selectModelForAnalysis(analysisType: AnalysisType, preferredModel?: AIModelType): AIModel {
  // Si se solicita un modelo específico (y está disponible), usarlo
  if (preferredModel === AIModelType.OPENAI && isOpenAIConfigured()) {
    return AVAILABLE_MODELS.find(m => m.type === AIModelType.OPENAI)!;
  }
  
  if (preferredModel === AIModelType.ANTHROPIC && isAnthropicConfigured()) {
    return AVAILABLE_MODELS.find(m => m.type === AIModelType.ANTHROPIC)!;
  }
  
  // Si se solicita selección automática o el modelo preferido no está disponible,
  // elegir el modelo más apropiado disponible
  const availableModels = AVAILABLE_MODELS.filter(model => 
    (model.type === AIModelType.OPENAI && isOpenAIConfigured()) ||
    (model.type === AIModelType.ANTHROPIC && isAnthropicConfigured())
  );
  
  if (availableModels.length === 0) {
    throw new Error("No AI models are configured. Please set up at least one API key.");
  }
  
  // Filtrar modelos capaces de realizar el análisis solicitado
  const capableModels = availableModels.filter(model => 
    model.capabilities.includes(analysisType)
  );
  
  if (capableModels.length === 0) {
    throw new Error(`No available models can perform ${analysisType} analysis.`);
  }
  
  // Para este ejemplo, elegiremos el modelo con menor tiempo de respuesta entre los capaces
  return capableModels.sort((a, b) => a.responseTime - b.responseTime)[0];
}

/**
 * Genera un análisis de alerta usando el modelo AI especificado
 */
export async function generateAlertInsight(
  alert: Alert, 
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<InsertAiInsight | null> {
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.ALERT_ANALYSIS, preferredModel);
    
    // Preparar el prompt
    const prompt = `
    Analyze this security alert and provide insights:
    
    Alert Title: ${alert.title}
    Description: ${alert.description}
    Severity: ${alert.severity}
    Source: ${alert.source}
    Source IP: ${alert.sourceIp}
    Destination IP: ${alert.destinationIp}
    
    Provide a security analysis including:
    1. Potential threat actors or campaigns
    2. Possible attack techniques (MITRE ATT&CK if applicable)
    3. Recommended actions
    4. Risk assessment
    
    Format your response as JSON with the following fields:
    {
      "title": "Brief insight title",
      "description": "Detailed analysis",
      "type": "alert_analysis",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["IPs", "domains", "threat actors", "techniques"]
    }
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity expert specializing in threat analysis. Provide insightful, accurate, and actionable security intelligence."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a cybersecurity expert specializing in threat analysis. Provide insightful, accurate, and actionable security intelligence.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar respuesta
    if (!jsonResponse || typeof jsonResponse !== 'object') {
      throw new Error("Invalid response format from AI model");
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: "alert_analysis",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.7),
      relatedEntities: jsonResponse.relatedEntities || []
    };
  } catch (error) {
    console.error(`Error generating alert insight with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Correlaciona alertas para identificar incidentes potenciales
 */
export async function correlateAlerts(
  alerts: Alert[],
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<Incident | null> {
  if (alerts.length === 0) return null;
  
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.INCIDENT_CORRELATION, preferredModel);
    
    const alertSummaries = alerts.map(alert => 
      `- ID: ${alert.id}, Title: ${alert.title}, Severity: ${alert.severity}, Source: ${alert.source}, IPs: ${alert.sourceIp || 'N/A'} → ${alert.destinationIp || 'N/A'}`
    ).join("\n");
    
    const prompt = `
    Analyze these security alerts and determine if they are related and constitute a security incident:
    
    ${alertSummaries}
    
    If these alerts are related and represent a potential security incident, provide analysis in JSON format:
    {
      "title": "Incident title (be specific)",
      "description": "Detailed analysis of the potential incident",
      "severity": "critical|high|medium|low",
      "status": "new",
      "relatedAlerts": [alert IDs that are related],
      "timeline": [{"timestamp": "description of event"}],
      "aiAnalysis": {
        "attackPattern": "description of the attack pattern",
        "recommendations": ["list", "of", "recommendations"],
        "riskAssessment": "assessment of the risk",
        "mitreTactics": ["tactic-id-1", "tactic-id-2"],
        "confidence": 0.8
      }
    }
    
    If these alerts are NOT related or don't constitute an incident, return {"title": null}.
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity expert specializing in incident response. Analyze security alerts to identify potential incidents."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a cybersecurity expert specializing in incident response. Analyze security alerts to identify potential incidents.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    if (!jsonResponse.title) {
      return null;
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Comprobar que aiAnalysis tiene la estructura correcta
    const aiAnalysis = jsonResponse.aiAnalysis || {};
    if (!aiAnalysis.mitreTactics) {
      aiAnalysis.mitreTactics = [];
    }
    
    // Crear y devolver el incidente
    return {
      title: jsonResponse.title,
      description: jsonResponse.description,
      severity: severity, 
      status: "new",
      relatedAlerts: jsonResponse.relatedAlerts,
      timeline: jsonResponse.timeline,
      aiAnalysis: aiAnalysis,
      mitreTactics: aiAnalysis.mitreTactics
    };
  } catch (error) {
    console.error(`Error correlating alerts with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Analiza datos de inteligencia de amenazas
 */
export async function analyzeThreatIntel(
  intel: ThreatIntel,
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<AiInsight | null> {
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.THREAT_INTEL_ANALYSIS, preferredModel);
    
    const prompt = `
    Analyze this threat intelligence and provide actionable insights:
    
    Title: ${intel.title}
    Type: ${intel.type}
    Description: ${intel.description}
    Severity: ${intel.severity}
    Source: ${intel.source}
    Confidence: ${intel.confidence}
    IOCs: ${JSON.stringify(intel.iocs)}
    
    Provide a detailed analysis including:
    1. Impact assessment for organization
    2. Defensive recommendations
    3. Detection strategies
    4. Relevance to current threat landscape
    
    Format your response as JSON with the following fields:
    {
      "title": "Brief insight title",
      "description": "Detailed analysis",
      "type": "threat_intel_analysis",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["IPs", "domains", "threat actors", "techniques"],
      "status": "new"
    }
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a threat intelligence analyst specializing in actionable intelligence. Provide detailed analysis and defensive recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a threat intelligence analyst specializing in actionable intelligence. Provide detailed analysis and defensive recommendations.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: jsonResponse.type || "threat_intel_analysis",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.7),
      relatedEntities: jsonResponse.relatedEntities || []
    };
  } catch (error) {
    console.error(`Error analyzing threat intel with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Genera recomendaciones de seguridad basadas en la postura de seguridad actual
 */
export async function generateSecurityRecommendations(
  recentAlerts: Alert[],
  recentIncidents: Incident[],
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<AiInsight | null> {
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.SECURITY_RECOMMENDATIONS, preferredModel);
    
    const alertSummary = recentAlerts.slice(0, 5).map(alert => 
      `- ${alert.title} (${alert.severity}): ${alert.description.substring(0, 100)}...`
    ).join("\n");
    
    const incidentSummary = recentIncidents.slice(0, 3).map(incident => 
      `- ${incident.title} (${incident.severity}): ${incident.description.substring(0, 100)}...`
    ).join("\n");
    
    const prompt = `
    Based on the following recent security events, provide strategic security recommendations:
    
    Recent Alerts:
    ${alertSummary || "No recent alerts"}
    
    Recent Incidents:
    ${incidentSummary || "No recent incidents"}
    
    Generate comprehensive security recommendations to improve the organization's security posture.
    Consider gaps in controls, emerging threats relevant to the observed patterns, and prioritized actions.
    
    Format your response as JSON with the following fields:
    {
      "title": "Security Recommendation Summary",
      "description": "Detailed analysis and recommendations",
      "type": "security_recommendations",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["security controls", "frameworks", "technologies"],
      "status": "new",
      "actionItems": [
        {"priority": "high|medium|low", "title": "Action item title", "description": "Action item description"}
      ]
    }
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity consultant specializing in security architecture and risk management. Provide strategic recommendations to improve security posture."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a cybersecurity consultant specializing in security architecture and risk management. Provide strategic recommendations to improve security posture.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: "security_recommendations",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.8),
      relatedEntities: jsonResponse.relatedEntities || [],
      actionItems: jsonResponse.actionItems || []
    };
  } catch (error) {
    console.error(`Error generating security recommendations with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Analiza patrones en logs (detecta anomalías y comportamientos sospechosos)
 */
export async function analyzeLogPatterns(
  logs: string[],
  context: Record<string, any> = {},
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<AiInsight | null> {
  if (logs.length === 0) return null;
  
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.LOG_PATTERN_DETECTION, preferredModel);
    
    // Limitar los logs para evitar exceder límites de tokens
    const logSample = logs.length > 50 ? logs.slice(0, 50).join("\n") : logs.join("\n");
    
    const contextInfo = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    
    const prompt = `
    Analyze these system logs and identify any suspicious patterns, anomalies, or security issues:
    
    CONTEXT INFORMATION:
    ${contextInfo || "No additional context provided."}
    
    LOGS:
    ${logSample}
    
    Identify any security-relevant patterns, intrusion attempts, or anomalies in these logs.
    Analyze the logs for indicators of compromise, unauthorized access, suspicious activities, or system misconfigurations.
    
    Format your response as JSON with the following fields:
    {
      "title": "Brief summary of findings",
      "description": "Detailed analysis of identified patterns or issues",
      "type": "log_pattern_detection",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["IP addresses", "usernames", "command patterns", etc],
      "patterns": [
        {
          "pattern": "Pattern identified",
          "occurences": Number of times observed,
          "significance": "Why this pattern is relevant",
          "recommendation": "What action should be taken"
        }
      ],
      "status": "new"
    }
    
    If no suspicious patterns are found, still provide analysis but set severity to "low" and explain why the logs appear normal.
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity log analysis expert specializing in detecting suspicious patterns and anomalies in system logs."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a cybersecurity log analysis expert specializing in detecting suspicious patterns and anomalies in system logs.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: "log_pattern_detection",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.7),
      relatedEntities: jsonResponse.relatedEntities || [],
      patterns: jsonResponse.patterns || []
    };
  } catch (error) {
    console.error(`Error analyzing log patterns with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Analiza tráfico de red para detectar patrones y comportamientos anómalos
 */
export async function analyzeNetworkTraffic(
  trafficData: any[],
  context: Record<string, any> = {},
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<AiInsight | null> {
  if (trafficData.length === 0) return null;
  
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.NETWORK_TRAFFIC_ANALYSIS, preferredModel);
    
    // Convertir datos de tráfico a formato legible
    const trafficSample = trafficData.slice(0, 30).map(packet => {
      return JSON.stringify(packet, null, 2);
    }).join("\n\n");
    
    const contextInfo = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    
    const prompt = `
    Analyze this network traffic data and identify any suspicious patterns, communication flows, or security issues:
    
    CONTEXT INFORMATION:
    ${contextInfo || "No additional context provided."}
    
    NETWORK TRAFFIC SAMPLE:
    ${trafficSample}
    
    Identify any suspicious network traffic patterns, potential malicious communication, data exfiltration, or C2 traffic.
    Analyze the flows for unusual destinations, protocols, timing patterns, or data volumes.
    
    Format your response as JSON with the following fields:
    {
      "title": "Brief summary of findings",
      "description": "Detailed analysis of network traffic patterns",
      "type": "network_traffic_analysis",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["IP addresses", "domains", "ports", "protocols"],
      "traffic_patterns": [
        {
          "pattern": "Pattern description",
          "indicators": ["indicator1", "indicator2"],
          "significance": "Why this pattern is concerning",
          "recommendation": "What action should be taken"
        }
      ],
      "status": "new"
    }
    
    If no suspicious patterns are found, still provide analysis but set severity to "low".
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a network security expert specializing in detecting malicious traffic patterns, exfiltration, and command & control communication."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a network security expert specializing in detecting malicious traffic patterns, exfiltration, and command & control communication.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: "network_traffic_analysis",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.7),
      relatedEntities: jsonResponse.relatedEntities || [],
      trafficPatterns: jsonResponse.traffic_patterns || []
    };
  } catch (error) {
    console.error(`Error analyzing network traffic with ${preferredModel} model:`, error);
    return null;
  }
}

/**
 * Detecta anomalías en datos de series temporales (métricas, logs, etc.)
 */
export async function detectAnomalies(
  timeSeriesData: any[],
  context: Record<string, any> = {},
  preferredModel: AIModelType = AIModelType.AUTO
): Promise<AiInsight | null> {
  if (timeSeriesData.length === 0) return null;
  
  try {
    const selectedModel = selectModelForAnalysis(AnalysisType.ANOMALY_DETECTION, preferredModel);
    
    // Convertir datos de serie temporal a formato legible
    const dataSample = JSON.stringify(timeSeriesData.slice(0, 50), null, 2);
    
    const contextInfo = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    
    const prompt = `
    Analyze this time series data and identify any anomalies or unusual patterns:
    
    CONTEXT INFORMATION:
    ${contextInfo || "No additional context provided."}
    
    TIME SERIES DATA:
    ${dataSample}
    
    Identify any anomalies, outliers, unusual trends, or suspicious spikes/drops in this time series data.
    Consider baseline behavior vs. unusual deviations that might indicate security issues.
    
    Format your response as JSON with the following fields:
    {
      "title": "Anomaly Detection Summary",
      "description": "Detailed analysis of identified anomalies",
      "type": "anomaly_detection",
      "severity": "critical|high|medium|low",
      "confidence": 0.X (number between 0 and 1),
      "relatedEntities": ["metrics", "timestamps", "affected systems"],
      "anomalies": [
        {
          "timepoint": "When the anomaly occurred",
          "description": "What was observed",
          "deviation": "How much it deviated from norm",
          "significance": "Why this anomaly is relevant",
          "recommendation": "What action should be taken"
        }
      ],
      "status": "new"
    }
    
    If no anomalies are found, still provide analysis but set severity to "low".
    `;
    
    let jsonResponse: any;
    
    // Llamar al modelo apropiado
    if (selectedModel.type === AIModelType.OPENAI) {
      const openai = ensureOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: selectedModel.name,
        messages: [
          {
            role: "system",
            content: "You are a security data scientist specializing in anomaly detection and behavioral analysis for security monitoring."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    } 
    else if (selectedModel.type === AIModelType.ANTHROPIC) {
      const anthropic = ensureAnthropicClient();
      
      const response = await anthropic.messages.create({
        model: selectedModel.name,
        system: "You are a security data scientist specializing in anomaly detection and behavioral analysis for security monitoring.",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      });

      jsonResponse = JSON.parse(response.content[0].text);
    }
    
    // Validar severidad
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    // Crear y devolver el insight
    return {
      title: jsonResponse.title,
      type: "anomaly_detection",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: Number(jsonResponse.confidence || 0.7),
      relatedEntities: jsonResponse.relatedEntities || [],
      anomalies: jsonResponse.anomalies || []
    };
  } catch (error) {
    console.error(`Error detecting anomalies with ${preferredModel} model:`, error);
    return null;
  }
}