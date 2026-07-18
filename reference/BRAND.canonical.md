# Prochaine — Brand rules (locked, v1.0)

Full visual guide: prochaine-brand-guide.html (kept outside repo).
These are the rules the CODE must obey.

## Concept
Borrow the SYSTEM of Montreal transit signage, never its assets.
No STM/exo/REM/BIXI logos or marks, ever.

## Colour — two native grammars, one system
- DARK = the station signage (colours on black): ground #0E0F11,
  surface #191B1E, surface-2 #232629, text #F2F3F4, muted #9AA0A6,
  active-state yellow #FFD900.
- LIGHT = the métro map (colours on white): ground #F7F7F5,
  surface #FFFFFF, surface-2 #E2E2DE, bubble #E9E9E5, text #16181A,
  muted #6B7076, active-state dark-yellow #B28F00 (raw yellow fails
  contrast on white; discs keep #FFD900 with dark text).
- App follows system preference; manual override cycles auto/light/dark.
- Line colours identical in both modes: vert #008E5B · orange #EF8122
  · jaune #FFD900 · bleu #0083CA.
- Signage black remains the brand's home ground for the wordmark hero
  and marketing materials.
- Line colours only where they MEAN something: wordmark, header band,
  and the left rule of an answer about a specific line. Never decoration.
- Yellow: only fill with dark text (#0E0F11); also the single "active"
  state colour. No fifth hue, no gradients, no shadows.

## Type
- System sans only (zero font downloads — speed is brand behaviour).
- Two weights: regular + 700/800 for wordmark/header.
- Uppercase + 0.16em tracking for wordmark/header only.
- Quebec 24h times in French output: « 17 h 42 », « 0 h 45 ».

## Wordmark
"Chat-" then P·R·O·C·H·A·I·N·E as discs cycling g→o→y→b.
Yellow discs = dark text. Reproduce from public/index.html markup.

## Voice (enforced in prompts/answer.txt — do not dilute)
Understands the street, answers like the institution.
- Casual, mixed, frustrated, or misspelled input in → ONE clean language out (the language
  the user leads with; standing preference set by asking, e.g.
  « réponds toujours en français »). Never mirror slang; never mix
  languages in a reply.
- No language toggle in the UI — language is handled conversationally.
- 1–3 sentences. Facts before sympathy. Lead with the disruption.
- Never apologize for/represent the STM. Never invent schedules.
- Plain language out — short, common words, digits. Never correct or
  comment on the user’s spelling, grammar, or accents. Every literacy
  level is a first-class user.
- Explanation, not prediction (events/weather warn from known facts only).
- Tagline: « Prochaine — le réseau, en une question. »

## Backlog item this locks in
Answers about a specific line get a left rule in that line's colour
(client-side: detect line in answer → set border colour). Currently
neutral; implement in Phase 3.
