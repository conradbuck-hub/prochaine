import { readFileSync } from "node:fs";
import { complete } from "./client.js";

const SYSTEM_PROMPT = readFileSync(
  new URL("./prompts/answer-formatter.md", import.meta.url),
  "utf8"
);

// Builds the JSON "DATA block" sent to the formatter — a single free-form
// object so new confirmation fields (placeSaved, termSaved, etc.) can be
// added without a signature change. Only defined keys are sent, so the
// prompt's "only what's present" framing stays literally true.
export function buildDataBlock({
  departures,
  alerts,
  weatherCaveat,
  bixiStations,
  serviceHours,
  outOfScope,
  onboardingInvite,
  onboardingSkipped,
  placeSaved,
  placeSaveFailed,
  aliasUsed,
  aliasUnset,
  languagePrefSaved,
  termSaved,
  language,
  languagePref,
  frustrated,
} = {}) {
  const data = { language, frustrated: frustrated === true };
  if (departures !== undefined) data.departures = departures;
  if (alerts !== undefined) data.alerts = alerts;
  if (weatherCaveat) data.weatherCaveat = weatherCaveat;
  if (bixiStations !== undefined) data.bixiStations = bixiStations;
  if (serviceHours !== undefined) data.serviceHours = serviceHours;
  if (outOfScope) data.outOfScope = true;
  if (onboardingInvite) data.onboardingInvite = onboardingInvite;
  if (onboardingSkipped) data.onboardingSkipped = true;
  if (placeSaved) data.placeSaved = placeSaved;
  if (placeSaveFailed) data.placeSaveFailed = true;
  if (aliasUsed) data.aliasUsed = aliasUsed;
  if (aliasUnset) data.aliasUnset = aliasUnset;
  if (languagePrefSaved) data.languagePrefSaved = languagePrefSaved;
  if (termSaved) data.termSaved = termSaved;
  if (languagePref) data.languagePref = languagePref;
  return data;
}

export async function formatAnswer(fields) {
  const { client, model } = fields;
  const data = buildDataBlock(fields);
  const reply = await complete({ client, model, system: SYSTEM_PROMPT, prompt: JSON.stringify(data) });
  return reply.trim();
}
