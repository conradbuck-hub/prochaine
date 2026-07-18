// Typo-tolerant stop resolution: personal aliases/lexicon first, then exact
// match against the preprocessed stop index, then a TOKEN-LEVEL edit-distance
// fallback. "sherbrook atwatter" needs to resolve to "Sherbrooke / Atwater"
// without the user ever typing an exact GTFS stop name — but whole-name
// comparison is unreliable once real stop names are multi-word cross-streets:
// against real STM data, "atwatter" whole-string-matched decoy stops like
// "Elm / Tower" and "Bombardier" more closely than "Sherbrooke / Atwater",
// purely because of overall length/character overlap, nothing to do with the
// actual word being typed. Comparing individual words instead fixes that.

const ACCENTS = /[̀-ͯ]/g;

// Query tokens shorter than this are too likely to false-positive-match
// unrelated words (fr/en articles, etc.) to use for fuzzy comparison.
const MIN_FUZZY_TOKEN_LENGTH = 4;
// Never surface a fuzzy match further than this from some token in the
// query — a hard cap, not a length-scaled threshold.
const MAX_FUZZY_DISTANCE = 2;

export function normalize(str) {
  return str
    .normalize("NFD")
    .replace(ACCENTS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(
        Math.min(
          prevRow[j] + 1,       // deletion
          currRow[j - 1] + 1,   // insertion
          prevRow[j - 1] + cost // substitution
        )
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

function tokenize(normalizedStr) {
  return normalizedStr.split(" ").filter(Boolean);
}

// Compares each query token of length >= MIN_FUZZY_TOKEN_LENGTH against
// every token in a candidate stop name, keeping the best (lowest) distance
// found per query token. A stop only qualifies if at least one query token
// has some name-token within MAX_FUZZY_DISTANCE — short query tokens (< 4
// chars) never participate, and nothing beyond the cap ever counts.
// Returns { distance, matchedTokens } (distance = best single-token match
// found across all qualifying query tokens; matchedTokens = how many
// distinct query tokens cleared the cap) or null if nothing qualifies.
function scoreTokenMatch(queryTokens, nameTokens) {
  const candidates = queryTokens.filter((t) => t.length >= MIN_FUZZY_TOKEN_LENGTH);
  if (candidates.length === 0) return null;

  let distance = Infinity;
  let matchedTokens = 0;

  for (const qToken of candidates) {
    let best = Infinity;
    for (const nToken of nameTokens) {
      const d = levenshtein(qToken, nToken);
      if (d < best) best = d;
    }
    if (best <= MAX_FUZZY_DISTANCE) {
      matchedTokens++;
      if (best < distance) distance = best;
    }
  }

  return matchedTokens > 0 ? { distance, matchedTokens } : null;
}

// stopIndex: array of { id, name, agency, lat, lon }
// profile: user profile with .aliases and .lexicon maps (term -> stopId or name)
// Returns { stop, source: "lexicon"|"alias"|"exact"|"fuzzy", distance? } or null.
export function findStop(query, stopIndex, profile = {}) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const lexicon = profile.lexicon ?? {};
  const aliases = profile.aliases ?? {};

  for (const [term, target] of Object.entries(lexicon)) {
    if (normalize(term) === normalizedQuery) {
      const stop = resolveTarget(target, stopIndex);
      if (stop) return { stop, source: "lexicon" };
    }
  }

  for (const [term, target] of Object.entries(aliases)) {
    if (normalize(term) === normalizedQuery) {
      const stop = resolveTarget(target, stopIndex);
      if (stop) return { stop, source: "alias" };
    }
  }

  const exact = stopIndex.find((s) => normalize(s.name) === normalizedQuery);
  if (exact) return { stop: exact, source: "exact" };

  const contains = stopIndex.find((s) =>
    normalize(s.name).includes(normalizedQuery)
  );
  if (contains) return { stop: contains, source: "exact" };

  const queryTokens = tokenize(normalizedQuery);
  let best = null;
  for (const stop of stopIndex) {
    const score = scoreTokenMatch(queryTokens, tokenize(normalize(stop.name)));
    if (!score) continue;
    if (
      !best ||
      score.distance < best.score.distance ||
      (score.distance === best.score.distance && score.matchedTokens > best.score.matchedTokens)
    ) {
      best = { stop, score };
    }
  }

  if (best) {
    return { stop: best.stop, source: "fuzzy", distance: best.score.distance };
  }

  return null;
}

// Ranks every stop against a query using the same normalize/exact/contains/
// token-level-edit-distance signals findStop uses, instead of returning
// just the single winner — useful for debugging a resolution (e.g.
// GET /debug/stops?q=...): seeing the top few candidates, their distance,
// and how many query tokens matched makes it obvious why a query resolved
// (or didn't) the way it did. Sorted by distance, then by matched-token
// count; ties beyond that keep stopIndex order (stable sort).
export function rankStops(query, stopIndex, limit = 10) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const queryTokens = tokenize(normalizedQuery);

  const results = [];
  for (const stop of stopIndex) {
    const normalizedName = normalize(stop.name);
    if (normalizedName === normalizedQuery) {
      results.push({ stop, source: "exact", distance: 0, matchedTokens: queryTokens.length });
      continue;
    }
    if (normalizedName.includes(normalizedQuery)) {
      results.push({ stop, source: "contains", distance: 0, matchedTokens: queryTokens.length });
      continue;
    }
    const score = scoreTokenMatch(queryTokens, tokenize(normalizedName));
    if (score) {
      results.push({ stop, source: "fuzzy", distance: score.distance, matchedTokens: score.matchedTokens });
    }
  }

  return results
    .sort((a, b) => a.distance - b.distance || b.matchedTokens - a.matchedTokens)
    .slice(0, limit);
}

function resolveTarget(target, stopIndex) {
  if (typeof target !== "string") return null;
  return stopIndex.find((s) => s.id === target) ?? stopIndex.find((s) => normalize(s.name) === normalize(target)) ?? null;
}
