import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataBlock } from "../server/llm/answerFormatter.js";

test("buildDataBlock includes only defined confirmation fields", () => {
  const data = buildDataBlock({ language: "fr", frustrated: true, departures: [{ route: "24" }] });
  assert.equal(data.language, "fr");
  assert.equal(data.frustrated, true);
  assert.deepEqual(data.departures, [{ route: "24" }]);
  assert.equal("placeSaved" in data, false);
  assert.equal("termSaved" in data, false);
  assert.equal("onboardingInvite" in data, false);
});

test("buildDataBlock surfaces placeSaved + onboardingInvite together", () => {
  const data = buildDataBlock({
    language: "fr",
    placeSaved: { placeKey: "home", stopName: "Sherbrooke / Atwater" },
    onboardingInvite: "Et le travail ou l'école?",
  });
  assert.deepEqual(data.placeSaved, { placeKey: "home", stopName: "Sherbrooke / Atwater" });
  assert.equal(data.onboardingInvite, "Et le travail ou l'école?");
});

test("buildDataBlock surfaces aliasUnset and termSaved", () => {
  const data = buildDataBlock({
    language: "en",
    aliasUnset: { term: "work" },
    termSaved: { term: "mon bus", target: "24" },
  });
  assert.deepEqual(data.aliasUnset, { term: "work" });
  assert.deepEqual(data.termSaved, { term: "mon bus", target: "24" });
});

test("buildDataBlock omits falsy weatherCaveat and outOfScope", () => {
  const data = buildDataBlock({ language: "fr", weatherCaveat: null, outOfScope: false });
  assert.equal("weatherCaveat" in data, false);
  assert.equal("outOfScope" in data, false);
});
