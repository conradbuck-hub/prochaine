#!/usr/bin/env node
// Streams multi-agency GTFS (zips, or plain directories for the test
// fixture) into two compact files the server loads at boot:
//   stops-index.json     — every stop actually served, with its mode
//   schedule-index.json  — frequency tables (métro/REM) + timetables (exo)
//
// The row-by-row aggregation lives in scripts/lib/preprocess.js so it can be
// unit-tested directly against the synthetic fixture; this file is just the
// CLI wrapper.
//
// Usage:
//   node scripts/preprocess-gtfs.js --stm=<zip|dir> [--exo=<zip|dir>] [--rem=<zip|dir>] [--out=<dir>]

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { processAgency, AGENCY_PROFILES, mergeResults } from "./lib/preprocess.js";

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ?? fileURLToPath(new URL("../server/data/compiled/", import.meta.url));

  const jobs = [];
  for (const agency of ["stm", "rem", "exo"]) {
    if (args[agency]) {
      jobs.push(processAgency({ ...AGENCY_PROFILES[agency], sourcePath: args[agency] }));
    }
  }

  if (jobs.length === 0) {
    console.error(
      "Usage: node scripts/preprocess-gtfs.js --stm=<zip|dir> [--exo=<zip|dir>] [--rem=<zip|dir>] [--out=<dir>]"
    );
    process.exit(1);
  }
  if (!args.rem) {
    console.warn(
      "No --rem source given — REM stops are assumed to come through the exo feed until Stage 0 resolves this (see docs/BUILD-STAGES.md)."
    );
  }

  const results = await Promise.all(jobs);
  const { stopsIndex, scheduleIndex } = mergeResults(results);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "stops-index.json"), JSON.stringify(stopsIndex, null, 2));
  await writeFile(join(outDir, "schedule-index.json"), JSON.stringify(scheduleIndex, null, 2));

  const totalRows = results.reduce((sum, r) => sum + r.rowsProcessed, 0);
  console.log(`Processed ${totalRows} stop_times rows across ${results.length} agenc${results.length === 1 ? "y" : "ies"}.`);
  console.log(
    `${stopsIndex.length} stops, ${Object.keys(scheduleIndex.frequencies).length} frequency-table stops, ${Object.keys(scheduleIndex.timetable).length} timetable stops.`
  );
  console.log(`Wrote ${join(outDir, "stops-index.json")} and ${join(outDir, "schedule-index.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
