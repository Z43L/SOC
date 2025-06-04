import { z } from 'zod';
import { CompletionOptions, CompletionResult } from './llm-provider.interface';
import { log } from '../../vite';

/**
 * Wrapper that calls a model and validates the response with a Zod schema.
 * Will retry up to specified number of times with error feedback to the model.
 */
export async function parseOrRetry<T>(
  modelCall: (options: CompletionOptions) => Promise<CompletionResult>,
  options: CompletionOptions,
  schema: z.ZodSchema<T>,
  maxRetries: number = 3
): Promise<{ data: T; metrics: CompletionResult['metrics'] }> {
  let lastError = null;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    try {
      // Clone the options to avoid modifying the original
      const currentOptions = { ...options };
      
      // If this is a retry, add error information to the prompt
      if (attempt > 1 && lastError) {
        currentOptions.userMessage = `${currentOptions.userMessage}\n\nThe previous response had validation errors:\n${lastError}\n\nPlease fix these issues and ensure your response matches the required schema.`;
      }
      
      // Call the model
      const startTime = Date.now();
      const result = await modelCall(currentOptions);
      const endTime = Date.now();
      
      // Try to parse the content as JSON if response format is json_object
      let content = result.content;
      let jsonContent;
      
      try {
        if (options.responseFormat === 'json_object') {
          jsonContent = JSON.parse(content);
        } else {
          // For non-JSON responses, just validate the content directly
          jsonContent = content;
        }
      } catch (parseError) {
        lastError = `JSON parsing error: ${parseError.message}`;
        log(`Attempt ${attempt}/${maxRetries}: JSON parsing failed - ${lastError}`, 'llm-validation');
        continue;
      }
      
      // Validate with Zod schema
      const validationResult = schema.safeParse(jsonContent);
      
      if (validationResult.success) {
        log(`Validation successful on attempt ${attempt}/${maxRetries}`, 'llm-validation');
        return { 
          data: validationResult.data,
          metrics: result.metrics
        };
      }
      
      // If validation failed, prepare error message for next attempt
      const formattedError = validationResult.error.format();
      lastError = JSON.stringify(formattedError, null, 2);
      
      log(`Attempt ${attempt}/${maxRetries}: Validation failed - ${lastError}`, 'llm-validation');
      
      // Send validation error to monitoring if available
      try {
        // TODO: Send validation errors to Sentry or other monitoring
        console.warn('LLM validation error:', {
          schema: schema.description || 'Unnamed schema',
          attempt,
          model: result.metrics.model,
          error: formattedError
        });
      } catch (monitoringError) {
        console.error('Error sending validation error to monitoring:', monitoringError);
      }
    } catch (error) {
      lastError = `Model call error: ${error.message}`;
      log(`Attempt ${attempt}/${maxRetries}: Model call failed - ${lastError}`, 'llm-validation');
    }
  }
  
  // If we've exhausted all retries, throw an error
  throw new Error(`Failed to get valid response after ${maxRetries} attempts. Last error: ${lastError}`);
}