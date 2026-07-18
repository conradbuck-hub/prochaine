import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { complete } from "./client.js";

const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL("./prompts/intent-parser.md", import.meta.url)),
  "utf8"
);

const VALID_TYPES = new Set([
  "departures",
  "alerts",
  "bixi",
  "service_hours",
  "set_place",
  "set_language",
  "set_term",
  "smalltalk",
  "out_of_scope",
]);
const VALID_MODES = new Set(["bus", "metro", "rem", "exo", null]);
const VALID_DIRECTIONS = new Set(["E", "W", "N", "S", "inbound", "outbound", null]);
const VALID_WHEN = new Set(["now", "tonight", "specific", null]);
const VALID_LANGUAGE_PREFS = new Set(["fr", "en", "auto", null]);
const VALID_PLACE_KEYS = new Set(["home", "work", "school", null]);

// Strips accidental markdown fences and parses+validates the model's JSON
// output. Throws on anything that doesn't match the documented shape —
// callers should treat a throw as a parse failure (surfaced as a 500), not
// silently fall back to a guess.
export function parseIntentResponse(raw) {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!VALID_TYPES.has(parsed.type)) {
    throw new Error(`Invalid intent type: ${parsed.type}`);
  }
  if (!VALID_MODES.has(parsed.modeFilter ?? null)) {
    throw new Error(`Invalid modeFilter: ${parsed.modeFilter}`);
  }
  if (!VALID_DIRECTIONS.has(parsed.direction ?? null)) {
    throw new Error(`Invalid direction: ${parsed.direction}`);
  }
  if (!VALID_WHEN.has(parsed.when ?? null)) {
    throw new Error(`Invalid when: ${parsed.when}`);
  }
  if (!VALID_LANGUAGE_PREFS.has(parsed.languagePref ?? null)) {
    throw new Error(`Invalid languagePref: ${parsed.languagePref}`);
  }
  if (!VALID_PLACE_KEYS.has(parsed.placeKey ?? null)) {
    throw new Error(`Invalid placeKey: ${parsed.placeKey}`);
  }
  if (parsed.language !== "fr" && parsed.language !== "en") {
    throw new Error(`Invalid language: ${parsed.language}`);
  }

  return {
    type: parsed.type,
    modeFilter: parsed.modeFilter ?? null,
    route: parsed.route ?? null,
    stopQuery: parsed.stopQuery ?? null,
    direction: parsed.direction ?? null,
    when: parsed.when ?? null,
    useGeolocation: parsed.useGeolocation === true,
    frustrated: parsed.frustrated === true,
    language: parsed.language,
    languagePref: parsed.languagePref ?? null,
    placeKey: parsed.placeKey ?? null,
    teach: parsed.teach ?? null,
  };
}

export async function parseIntent({ message, profile, client, model }) {
  const prompt = JSON.stringify({ message, profile });
  const raw = await complete({ client, model, system: SYSTEM_PROMPT, prompt });
  return parseIntentResponse(raw);
}
