import Anthropic from '@anthropic-ai/sdk';
/**
 * Anthropic LLM provider implementation
 */
export class AnthropicProvider {
    name = 'Anthropic';
    client = null;
    // Models available from Anthropic
    models = [
        {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            costPerInputToken: 0.015 / 1000, // $0.015 per 1K tokens
            costPerOutputToken: 0.075 / 1000, // $0.075 per 1K tokens
            averageLatencyMs: 3000,
            maxContextTokens: 200000,
            isMultimodal: true
        },
        {
            id: 'claude-3-sonnet-20240229',
            name: 'Claude 3 Sonnet',
            costPerInputToken: 0.003 / 1000, // $0.003 per 1K tokens
            costPerOutputToken: 0.015 / 1000, // $0.015 per 1K tokens
            averageLatencyMs: 2000,
            maxContextTokens: 200000,
            isMultimodal: true
        },
        {
            id: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            costPerInputToken: 0.00025 / 1000, // $0.00025 per 1K tokens
            costPerOutputToken: 0.00125 / 1000, // $0.00125 per 1K tokens
            averageLatencyMs: 1000,
            maxContextTokens: 200000,
            isMultimodal: true
        }
    ];
    /**
     * Initialize the Anthropic client
     */
    async initialize(credentials) {
        try {
            if (!credentials.apiKey) {
                throw new Error('Anthropic API key is required');
            }
            this.client = new Anthropic({
                apiKey: credentials.apiKey
            });
            return true;
        }
        catch (error) {
            console.error('Failed to initialize Anthropic client:', error);
            this.client = null;
            return false;
        }
    }
    /**
     * Check if the client is initialized
     */
    isInitialized() {
        return this.client !== null;
    }
    /**
     * Generate a completion using Anthropic
     */
    async generateCompletion(options) {
        if (!this.client) {
            throw new Error('Anthropic client is not initialized');
        }
        // Find the model info to calculate costs later
        const modelInfo = this.models.find(model => model.id === options.modelId);
        if (!modelInfo) {
            throw new Error(`Unknown model: ${options.modelId}`);
        }
        // Start measuring latency
        const startTime = Date.now();
        // Call the Anthropic API
        const response = await this.client.messages.create({
            model: options.modelId,
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature,
            system: options.systemMessage,
            messages: [
                {
                    role: 'user',
                    content: options.userMessage
                }
            ]
        });
        // End measuring latency
        const latencyMs = Date.now() - startTime;
        // Extract tokens and calculate cost
        // Claude API doesn't return token usage directly in the same way OpenAI does
        // We would need to estimate or use a separate token counting library
        // For now, we'll use a simple approximation based on text length
        const estimatedInputTokens = Math.ceil((options.userMessage.length + (options.systemMessage?.length || 0)) / 4);
        const content = response.content[0]?.text || '';
        const estimatedOutputTokens = Math.ceil(content.length / 4);
        const cost = (estimatedInputTokens * modelInfo.costPerInputToken) +
            (estimatedOutputTokens * modelInfo.costPerOutputToken);
        // Create completion metrics
        const metrics = {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            cost,
            latencyMs,
            model: options.modelId,
            provider: this.name
        };
        return {
            content,
            metrics,
            providerResponse: response
        };
    }
}
