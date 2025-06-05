# Documentación de Servicios de IA

Este archivo documenta el sistema completo de inteligencia artificial implementado en los archivos `server/ai-service.ts` y `server/advanced-ai-service.ts`, que proporciona capacidades de análisis automatizado para operaciones de ciberseguridad.

## Propósito General

Los servicios de IA proporcionan:
- **Análisis automatizado de alertas** con OpenAI y Anthropic
- **Correlación inteligente de incidentes** para identificar patrones
- **Análisis de threat intelligence** para enriquecimiento automático
- **Detección de anomalías** en logs y tráfico de red
- **Recomendaciones de seguridad** basadas en contexto
- **Multi-provider support** con selección automática de modelo

## Arquitectura del Sistema

### Dos Capas de Servicios

#### 1. AI Service Básico (`ai-service.ts`)
- **Funcionalidad core**: Análisis básico con OpenAI
- **Single provider**: Solo OpenAI GPT-4o
- **Operaciones específicas**: Alert insights, correlación, threat analysis

#### 2. Advanced AI Service (`advanced-ai-service.ts`)
- **Multi-provider**: OpenAI, Anthropic, Google
- **Selección automática**: Optimización por costo y capacidades
- **LLM Orchestrator**: Abstracción de providers
- **Análisis avanzados**: Detección de anomalías, análisis de logs

## AI Service Básico

### Inicialización y Configuración

```typescript
import OpenAI from "openai";

let openAiClient: OpenAI | null = null;

// Inicializar cliente OpenAI
export function initializeOpenAI(apiKey: string) {
  try {
    openAiClient = new OpenAI({ apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    return false;
  }
}

// Verificar configuración
export function isOpenAIConfigured(): boolean {
  return openAiClient !== null;
}

// Helper para garantizar cliente inicializado
function ensureOpenAIClient(): OpenAI {
  if (!openAiClient) {
    throw new Error("OpenAI client is not initialized. Please set API key first.");
  }
  return openAiClient;
}
```

#### Patrón de inicialización:
1. **Lazy initialization**: Cliente se crea solo cuando se necesita
2. **Validation**: Verificación de API key antes de uso
3. **Error handling**: Manejo robusto de errores de configuración

### Análisis de Alertas

```typescript
export async function generateAlertInsight(alert: Alert): Promise<InsertAiInsight | null> {
  try {
    const openai = ensureOpenAIClient();
    
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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

    const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate severity
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    return {
      title: jsonResponse.title,
      type: "alert_analysis",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: jsonResponse.confidence || 0.7,
      relatedEntities: jsonResponse.relatedEntities || []
    };
  } catch (error) {
    console.error("Error generating alert insight:", error);
    return null;
  }
}
```

#### Características del análisis:

1. **Structured prompt**: Template específico para análisis de seguridad
2. **JSON output**: Response estructurada y parseable
3. **Validation**: Verificación de tipos de datos (severity)
4. **Error resilience**: Valores por defecto para campos opcionales
5. **MITRE ATT&CK**: Mapeo a framework de tácticas y técnicas

#### Ejemplo de uso:
```typescript
const alert = await storage.getAlert(alertId);
const insight = await generateAlertInsight(alert);

if (insight) {
  await storage.createAiInsight({
    ...insight,
    organizationId: alert.organizationId,
    relatedEntityId: alert.id,
    relatedEntityType: 'alert'
  });
}
```

### Correlación de Incidentes

```typescript
export async function correlateAlerts(alerts: Alert[]): Promise<Incident | null> {
  if (alerts.length === 0) return null;
  
  try {
    const openai = ensureOpenAIClient();
    
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
        "riskAssessment": "assessment of the risk"
      }
    }
    
    If these alerts are NOT related or don't constitute an incident, return {"title": null}.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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

    const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    if (!jsonResponse.title) {
      return null; // No correlation found
    }
    
    return {
      title: jsonResponse.title,
      description: jsonResponse.description,
      severity: jsonResponse.severity || "medium",
      status: "new",
      relatedAlerts: jsonResponse.relatedAlerts,
      timeline: jsonResponse.timeline,
      aiAnalysis: jsonResponse.aiAnalysis
    };
  } catch (error) {
    console.error("Error correlating alerts:", error);
    return null;
  }
}
```

#### Lógica de correlación:

1. **Input validation**: Requiere al menos una alerta
2. **Summary generation**: Crea resumen estructurado de alertas
3. **Pattern detection**: IA identifica patrones y relaciones
4. **Threshold decision**: Determina si constituye un incidente
5. **Timeline construction**: Crea línea de tiempo de eventos

#### Ejemplo de correlación automática:
```typescript
// En el procesador de alertas
const recentAlerts = await storage.getAlertsLastHour(organizationId);
const incident = await correlateAlerts(recentAlerts);

if (incident) {
  await storage.createIncident({
    ...incident,
    organizationId,
    assignedTo: getDefaultAnalyst(organizationId)
  });
}
```

## Advanced AI Service

### Arquitectura Multi-Provider

```typescript
export enum AIModelType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AUTO = 'auto', // Selección automática
}

export enum AnalysisType {
  ALERT_ANALYSIS = 'alert_analysis',
  INCIDENT_CORRELATION = 'incident_correlation',
  THREAT_INTEL_ANALYSIS = 'threat_intel_analysis',
  SECURITY_RECOMMENDATIONS = 'security_recommendations',
  LOG_PATTERN_DETECTION = 'log_pattern_detection',
  NETWORK_TRAFFIC_ANALYSIS = 'network_traffic_analysis',
  ANOMALY_DETECTION = 'anomaly_detection',
}

interface AIModel {
  type: AIModelType;
  name: string;
  capabilities: AnalysisType[];
  costPerToken: number;
  maxContextSize: number;
  responseTime: number;
  multimodal?: boolean;
}
```

### Definición de Modelos Disponibles

```typescript
const AVAILABLE_MODELS: AIModel[] = [
  {
    type: AIModelType.OPENAI,
    name: 'gpt-4o',
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
    multimodal: true,
  },
  {
    type: AIModelType.OPENAI,
    name: 'gpt-4o-mini',
    capabilities: [/* ... */],
    costPerToken: 0.0015,
    maxContextSize: 8000,
    responseTime: 1000,
    multimodal: true,
  },
  {
    type: AIModelType.ANTHROPIC,
    name: 'claude-3-sonnet-20240229',
    capabilities: [
      AnalysisType.ALERT_ANALYSIS,
      AnalysisType.INCIDENT_CORRELATION,
      AnalysisType.THREAT_INTEL_ANALYSIS,
      AnalysisType.SECURITY_RECOMMENDATIONS,
      AnalysisType.LOG_PATTERN_DETECTION,
    ],
    costPerToken: 0.003,
    maxContextSize: 200000,
    responseTime: 3000,
    multimodal: false,
  }
];
```

#### Criterios de selección de modelo:

- **Capabilities**: Modelo debe soportar el tipo de análisis
- **Cost**: Optimización por costo por token
- **Context size**: Tamaño de input requerido
- **Response time**: Latencia requerida
- **Multimodal**: Necesidad de procesamiento de imágenes

### Selección Automática de Modelo

```typescript
function selectOptimalModel(
  analysisType: AnalysisType, 
  inputSize: number, 
  prioritizeCost: boolean = true
): AIModel {
  const suitableModels = AVAILABLE_MODELS.filter(model => 
    model.capabilities.includes(analysisType) && 
    model.maxContextSize >= inputSize
  );
  
  if (suitableModels.length === 0) {
    throw new Error(`No suitable model found for ${analysisType}`);
  }
  
  // Sort by cost or response time
  const sortedModels = suitableModels.sort((a, b) => 
    prioritizeCost ? a.costPerToken - b.costPerToken : a.responseTime - b.responseTime
  );
  
  return sortedModels[0];
}
```

### LLM Orchestrator Integration

```typescript
import { orchestrator, ProviderType } from "./integrations/llm";

export async function generateAdvancedAlertInsight(
  alert: Alert, 
  preferredProvider?: ProviderType
): Promise<InsertAiInsight | null> {
  try {
    // Determinar provider optimal
    const provider = preferredProvider || await selectOptimalProvider(alert);
    
    const systemMessage = `You are a cybersecurity expert specializing in threat analysis. 
    Provide insightful, accurate, and actionable security intelligence using the MITRE ATT&CK framework.`;
    
    const userMessage = createAlertAnalysisPrompt(alert);
    
    // Usar LLM Orchestrator para abstracción de providers
    const completionOptions = {
      provider,
      estimatedTokens: estimateTokens(userMessage),
      requireLowLatency: alert.severity === 'critical',
      xPreferredModel: getPreferredModel(provider),
      systemMessage,
      userMessage,
      responseFormat: "json_object" as const
    };
    
    const response = await orchestrator.complete(completionOptions);
    
    return parseAlertInsightResponse(response, alert);
    
  } catch (error) {
    console.error('Error in advanced alert analysis:', error);
    return null;
  }
}
```

#### Características avanzadas:

1. **Provider selection**: Selección inteligente de provider
2. **Token estimation**: Estimación de costo antes de llamada
3. **Latency optimization**: Priorización por urgencia
4. **Fallback handling**: Manejo de fallos con providers alternativos

### Análisis de Patrones de Logs

```typescript
export async function analyzeLogPatterns(
  logEntries: string[], 
  timeWindow: string = "1h"
): Promise<{
  patterns: Array<{
    pattern: string;
    frequency: number;
    severity: string;
    description: string;
  }>;
  anomalies: Array<{
    entry: string;
    anomalyScore: number;
    reason: string;
  }>;
}> {
  try {
    const model = selectOptimalModel(AnalysisType.LOG_PATTERN_DETECTION, logEntries.length);
    
    const prompt = `
    Analyze these log entries for security patterns and anomalies:
    
    Time Window: ${timeWindow}
    Log Entries (${logEntries.length} total):
    ${logEntries.slice(0, 100).join('\n')} // Limit to first 100 for token efficiency
    
    Identify:
    1. Common patterns that might indicate security threats
    2. Anomalous entries that deviate from normal patterns
    3. Potential attack signatures or reconnaissance attempts
    
    Response format:
    {
      "patterns": [
        {
          "pattern": "description",
          "frequency": number,
          "severity": "critical|high|medium|low",
          "description": "detailed explanation"
        }
      ],
      "anomalies": [
        {
          "entry": "actual log entry",
          "anomalyScore": 0.X,
          "reason": "why this is anomalous"
        }
      ]
    }
    `;
    
    const response = await callAIProvider(model, prompt);
    return JSON.parse(response.content);
    
  } catch (error) {
    console.error('Error analyzing log patterns:', error);
    return { patterns: [], anomalies: [] };
  }
}
```

### Análisis de Tráfico de Red

```typescript
export async function analyzeNetworkTraffic(
  trafficData: {
    sourceIp: string;
    destinationIp: string;
    port: number;
    protocol: string;
    bytes: number;
    timestamp: Date;
  }[]
): Promise<{
  suspiciousConnections: Array<{
    connection: string;
    riskScore: number;
    reasons: string[];
    mitreTactics: string[];
  }>;
  recommendations: string[];
}> {
  try {
    const trafficSummary = trafficData.map(t => 
      `${t.sourceIp}:${t.port} → ${t.destinationIp} (${t.protocol}, ${t.bytes} bytes)`
    ).join('\n');
    
    const prompt = `
    Analyze this network traffic for security threats:
    
    Traffic Data:
    ${trafficSummary}
    
    Identify:
    1. Suspicious connection patterns
    2. Potential data exfiltration
    3. Command and control (C2) communications
    4. Port scanning or reconnaissance
    5. DDoS patterns
    
    Map findings to MITRE ATT&CK tactics where applicable.
    
    Response format:
    {
      "suspiciousConnections": [
        {
          "connection": "source:port → destination",
          "riskScore": 0.X,
          "reasons": ["list of reasons"],
          "mitreTactics": ["Initial Access", "Command and Control"]
        }
      ],
      "recommendations": ["list of recommended actions"]
    }
    `;
    
    const model = selectOptimalModel(AnalysisType.NETWORK_TRAFFIC_ANALYSIS, trafficSummary.length);
    const response = await callAIProvider(model, prompt);
    
    return JSON.parse(response.content);
    
  } catch (error) {
    console.error('Error analyzing network traffic:', error);
    return { suspiciousConnections: [], recommendations: [] };
  }
}
```

## Validación y Esquemas

### Schemas de Validación con Zod

```typescript
import { z } from "zod";

export const AlertInsightResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.literal("alert_analysis"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  confidence: z.number().min(0).max(1),
  relatedEntities: z.array(z.string()),
  mitreTactics: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional()
});

export const IncidentCorrelationResponseSchema = z.object({
  title: z.string().nullable(),
  description: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  relatedAlerts: z.array(z.number()).optional(),
  timeline: z.array(z.object({
    timestamp: z.string(),
    description: z.string()
  })).optional(),
  aiAnalysis: z.object({
    attackPattern: z.string(),
    recommendations: z.array(z.string()),
    riskAssessment: z.string(),
    mitreTactics: z.array(z.string()).optional()
  }).optional()
});
```

### Validación con Retry Logic

```typescript
import { parseOrRetry } from "./integrations/llm/llm-validation";

async function parseAlertInsightResponse(
  response: any, 
  alert: Alert
): Promise<InsertAiInsight | null> {
  try {
    const parsed = await parseOrRetry(
      response.content,
      AlertInsightResponseSchema,
      3 // max retries
    );
    
    return {
      ...parsed,
      organizationId: alert.organizationId,
      relatedEntityId: alert.id,
      relatedEntityType: 'alert',
      status: 'new'
    };
  } catch (error) {
    console.error('Failed to parse AI response after retries:', error);
    return null;
  }
}
```

## Optimizaciones de Performance

### Token Estimation

```typescript
function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

function optimizePromptLength(prompt: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(prompt);
  
  if (estimatedTokens <= maxTokens) {
    return prompt;
  }
  
  // Truncate while preserving structure
  const targetLength = maxTokens * 4 * 0.8; // 80% of max to be safe
  return prompt.substring(0, targetLength) + "\n[Content truncated for token limit]";
}
```

### Caching de Responses

```typescript
import NodeCache from 'node-cache';

class AIServiceCache {
  private cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
  
  async getCachedAnalysis(key: string): Promise<any | null> {
    return this.cache.get(key) || null;
  }
  
  setCachedAnalysis(key: string, analysis: any): void {
    this.cache.set(key, analysis);
  }
  
  generateCacheKey(alert: Alert): string {
    return `alert_${alert.id}_${alert.severity}_${alert.sourceIp}`;
  }
}

export async function generateCachedAlertInsight(alert: Alert): Promise<InsertAiInsight | null> {
  const cache = new AIServiceCache();
  const cacheKey = cache.generateCacheKey(alert);
  
  // Check cache first
  let insight = await cache.getCachedAnalysis(cacheKey);
  
  if (!insight) {
    // Generate new insight
    insight = await generateAlertInsight(alert);
    if (insight) {
      cache.setCachedAnalysis(cacheKey, insight);
    }
  }
  
  return insight;
}
```

### Batch Processing

```typescript
export async function analyzeAlertsBatch(
  alerts: Alert[], 
  batchSize: number = 5
): Promise<InsertAiInsight[]> {
  const insights: InsertAiInsight[] = [];
  
  for (let i = 0; i < alerts.length; i += batchSize) {
    const batch = alerts.slice(i, i + batchSize);
    
    const batchPromises = batch.map(alert => 
      generateAlertInsight(alert).catch(error => {
        console.error(`Failed to analyze alert ${alert.id}:`, error);
        return null;
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    insights.push(...batchResults.filter(Boolean));
    
    // Rate limiting between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return insights;
}
```

## Integración con el Sistema SOC

### Análisis Automático de Alertas

```typescript
// En el procesador de alertas
import { generateAlertInsight } from './ai-service';

export async function processNewAlert(alert: Alert) {
  // Procesar alerta básica
  const enrichedAlert = await enrichAlert(alert);
  
  // Análisis de IA en background
  generateAlertInsight(enrichedAlert)
    .then(insight => {
      if (insight) {
        storage.createAiInsight({
          ...insight,
          organizationId: alert.organizationId,
          relatedEntityId: alert.id,
          relatedEntityType: 'alert'
        });
      }
    })
    .catch(error => {
      console.error('AI analysis failed:', error);
    });
  
  return enrichedAlert;
}
```

### Dashboard de IA

```typescript
// Endpoint para métricas de IA
app.get('/api/ai/metrics', isAuthenticated, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    
    const metrics = {
      totalInsights: await storage.countAiInsights(organizationId),
      insightsByType: await storage.getInsightsByType(organizationId),
      averageConfidence: await storage.getAverageConfidence(organizationId),
      recentInsights: await storage.getRecentInsights(organizationId, 10),
      providerUsage: await getProviderUsageStats(organizationId)
    };
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Configuración de Modelos

```typescript
// Endpoint para configurar preferencias de IA
app.post('/api/ai/config', isAuthenticated, async (req, res) => {
  try {
    const { preferredProvider, enableAutoAnalysis, confidenceThreshold } = req.body;
    
    await storage.updateOrganizationSettings(req.user.organizationId, {
      aiConfig: {
        preferredProvider,
        enableAutoAnalysis,
        confidenceThreshold
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Consideraciones de Costos

### Tracking de Uso

```typescript
interface AIUsageMetrics {
  organizationId: number;
  provider: string;
  model: string;
  tokensUsed: number;
  cost: number;
  analysisType: string;
  timestamp: Date;
}

async function trackAIUsage(metrics: AIUsageMetrics) {
  await storage.createAIUsageRecord(metrics);
  
  // Check budget limits
  const monthlyUsage = await storage.getMonthlyAIUsage(metrics.organizationId);
  const organization = await storage.getOrganization(metrics.organizationId);
  
  if (monthlyUsage.cost > organization.aiBudgetLimit) {
    // Send notification or disable AI features
    await notifyBudgetExceeded(metrics.organizationId, monthlyUsage.cost);
  }
}
```

### Optimización de Costos

```typescript
function selectCostOptimalModel(analysisType: AnalysisType, priority: 'cost' | 'speed' | 'quality'): AIModel {
  const suitableModels = AVAILABLE_MODELS.filter(m => m.capabilities.includes(analysisType));
  
  switch (priority) {
    case 'cost':
      return suitableModels.sort((a, b) => a.costPerToken - b.costPerToken)[0];
    case 'speed':
      return suitableModels.sort((a, b) => a.responseTime - b.responseTime)[0];
    case 'quality':
      // Prefer larger models with more capabilities
      return suitableModels.sort((a, b) => b.maxContextSize - a.maxContextSize)[0];
    default:
      return suitableModels[0];
  }
}
```

## Mejores Prácticas

### 1. **Error Handling Robusto**

```typescript
export async function safeAIAnalysis<T>(
  analysisFunction: () => Promise<T>,
  fallbackValue: T,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analysisFunction();
    } catch (error) {
      console.error(`AI analysis attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('All AI analysis attempts failed, using fallback');
        return fallbackValue;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  return fallbackValue;
}
```

### 2. **Rate Limiting**

```typescript
import { RateLimiter } from 'limiter';

class AIRateLimiter {
  private limiters = new Map<string, RateLimiter>();
  
  async waitForToken(provider: string): Promise<void> {
    if (!this.limiters.has(provider)) {
      // Different limits for different providers
      const tokensPerMinute = this.getProviderLimit(provider);
      this.limiters.set(provider, new RateLimiter(tokensPerMinute, 'minute'));
    }
    
    const limiter = this.limiters.get(provider)!;
    
    return new Promise((resolve) => {
      limiter.removeTokens(1, () => resolve());
    });
  }
  
  private getProviderLimit(provider: string): number {
    const limits = {
      'openai': 1000,
      'anthropic': 50,
      'google': 100
    };
    return limits[provider] || 50;
  }
}
```

### 3. **Monitoring y Alertas**

```typescript
// Métricas de performance de IA
export async function monitorAIPerformance() {
  setInterval(async () => {
    const metrics = {
      responseTime: await getAverageResponseTime(),
      errorRate: await getErrorRate(),
      costPerHour: await getCostPerHour(),
      accuracyScore: await getAccuracyScore()
    };
    
    // Alertar si métricas están fuera de rango
    if (metrics.errorRate > 0.1) {
      await sendAlert('High AI error rate detected', metrics);
    }
    
    if (metrics.costPerHour > 100) {
      await sendAlert('AI costs exceeding budget', metrics);
    }
  }, 300000); // Check every 5 minutes
}
```

### 4. **Validación de Outputs**

```typescript
function validateAIOutput(output: any, schema: z.ZodSchema): boolean {
  try {
    schema.parse(output);
    return true;
  } catch (error) {
    console.error('AI output validation failed:', error);
    return false;
  }
}

// Usar validación en todas las respuestas de IA
export async function generateValidatedInsight(alert: Alert): Promise<InsertAiInsight | null> {
  const rawInsight = await generateAlertInsight(alert);
  
  if (!rawInsight || !validateAIOutput(rawInsight, AlertInsightResponseSchema)) {
    console.warn('AI generated invalid insight, skipping');
    return null;
  }
  
  return rawInsight;
}
```