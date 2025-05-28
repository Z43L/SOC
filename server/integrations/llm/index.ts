// Export all LLM-related components
export * from './llm-provider.interface';
export * from './llm-orchestrator';
export * from './llm-validation';
export * from './llm-metrics';
export * from './openai-provider';
export * from './anthropic-provider';
export * from './gemini-provider';

// Export the main orchestrator instance
import { LLMOrchestrator } from './llm-orchestrator';
import { LLMMetricsPersistence } from './llm-metrics';

// Create and configure the orchestrator
const orchestrator = new LLMOrchestrator();
const metricsPersistence = new LLMMetricsPersistence();
orchestrator.setMetricsPersistence(metricsPersistence);

export { orchestrator };