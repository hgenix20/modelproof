import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createSseStream } from "@azure/core-sse";
import { config } from '../config';

if (!config.githubToken) {
  throw new Error("VITE_GITHUB_TOKEN environment variable is not set");
}

const endpoint = config.endpoints.github;
const modelName = config.models.openai.github;

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
    new AzureKeyCredential(config.githubToken as string),
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
      temperature: 1.0,
      top_p: 1.0,
      max_tokens: 1000,
      stream: true
    }
  }).asNodeStream();

  if (!response.body) {
    throw new Error("The response is undefined");
  }

  const sseStream = createSseStream(response.body);
  let fullContent = "";
  let usage = null;

  for await (const event of sseStream) {
    if (event.data === "[DONE]") {
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

  return {
    content: fullContent,
    usage
  };
} 