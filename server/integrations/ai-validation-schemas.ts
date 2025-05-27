/**
 * AI Response Validation Schemas
 * 
 * This module provides Zod schemas for validating the responses from AI models
 * to ensure they conform to the expected structure before being used in the application.
 */

import { z } from "zod";
import { SeverityTypes } from "@shared/schema";

/**
 * Base schema for AI responses
 */
export const BaseAiResponseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  severity: SeverityTypes,
  confidence: z.number().min(0).max(1).default(0.7)
});

/**
 * Schema for alert analysis responses
 */
export const AlertInsightResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("alert_analysis"),
  relatedEntities: z.array(z.string()).default([])
});

/**
 * Schema for incident correlation responses
 */
export const IncidentCorrelationResponseSchema = BaseAiResponseSchema.extend({
  status: z.string().default("new"),
  relatedAlerts: z.array(z.number()).optional(),
  timeline: z.array(z.object({
    timestamp: z.string(),
    description: z.string()
  })).optional(),
  aiAnalysis: z.object({
    attackPattern: z.string().optional(),
    recommendations: z.array(z.string()).optional(),
    riskAssessment: z.string().optional(),
    mitreTactics: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).optional()
  }).optional()
});

/**
 * Schema for threat intel analysis responses
 */
export const ThreatIntelResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("threat_intel_analysis"),
  relatedEntities: z.array(z.string()).default([]),
  status: z.string().default("new")
});

/**
 * Schema for log pattern detection responses
 */
export const LogPatternResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("log_pattern_detection"),
  relatedEntities: z.array(z.string()).default([]),
  patterns: z.array(z.object({
    pattern: z.string(),
    occurences: z.number().optional(),
    significance: z.string().optional(),
    recommendation: z.string().optional()
  })).default([]),
  status: z.string().default("new")
});

/**
 * Schema for network traffic analysis responses
 */
export const NetworkAnalysisResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("network_traffic_analysis"),
  relatedEntities: z.array(z.string()).default([]),
  trafficPatterns: z.array(z.object({
    pattern: z.string(),
    indicators: z.array(z.string()).optional(),
    significance: z.string().optional(),
    recommendation: z.string().optional()
  })).default([]),
  status: z.string().default("new")
});

/**
 * Schema for anomaly detection responses
 */
export const AnomalyDetectionResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("anomaly_detection"),
  relatedEntities: z.array(z.string()).default([]),
  anomalies: z.array(z.object({
    timepoint: z.string(),
    description: z.string(),
    deviation: z.string().optional(),
    significance: z.string().optional(),
    recommendation: z.string().optional()
  })).default([]),
  status: z.string().default("new")
});

/**
 * Schema for security recommendation responses
 */
export const SecurityRecommendationResponseSchema = BaseAiResponseSchema.extend({
  type: z.literal("security_recommendations"),
  relatedEntities: z.array(z.string()).default([]),
  status: z.string().default("new"),
  actionItems: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    title: z.string(),
    description: z.string()
  })).default([])
});