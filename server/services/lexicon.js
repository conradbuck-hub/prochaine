// Personal lexicon & aliases: "quand je dis mon bus, c'est le 24" and
// "bus home" both resolve through the same term -> stopId/route mapping,
// checked by stopMatcher before anything else.

export function teachTerm(profile, term, target) {
  return {
    ...profile,
    lexicon: { ...profile.lexicon, [term.trim().toLowerCase()]: target },
  };
}

export function addAlias(profile, term, target) {
  return {
    ...profile,
    aliases: { ...profile.aliases, [term.trim().toLowerCase()]: target },
  };
}

export function setLanguage(profile, language) {
  return { ...profile, language };
}

export function forgetTerm(profile, term) {
  const key = term.trim().toLowerCase();
  const lexicon = { ...profile.lexicon };
  const aliases = { ...profile.aliases };
  delete lexicon[key];
  delete aliases[key];
  return { ...profile, lexicon, aliases };
}
