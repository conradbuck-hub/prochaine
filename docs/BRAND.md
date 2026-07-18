# Prochaine — Brand Guide

An original visual and voice identity, in the spirit of Montreal's métro
wayfinding — flip-board departure signs, bold line colors, no-nonsense
sans-serif — without reproducing STM's actual logo, roundel, or trademarks.

## Name

**Prochaine** — what you hear on every métro platform ("prochaine station")
and every countdown sign ("prochain départ"). Feminine by agreement with
"station," used here as a standalone mark.

## Voice

- Neutral Quebec French or plain English. Never mixed in one reply.
- Short, declarative, platform-sign energy: "3 min · 24 Sherbrooke," not
  "Great news! Your bus is arriving in just 3 minutes!"
- Calm under complaint. Acknowledge briefly, then answer.

## Color

Four accent colors, each an original hue inspired by (but distinct from) the
four métro line colors — used for mode-tagging in the chat UI (a bus answer
carries a slightly different accent than a métro or exo answer), never as a
literal reproduction of the STM diagram.

| Token | Hex | Use |
|---|---|---|
| `--line-a` (green-leaning) | `#0C8353` | métro answers |
| `--line-b` (orange-leaning) | `#D9631E` | bus answers |
| `--line-c` (yellow-leaning) | `#D9A404` | exo answers |
| `--line-d` (blue-leaning) | `#1F5FA8` | BIXI / weather asides |
| `--ink` | `#14181C` | primary text, light mode |
| `--paper` | `#F5F3EE` | background, light mode |
| `--ink-dark` | `#EDEFF2` | primary text, dark mode |
| `--paper-dark` | `#101316` | background, dark mode |

## Type

System sans-serif stack (`-apple-system, "Segoe UI", Roboto, sans-serif`) —
this is a one-user utility, not a marketing site; it should render instantly
and feel native on Android. Numerals are tabular where shown (departure
countdowns should not jitter horizontally as digits change).

## Iconography

Geometric, single-weight marks only: a filled triangle/chevron for
"departing," a hollow circle for "stop," a simple bicycle glyph for BIXI. No
photographic imagery, no literal STM roundel.

## Tone examples

- FR: « 3 min · 24 vers Côte-Vertu. Prochain dans 11 min. »
- EN: "3 min · 24 toward Côte-Vertu. Next in 11 min."
- Frustration: « Je comprends, c'est frustrant. Le 105 est retardé de 8 min
  — voici le prochain départ fiable. »

See `docs/brand-guide.html` for a rendered reference.
