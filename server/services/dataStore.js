// Loads the compiled, preprocessed GTFS data (see scripts/preprocess-gtfs.js).
// Until Stage 1 runs against real GTFS zips, these files won't exist yet —
// callers get empty structures rather than a crash, so the server can boot
// and be exercised against fixtures/debug endpoints regardless.

import { readFile } from "node:fs/promises";

async function readJsonOrDefault(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function loadStopIndex(compiledDir) {
  return readJsonOrDefault(new URL("stops-index.json", compiledDir), []);
}

export async function loadScheduleIndex(compiledDir) {
  return readJsonOrDefault(new URL("schedule-index.json", compiledDir), {
    frequencies: {},
    timetable: {},
  });
}
