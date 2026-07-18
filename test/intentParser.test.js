import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntentResponse } from "../server/llm/intentParser.js";

test("parses a minimal valid departures intent, defaulting optional fields", () => {
  const intent = parseIntentResponse(
    JSON.stringify({ type: "departures", stopQuery: "Atwater", language: "fr" })
  );
  assert.equal(intent.type, "departures");
  assert.equal(intent.stopQuery, "Atwater");
  assert.equal(intent.modeFilter, null);
  assert.equal(intent.frustrated, false);
  assert.equal(intent.useGeolocation, false);
  assert.equal(intent.languagePref, null);
  assert.equal(intent.placeKey, null);
  assert.equal(intent.teach, null);
});

test("strips markdown fences around the JSON", () => {
  const intent = parseIntentResponse(
    "```json\n" + JSON.stringify({ type: "smalltalk", language: "en" }) + "\n```"
  );
  assert.equal(intent.type, "smalltalk");
});

test("parses set_term with teach payload", () => {
  const intent = parseIntentResponse(
    JSON.stringify({
      type: "set_term",
      language: "fr",
      teach: { term: "mon bus", target: "24" },
    })
  );
  assert.equal(intent.type, "set_term");
  assert.deepEqual(intent.teach, { term: "mon bus", target: "24" });
});

test("parses set_place with placeKey", () => {
  const intent = parseIntentResponse(
    JSON.stringify({
      type: "set_place",
      language: "fr",
      placeKey: "school",
      stopQuery: "Gare Centrale",
    })
  );
  assert.equal(intent.placeKey, "school");
  assert.equal(intent.stopQuery, "Gare Centrale");
});

test("parses set_language with languagePref", () => {
  const intent = parseIntentResponse(
    JSON.stringify({ type: "set_language", language: "fr", languagePref: "en" })
  );
  assert.equal(intent.languagePref, "en");
});

test("parses frustrated flag and direction", () => {
  const intent = parseIntentResponse(
    JSON.stringify({
      type: "departures",
      language: "fr",
      frustrated: true,
      direction: "inbound",
      route: "exo4",
    })
  );
  assert.equal(intent.frustrated, true);
  assert.equal(intent.direction, "inbound");
  assert.equal(intent.route, "exo4");
});

test("rejects an unknown intent type", () => {
  assert.throws(() => parseIntentResponse(JSON.stringify({ type: "bogus", language: "fr" })));
});

test("rejects an invalid modeFilter", () => {
  assert.throws(() =>
    parseIntentResponse(JSON.stringify({ type: "departures", language: "fr", modeFilter: "train" }))
  );
});

test("rejects a missing/invalid language", () => {
  assert.throws(() => parseIntentResponse(JSON.stringify({ type: "smalltalk" })));
});

test("accepts every documented intent type", () => {
  const types = [
    "departures", "alerts", "bixi", "service_hours",
    "set_place", "set_language", "set_term", "smalltalk", "out_of_scope",
  ];
  for (const type of types) {
    const intent = parseIntentResponse(JSON.stringify({ type, language: "fr" }));
    assert.equal(intent.type, type);
  }
});
