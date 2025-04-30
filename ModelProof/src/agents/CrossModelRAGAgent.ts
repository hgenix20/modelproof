import createModelClient from "@azure-rest/ai-inference";
import { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

interface LLMResponse {
  text: string;
  confidence: number;
  model: string;
  timestamp: Date;
}

interface LLMConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

interface CrossModelRAGAgentConfig {
  primaryLLM: LLMConfig;
  secondaryLLM: LLMConfig;
  similarityThreshold: number;
}

class CrossModelRAGAgent {
  private config: CrossModelRAGAgentConfig;

  constructor(config: CrossModelRAGAgentConfig) {
    this.config = config;
  }

  private async queryLLM(
    config: LLMConfig,
    prompt: string
  ): Promise<LLMResponse> {
    try {
      const client = createModelClient(config.endpoint, new AzureKeyCredential(config.apiKey));
      const response = await client.path("/chat/completions").post({
        queryParameters: {
          "api-version": "2024-05-01-preview"
        },
        body: {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: config.temperature || 0.7,
          max_tokens: config.maxTokens || 1000
        }
      });

      if (isUnexpected(response)) {
        const errorMessage = response.body.error?.message || 'Unknown error from model';
        throw new Error(errorMessage);
      }

      return {
        text: response.body.choices[0].message.content || '',
        confidence: 0.9,
        model: config.model,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      console.error(`Error querying ${config.model}:`, error);
      throw new Error(`Failed to query ${config.model}`);
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation based on shared words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private combineResponses(
    primaryResponse: LLMResponse,
    secondaryResponse: LLMResponse
  ): LLMResponse {
    const similarity = this.calculateSimilarity(
      primaryResponse.text,
      secondaryResponse.text
    );

    if (similarity >= this.config.similarityThreshold) {
      // If responses are similar, use the one with higher confidence
      return primaryResponse.confidence >= secondaryResponse.confidence
        ? primaryResponse
        : secondaryResponse;
    }

    // If responses are different, combine them
    return {
      text: `${primaryResponse.text}\n\nAdditional perspective:\n${secondaryResponse.text}`,
      confidence: (primaryResponse.confidence + secondaryResponse.confidence) / 2,
      model: `${primaryResponse.model} + ${secondaryResponse.model}`,
      timestamp: new Date(),
    };
  }

  public async processPrompt(prompt: string): Promise<LLMResponse> {
    try {
      // Query both LLMs in parallel
      const [primaryResponse, secondaryResponse] = await Promise.all([
        this.queryLLM(this.config.primaryLLM, prompt),
        this.queryLLM(this.config.secondaryLLM, prompt),
      ]);

      // Combine the responses
      return this.combineResponses(primaryResponse, secondaryResponse);
    } catch (error) {
      const err = error as Error;
      console.error('Error processing prompt:', err);
      throw new Error(`Failed to process prompt: ${err.message}`);
    }
  }
}

export { CrossModelRAGAgent };
export type { LLMConfig, CrossModelRAGAgentConfig, LLMResponse }; 