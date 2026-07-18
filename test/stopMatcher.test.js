import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, levenshtein, findStop, rankStops } from "../server/services/stopMatcher.js";

// Includes two decoys ("Elm / Tower", "Bombardier") mirroring the real STM
// bug report: querying "atwatter" whole-string-matched these more closely
// than "Sherbrooke / Atwater", purely by overall length/character overlap,
// even though neither has anything to do with "Atwater". Token-level
// matching must not repeat that mistake.
const stopIndex = [
  { id: "stm:2001", name: "Sherbrooke / Atwater", agency: "stm", mode: "bus" },
  { id: "stm:2002", name: "Atwater", agency: "stm", mode: "metro" },
  { id: "stm:1999", name: "Cote-Vertu", agency: "stm", mode: "metro" },
  { id: "exo:3001", name: "Gare Vaudreuil", agency: "exo", mode: "exo" },
  { id: "rem:5000", name: "Gare Centrale", agency: "rem", mode: "rem" },
  { id: "stm:9001", name: "Elm / Tower", agency: "stm", mode: "bus" },
  { id: "stm:9002", name: "Bombardier", agency: "stm", mode: "bus" },
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
  assert.equal(result.stop.id, "stm:2001", "both query tokens match this stop's tokens, beating 'Atwater' alone on matched-token count");
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

test("bug fix: 'atwatter' resolves to an Atwater stop, not the whole-string coincidence decoys", () => {
  const result = findStop("atwatter", stopIndex);
  assert.ok(result, "expected a fuzzy match");
  assert.match(result.stop.name, /atwater/i);
  assert.equal(result.distance, 1);
  assert.notEqual(result.stop.id, "stm:9001", "Elm / Tower must not win");
  assert.notEqual(result.stop.id, "stm:9002", "Bombardier must not win");
});

test("rankStops resolves 'sherbrooke atwater' as an exact ranked match", () => {
  const ranked = rankStops("sherbrooke atwater", stopIndex);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].stop.id, "stm:2001");
  assert.equal(ranked[0].source, "exact");
  assert.equal(ranked[0].distance, 0);
});

test("bug fix: rankStops ranks Atwater stops above the whole-string-coincidence decoys for 'atwatter'", () => {
  const ranked = rankStops("atwatter", stopIndex);
  assert.equal(ranked.length, 2, "only the two Atwater-containing stops clear the distance-2 cap");
  assert.match(ranked[0].stop.name, /atwater/i);
  assert.equal(ranked[0].distance, 1);
  assert.equal(ranked[0].source, "fuzzy");
  const ids = ranked.map((r) => r.stop.id);
  assert.ok(!ids.includes("stm:9001"), "Elm / Tower (whole-string distance 6 in the bug report) must not qualify");
  assert.ok(!ids.includes("stm:9002"), "Bombardier (whole-string distance 7 in the bug report) must not qualify");
  // results are sorted best-first
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i].distance >= ranked[i - 1].distance);
  }
});

test("rankStops: 'gare santrale' top-ranks Gare Centrale over Gare Vaudreuil via matched-token count", () => {
  const ranked = rankStops("gare santrale", stopIndex);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].stop.id, "rem:5000", "both tokens match here (gare=gare, santrale~centrale at distance 2) vs only 'gare' for Gare Vaudreuil");
  assert.equal(ranked[0].distance, 0);
  assert.equal(ranked[0].matchedTokens, 2);
});

test("bug fix: nonsense far from every stop name returns nothing, never a garbage best-effort match", () => {
  assert.equal(findStop("zzqqxx", stopIndex), null);
  assert.deepEqual(rankStops("zzqqxx", stopIndex), []);
});

test("rankStops respects the limit", () => {
  const unlimited = rankStops("atwatter", stopIndex);
  assert.equal(unlimited.length, 2, "both Atwater-containing stops qualify");
  const limited = rankStops("atwatter", stopIndex, 1);
  assert.equal(limited.length, 1);
});

test("rankStops returns an empty list for a blank query", () => {
  assert.deepEqual(rankStops("   ", stopIndex), []);
});

test("fuzzy matching ignores short query tokens (< 4 chars) entirely", () => {
  // "de" and "la" are too short to fuzzy-match on their own; only "gare"
  // (>= 4 chars) can qualify a candidate.
  const ranked = rankStops("de la gare", stopIndex);
  const ids = ranked.map((r) => r.stop.id);
  assert.ok(ids.includes("exo:3001") || ids.includes("rem:5000"), "a 'gare' stop should still match via the qualifying token");
});
