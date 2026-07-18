import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { processAgency, AGENCY_PROFILES, mergeResults } from "../scripts/lib/preprocess.js";

const stmDir = fileURLToPath(new URL("./fixtures/gtfs-sample/stm/", import.meta.url));
const exoDir = fileURLToPath(new URL("./fixtures/gtfs-sample/exo/", import.meta.url));

test("preprocesses the 4-stop synthetic fixture into stops + schedule indices", async () => {
  const stm = await processAgency({ ...AGENCY_PROFILES.stm, sourcePath: stmDir });
  const exo = await processAgency({ ...AGENCY_PROFILES.exo, sourcePath: exoDir });

  const { stopsIndex, scheduleIndex } = mergeResults([stm, exo]);

  assert.equal(stopsIndex.length, 4, "expects the 4-stop fixture: bus, 2 metro, 1 exo");

  const bus = stopsIndex.find((s) => s.id === "stm:2001");
  assert.equal(bus.mode, "bus");
  assert.equal(bus.name, "Sherbrooke / Atwater");

  const metro = stopsIndex.find((s) => s.id === "stm:2002");
  assert.equal(metro.mode, "metro");
  assert.ok(scheduleIndex.frequencies["stm:2002"].length > 0, "metro stop should have frequency entries");

  const exoStop = stopsIndex.find((s) => s.id === "exo:3001");
  assert.equal(exoStop.mode, "exo");
  assert.equal(scheduleIndex.timetable["exo:3001"].length, 2, "exo stop should have 2 scheduled departures");

  // Bus stops are query-time live lookups — no schedule data should be captured for them.
  assert.equal(scheduleIndex.frequencies["stm:2001"], undefined);
  assert.equal(scheduleIndex.timetable["stm:2001"], undefined);
});

test("frequency entries are deduped across trips sharing the same pattern", async () => {
  const stm = await processAgency({ ...AGENCY_PROFILES.stm, sourcePath: stmDir });
  const entries = stm.frequencies["stm:2002"];
  assert.equal(entries.length, 1, "TGREEN-1 is the only trip serving stop 2002");
  assert.equal(entries[0].headwaySecs, 240);
});
