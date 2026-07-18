# Prochaine — Build Stages

Six gated stages, each with an exit criterion. This document is meant to be
self-describing for the owner or any collaborator picking this up cold.

---

## Stage 0 — Keys & feeds (~1 evening)

**Goal:** prove every external feed is reachable before writing a single line
against it in anger.

- [ ] Finish STM developer registration (create an Application in the STM API
      catalog, subscribe it to the two v2 APIs, copy the key)
- [ ] Get an Anthropic API key
- [ ] Locate current exo/ARTM GTFS + GTFS-RT endpoints
- [ ] Run `npm run test:feeds` until all five checks pass
- [ ] Resolve the one open architectural question: does REM real-time flow
      through the exo feed, or does it need its own source?

**Exit criterion:** `npm run test:feeds` is all green, with a data sample
printed for each of the five sources.

## Stage 1 — Data spine (~1 evening)

- [ ] Download GTFS static zips for STM, exo/ARTM, and REM
- [ ] Run `npm run preprocess` to build `stops-index.json` and
      `schedule-index.json`
- [ ] Spot-check against published schedules: one exo departure + direction
      mapping, one métro first/last train time, the home stop resolving
      correctly
- [ ] Verify all three departure paths (`/debug/departures/:stopId`) return
      sane data for real stops

**Exit criterion:** all three paths return correct, spot-checked departures
for real Montreal stops.

## Stage 2 — Chat end-to-end (~1 evening)

- [ ] Test queries in both languages, several registers/spellings
- [ ] Complete onboarding (home, then work/school)
- [ ] Teach a lexicon term (e.g. « quand je dis mon bus, c'est le 24 ») and
      confirm it's used on the next query
- [ ] Confirm profile + lexicon persist across a server restart
- [ ] Judge whether Haiku's Quebec French is good enough, or bump
      `ANSWER_MODEL` to Sonnet (one-line env change)

**Exit criterion:** a full onboarding + query + teach + restart cycle works
without touching code.

## Stage 3 — Deploy (~1 hour)

- [ ] Push to a private GitHub repo
- [ ] Deploy to Railway
- [ ] Set the two required env vars (`ANTHROPIC_API_KEY`, plus whichever
      feed keys Stage 0 produced)
- [ ] Generate a domain
- [ ] Add to home screen on the Pixel

**Exit criterion (= launch):** a full conversation working from the phone,
over mobile data, standing at a bus stop.

## Stage 4 — Live and logging (~2 weeks)

- [ ] Live on the home screen for two weeks
- [ ] Log every failure (wrong stop resolved, wrong direction, awkward
      phrasing, missed alert, etc.) — do not fix anything yet, just log

**Exit criterion:** a failure log with enough volume to prioritize from.

## Stage 5 — Polish, scoped strictly by the log

Only build what Stage 4 actually surfaced. Candidates already anticipated,
not to be started early:

- [ ] Weather caveats on bus answers (e.g. delays in freezing rain)
- [ ] Hockey/festival crowd warnings near the Bell Centre / Old Port
- [ ] Elevator/escalator outage status for métro accessibility
- [ ] Roadwork context for bus detours
- [ ] Line-coloured answer rules (matching each métro line's real color)
- [ ] Habit defaults (e.g. assume "home → work" on weekday mornings without
      being asked)

**Exit criterion:** the failure log from Stage 4 is empty on replay.

---

## Known risks (front-loaded into Stages 0–1)

| Risk | Resolved by |
|---|---|
| exo/REM endpoint URLs may have moved | Stage 0 feed test |
| REM real-time coverage unverified | Stage 0 (checking exo routeIds output) |
| exo `direction_id` convention needs one spot-check | Stage 1 |
| Fuzzy matcher tuned on a 4-stop fixture, not the real ~9,000-stop index | Stage 1–2 |

## Bottom line

Design, code, brand, and documentation are complete and internally
consistent as of this repo's first commit. The project is one STM form away
from touching reality, and about three evenings from living on the home
screen.
