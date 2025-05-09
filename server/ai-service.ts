import OpenAI from "openai";
import { 
  InsertAiInsight, 
  Alert, 
  Incident, 
  ThreatIntel, 
  AiInsight, 
  SeverityTypes 
} from "@shared/schema";

let openAiClient: OpenAI | null = null;

// Initialize OpenAI client
export function initializeOpenAI(apiKey: string) {
  try {
    openAiClient = new OpenAI({ apiKey });
    return true;
  } catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    return false;
  }
}

// Check if OpenAI is configured
export function isOpenAIConfigured(): boolean {
  return openAiClient !== null;
}

// Helper function to ensure OpenAI is configured
function ensureOpenAIClient(): OpenAI {
  if (!openAiClient) {
    throw new Error("OpenAI client is not initialized. Please set API key first.");
  }
  return openAiClient;
}

/**
 * Generate insights for an alert using OpenAI
 */
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
  } catch (error) {
    console.error("Error generating alert insight:", error);
    return null;
  }
}

/**
 * Correlate alerts to identify potential incidents
 */
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
      return null;
    }
    
    // Validate the severity from the response
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    return {
      title: jsonResponse.title,
      description: jsonResponse.description,
      severity: severity, 
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

/**
 * Analyze threat intelligence data
 */
export async function analyzeThreatIntel(intel: ThreatIntel): Promise<AiInsight | null> {
  try {
    const openai = ensureOpenAIClient();
    
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

    const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate the severity from the response
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    return {
      title: jsonResponse.title,
      type: jsonResponse.type || "threat_intel_analysis",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: jsonResponse.confidence || 0.7,
      relatedEntities: jsonResponse.relatedEntities || []
    };
  } catch (error) {
    console.error("Error analyzing threat intel:", error);
    return null;
  }
}

/**
 * Generate security recommendations based on the current security posture
 */
export async function generateSecurityRecommendations(
  recentAlerts: Alert[],
  recentIncidents: Incident[]
): Promise<AiInsight | null> {
  try {
    const openai = ensureOpenAIClient();
    
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
      "status": "new"
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

    const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate the severity from the response
    let severity = jsonResponse.severity || "medium";
    if (!SeverityTypes.safeParse(severity).success) {
      severity = "medium";
    }
    
    return {
      title: jsonResponse.title,
      type: "security_recommendations",
      description: jsonResponse.description,
      severity: severity,
      status: "new",
      confidence: jsonResponse.confidence || 0.8,
      relatedEntities: jsonResponse.relatedEntities || []
    };
  } catch (error) {
    console.error("Error generating security recommendations:", error);
    return null;
  }
}