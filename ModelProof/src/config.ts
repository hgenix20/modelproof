export const config = {
  githubToken: import.meta.env.VITE_GITHUB_TOKEN || '',
  huggingfaceToken: import.meta.env.VITE_HUGGINGFACE_TOKEN || '',
  endpoints: {
    github: "https://models.github.ai/inference",
    huggingface: "https://6Genix-AIAgentHackathon2025.hf.space"
  },
  models: {
    MAI: {
      github: "meta/Meta-Llama-3-8B-Instruct",
      huggingface: "meta-llama/Meta-Llama-3-8B-Instruct"
    },
    phi35: {
      github: "microsoft/phi-3-mini-128k-instruct",
      huggingface: "microsoft/phi-3-mini-128k-instruct"
    },
    openai: {
      github: "ai21-labs/AI21-Jamba-1.5-Large",
      huggingface: "ai21-labs/AI21-Jamba-1.5-Large"
    }
  },
  fallbackEnabled: true
}; 