import { AnalysisType } from '../../advanced-ai-service';
import { LLMProvider, CompletionOptions, CompletionResult, LLMModelInfo, CompletionMetrics } from './llm-provider.interface';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { log } from '../../vite';

/**
 * Provider types supported by the orchestrator
 */
export enum ProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AUTO = 'auto'
}

/**
 * Interface for metrics persistence
 */
export interface MetricsPersistence {
  saveMetrics(metrics: CompletionMetrics): Promise<void>;
  getAverageLatency(modelId: string): Promise<number>;
  getTotalTokensProcessed(modelId: string): Promise<{ input: number, output: number }>;
  getTotalCost(modelId: string): Promise<number>;
}

/**
 * Main LLM orchestrator that manages multiple providers
 */
export class LLMOrchestrator {
  private providers: Map<ProviderType, LLMProvider> = new Map();
  private metricsPersistence: MetricsPersistence | null = null;
  
  /**
   * Initialize the orchestrator with available providers
   */
  constructor() {
    // Register providers
    this.providers.set(ProviderType.OPENAI, new OpenAIProvider());
    this.providers.set(ProviderType.ANTHROPIC, new AnthropicProvider());
    this.providers.set(ProviderType.GOOGLE, new GeminiProvider());
    
    log('LLM Orchestrator initialized with providers: ' + 
        Array.from(this.providers.keys()).join(', '), 'llm-orchestrator');
  }
  
  /**
   * Set the metrics persistence service
   */
  setMetricsPersistence(persistence: MetricsPersistence): void {
    this.metricsPersistence = persistence;
  }
  
  /**
   * Initialize a provider with credentials
   */
  async initializeProvider(
    providerType: ProviderType, 
    credentials: Record<string, string>
  ): Promise<boolean> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not found`);
    }
    
    const result = await provider.initialize(credentials);
    if (result) {
      log(`Provider ${providerType} initialized successfully`, 'llm-orchestrator');
    } else {
      log(`Failed to initialize provider ${providerType}`, 'llm-orchestrator');
    }
    
    return result;
  }
  
  /**
   * Check if a provider is initialized
   */
  isProviderInitialized(providerType: ProviderType): boolean {
    const provider = this.providers.get(providerType);
    return provider ? provider.isInitialized() : false;
  }
  
  /**
   * Get all available models across initialized providers
   */
  getAllModels(): LLMModelInfo[] {
    const models: LLMModelInfo[] = [];
    
    for (const provider of this.providers.values()) {
      if (provider.isInitialized()) {
        models.push(...provider.models);
      }
    }
    
    return models;
  }
  
  /**
   * Get all initialized providers
   */
  getInitializedProviders(): ProviderType[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isInitialized())
      .map(([type, _]) => type);
  }
  
  /**
   * Select the most appropriate model for a specific use case
   */
  selectModelForAnalysis(
    analysisType: AnalysisType,
    preferredProvider: ProviderType = ProviderType.AUTO,
    estimatedTokens: number = 4000,
    requireLowLatency: boolean = false,
    xPreferredModel?: string
  ): { provider: ProviderType; modelId: string } {
    // If a specific model is requested via header, try to use it
    if (xPreferredModel) {
      for (const [providerType, provider] of this.providers.entries()) {
        if (provider.isInitialized()) {
          const model = provider.models.find(m => m.id === xPreferredModel);
          if (model) {
            return { provider: providerType, modelId: model.id };
          }
        }
      }
      // If preferred model not found, log warning and continue with auto selection
      log(`Requested model ${xPreferredModel} not found, falling back to auto selection`, 'llm-orchestrator');
    }
    
    // If a specific provider is requested (and initialized), use it
    if (preferredProvider !== ProviderType.AUTO) {
      const provider = this.providers.get(preferredProvider);
      if (provider && provider.isInitialized()) {
        // Get the most appropriate model from this provider
        const models = provider.models;
        
        // Sort by context size for now (more complex logic could be added)
        const sortedModels = [...models].sort((a, b) => {
          // If we need low latency, prioritize that
          if (requireLowLatency) {
            return a.averageLatencyMs - b.averageLatencyMs;
          }
          
          // Otherwise, prioritize models that can handle the estimated tokens
          if (estimatedTokens > a.maxContextTokens && estimatedTokens <= b.maxContextTokens) {
            return 1; // b is better
          }
          if (estimatedTokens > b.maxContextTokens && estimatedTokens <= a.maxContextTokens) {
            return -1; // a is better
          }
          
          // If both can handle it, prefer the cheaper one
          if (estimatedTokens <= a.maxContextTokens && estimatedTokens <= b.maxContextTokens) {
            return (a.costPerInputToken + a.costPerOutputToken) - 
                   (b.costPerInputToken + b.costPerOutputToken);
          }
          
          // Default to larger context
          return b.maxContextTokens - a.maxContextTokens;
        });
        
        if (sortedModels.length > 0) {
          return { provider: preferredProvider, modelId: sortedModels[0].id };
        }
      }
    }
    
    // Auto selection logic based on requirements
    const initializedProviders = this.getInitializedProviders();
    
    if (initializedProviders.length === 0) {
      throw new Error('No LLM providers are initialized');
    }
    
    // Collect all models from initialized providers
    const allModels: Array<{ provider: ProviderType; model: LLMModelInfo }> = [];
    
    for (const providerType of initializedProviders) {
      const provider = this.providers.get(providerType)!;
      for (const model of provider.models) {
        allModels.push({ provider: providerType, model });
      }
    }
    
    // Filter models that can handle the tokens
    let eligibleModels = allModels.filter(({ model }) => model.maxContextTokens >= estimatedTokens);
    
    // If no models can handle it, get the largest context models
    if (eligibleModels.length === 0) {
      const maxContextSize = Math.max(...allModels.map(({ model }) => model.maxContextTokens));
      eligibleModels = allModels.filter(({ model }) => model.maxContextTokens === maxContextSize);
    }
    
    // Apply selection rules based on tokens and latency requirements
    if (estimatedTokens <= 8000 && requireLowLatency) {
      // Rule 1: ≤ 8K tokens & low latency → GPT-4o mini or similar
      const smallModels = eligibleModels.filter(
        ({ model }) => model.maxContextTokens <= 16000 && model.averageLatencyMs < 1500
      );
      
      if (smallModels.length > 0) {
        // Sort by latency
        smallModels.sort((a, b) => a.model.averageLatencyMs - b.model.averageLatencyMs);
        return { 
          provider: smallModels[0].provider, 
          modelId: smallModels[0].model.id 
        };
      }
    } else if (estimatedTokens <= 128000) {
      // Rule 2: ≤ 128K tokens or medium-sized → GPT-4o / Claude Sonnet
      const mediumModels = eligibleModels.filter(
        ({ model }) => model.maxContextTokens >= estimatedTokens && model.maxContextTokens <= 200000
      );
      
      if (mediumModels.length > 0) {
        // Sort by balance of cost and latency
        mediumModels.sort((a, b) => {
          const scoreA = a.model.averageLatencyMs * (a.model.costPerInputToken + a.model.costPerOutputToken);
          const scoreB = b.model.averageLatencyMs * (b.model.costPerInputToken + b.model.costPerOutputToken);
          return scoreA - scoreB;
        });
        
        return { 
          provider: mediumModels[0].provider, 
          modelId: mediumModels[0].model.id 
        };
      }
    } else {
      // Rule 3: > 128K tokens → Gemini 1.5 Pro or largest available
      const largeModels = eligibleModels.filter(
        ({ model }) => model.maxContextTokens >= estimatedTokens
      );
      
      if (largeModels.length > 0) {
        // Sort by context size
        largeModels.sort((a, b) => b.model.maxContextTokens - a.model.maxContextTokens);
        return { 
          provider: largeModels[0].provider, 
          modelId: largeModels[0].model.id 
        };
      }
    }
    
    // Default fallback - sort all eligible models by a combination of factors
    eligibleModels.sort((a, b) => {
      // Balance of cost, context size, and latency
      const scoreA = (a.model.costPerInputToken + a.model.costPerOutputToken) * 
                    (requireLowLatency ? a.model.averageLatencyMs / 1000 : 1) *
                    (1000000 / a.model.maxContextTokens);
                    
      const scoreB = (b.model.costPerInputToken + b.model.costPerOutputToken) * 
                    (requireLowLatency ? b.model.averageLatencyMs / 1000 : 1) *
                    (1000000 / b.model.maxContextTokens);
                    
      return scoreA - scoreB;
    });
    
    return { 
      provider: eligibleModels[0].provider, 
      modelId: eligibleModels[0].model.id 
    };
  }
  
  /**
   * Generate a completion using the specified or auto-selected model
   */
  async generateCompletion(
    options: CompletionOptions & {
      provider?: ProviderType;
      estimatedTokens?: number;
      requireLowLatency?: boolean;
      xPreferredModel?: string;
    }
  ): Promise<CompletionResult> {
    const { 
      provider: specifiedProvider = ProviderType.AUTO,
      estimatedTokens = 4000,
      requireLowLatency = false,
      xPreferredModel,
      ...completionOptions 
    } = options;
    
    // If modelId is specified, find which provider has it
    if (completionOptions.modelId && specifiedProvider === ProviderType.AUTO) {
      for (const [providerType, provider] of this.providers.entries()) {
        if (provider.isInitialized() && 
            provider.models.some(m => m.id === completionOptions.modelId)) {
          // Use this provider
          const result = await this.callProvider(
            providerType, 
            completionOptions as CompletionOptions
          );
          
          // Persist metrics if available
          if (this.metricsPersistence) {
            await this.metricsPersistence.saveMetrics(result.metrics);
          }
          
          return result;
        }
      }
      
      // If no provider found for this model, fall back to auto-selection
      log(`No provider found for model ${completionOptions.modelId}, using auto-selection`, 'llm-orchestrator');
    }
    
    // Auto-select model if needed
    const { provider, modelId } = this.selectModelForAnalysis(
      AnalysisType.ALERT_ANALYSIS, // default analysis type
      specifiedProvider,
      estimatedTokens,
      requireLowLatency,
      xPreferredModel
    );
    
    // Set the selected model ID
    const finalOptions: CompletionOptions = {
      ...completionOptions,
      modelId: modelId
    };
    
    // Call the selected provider
    const result = await this.callProvider(provider, finalOptions);
    
    // Persist metrics if available
    if (this.metricsPersistence) {
      await this.metricsPersistence.saveMetrics(result.metrics);
    }
    
    return result;
  }
  
  /**
   * Call a specific provider to generate a completion
   */
  private async callProvider(
    providerType: ProviderType, 
    options: CompletionOptions
  ): Promise<CompletionResult> {
    const provider = this.providers.get(providerType);
    
    if (!provider) {
      throw new Error(`Provider ${providerType} not found`);
    }
    
    if (!provider.isInitialized()) {
      throw new Error(`Provider ${providerType} is not initialized`);
    }
    
    log(`Calling ${providerType} with model ${options.modelId}`, 'llm-orchestrator');
    
    try {
      return await provider.generateCompletion(options);
    } catch (error) {
      log(`Error calling ${providerType}: ${error.message}`, 'llm-orchestrator');
      throw error;
    }
  }
}