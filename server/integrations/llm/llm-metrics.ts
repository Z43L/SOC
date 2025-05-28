import { CompletionMetrics } from './llm-provider.interface';
import { MetricsPersistence } from './llm-orchestrator';
import { storage } from '../../storage';
import { log } from '../../vite';

/**
 * Implementation of metrics persistence for LLM usage
 */
export class LLMMetricsPersistence implements MetricsPersistence {
  // In-memory cache for recent metrics
  private recentMetrics: CompletionMetrics[] = [];
  private lastPersistTime: number = Date.now();
  private persistInterval: number = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Save metrics from an LLM call
   */
  async saveMetrics(metrics: CompletionMetrics): Promise<void> {
    // Add to in-memory cache
    this.recentMetrics.push(metrics);
    
    // Check if it's time to persist to database
    const now = Date.now();
    if (now - this.lastPersistTime > this.persistInterval) {
      await this.persistMetrics();
      this.lastPersistTime = now;
    }
  }
  
  /**
   * Persist metrics to database
   */
  private async persistMetrics(): Promise<void> {
    if (this.recentMetrics.length === 0) {
      return;
    }
    
    try {
      // In a real implementation, you would batch insert these metrics
      // For now, we'll just log them
      log(`Persisting ${this.recentMetrics.length} LLM metrics records`, 'llm-metrics');
      
      // TODO: Implement actual persistence using storage API
      // For now, we'll keep it in memory
      
      // Clear the cache after persistence
      this.recentMetrics = [];
    } catch (error) {
      log(`Error persisting LLM metrics: ${error.message}`, 'llm-metrics');
    }
  }
  
  /**
   * Get average latency for a model
   */
  async getAverageLatency(modelId: string): Promise<number> {
    // Check in-memory cache first
    const relevantMetrics = this.recentMetrics.filter(m => m.model === modelId);
    
    if (relevantMetrics.length > 0) {
      const totalLatency = relevantMetrics.reduce((sum, m) => sum + m.latencyMs, 0);
      return totalLatency / relevantMetrics.length;
    }
    
    // TODO: Query from database if not in memory
    return 0;
  }
  
  /**
   * Get total tokens processed by a model
   */
  async getTotalTokensProcessed(modelId: string): Promise<{ input: number, output: number }> {
    // Check in-memory cache
    const relevantMetrics = this.recentMetrics.filter(m => m.model === modelId);
    
    let inputTokens = 0;
    let outputTokens = 0;
    
    for (const metric of relevantMetrics) {
      inputTokens += metric.inputTokens;
      outputTokens += metric.outputTokens;
    }
    
    // TODO: Add database query for historical data
    
    return { input: inputTokens, output: outputTokens };
  }
  
  /**
   * Get total cost for a model
   */
  async getTotalCost(modelId: string): Promise<number> {
    // Check in-memory cache
    const relevantMetrics = this.recentMetrics.filter(m => m.model === modelId);
    const totalCost = relevantMetrics.reduce((sum, m) => sum + m.cost, 0);
    
    // TODO: Add database query for historical data
    
    return totalCost;
  }
}