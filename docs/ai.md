# SOC AI Capabilities Documentation

This document details the AI capabilities and configuration options in the SOC platform.

## Available AI Providers

The SOC platform now supports multiple AI providers:

1. **OpenAI**
   - GPT-4o: Advanced model with 128K context window and multimodal capabilities
   - GPT-4o mini: Smaller, faster version for low-latency needs (8K context)

2. **Anthropic**
   - Claude 3 Opus: Most powerful Claude model with 200K context
   - Claude 3 Sonnet: Balanced performance and cost with 200K context
   - Claude 3 Haiku: Fast, efficient model for simpler analysis tasks

3. **Google** (Planned)
   - Gemini 1.5 Pro: Long-context model supporting up to 2M tokens

## Automatic Model Selection

The SOC platform now includes intelligent model selection based on the request requirements:

- For smaller tasks (≤ 8K tokens) requiring low latency: GPT-4o mini or Claude 3 Haiku
- For medium tasks (≤ 128K tokens): GPT-4o or Claude 3 Sonnet
- For very large contexts (> 128K tokens): Gemini 1.5 Pro (when available)

## Tenant Configuration

Tenants can configure AI settings in their configuration:

```yaml
ai:
  provider: auto    # Can be 'auto', 'openai', 'anthropic', or 'google'
  cost_threshold_usd: 30  # Maximum monthly spend on AI
  max_tokens: 32768  # Maximum context size to use
  anomaly:
    enabled: true
    sensitivity: 0.85  # 0-1 range, higher = more sensitive
```

Individual requests can override the provider selection using the `x-preferred-model` header.

## Supported Analysis Types

The AI system can perform various types of security analysis:

1. Alert Analysis
2. Incident Correlation
3. Threat Intel Analysis
4. Security Recommendations
5. Log Pattern Detection
6. Network Traffic Analysis
7. Anomaly Detection

## Anomaly Detection

The platform now includes two approaches to anomaly detection:

1. **Statistical Anomaly Detection**: Basic z-score based detection built into the platform
2. **ML-based Detection**: Connect to external Python service for advanced anomaly detection

To enable anomaly detection, configure the `anomaly` section in your tenant configuration.

## Metrics and Observability

The system tracks the following metrics for all AI calls:

- Input tokens
- Output tokens
- Cost (USD)
- Latency (ms)
- Model used
- Provider used

These metrics are available in the dashboard under "AI Usage".