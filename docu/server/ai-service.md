# Documentación del Servidor Backend - ai-service.ts

## Propósito

El archivo `ai-service.ts` implementa el **servicio básico de inteligencia artificial** del SOC, proporcionando:

- Análisis automático de alertas de seguridad usando OpenAI GPT-4
- Correlación de alertas para detección de incidentes
- Análisis de inteligencia de amenazas (Threat Intelligence)
- Generación de recomendaciones de seguridad estratégicas
- Validación y formateo de respuestas de IA
- Gestión centralizada del cliente OpenAI

## Estructura del Archivo

### 1. Imports y Tipos

#### OpenAI SDK
```typescript
import OpenAI from "openai";
```

**Funcionalidades**:
- Client oficial de OpenAI para Node.js
- Support para GPT-4, GPT-3.5, y otros modelos
- Streaming y non-streaming responses
- Structured outputs con JSON mode

#### Tipos del Schema
```typescript
import { 
  InsertAiInsight, 
  Alert, 
  Incident, 
  ThreatIntel, 
  AiInsight, 
  SeverityTypes 
} from "@shared/schema";
```

**Entidades manejadas**:
- **Alert**: Alertas de seguridad del SOC
- **Incident**: Incidentes correlacionados 
- **ThreatIntel**: Inteligencia de amenazas
- **AiInsight**: Insights generados por IA
- **SeverityTypes**: Enum para niveles de severidad

### 2. Gestión del Cliente OpenAI

#### Variable de Estado Global
```typescript
let openAiClient: OpenAI | null = null;
```

**Patrón Singleton**:
- Una instancia global del cliente OpenAI
- Inicialización lazy (solo cuando se necesita)
- Null indica no configurado

#### Inicialización del Cliente
```typescript
export function initializeOpenAI(apiKey: string) {
  try {
    openAiClient = new OpenAI({ apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    return false;
  }
}
```

**Características**:
- **Error Handling**: Try-catch con logging
- **Boolean Return**: `true` si éxito, `false` si error
- **Configuration**: Usa API key proporcionada
- **Global State**: Actualiza variable global

#### Verificación de Configuración
```typescript
export function isOpenAIConfigured(): boolean {
  return openAiClient !== null;
}
```

**Uso típico**:
```typescript
if (isOpenAIConfigured()) {
  const insight = await generateAlertInsight(alert);
} else {
  console.log("OpenAI not configured, skipping AI analysis");
}
```

#### Helper de Seguridad
```typescript
function ensureOpenAIClient(): OpenAI {
  if (!openAiClient) {
    throw new Error("OpenAI client is not initialized. Please set API key first.");
  }
  return openAiClient;
}
```

**Propósito**:
- **Fail Fast**: Error inmediato si no configurado
- **Type Safety**: Garantiza non-null client
- **Clear Error**: Mensaje descriptivo para debugging

### 3. Análisis de Alertas

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
```

#### Estructura del Prompt

**Contexto de la Alerta**:
- **Alert Title**: Título descriptivo
- **Description**: Descripción detallada del evento
- **Severity**: Nivel de gravedad
- **Source/IPs**: Información de red y origen

**Análisis Solicitado**:
1. **Threat Actors**: Posibles grupos de amenaza
2. **MITRE ATT&CK**: Técnicas y tácticas relevantes
3. **Recommended Actions**: Acciones específicas a tomar
4. **Risk Assessment**: Evaluación del riesgo

**Formato Estructurado**:
- **JSON Response**: Formato consistente para parsing
- **Campos obligatorios**: title, description, type, severity
- **Campos opcionales**: confidence, relatedEntities

#### Configuración del Modelo
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
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
```

**Configuración detallada**:

**model: "gpt-4o"**:
- Modelo más reciente y capaz de OpenAI
- Mejor comprensión de contexto y precisión
- Optimizado para tareas complejas de análisis

**System Prompt**:
- Define el rol del asistente como experto en ciberseguridad
- Enfatiza insights accionables y precisos
- Establece el contexto profesional

**response_format: "json_object"**:
- Fuerza respuesta en formato JSON válido
- Facilita parsing automático
- Reduce errores de formato

#### Validación y Procesamiento
```typescript
const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");

// Validate the severity from the response
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
```

**Validación robusta**:
- **JSON Parsing**: Try-catch implícito con fallback
- **Severity Validation**: Usa Zod schema para validar
- **Default Values**: Fallbacks para campos opcionales
- **Type Consistency**: Asegura tipos correctos

### 4. Correlación de Alertas

```typescript
export async function correlateAlerts(alerts: Alert[]): Promise<Incident | null> {
  if (alerts.length === 0) return null;
  
  try {
    const openai = ensureOpenAIClient();
    
    const alertSummaries = alerts.map(alert => 
      `- ID: ${alert.id}, Title: ${alert.title}, Severity: ${alert.severity}, Source: ${alert.source}, IPs: ${alert.sourceIp || 'N/A'} → ${alert.destinationIp || 'N/A'}`
    ).join("\n");
```

#### Preparación de Datos
**Alert Summaries**:
- Formato conciso de cada alerta
- Información clave: ID, título, severidad, fuente, IPs
- Join con newlines para legibilidad

**Prompt para Correlación**:
```typescript
const prompt = `
Analyze these related security alerts and determine if they represent a coordinated incident:

${alertSummaries}

Consider:
1. Timeline correlation
2. Common indicators (IPs, domains, file hashes)
3. Attack patterns and techniques
4. Potential campaign or threat actor

If these alerts appear to be related, create an incident report.
Format your response as JSON...
`;
```

#### Análisis de Correlación
**Factores considerados**:
1. **Timeline**: Correlación temporal de eventos
2. **Common IoCs**: Indicadores compartidos
3. **Attack Patterns**: Patrones de ataque reconocibles
4. **Threat Actor**: Attribution a grupos conocidos

### 5. Análisis de Threat Intelligence

```typescript
export async function analyzeThreatIntel(intel: ThreatIntel): Promise<InsertAiInsight | null> {
  try {
    const openai = ensureOpenAIClient();
    
    const prompt = `
    Analyze this threat intelligence and provide actionable insights:
    
    Title: ${intel.title}
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
    `;
```

#### Enfoque en Actionability
**Análisis solicitado**:
1. **Impact Assessment**: Cómo afecta a la organización específica
2. **Defensive Recommendations**: Controles y mitigaciones
3. **Detection Strategies**: Reglas y queries de detección
4. **Threat Landscape**: Relevancia en el contexto actual

**System Prompt especializado**:
```typescript
{
  role: "system",
  content: "You are a threat intelligence analyst specializing in actionable intelligence. Provide detailed analysis and defensive recommendations."
}
```

### 6. Generación de Recomendaciones de Seguridad

```typescript
export async function generateSecurityRecommendations(
  recentAlerts: Alert[],
  recentIncidents: Incident[]
): Promise<AiInsight | null> {
```

#### Análisis Contextual
**Input Data Processing**:
```typescript
const alertSummary = recentAlerts.slice(0, 5).map(alert => 
  `- ${alert.title} (${alert.severity}): ${alert.description.substring(0, 100)}...`
).join("\n");

const incidentSummary = recentIncidents.slice(0, 3).map(incident => 
  `- ${incident.title} (${incident.severity}): ${incident.description.substring(0, 100)}...`
).join("\n");
```

**Características**:
- **Limited Scope**: Solo alertas/incidentes más recientes
- **Truncated Descriptions**: 100 caracteres para brevedad
- **Structured Format**: Formato consistente para el análisis

#### Strategic Recommendations
```typescript
const prompt = `
Based on the following recent security events, provide strategic security recommendations:

Recent Alerts:
${alertSummary || "No recent alerts"}

Recent Incidents:
${incidentSummary || "No recent incidents"}

Generate comprehensive security recommendations to improve the organization's security posture.
Consider gaps in controls, emerging threats relevant to the observed patterns, and prioritized actions.
`;
```

**Enfoque estratégico**:
- **Gap Analysis**: Identifica brechas en controles
- **Emerging Threats**: Considera amenazas emergentes
- **Prioritized Actions**: Acciones priorizadas por impacto

## Patrones de Diseño Implementados

### 1. Error Handling Consistent
```typescript
try {
  // AI operation
  return result;
} catch (error) {
  console.error("Error in AI operation:", error);
  return null;
}
```

**Características**:
- **Graceful Degradation**: Retorna null en error
- **Detailed Logging**: Error completo para debugging
- **Non-blocking**: No interrumpe flujo principal

### 2. Validation Pattern
```typescript
let severity = jsonResponse.severity || "medium";
if (!SeverityTypes.safeParse(severity).success) {
  severity = "medium";
}
```

**Robustez**:
- **Schema Validation**: Usa Zod para validar tipos
- **Safe Fallbacks**: Default values para campos inválidos
- **Type Safety**: Garantiza tipos correctos

### 3. Structured Prompting
```typescript
const prompt = `
Context: ${data}

Analysis Required:
1. Point 1
2. Point 2
3. Point 3

Format: JSON with fields...
`;
```

**Beneficios**:
- **Consistent Structure**: Misma estructura en todos los prompts
- **Clear Instructions**: Instrucciones específicas para IA
- **JSON Enforcement**: Formato estructurado para parsing

## Configuración y Uso

### Inicialización en startup
```typescript
// En index.ts o configuración inicial
import { initializeOpenAI } from './ai-service';

if (process.env.OPENAI_API_KEY) {
  const success = initializeOpenAI(process.env.OPENAI_API_KEY);
  if (success) {
    console.log('AI services initialized successfully');
  } else {
    console.warn('Failed to initialize AI services');
  }
}
```

### Uso en Routes
```typescript
// En routes.ts
import { generateAlertInsight, correlateAlerts } from './ai-service';

app.post('/api/alerts/:id/analyze', async (req, res) => {
  const alert = await storage.getAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  
  const insight = await generateAlertInsight(alert);
  if (insight) {
    const savedInsight = await storage.createAiInsight({
      ...insight,
      alertId: alert.id,
      organizationId: alert.organizationId
    });
    res.json(savedInsight);
  } else {
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});
```

### Variables de Entorno
```bash
# Required for AI functionality
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional: Custom model (defaults to gpt-4o)
OPENAI_MODEL=gpt-4o
```

## Consideraciones de Costos

### Token Usage Optimization
- **Prompt Engineering**: Prompts concisos pero específicos
- **Context Limiting**: Solo información relevante
- **Model Selection**: GPT-4o para balance calidad/costo

### Batch Processing
```typescript
// Procesar múltiples alertas de forma eficiente
const insights = await Promise.all(
  alerts.map(alert => generateAlertInsight(alert))
);
const validInsights = insights.filter(insight => insight !== null);
```

### Rate Limiting
- OpenAI tiene límites de rate por API key
- Considerar queue system para volumen alto
- Retry logic para errores temporales

## Security Considerations

### API Key Protection
```typescript
// ✅ Correcto: API key en variable de entorno
const apiKey = process.env.OPENAI_API_KEY;

// ❌ Incorrecto: API key hardcoded
const apiKey = "sk-...";
```

### Data Privacy
- Alertas pueden contener información sensible
- OpenAI terms of service para data retention
- Considerar modelos on-premise para alta sensibilidad

### Input Sanitization
```typescript
// Sanitizar inputs antes de enviar a OpenAI
const sanitizedDescription = alert.description
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')  // Replace IPs
  .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'); // Replace emails
```

---

Este servicio de IA proporciona **análisis inteligente y automatizado** de eventos de seguridad, mejorando significativamente la capacidad de detección y respuesta del SOC.