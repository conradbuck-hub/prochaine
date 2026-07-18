import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, levenshtein, findStop, rankStops } from "../server/services/stopMatcher.js";

const stopIndex = [
  { id: "stm:2001", name: "Sherbrooke / Atwater", agency: "stm", mode: "bus" },
  { id: "stm:2002", name: "Atwater", agency: "stm", mode: "metro" },
  { id: "stm:1999", name: "Cote-Vertu", agency: "stm", mode: "metro" },
  { id: "exo:3001", name: "Gare Vaudreuil", agency: "exo", mode: "exo" },
];

test("normalize strips accents, case, and punctuation", () => {
  assert.equal(normalize("Côte-Vertu"), "cote vertu");
  assert.equal(normalize("  Sherbrooke / Atwater  "), "sherbrooke atwater");
});

test("levenshtein distance", () => {
  assert.equal(levenshtein("atwater", "atwater"), 0);
  assert.equal(levenshtein("atwatter", "atwater"), 1);
  assert.equal(levenshtein("", "abc"), 3);
});

test("findStop resolves an exact match", () => {
  const result = findStop("Atwater", stopIndex);
  assert.equal(result.source, "exact");
  assert.equal(result.stop.id, "stm:2002");
});

test("findStop typo-tolerant fallback resolves 'sherbrook atwatter'", () => {
  const result = findStop("sherbrook atwatter", stopIndex);
  assert.ok(result, "expected a fuzzy match");
  assert.equal(result.stop.id, "stm:2001");
});

test("findStop checks the personal lexicon before the general index", () => {
  const profile = { lexicon: { "mon bus": "stm:2001" }, aliases: {} };
  const result = findStop("mon bus", stopIndex, profile);
  assert.equal(result.source, "lexicon");
  assert.equal(result.stop.id, "stm:2001");
});

test("findStop checks aliases", () => {
  const profile = { lexicon: {}, aliases: { "bus home": "Sherbrooke / Atwater" } };
  const result = findStop("bus home", stopIndex, profile);
  assert.equal(result.source, "alias");
  assert.equal(result.stop.id, "stm:2001");
});

test("findStop returns null for gibberish far from any stop name", () => {
  const result = findStop("xkxkxkxkxk", stopIndex);
  assert.equal(result, null);
});

test("rankStops resolves 'sherbrooke atwater' as an exact ranked match", () => {
  const ranked = rankStops("sherbrooke atwater", stopIndex);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].stop.id, "stm:2001");
  assert.equal(ranked[0].source, "exact");
  assert.equal(ranked[0].distance, 0);
});

test("rankStops uses the edit-distance typo fallback and ranks the closest name first", () => {
  const ranked = rankStops("atwatter", stopIndex);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].stop.id, "stm:2002", "'Atwater' alone is closer to 'atwatter' than 'Sherbrooke / Atwater'");
  assert.equal(ranked[0].source, "fuzzy");
  assert.equal(ranked[0].distance, 1);
  // results are sorted best-first
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i].distance >= ranked[i - 1].distance);
  }
});

test("rankStops respects the limit", () => {
  const ranked = rankStops("a", stopIndex, 2);
  assert.equal(ranked.length, 2);
});

test("rankStops returns an empty list for a blank query", () => {
  assert.deepEqual(rankStops("   ", stopIndex), []);
});
