import OpenAI from 'openai';
/**
 * OpenAI LLM provider implementation
 */
export class OpenAIProvider {
    name = 'OpenAI';
    client = null;
    // Models available from OpenAI
    models = [
        {
            id: 'gpt-4o',
            name: 'GPT-4o',
            costPerInputToken: 0.01 / 1000, // $0.01 per 1K tokens
            costPerOutputToken: 0.03 / 1000, // $0.03 per 1K tokens
            averageLatencyMs: 2000,
            maxContextTokens: 128000,
            isMultimodal: true
        },
        {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            costPerInputToken: 0.0015 / 1000, // $0.0015 per 1K tokens
            costPerOutputToken: 0.006 / 1000, // $0.006 per 1K tokens
            averageLatencyMs: 1000,
            maxContextTokens: 8000,
            isMultimodal: true
        },
        {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            costPerInputToken: 0.01 / 1000, // $0.01 per 1K tokens
            costPerOutputToken: 0.03 / 1000, // $0.03 per 1K tokens
            averageLatencyMs: 3000,
            maxContextTokens: 128000,
            isMultimodal: false
        }
    ];
    /**
     * Initialize the OpenAI client
     */
    async initialize(credentials) {
        try {
            if (!credentials.apiKey) {
                throw new Error('OpenAI API key is required');
            }
            this.client = new OpenAI({
                apiKey: credentials.apiKey,
                organization: credentials.organization
            });
            return true;
        }
        catch (error) {
            console.error('Failed to initialize OpenAI client:', error);
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
     * Generate a completion using OpenAI
     */
    async generateCompletion(options) {
        if (!this.client) {
            throw new Error('OpenAI client is not initialized');
        }
        // Find the model info to calculate costs later
        const modelInfo = this.models.find(model => model.id === options.modelId);
        if (!modelInfo) {
            throw new Error(`Unknown model: ${options.modelId}`);
        }
        const messages = [];
        // Add system message if provided
        if (options.systemMessage) {
            messages.push({
                role: 'system',
                content: options.systemMessage
            });
        }
        // Add user message
        messages.push({
            role: 'user',
            content: options.userMessage
        });
        // Start measuring latency
        const startTime = Date.now();
        // Call the OpenAI API
        const responseFormat = options.responseFormat === 'json_object'
            ? { type: 'json_object' }
            : undefined;
        const response = await this.client.chat.completions.create({
            model: options.modelId,
            messages,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            response_format: responseFormat
        });
        // End measuring latency
        const latencyMs = Date.now() - startTime;
        // Extract tokens and calculate cost
        const inputTokens = response.usage?.prompt_tokens || 0;
        const outputTokens = response.usage?.completion_tokens || 0;
        const cost = (inputTokens * modelInfo.costPerInputToken) +
            (outputTokens * modelInfo.costPerOutputToken);
        // Create completion metrics
        const metrics = {
            inputTokens,
            outputTokens,
            cost,
            latencyMs,
            model: options.modelId,
            provider: this.name
        };
        return {
            content: response.choices[0]?.message?.content || '',
            metrics,
            providerResponse: response
        };
    }
}
