import { Client } from "@gradio/client";
import { config } from '../config';
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

/**
 * Represents a response from an AI model.
 * @interface ModelResponse
 * @property {string} content - The generated text content
 * @property {Object} [usage] - Token usage statistics
 * @property {number} [usage.prompt_tokens] - Number of tokens in the prompt
 * @property {number} [usage.completion_tokens] - Number of tokens in the completion
 * @property {number} [usage.total_tokens] - Total number of tokens used
 * @property {string} model - The name of the model that generated the response
 */
interface ModelResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

/**
 * Extended Error type for Azure API errors.
 * @interface AzureError
 * @extends {Error}
 * @property {string} statusCode - HTTP status code as string
 * @property {Object} [response] - Response object containing status information
 */
interface AzureError extends Error {
  statusCode: string;
  response?: {
    status?: number;
  };
}

/**
 * Custom error class for rate limit errors.
 * @class RateLimitError
 * @extends {Error}
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Type guard to check if an error is an AzureError.
 * @function isAzureError
 * @param {unknown} error - The error to check
 * @returns {boolean} True if the error is an AzureError
 */
function isAzureError(error: unknown): error is AzureError {
  return error instanceof Error && 
         typeof (error as AzureError).statusCode === 'string' && 
         'response' in error;
}

/**
 * Queries an AI model with automatic fallback to alternative models on rate limits.
 * 
 * @async
 * @function queryModelWithFallback
 * @param {'MAI' | 'phi35' | 'openai'} modelType - The type of model to query
 * @param {string} systemPrompt - The system prompt for the model
 * @param {string} userPrompt - The user's input prompt
 * @param {(token: string) => void} onToken - Callback for streaming tokens
 * @returns {Promise<ModelResponse>} The model's response
 * @throws {Error} If both primary and fallback models fail
 * 
 * @example
 * const response = await queryModelWithFallback(
 *   'MAI',
 *   'You are a helpful assistant.',
 *   'What is the capital of France?',
 *   (token) => console.log(token)
 * );
 */
export async function queryModelWithFallback(
  modelType: 'MAI' | 'phi35' | 'openai',
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void
): Promise<ModelResponse> {
  try {
    const githubResponse = await queryGitHubModel(modelType, systemPrompt, userPrompt, onToken);
    return {
      ...githubResponse,
      model: config.models[modelType].github
    };
  } catch (error) {
    if (isAzureError(error)) {
      const err = error;
      const responseStatus = err.response?.status;
      const isRateLimit = err.statusCode === '429' || 
                         (responseStatus !== undefined && String(responseStatus) === '429') || 
                         (err.message && String(err.message).toLowerCase().includes('too many requests'));

      if (isRateLimit) {
        console.warn(`Rate limit hit for GitHub. Falling back to Hugging Face for ${modelType}.`);
        // Fallback to Hugging Face
        const hfResponse = await queryHuggingFaceModel(modelType, systemPrompt, userPrompt, onToken);
        return {
          ...hfResponse,
          model: config.models[modelType].huggingface
        };
      }
    }

    throw error;
  }
}

/**
 * Queries the GitHub-hosted AI model.
 * 
 * @async
 * @function queryGitHubModel
 * @param {'MAI' | 'phi35' | 'openai'} modelType - The type of model to query
 * @param {string} systemPrompt - The system prompt for the model
 * @param {string} userPrompt - The user's input prompt
 * @param {(token: string) => void} onToken - Callback for streaming tokens
 * @returns {Promise<ModelResponse>} The model's response
 * @throws {RateLimitError} If the API rate limit is exceeded
 * @throws {Error} For other API errors
 */
async function queryGitHubModel(
  modelType: 'MAI' | 'phi35' | 'openai',
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void
): Promise<ModelResponse> {
  const client = ModelClient(
    config.endpoints.github,
    new AzureKeyCredential(config.githubToken)
  );

  const response = await client.path("/chat/completions").post({
    queryParameters: {
      "api-version": "2024-05-01-preview"
    },
    body: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: config.models[modelType].github,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1000,
      stream: false
    }
  });

  if (isUnexpected(response)) {
    if (Number(response.status) === 429) {
      throw new RateLimitError('GitHub API rate limit exceeded');
    }
    const errorMessage = response.body?.error?.message || 'Unknown error from GitHub model';
    throw new Error(errorMessage);
  }

  const content = response.body.choices?.[0]?.message?.content || '';
  onToken(content);

  return {
    content,
    usage: response.body.usage,
    model: config.models[modelType].github
  };
}

/**
 * Queries the Hugging Face model as a fallback option.
 * 
 * @async
 * @function queryHuggingFaceModel
 * @param {'MAI' | 'phi35' | 'openai'} modelType - The type of model to query
 * @param {string} systemPrompt - The system prompt for the model
 * @param {string} userPrompt - The user's input prompt
 * @param {(token: string) => void} onToken - Callback for streaming tokens
 * @returns {Promise<ModelResponse>} The model's response
 * @throws {Error} If the API request fails
 */
export async function queryHuggingFaceModel(
  modelType: 'MAI' | 'phi35' | 'openai',
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void
): Promise<ModelResponse> {
  const client = await Client.connect(config.endpoints.huggingface);
  const result = await client.predict("/chat", {
    message: userPrompt,
    system_message: systemPrompt,
    max_tokens: 1000,
    temperature: 0.7,
    top_p: 0.9,
  });

  if (!result.data || typeof result.data !== 'string') {
    throw new Error("No response from Hugging Face model");
  }

  // Process the response and call onToken for each token
  const content = result.data;
  for (const token of content.split(' ')) {
    onToken(token + ' ');
  }

  return {
    content,
    model: config.models[modelType].huggingface
  };
}