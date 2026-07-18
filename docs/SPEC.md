# Prochaine — Working Spec

## Purpose

One chat window, on one phone, for one person, answering "what's the next
X" for every way that person moves around Montreal: STM métro, STM bus, REM,
exo commuter trains, BIXI, plus a weather modifier on the answer. Named after
the word Montrealers hear constantly on the métro platform — "prochaine
station" — and on countdown displays — "prochain départ."

## Non-negotiable rule

**The LLM never invents a schedule.** Every departure time, delay, alert, or
station status comes from a real feed, fetched and normalized by code. The
LLM's job is strictly:

1. **Parse** the user's free-form message into a structured intent
   (which stop, which mode, teaching a lexicon term, a plain follow-up, etc).
2. **Format** the code's answer into natural, correctly-registered prose.

If a feed is down or a stop can't be resolved, the formatter says so — it
does not paper over the gap with a plausible-sounding guess.

## Voice doctrine

- **Comprehension is permissive.** The intent parser must handle any
  register (formal to very casual), any spelling (including common
  Québécois informal spellings and abbreviations — "stm", "pantoute",
  "asap"), and either language, including code-switched messages.
- **Output is disciplined.** Every reply is either clean, neutral Quebec
  French, or plain English — never mixed mid-reply, never a translation
  register that sounds like it was written for France. One language per
  reply, matching whichever language the user's message was in (defaulting
  to the user's stored preference for ambiguous short messages like "ok").
- **Frustration handling.** If the user expresses frustration (delay
  complaints, repeated corrections), the formatter acknowledges briefly and
  gets straight back to useful information — no over-apologizing, no
  chirpiness.

## Three-path departures engine

Different Montreal transit modes publish fundamentally different kinds of
data, so the engine picks a different strategy per mode rather than forcing
one shape on all of them:

| Mode | Path | Why |
|---|---|---|
| STM bus | **Live real-time** (GTFS-RT TripUpdates) | Buses are frequent and traffic-affected; only live positions are trustworthy |
| STM métro / REM | **Frequency tables** (GTFS static `frequencies.txt`) | These run on fixed headways, not published live positions — "every 4 min" is the honest answer, not a fake countdown |
| exo commuter rail | **Timetable + delays** (GTFS static `stop_times.txt` + GTFS-RT delay overlay) | Trains run on a real timetable; delays are the only live component worth fetching |

All three paths normalize to the same shape before reaching the formatter:

```js
{ route, headsign, minutesAway, source /* "live" | "frequency" | "timetable" */ }
```

## Stop resolution

Users don't type exact GTFS stop names. The stop matcher:

1. Normalizes (lowercase, strip accents, collapse whitespace).
2. Exact-matches against the preprocessed stop-name index.
3. Falls back to edit-distance (Levenshtein) nearest match across the index
   when there's no exact hit — e.g. "sherbrook atwatter" resolves to
   "Sherbrooke / Atwater".
4. Checks the user's personal aliases and taught lexicon before falling back
   to the general index (so "mon bus" resolves to whatever route the user
   taught it to mean, before anything else is tried).

## Onboarding

Exactly two questions, asked conversationally the first time the chat is
used, not as a form:

1. "Where's home?" (home stop)
2. "Where's work or school?" (second anchor stop)

Both are stored in the user's profile. Later messages can reference either
by name ("home", "work") without repeating the stop.

## Personal lexicon & aliases

The user can teach the bot standing terms at any time in conversation, e.g.
« quand je dis mon bus, c'est le 24 » — the intent parser recognizes
teaching statements and the lexicon service persists the mapping. Aliases
like "bus home" (shorthand for "the bus stop near home") work the same way.
Language preference is also conversational — no settings screen.

## Persistence

Single user, so a JSON file (`server/data/user-profile.json`, gitignored) is
sufficient: home/work stops, aliases, taught lexicon terms, language
preference. No database.

## Caching

All feed calls go through a simple TTL cache (`server/services/cache.js`) —
short TTLs for real-time data (bus positions, delays), longer TTLs for
static/frequency data that only changes with a schedule update.

## Alerts, BIXI, weather

- **Alerts:** multi-agency GTFS-RT Alerts feeds, surfaced when they affect a
  route/stop the user asked about.
- **BIXI:** GBFS station_information + station_status feeds, used to answer
  "nearest BIXI dock with bikes/docks available" relative to a stop.
- **Weather:** a lightweight modifier on the answer (e.g. flagging likely bus
  delays in freezing rain), not a separate query surface.

## Frontend

A single-screen PWA: one chat thread, no navigation, installable on
Android home screen. Light and dark themes follow the system setting; there
is deliberately no in-app theme toggle to maintain.

## Deployment target

Railway, two environment variables (`ANTHROPIC_API_KEY` + feed keys), a
generated domain, added to the home screen. Target cost: ~$5/month, one
user — this shapes every architectural choice in this spec (no database
server, no framework overhead, no multi-tenant complexity).
