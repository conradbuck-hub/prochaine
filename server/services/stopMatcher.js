// Typo-tolerant stop resolution: personal aliases/lexicon first, then exact
// match against the preprocessed stop index, then edit-distance fallback.
// "sherbrook atwatter" needs to resolve to "Sherbrooke / Atwater" without the
// user ever typing an exact GTFS stop name.

const ACCENTS = /[̀-ͯ]/g;

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

  let best = null;
  let bestDistance = Infinity;
  for (const stop of stopIndex) {
    const distance = levenshtein(normalizedQuery, normalize(stop.name));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stop;
    }
  }

  // Distance threshold scales with query length so short queries don't
  // fuzzy-match to something unrelated.
  const threshold = Math.max(2, Math.floor(normalizedQuery.length * 0.4));
  if (best && bestDistance <= threshold) {
    return { stop: best, source: "fuzzy", distance: bestDistance };
  }

  return null;
}

function resolveTarget(target, stopIndex) {
  if (typeof target !== "string") return null;
  return stopIndex.find((s) => s.id === target) ?? stopIndex.find((s) => normalize(s.name) === normalize(target)) ?? null;
}
