import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { complete } from "./client.js";

const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL("./prompts/intent-parser.md", import.meta.url)),
  "utf8"
);

const VALID_TYPES = new Set([
  "departure_query",
  "teach_lexicon",
  "onboarding_answer",
  "small_talk",
  "unknown",
]);
const VALID_MODES = new Set(["bus", "metro", "rem", "exo", "bixi", null]);

// Strips accidental markdown fences and parses+validates the model's JSON
// output. Throws on anything that doesn't match the documented shape —
// callers should treat a throw the same as "unknown" intent.
export function parseIntentResponse(raw) {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!VALID_TYPES.has(parsed.type)) {
    throw new Error(`Invalid intent type: ${parsed.type}`);
  }
  if (!VALID_MODES.has(parsed.modeFilter ?? null)) {
    throw new Error(`Invalid modeFilter: ${parsed.modeFilter}`);
  }
  if (parsed.language !== "fr" && parsed.language !== "en") {
    throw new Error(`Invalid language: ${parsed.language}`);
  }

  return {
    type: parsed.type,
    stopQuery: parsed.stopQuery ?? null,
    modeFilter: parsed.modeFilter ?? null,
    teach: parsed.teach ?? null,
    language: parsed.language,
  };
}

export async function parseIntent({ message, profile, client, model }) {
  const prompt = JSON.stringify({ message, profile });
  const raw = await complete({ client, model, system: SYSTEM_PROMPT, prompt });
  return parseIntentResponse(raw);
}
