# Canonical reference files — Prochaine

These five files are the ITERATED ORIGINALS from the design sessions
(~30 rounds of refinement, including francophone review of the language
and voice rules). The repo's current versions of these files were
regenerated from a summary document and are approximations.

Precedence rule for reconciliation:
- CONTENT (rules, coverage, vocabulary, doctrine, brand tokens, stage
  gates): these canonical files win, always.
- STRUCTURE (file paths, JSON schema field names the code expects,
  endpoint names, module layout): the repo's existing code wins — adapt
  canonical content into the repo's structures, never break the code to
  match these files.

Files:
- intent-parser.canonical.txt   — full comprehension coverage: register
  calibration, sacres/joual recognition (coverage not expectation),
  SMS compression, typo correction, francophone varieties (France,
  Belgium, Haiti, Maghreb...), Haitian Creole, set_place / set_language
  / set_term intents, Gare Centrale ambiguity rule, train
  inbound/outbound convention.
- answer-formatter.canonical.txt — the voice: clean Quebec French rules
  (« présentement », « 17 h 42 », France-isms banned), one language per
  reply, frustration handling (facts before sympathy), dignity rule
  (never correct the user's writing), profile/onboarding/lexicon
  confirmation behaviors, plain-language requirements.
- BRAND.canonical.md — locked visual tokens incl. dual-mode palettes
  (note: light-mode active-state yellow is #B28F00, not #FFD900 — raw
  yellow fails contrast on white; discs keep #FFD900 with dark text),
  colours-mean-never-decorate, no-language-toggle rule.
- SPEC.canonical.md — the full working spec with decision log.
- BUILD-STAGES.canonical.md — the six gated stages with exit criteria.
