import { readFileSync } from "node:fs";
import { complete } from "./client.js";

const SYSTEM_PROMPT = readFileSync(
  new URL("./prompts/answer-formatter.md", import.meta.url),
  "utf8"
);

export async function formatAnswer({
  departures,
  alerts = [],
  weatherCaveat = null,
  language,
  frustrated = false,
  client,
  model,
}) {
  const prompt = JSON.stringify({ departures, alerts, weatherCaveat, language, frustrated });
  const reply = await complete({ client, model, system: SYSTEM_PROMPT, prompt });
  return reply.trim();
}
