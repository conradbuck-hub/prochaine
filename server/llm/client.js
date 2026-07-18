import Anthropic from "@anthropic-ai/sdk";

let sharedClient = null;

export function getAnthropicClient(config) {
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return sharedClient;
}

// Thin wrapper so callers (intentParser, answerFormatter) don't touch the
// SDK shape directly — makes both easy to stub in tests.
export async function complete({ client, model, system, prompt, maxTokens = 1024 }) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
