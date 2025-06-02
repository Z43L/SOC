# Documentación del Servidor Backend - advanced-ai-service.ts

## Propósito

El archivo `advanced-ai-service.ts` implementa el **sistema avanzado de inteligencia artificial multi-proveedor** del SOC, proporcionando:

- Soporte para múltiples proveedores de IA (OpenAI, Anthropic, Google)
- Selección automática del modelo óptimo según el tipo de análisis
- Análisis especializados: logs, tráfico de red, anomalías
- Validación robusta con esquemas Zod
- Optimización de costos y rendimiento
- Orquestación inteligente de modelos LLM
- Capacidades multimodales (texto, imágenes, audio)

## Arquitectura Multi-Proveedor

### Diferencias con ai-service.ts Básico

| Característica | ai-service.ts (Básico) | advanced-ai-service.ts (Avanzado) |
|---|---|---|
| **Proveedores** | Solo OpenAI | OpenAI, Anthropic, Google |
| **Selección de Modelo** | GPT-4o fijo | Automática basada en análisis |
| **Análisis** | 4 tipos básicos | 7 tipos especializados |
| **Validación** | Básica con fallbacks | Esquemas Zod complejos |
| **Optimización** | Manual | Automática (costo/rendimiento) |
| **Orquestación** | No | LLM Orchestrator integrado |

## Estructura del Archivo

### 1. Imports y Dependencias Avanzadas

#### SDKs de Múltiples Proveedores
```typescript
import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
```

#### Validación y Orquestación
```typescript
import { AlertInsightResponseSchema } from "./integrations/ai-validation-schemas";
import { IncidentCorrelationResponseSchema } from "./integrations/ai-validation-schemas";
import { orchestrator, ProviderType } from "./integrations/llm";
import { parseOrRetry } from "./integrations/llm/llm-validation";
import { z } from "zod";
```

**Nuevas capacidades**:
- **Anthropic SDK**: Claude models (3.5 Sonnet, Opus, Haiku)
- **LLM Orchestrator**: Selección inteligente de modelos
- **Validation Schemas**: Esquemas Zod específicos por tipo de análisis
- **Parse & Retry**: Lógica de reintento con validación

### 2. Enums y Tipos Avanzados

#### Tipos de Modelos de IA
```typescript
export enum AIModelType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AUTO = 'auto', // Selección automática basada en la entrada
}
```

#### Tipos de Análisis Especializados
```typescript
export enum AnalysisType {
  ALERT_ANALYSIS = 'alert_analysis',
  INCIDENT_CORRELATION = 'incident_correlation',
  THREAT_INTEL_ANALYSIS = 'threat_intel_analysis',
  SECURITY_RECOMMENDATIONS = 'security_recommendations',
  LOG_PATTERN_DETECTION = 'log_pattern_detection',         // Nuevo
  NETWORK_TRAFFIC_ANALYSIS = 'network_traffic_analysis',   // Nuevo
  ANOMALY_DETECTION = 'anomaly_detection',                 // Nuevo
}
```

**Nuevos tipos de análisis**:
- **LOG_PATTERN_DETECTION**: Detección de patrones sospechosos en logs
- **NETWORK_TRAFFIC_ANALYSIS**: Análisis de tráfico de red para amenazas
- **ANOMALY_DETECTION**: Detección de anomalías usando ML

### 3. Definición de Modelos Avanzada

```typescript
interface AIModel {
  type: AIModelType;
  name: string;
  capabilities: AnalysisType[];
  costPerToken: number; // Coste estimado por token, para optimización de recursos
  maxContextSize: number; // Tamaño máximo de contexto (en tokens)
  responseTime: number; // Tiempo de respuesta estimado (milisegundos)
  multimodal?: boolean; // Si el modelo soporta entradas multimodales
}
```

**Nuevos campos**:
- **costPerToken**: Para optimización de costos automática
- **maxContextSize**: Para manejar límites de contexto
- **responseTime**: Para optimización de latencia
- **multimodal**: Para análisis de imágenes/audio

### 4. Catálogo de Modelos Disponibles

#### OpenAI Models
```typescript
{
  type: AIModelType.OPENAI,
  name: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
  capabilities: [/* todos los tipos de análisis */],
  costPerToken: 0.01,
  maxContextSize: 128000,
  responseTime: 2000,
  multimodal: true,
},
{
  type: AIModelType.OPENAI,
  name: 'gpt-4o-mini', // Smaller, faster and cheaper version of GPT-4o
  capabilities: [/* todos los tipos de análisis */],
  costPerToken: 0.0015,
  maxContextSize: 8000,
  responseTime: 1000,
  multimodal: true,
}
```

#### Anthropic Models
```typescript
{
  type: AIModelType.ANTHROPIC,
  name: 'claude-3-sonnet-20240229', // the newest Anthropic model
  capabilities: [/* análisis complejos */],
  costPerToken: 0.003,
  maxContextSize: 200000,
  responseTime: 2000,
  multimodal: true,
},
{
  type: AIModelType.ANTHROPIC,
  name: 'claude-3-haiku-20240307', // Fast and efficient Claude model
  capabilities: [/* análisis básicos */],
  costPerToken: 0.00025,
  maxContextSize: 200000,
  responseTime: 1000,
  multimodal: true,
},
{
  type: AIModelType.ANTHROPIC,
  name: 'claude-3-opus-20240229', // Most powerful Claude model
  capabilities: [/* todos los tipos de análisis */],
  costPerToken: 0.015,
  maxContextSize: 200000,
  responseTime: 3000,
  multimodal: true,
}
```

#### Google Models
```typescript
{
  type: AIModelType.GOOGLE,
  name: 'gemini-1.5-pro', // Google's advanced model with long context
  capabilities: [/* todos los tipos de análisis */],
  costPerToken: 0.0025,
  maxContextSize: 2000000, // 2 million tokens - massive context
  responseTime: 2500,
  multimodal: true,
}
```

**Ventajas por proveedor**:
- **OpenAI**: Mejor para análisis general, excelente calidad
- **Anthropic**: Mejor para análisis complejos, contexto largo
- **Google**: Contexto masivo (2M tokens), multimodal avanzado

### 5. Inicialización Multi-Proveedor

#### Variables de Estado Globales
```typescript
let openAiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
// Google se maneja via orchestrator
```

#### Inicialización de OpenAI
```typescript
export function initializeOpenAI(apiKey: string) {
  try {
    openAiClient = new OpenAI({ apiKey });
    // Inicializar también en el orchestrator
    orchestrator.initializeProvider(ProviderType.OPENAI, { apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    return false;
  }
}
```

#### Inicialización de Anthropic
```typescript
export function initializeAnthropic(apiKey: string) {
  try {
    anthropicClient = new Anthropic({ apiKey });
    // Inicializar también en el orchestrator
    orchestrator.initializeProvider(ProviderType.ANTHROPIC, { apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize Anthropic client:", error);
    return false;
  }
}
```

#### Inicialización de Google
```typescript
export function initializeGoogle(apiKey: string) {
  try {
    // Solo via orchestrator para Google
    orchestrator.initializeProvider(ProviderType.GOOGLE, { apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize Google client:", error);
    return false;
  }
}
```

### 6. Selección Inteligente de Modelos

```typescript
function selectModelForAnalysis(
  analysisType: AnalysisType, 
  preferredModel?: AIModelType, 
  estimatedTokens: number = 4000,
  requireLowLatency: boolean = false,
  xPreferredModel?: string
): AIModel {
  // Try to use the orchestrator first for modern selection logic
  try {
    // Convert AIModelType to ProviderType
    let providerType: ProviderType = ProviderType.AUTO;
    if (preferredModel === AIModelType.OPENAI) providerType = ProviderType.OPENAI;
    else if (preferredModel === AIModelType.ANTHROPIC) providerType = ProviderType.ANTHROPIC;
    else if (preferredModel === AIModelType.GOOGLE) providerType = ProviderType.GOOGLE;
    
    // Check if we need low latency based on analysis type
    if (analysisType === AnalysisType.ALERT_ANALYSIS) {
      requireLowLatency = true;
    }
    
    // Use the orchestrator to select the model
    const { provider, modelId } = orchestrator.selectModelForAnalysis(
      analysisType,
      providerType,
      estimatedTokens,
      requireLowLatency,
      xPreferredModel
    );
```

#### Lógica de Selección Inteligente

**Factores considerados**:
1. **Tipo de análisis**: Diferentes modelos para diferentes tareas
2. **Tokens estimados**: Modelos con contexto suficiente
3. **Latencia requerida**: Modelos rápidos para análisis en tiempo real
4. **Modelo preferido**: Override manual si se especifica
5. **Costo**: Optimización automática de costo/beneficio

**Ejemplos de selección**:
```typescript
// Análisis de alerta - requiere baja latencia
selectModelForAnalysis(AnalysisType.ALERT_ANALYSIS, AIModelType.AUTO, 2000, true)
// → gpt-4o-mini (rápido y eficiente)

// Análisis de logs grandes - contexto grande
selectModelForAnalysis(AnalysisType.LOG_PATTERN_DETECTION, AIModelType.AUTO, 50000, false)
// → gemini-1.5-pro (contexto de 2M tokens)

// Correlación compleja - máxima calidad
selectModelForAnalysis(AnalysisType.INCIDENT_CORRELATION, AIModelType.ANTHROPIC, 10000, false)
// → claude-3-opus (máxima capacidad)
```

### 7. Análisis Avanzados Especializados

#### Análisis de Patrones en Logs
```typescript
export async function analyzeLogPatterns(
  logEntries: string[],
  timeWindow: { start: Date; end: Date },
  modelType?: AIModelType
): Promise<AiInsight | null> {
  try {
    // Estimate tokens based on log content
    const estimatedTokens = logEntries.join('\n').length / 4; // Rough estimation
    
    const selectedModel = selectModelForAnalysis(
      AnalysisType.LOG_PATTERN_DETECTION,
      modelType,
      estimatedTokens,
      false // Log analysis doesn't require low latency
    );
    
    const prompt = `
    Analyze the following log entries for suspicious patterns, anomalies, or security indicators:
    
    Time Window: ${timeWindow.start.toISOString()} to ${timeWindow.end.toISOString()}
    
    Log Entries:
    ${logEntries.slice(0, 100).join('\n')} // Limit for token management
    
    Identify:
    1. Suspicious access patterns
    2. Potential attack signatures
    3. Anomalous user behavior
    4. System misconfigurations
    5. Failed authentication clusters
    6. Data exfiltration indicators
    
    Consider MITRE ATT&CK techniques and provide actionable insights.
    `;
```

**Características del análisis de logs**:
- **Gestión de tokens**: Estimación automática y limitación
- **Ventana temporal**: Contexto temporal para el análisis
- **Patrones específicos**: Búsqueda de indicadores de seguridad
- **MITRE ATT&CK**: Mapeo a técnicas conocidas

#### Análisis de Tráfico de Red
```typescript
export async function analyzeNetworkTraffic(
  trafficData: {
    sourceIp: string;
    destinationIp: string;
    port: number;
    protocol: string;
    bytes: number;
    timestamp: Date;
    payload?: string;
  }[],
  modelType?: AIModelType
): Promise<AiInsight | null> {
  try {
    const estimatedTokens = trafficData.length * 50; // Estimate tokens per traffic entry
    
    const selectedModel = selectModelForAnalysis(
      AnalysisType.NETWORK_TRAFFIC_ANALYSIS,
      modelType,
      estimatedTokens,
      false
    );
    
    const trafficSummary = trafficData.map(traffic => 
      `${traffic.timestamp.toISOString()}: ${traffic.sourceIp}:${traffic.port} -> ${traffic.destinationIp} (${traffic.protocol}, ${traffic.bytes} bytes)`
    ).join('\n');
    
    const prompt = `
    Analyze this network traffic for security threats and anomalies:
    
    Traffic Data:
    ${trafficSummary}
    
    Identify:
    1. Unusual traffic patterns
    2. Potential C2 communication
    3. Data exfiltration attempts
    4. Port scanning activities
    5. DDoS patterns
    6. Lateral movement indicators
    
    Consider network-based MITRE ATT&CK techniques.
    `;
```

**Análisis de tráfico especializado**:
- **Estructuras de datos**: Objetos complejos con metadatos de red
- **Estimación precisa**: Tokens por entrada de tráfico
- **Patrones de red**: C2, exfiltración, movimiento lateral
- **Protocolos**: Análisis por protocolo específico

#### Detección de Anomalías
```typescript
export async function detectAnomalies(
  historicalData: any[],
  currentData: any[],
  dataType: 'user_behavior' | 'system_metrics' | 'network_patterns' | 'application_logs',
  modelType?: AIModelType
): Promise<AiInsight | null> {
  try {
    const estimatedTokens = (historicalData.length + currentData.length) * 20;
    
    const selectedModel = selectModelForAnalysis(
      AnalysisType.ANOMALY_DETECTION,
      modelType,
      estimatedTokens,
      false
    );
    
    const prompt = `
    Perform anomaly detection analysis:
    
    Data Type: ${dataType}
    Historical Baseline (last 30 days):
    ${JSON.stringify(historicalData.slice(-50), null, 2)}
    
    Current Data (last 24 hours):
    ${JSON.stringify(currentData.slice(-20), null, 2)}
    
    Identify:
    1. Statistical anomalies
    2. Behavioral deviations
    3. Pattern breaks
    4. Outliers and edge cases
    5. Temporal anomalies
    6. Correlation anomalies
    
    Provide confidence scores and risk assessment.
    `;
```

**Detección de anomalías multi-tipo**:
- **Tipos de datos**: Comportamiento, métricas, red, logs
- **Análisis temporal**: Baseline histórico vs datos actuales
- **Múltiples algoritmos**: Estadístico, comportamental, temporal
- **Confidence scores**: Nivel de confianza en la detección

### 8. Validación Avanzada con Esquemas

#### Uso de Esquemas Zod Específicos
```typescript
// En lugar de validación manual, usar esquemas predefinidos
const response = await orchestrator.generateWithValidation(
  selectedModel.type,
  selectedModel.name,
  prompt,
  AlertInsightResponseSchema // Esquema específico para insights de alertas
);

// O para correlación de incidentes
const correlationResponse = await orchestrator.generateWithValidation(
  selectedModel.type,
  selectedModel.name,
  correlationPrompt,
  IncidentCorrelationResponseSchema // Esquema específico para correlación
);
```

#### Parse y Retry Inteligente
```typescript
// Sistema de reintento con validación
const validatedResponse = await parseOrRetry(
  rawResponse,
  AlertInsightResponseSchema,
  {
    maxRetries: 3,
    fallbackValues: {
      severity: 'medium',
      confidence: 0.5,
      status: 'new'
    }
  }
);
```

**Características avanzadas**:
- **Esquemas específicos**: Validación por tipo de análisis
- **Retry logic**: Reintentos automáticos si falla validación
- **Fallback values**: Valores por defecto para campos requeridos
- **Type safety**: Garantías de tipo en compile-time y runtime

### 9. Optimización de Costos y Performance

#### Selección Basada en Costo
```typescript
// Algoritmo que considera costo por token
function selectCostOptimalModel(
  analysisType: AnalysisType,
  estimatedTokens: number,
  qualityThreshold: number = 0.8
): AIModel {
  const capableModels = AVAILABLE_MODELS.filter(model => 
    model.capabilities.includes(analysisType)
  );
  
  // Calcular costo total estimado
  const modelsWithCost = capableModels.map(model => ({
    ...model,
    totalCost: model.costPerToken * estimatedTokens,
    qualityScore: getModelQualityScore(model, analysisType)
  }));
  
  // Filtrar por calidad mínima
  const qualityModels = modelsWithCost.filter(model => 
    model.qualityScore >= qualityThreshold
  );
  
  // Seleccionar el más barato que cumple calidad
  return qualityModels.sort((a, b) => a.totalCost - b.totalCost)[0];
}
```

#### Caché de Respuestas
```typescript
// Sistema de caché para evitar llamadas repetitivas
const cacheKey = `${analysisType}_${hashInput(inputData)}`;
const cachedResult = await cacheManager.get(cacheKey);

if (cachedResult) {
  return cachedResult;
}

const result = await performAnalysis(inputData);
await cacheManager.set(cacheKey, result, { ttl: 3600 }); // 1 hora TTL
return result;
```

### 10. Configuración de Producción

#### Variables de Entorno Multi-Proveedor
```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o

# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Google Configuration
GOOGLE_API_KEY=your-google-api-key
GOOGLE_MODEL=gemini-1.5-pro

# Advanced Configuration
AI_PROVIDER_PRIORITY=anthropic,openai,google
AI_COST_OPTIMIZATION=true
AI_QUALITY_THRESHOLD=0.8
AI_MAX_RETRIES=3
AI_CACHE_TTL=3600
```

#### Inicialización Completa
```typescript
// En index.ts
import { 
  initializeOpenAI, 
  initializeAnthropic, 
  initializeGoogle 
} from './advanced-ai-service';

// Inicializar múltiples proveedores
const providers = [];

if (process.env.OPENAI_API_KEY) {
  providers.push('OpenAI');
  initializeOpenAI(process.env.OPENAI_API_KEY);
}

if (process.env.ANTHROPIC_API_KEY) {
  providers.push('Anthropic');
  initializeAnthropic(process.env.ANTHROPIC_API_KEY);
}

if (process.env.GOOGLE_API_KEY) {
  providers.push('Google');
  initializeGoogle(process.env.GOOGLE_API_KEY);
}

console.log(`Initialized AI providers: ${providers.join(', ')}`);
```

## Beneficios del Sistema Avanzado

### 1. Redundancia y Disponibilidad
- **Múltiples proveedores**: Si uno falla, otros continúan
- **Failover automático**: Cambio automático entre proveedores
- **Rate limiting protection**: Distribución de carga

### 2. Optimización Inteligente
- **Selección automática**: Mejor modelo para cada tarea
- **Costo/beneficio**: Optimización de costos automática
- **Performance**: Latencia optimizada según necesidad

### 3. Capacidades Especializadas
- **Análisis específicos**: Logs, red, anomalías
- **Modelos especializados**: Claude para análisis complejos, GPT-4o para velocidad
- **Contexto masivo**: Gemini para análisis de grandes volúmenes

### 4. Robustez y Validación
- **Esquemas Zod**: Validación estricta de respuestas
- **Retry logic**: Recuperación automática de errores
- **Fallback values**: Degradación elegante

---

Este sistema avanzado de IA proporciona una **plataforma robusta, escalable y optimizada** para análisis de seguridad de última generación, aprovechando lo mejor de cada proveedor de IA disponible.