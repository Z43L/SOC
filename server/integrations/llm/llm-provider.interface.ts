/**
 * Interface for LLM providers with common operations
 */
export interface LLMProvider {
  /**
   * Name of the provider
   */
  name: string;
  
  /**
   * Available models for this provider
   */
  models: LLMModelInfo[];
  
  /**
   * Initialize the provider with credentials
   */
  initialize(credentials: Record<string, string>): Promise<boolean>;
  
  /**
   * Check if the provider is initialized
   */
  isInitialized(): boolean;
  
  /**
   * Generate text completion using the LLM
   */
  generateCompletion(options: CompletionOptions): Promise<CompletionResult>;
}

/**
 * Information about an LLM model
 */
export interface LLMModelInfo {
  /**
   * Model identifier used by the provider
   */
  id: string;
  
  /**
   * Display name
   */
  name: string;
  
  /**
   * Estimated cost per 1K input tokens
   */
  costPerInputToken: number;
  
  /**
   * Estimated cost per 1K output tokens
   */
  costPerOutputToken: number;
  
  /**
   * Average latency in milliseconds
   */
  averageLatencyMs: number;
  
  /**
   * Maximum context size in tokens
   */
  maxContextTokens: number;
  
  /**
   * Whether the model supports multimodal inputs (images, audio, etc.)
   */
  isMultimodal: boolean;
}

/**
 * Options for completion generation
 */
export interface CompletionOptions {
  /**
   * Model ID to use
   */
  modelId: string;
  
  /**
   * System message / instructions
   */
  systemMessage?: string;
  
  /**
   * User message / prompt
   */
  userMessage: string;
  
  /**
   * Maximum tokens to generate
   */
  maxTokens?: number;
  
  /**
   * Temperature for generation
   */
  temperature?: number;
  
  /**
   * Whether to return JSON format
   */
  responseFormat?: 'json_object' | 'text';
}

/**
 * Result of a completion request
 */
export interface CompletionResult {
  /**
   * Generated text content
   */
  content: string;
  
  /**
   * Metrics for the completion
   */
  metrics: CompletionMetrics;
  
  /**
   * Raw provider response for additional data
   */
  providerResponse: any;
}

/**
 * Metrics for a completion request
 */
export interface CompletionMetrics {
  /**
   * Tokens in the input (prompt)
   */
  inputTokens: number;
  
  /**
   * Tokens in the output (completion)
   */
  outputTokens: number;
  
  /**
   * Total cost in USD
   */
  cost: number;
  
  /**
   * Latency in milliseconds
   */
  latencyMs: number;
  
  /**
   * Model used for the completion
   */
  model: string;
  
  /**
   * Provider used for the completion
   */
  provider: string;
}