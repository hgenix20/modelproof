import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';

interface LLMRequestConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  maxRetries?: number;
}

interface LLMResponse {
  text: string;
  confidence?: number;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

interface OpenAIResponse {
  choices: Array<{
    text?: string;
    message?: { content: string };
    confidence?: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AnthropicResponse {
  completion: string;
}

interface GitHubResponse {
  content: string;
  confidence?: number;
}

type LLMProviderResponse = OpenAIResponse | AnthropicResponse | GitHubResponse;

class LLMAPIUtils {
  private client: AxiosInstance;
  private config: LLMRequestConfig;
  private defaultConfig: Partial<LLMRequestConfig> = {
    maxTokens: 1000,
    temperature: 0.7,
    timeout: 30000,
    maxRetries: 3,
  };

  constructor(config: LLMRequestConfig) {
    this.config = { ...this.defaultConfig, ...config };
    
    this.client = axios.create({
      baseURL: this.config.endpoint,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  private async handleError(error: AxiosError): Promise<AxiosResponse> {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as { error?: { message: string } };

      switch (status) {
        case 401:
          throw new Error('Invalid API key');
        case 429:
          throw new Error('Rate limit exceeded');
        case 500:
          throw new Error('Server error');
        default:
          throw new Error(data.error?.message || 'Unknown error occurred');
      }
    } else if (error.request) {
      // Request made but no response received
      throw new Error('No response received from server');
    } else {
      // Error in request setup
      throw new Error(error.message);
    }
  }

  private async retryRequest<T>(
    request: () => Promise<T>,
    retries: number = this.config.maxRetries || 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }

    throw lastError;
  }

  private formatResponse(response: LLMProviderResponse, model: string): LLMResponse {
    if ('choices' in response && response.choices[0]) {
      // OpenAI format
      return {
        text: response.choices[0].text || response.choices[0].message?.content || '',
        confidence: response.choices[0].confidence,
        model,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    } else if ('completion' in response) {
      // Anthropic format
      return {
        text: response.completion,
        model,
      };
    } else if ('content' in response) {
      // GitHub format
      return {
        text: response.content,
        confidence: response.confidence,
        model,
      };
    } else {
      throw new Error('Unsupported response format');
    }
  }

  public async sendRequest(
    prompt: string,
    customConfig?: Partial<LLMRequestConfig>
  ): Promise<LLMResponse> {
    const config = { ...this.config, ...customConfig };

    const request = async () => {
      const response = await this.client.post<LLMProviderResponse>('', {
        prompt,
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      });

      return this.formatResponse(response.data, config.model);
    };

    try {
      return await this.retryRequest(request);
    } catch (error) {
      return {
        text: '',
        model: config.model,
        error: (error as Error).message,
      };
    }
  }

  public async batchRequests(
    prompts: string[],
    customConfig?: Partial<LLMRequestConfig>
  ): Promise<LLMResponse[]> {
    const requests = prompts.map(prompt => 
      this.sendRequest(prompt, customConfig)
    );
    return Promise.all(requests);
  }
}

export { LLMAPIUtils };
export type { LLMRequestConfig, LLMResponse }; 