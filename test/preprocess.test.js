import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { processAgency, AGENCY_PROFILES, mergeResults, CALENDAR_DAYS } from "../scripts/lib/preprocess.js";

const stmDir = fileURLToPath(new URL("./fixtures/gtfs-sample/stm/", import.meta.url));
const exoDir = fileURLToPath(new URL("./fixtures/gtfs-sample/exo/", import.meta.url));
const stmNoFreqDir = fileURLToPath(new URL("./fixtures/gtfs-sample/stm-no-freq/", import.meta.url));

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

test("derives frequency bands from explicit métro trips when frequencies.txt is absent (the real STM case)", async () => {
  const stm = await processAgency({ ...AGENCY_PROFILES.stm, sourcePath: stmNoFreqDir });

  assert.equal(stm.stopEntries.length, 1);
  assert.equal(stm.stopEntries[0].mode, "metro");

  const entries = stm.frequencies["stm:5001"];
  assert.ok(entries, "expected derived frequency entries for the métro-only stop");
  assert.equal(entries.length, 2, "one entry per time band with >=2 departures (AM peak + midday)");

  const amPeak = entries.find((e) => e.startTime === "07:00:00");
  assert.ok(amPeak, "AM peak band: 07:00, 07:04, 07:08");
  assert.equal(amPeak.endTime, "07:08:00");
  assert.equal(amPeak.headwaySecs, 240, "median gap between 07:00/07:04/07:08 is 4 min");
  assert.equal(amPeak.routeId, "1");
  assert.equal(amPeak.headsign, "Angrignon");
  assert.deepEqual(amPeak.serviceDays.sort(), [...CALENDAR_DAYS].sort());

  const midday = entries.find((e) => e.startTime === "12:00:00");
  assert.ok(midday, "midday band: 12:00, 12:10");
  assert.equal(midday.endTime, "12:10:00");
  assert.equal(midday.headwaySecs, 600, "gap between 12:00 and 12:10 is 10 min");
});
