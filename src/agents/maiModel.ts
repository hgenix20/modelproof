import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createSseStream } from "@azure/core-sse";
import { config } from '../config';

const token = import.meta.env.VITE_GITHUB_TOKEN;

if (!token) {
  throw new Error("VITE_GITHUB_TOKEN environment variable is not set.");
}

const endpoint = config.endpoints.github;
const modelName = config.models.MAI.github;

export interface ModelResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function streamModelResponse(
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void
): Promise<ModelResponse> {
  const client = ModelClient(
    endpoint,
    new AzureKeyCredential(token as string),
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
      model: modelName,
      temperature: 0.7, // Lower temperature for more focused, deterministic responses
      top_p: 0.9,
      max_tokens: 2000, // Higher max tokens for detailed analysis
      stream: true
    }
  }).asBrowserStream();

  if (!response.body) {
    console.warn("Stream response body is undefined.");
    return { content: "", usage: undefined };
  }

  const sseStream = createSseStream(response.body);
  let fullContent = "";
  let usage = null;
  let streamClosed = false;

  try {
    for await (const event of sseStream) {
      if (event.data === "[DONE]") {
        streamClosed = true;
        break;
      }
      const parsedData = JSON.parse(event.data);
      for (const choice of parsedData.choices) {
        const content = choice.delta?.content ?? "";
        fullContent += content;
        onToken(content);
      }
      if (parsedData.usage) {
        usage = parsedData.usage;
      }
    }
  } catch (error) {
    console.error("Error processing stream:", error);
    throw error;
  } finally {
    if (!streamClosed) {
      console.warn("Stream did not finish with [DONE]. Consider retry logic.");
    }
  }

  return {
    content: fullContent,
    usage
  };
} 