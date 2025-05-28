/**
 * Anomaly detection service for the SOC platform
 * 
 * This module provides functionality to detect anomalies in time series data
 * using statistical and ML approaches.
 */

import { log } from "../vite";
import { AiInsight, SeverityTypes } from "@shared/schema";
import { orchestrator, ProviderType } from "./llm";
import { detectAnomalies } from "../advanced-ai-service";

/**
 * Interface for metrics data to be analyzed
 */
export interface MetricsData {
  hostId: string;
  timestamp: Date;
  metrics: Record<string, number>;
  tags?: Record<string, string>;
}

/**
 * Result of anomaly detection
 */
export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  metrics: string[];
  explanation?: string;
}

/**
 * Simple anomaly detection service using statistical methods
 * 
 * In a real implementation, this would connect to a Python service
 * using PyOD or other ML libraries.
 */
export class AnomalyDetector {
  private static instance: AnomalyDetector;
  
  // Historical data for establishing baselines
  private historicalData: Map<string, MetricsData[]> = new Map();
  // Detection thresholds
  private sensitivityThreshold: number = 0.85; // 0-1 range, higher = more sensitive
  
  private constructor() {
    log("Anomaly Detector initialized", "anomaly-detector");
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): AnomalyDetector {
    if (!AnomalyDetector.instance) {
      AnomalyDetector.instance = new AnomalyDetector();
    }
    return AnomalyDetector.instance;
  }
  
  /**
   * Configure the detector
   */
  public configure(config: { sensitivityThreshold?: number }): void {
    if (config.sensitivityThreshold !== undefined) {
      this.sensitivityThreshold = config.sensitivityThreshold;
    }
    
    log(`Anomaly Detector configured with sensitivity: ${this.sensitivityThreshold}`, "anomaly-detector");
  }
  
  /**
   * Add metrics data to historical baseline
   */
  public addMetricsData(data: MetricsData): void {
    if (!this.historicalData.has(data.hostId)) {
      this.historicalData.set(data.hostId, []);
    }
    
    const hostData = this.historicalData.get(data.hostId)!;
    
    // Keep only the last 1000 data points for each host
    if (hostData.length >= 1000) {
      hostData.shift();
    }
    
    hostData.push(data);
  }
  
  /**
   * Clear historical data (for testing or reset)
   */
  public clearHistoricalData(): void {
    this.historicalData.clear();
    log("Anomaly Detector historical data cleared", "anomaly-detector");
  }
  
  /**
   * Detect anomalies in the provided metrics data
   */
  public async detectAnomalies(data: MetricsData): Promise<AnomalyResult> {
    const hostData = this.historicalData.get(data.hostId) || [];
    
    // If we don't have enough data, can't detect anomalies yet
    if (hostData.length < 10) {
      return {
        isAnomaly: false,
        score: 0,
        metrics: [],
        explanation: "Insufficient historical data for anomaly detection"
      };
    }
    
    // Analyze each metric
    const anomalousMetrics: string[] = [];
    let maxScore = 0;
    
    for (const [metricName, metricValue] of Object.entries(data.metrics)) {
      const historicalValues = hostData
        .filter(d => d.metrics[metricName] !== undefined)
        .map(d => d.metrics[metricName]);
      
      if (historicalValues.length < 5) continue;
      
      // Simple statistical anomaly detection
      const { mean, stdDev } = this.calculateStats(historicalValues);
      const zScore = Math.abs((metricValue - mean) / stdDev);
      
      // A z-score of 3 or more is generally considered an anomaly
      // But we adjust based on sensitivity threshold
      const anomalyThreshold = 3 * (1 - this.sensitivityThreshold);
      
      if (zScore > anomalyThreshold) {
        anomalousMetrics.push(metricName);
        maxScore = Math.max(maxScore, Math.min(1, zScore / 10));
      }
    }
    
    const isAnomaly = anomalousMetrics.length > 0;
    
    if (isAnomaly) {
      log(`Anomaly detected for host ${data.hostId} with score ${maxScore.toFixed(2)}`, "anomaly-detector");
    }
    
    return {
      isAnomaly,
      score: maxScore,
      metrics: anomalousMetrics,
      explanation: isAnomaly 
        ? `Unusual values detected in metrics: ${anomalousMetrics.join(', ')}`
        : "No anomalies detected"
    };
  }
  
  /**
   * Generate an AI insight for detected anomalies
   */
  public async generateAnomalyInsight(
    hostId: string,
    anomalyResults: AnomalyResult[]
  ): Promise<AiInsight> {
    if (anomalyResults.length === 0) {
      return {
        title: "No anomalies detected",
        type: "anomaly_detection",
        description: "No anomalies detected in the recent metrics",
        severity: "low",
        status: "new",
        confidence: 1.0,
        relatedEntities: [hostId],
        anomalies: []
      };
    }
    
    // Use LLM to analyze the anomalies
    try {
      const hostData = this.historicalData.get(hostId) || [];
      
      // Prepare data for the AI
      const anomaliesData = anomalyResults
        .filter(result => result.isAnomaly)
        .map(result => ({
          timestamp: new Date().toISOString(),
          metrics: result.metrics,
          score: result.score,
          explanation: result.explanation
        }));
        
      // Get some sample metrics for context
      const sampleMetrics = hostData.slice(-5).map(data => ({
        timestamp: data.timestamp.toISOString(),
        metrics: data.metrics
      }));
      
      // Use the advanced-ai-service
      const aiInsight = await detectAnomalies(
        [JSON.stringify(anomaliesData, null, 2)],
        {
          host: hostId,
          sampleMetrics: JSON.stringify(sampleMetrics, null, 2)
        }
      );
      
      if (aiInsight) {
        return aiInsight;
      }
      
      // Fallback if AI service fails
      return this.createBasicInsight(hostId, anomalyResults);
    } catch (error) {
      log(`Error generating AI insight for anomalies: ${error.message}`, "anomaly-detector");
      return this.createBasicInsight(hostId, anomalyResults);
    }
  }
  
  /**
   * Create a basic insight without AI
   */
  private createBasicInsight(hostId: string, anomalyResults: AnomalyResult[]): AiInsight {
    const highestScore = Math.max(...anomalyResults.map(r => r.score));
    
    // Determine severity based on anomaly score
    let severity: SeverityTypes;
    if (highestScore > 0.8) severity = "critical";
    else if (highestScore > 0.6) severity = "high";
    else if (highestScore > 0.4) severity = "medium";
    else severity = "low";
    
    // Collect all anomalous metrics
    const allMetrics = new Set<string>();
    anomalyResults.forEach(result => {
      result.metrics.forEach(metric => allMetrics.add(metric));
    });
    
    return {
      title: `Anomalies detected on host ${hostId}`,
      type: "anomaly_detection",
      description: `Statistical anomalies detected in the following metrics: ${Array.from(allMetrics).join(', ')}`,
      severity,
      status: "new",
      confidence: highestScore,
      relatedEntities: [hostId],
      anomalies: anomalyResults.filter(r => r.isAnomaly).map(result => ({
        timepoint: new Date().toISOString(),
        description: result.explanation || "Anomaly detected",
        deviation: `Score: ${result.score.toFixed(2)}`,
        significance: "Detected by statistical analysis",
        recommendation: "Investigate unusual activity on this host"
      }))
    };
  }
  
  /**
   * Calculate basic statistics for an array of values
   */
  private calculateStats(values: number[]): { mean: number; stdDev: number } {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return { mean, stdDev };
  }
}

// Export singleton instance
export const anomalyDetector = AnomalyDetector.getInstance();