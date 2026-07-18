// Single-user persistence. One JSON file is plenty at one user — see
// docs/SPEC.md "Persistence" for why this isn't a database.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function defaultProfile() {
  return {
    home: null, // { id, name }
    work: null, // { id, name }
    school: null, // { id, name }
    aliases: {}, // e.g. { "bus home": "<stopId>" }
    lexicon: {}, // e.g. { "mon bus": "24" }
    language: null, // the standing preference ("fr" | "en"), set only by an explicit set_language turn
    skippedOnboarding: [], // e.g. ["home"] — steps the user explicitly skipped
    onboarded: false,
  };
}

export async function loadProfile(path) {
  try {
    const raw = await readFile(path, "utf8");
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === "ENOENT") return defaultProfile();
    throw err;
  }
}

export async function saveProfile(profile, path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(profile, null, 2), "utf8");
  return profile;
}
