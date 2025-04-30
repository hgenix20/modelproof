import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { config } from '../config';

if (!config.githubToken) {
  throw new Error("VITE_GITHUB_TOKEN environment variable is not set");
}

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
    config.endpoints.github,
    new AzureKeyCredential(config.githubToken),
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
      model: config.models.phi35.github,
      stream: true
    }
  }).asBrowserStream();

  if (!response.body) {
    throw new Error("The response is undefined");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let usage = null;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last line in the buffer if it's incomplete
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        if (line === 'data: [DONE]') break;

        try {
          const data = line.replace('data: ', '');
          const parsedData = JSON.parse(data);
          
          for (const choice of parsedData.choices) {
            const content = choice.delta?.content ?? "";
            fullContent += content;
            onToken(content);
          }
          
          if (parsedData.usage) {
            usage = parsedData.usage;
          }
        } catch (e) {
          console.warn('Failed to parse JSON:', e);
          continue;
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const data = buffer.replace('data: ', '');
        const parsedData = JSON.parse(data);
        
        for (const choice of parsedData.choices) {
          const content = choice.delta?.content ?? "";
          fullContent += content;
          onToken(content);
        }
        
        if (parsedData.usage) {
          usage = parsedData.usage;
        }
      } catch (e) {
        console.warn('Failed to parse final buffer:', e);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    usage
  };
} 