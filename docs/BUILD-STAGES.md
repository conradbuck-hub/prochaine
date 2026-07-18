# Prochaine — Build Stages

The build process, in order, with exit criteria. Each stage gates the
next; do not skip gates. "Done" means the exit criterion is verified,
not that the code exists.

---

## Stage 0 — Keys & feed archaeology  *(you, ~1 evening)*

1. Register at developers.stm.info → create an Application → subscribe
   it to the v2 **Trip Updates** and v2 **Service Alerts** APIs → copy
   the API key.
2. Get an Anthropic API key (console.anthropic.com, small credit).
3. Locate current exo/ARTM open-data endpoints (trains GTFS static +
   GTFS-RT; REM GTFS). Note any token requirement.
4. `npm install`, copy `.env.example` → `.env`, fill in the keys and
   feed URLs.
5. Run `npm run test:feeds`.

**Exit criterion:** all five feed checks PASS. Record what the exo feed's
routeIds output looks like — it answers whether REM real-time flows
through that feed (the one open architectural question left).

---

## Stage 1 — Data spine  *(~1 evening)*

1. Download GTFS static zips (STM; exo trains; REM if it publishes
   separately) — anywhere on disk, they don't need to live in the repo.
2. `npm run preprocess -- --stm=<path> --exo=<path> [--rem=<path>]` →
   writes `server/data/compiled/stops-index.json` +
   `server/data/compiled/schedule-index.json`.
3. Spot-checks against published schedules:
   - one exo departure time and its inbound/outbound direction (flip the
     mapping in `scripts/lib/preprocess.js` if backwards — see the
     known risk below);
   - métro first/last time at one station (`GET /debug/departures/:stopId`
     with `service_hours` reasoning, or just eyeball the frequency
     window in `schedule-index.json`);
   - your home stop resolves via `GET /debug/match?q=<your stop>`.
4. `npm run dev`, then verify `GET /debug/departures/:stopId` for one bus
   stop (live RT), one métro station (frequency), one train station
   (timetable).

**Exit criterion:** all three departure paths return sane data through
the debug endpoints. No chat yet.

---

## Stage 2 — Chat end-to-end  *(~1 evening)*

1. With `ANTHROPIC_API_KEY` set, exercise `POST /chat` through the UI:
   - "Prochain 24 à <your stop>?" (bus, RT)
   - "État de la ligne orange" (alerts)
   - "Next train to Vaudreuil from Gare Centrale" (train, EN)
   - a misspelled stop ("atwatter") — matcher fallback
   - a casual/frustrated phrasing — tone rules hold
2. Complete onboarding (home → work/school) in conversation.
3. Teach one lexicon term ("quand je dis mon bus, je parle du 24"),
   then use it in a fresh session.
4. Verify aliases: "bus home", "métro pour le travail".
5. Judge whether Haiku's Quebec French is good enough, or bump
   `ANSWER_MODEL` to Sonnet (one-line env change).

**Exit criterion:** every bullet answers correctly in both languages;
onboarding + profile + lexicon persist across a server restart.

---

## Stage 3 — Deploy  *(~1 hour)*

1. Commit — confirm `server/data/compiled/*.json` are staged and `.env`
   + `server/data/user-profile.json` are NOT (`git status`).
2. Push to a private GitHub repo.
3. Railway → New Project → Deploy from repo → set `ANTHROPIC_API_KEY`,
   `STM_API_KEY`, and the exo/REM/weather env vars your Stage 0 feed
   test needed → Generate Domain.
4. On the Pixel: open the URL in Chrome → Add to Home screen.
5. Redo onboarding on the deployed instance (the profile file is
   per-instance, not shared with local dev).

**Exit criterion (= launch):** a full conversation works from the phone,
over mobile data, from a bus stop.

---

## Stage 4 — Live with it  *(2 weeks, passive)*

Use it as your only transit interface. Log every failure or annoyance (a
note per incident is enough): wrong stop resolved, stale data, tone miss,
feature reached-for-but-missing.

**Exit criterion:** 2 weeks elapsed + a written failure log. The log —
not imagination — decides Stage 5's contents.

---

## Stage 5 — Montreal polish  *(scoped by the Stage 4 log)*

Candidate backlog, in rough value order — pull only what the log demands:
- Weather caveat extension to bus answers in severe conditions
- NHL schedule fetch + `events.json` (festival calendar) crowd warnings
- STM elevator status in métro answers
- Info-Entraves roadwork context (detour "why" + bike-route impact)
- Line-coloured left rules on answers (client-side; see docs/BRAND.md's
  "Backlog item this locks in")
- Dynamic quick-chips from the query log (replacing the static
  empty-state examples in `public/index.html`)
- Habit defaults + confirmed lexicon inference (v2 proper)
- RTL / STL / exo-bus loading (only if cross-bridge queries appear)

**Exit criterion:** none — this stage is permanent. Each item ships
against a logged need, one at a time.

---

## Known risks (front-loaded into Stages 0–1)

| Risk | Resolved by |
|---|---|
| exo/REM endpoint URLs may have moved | Stage 0 feed test |
| REM real-time coverage unverified | Stage 0 (checking the exo feed's routeIds output) |
| exo `direction_id` / inbound-outbound convention needs one spot-check | Stage 1 |
| Fuzzy matcher tuned on a 4-stop fixture (`test/fixtures/gtfs-sample/`), not the real ~9,000-stop index | Stage 1–2 |

## Standing rules (all stages)

- The LLM never invents schedule data; no data → say so plainly.
- Comprehension adapts to the user; the voice never does.
- Re-run Stage 1 preprocessing when agencies publish service changes.
- Any move beyond one user re-opens: auth, privacy posture for
  `server/data/user-profile.json`, cost controls. See the decision log
  in `docs/SPEC.md`.

## Bottom line

Design, code, brand, and documentation are complete and internally
consistent as of this repo's current commit. The project is one STM form
away from touching reality, and about three evenings from living on the
home screen.
