# Prochaine — Build Spec (v1, personal prototype)

**Owner:** Conrad
**Platform:** Node/Express, deployed to Railway. (Originally scoped as a
Base44 prototype — see the decision log in §9; the port to a plain Node
app happened before this repo's first commit, so §4 below describes the
Node architecture directly. §8's Base44 kickoff prompt is kept only as a
historical record of the original plan.)
**Form factor:** Mobile web / PWA (add to home screen on Pixel)
**Users:** 1 (you). No auth flows, no rate limiting for others, no cost controls beyond your own usage.

---

## 1. Product definition

A bilingual (Quebec French / English — auto-detected, franglais welcome) conversational interface for Montreal transit that answers, in one message, the questions that take several taps in Transit/Chrono:

- "When's the next 24 eastbound from Sherbrooke/Atwater?"
- "Is the orange line messed up right now?"
- "Last métro from Berri tonight?"
- "Any BIXIs at the station near Greene?"
- "I'm at [geolocation] — what's leaving soon?"

**Core rule:** the LLM never answers a schedule question from its own knowledge. It parses intent → code queries real data → LLM formats the answer. If data is unavailable, it says so.

**In-scope network (v1):** STM (métro + bus), REM, exo commuter trains, BIXI.
**In-scope context (v1):** weather — informs bike-vs-transit answers.
**Design constraint:** ingestion is **agency-agnostic** — every transit source is just a feed row + entries in the stops index. RTL (Longueuil), STL (Laval), and exo suburban buses all publish GTFS/GTFS-RT via ARTM open data, so adding any of them later must be an afternoon (register feed, merge stops), not a redesign. Don't load them until the usage log demands it.
**Explicitly out of scope for v1:** A-to-B trip planning (deep-link to Google Maps transit instead — the parser tags these `out_of_scope`), X/social data, RTL/STL/exo-bus *data loading* (architecture-ready, not loaded), push notifications, accounts, offline mode.

---

## 2. Data sources

| Source | What | Access | Cost |
|---|---|---|---|
| STM GTFS static | Stops, routes, scheduled times | Download zip from STM open data | Free |
| STM GTFS-RT Trip Updates | Real-time bus departure predictions | API key (register at developers.stm.info), protobuf | Free |
| STM GTFS-RT Service Alerts | Métro + bus disruptions, FR/EN text | Same key, protobuf | Free |
| exo GTFS static (trains) | Train stations, lines, full timetables | exo / ARTM open data portal | Free |
| exo GTFS-RT | Train trip updates + service alerts | exo open data (check current key requirements at signup) | Free |
| REM GTFS static | Stations, frequencies, hours | Distributed via exo/ARTM open data | Free |
| BIXI GBFS | Station status (bikes/docks available) | Open JSON, no key | Free |
| Weather | Current conditions + short-term forecast for Montreal | Configurable provider (`WEATHER_API_URL`/`WEATHER_API_KEY`) — Open-Meteo is the intended pick since it needs no key; not yet wired to a specific provider, see the note below | Free |
| *(Phase 3)* STM elevator status | Métro elevator outages | STM open data / alerts | Free |
| *(Phase 3)* Info-Entraves (Ville de Montréal) | Roadwork, street closures — explains bus detours, affects bike routes | Montreal open data portal, JSON/GeoJSON | Free |
| *(Phase 3)* NHL schedule API | Canadiens home games → Bonaventure / Lucien-L'Allier crowd warnings | Open JSON, no key, fetch daily | Free |
| *(Phase 3)* events.json (hand-curated) | ~15 festival date ranges/yr (Jazz Fest, Osheaga, GP, Francos...) → affected stations + impact note | Static file in repo, updated ~2×/yr | Free |
| *(deferred)* RTL / STL / exo bus GTFS+RT | South Shore / Laval / suburban buses | ARTM open data | Free |

Notes:
- Métro has **no real-time vehicle data** — métro answers come from static frequency/first-last-train data plus the alerts feed.
- **REM behaves like the métro:** high-frequency automated service, so static frequency bands + service alerts answer "when's the next one" well enough; don't build around per-train RT for it. Verify what RT the REM feed actually carries during Stage 0 and treat anything beyond alerts as a bonus.
- **exo trains are the opposite:** low-frequency, timetable-driven (some lines run a handful of departures a day). Static timetables are *essential* here, not optional — a rider needs "the 17:15 from Gare Centrale," not a frequency band. Delay/cancellation info comes from the exo RT/alerts feed.
- GTFS-RT feeds are protobuf: `gtfs-realtime-bindings` (npm) decodes them — see `server/services/departures/bus.js` and `exo.js`.
- BIXI GBFS endpoints: `station_information.json` (static-ish, cache daily) and `station_status.json` (live) — see `server/services/bixi.js`.
- **Weather is a modifier, not an intent:** the weather call happens whenever the resolved query is `bixi` (or a mode-comparison question) and its output is passed to the answer-formatting LLM call — "8 bikes at Greene, but it's −12 with freezing rain; the 24 is in 4 minutes." One API call, cached, and it's what turns the BIXI feature from novelty into judgment. Cache 10 min (`server/services/weather.js`, `TTL.WEATHER`). **Known gap:** the repo's `.env.example`/`server/config.js` currently require a `WEATHER_API_KEY`, but Open-Meteo (the intended provider per this spec) needs no key — resolve which provider is actually being used in Stage 0 and simplify the config then, rather than guessing now.
- **Events are explanation, not prediction:** the bot never forecasts crowding; it warns from known facts ("Canadiens home tonight — expect Bonaventure and Lucien-L'Allier to be packed after the game"). Hockey comes from the open NHL schedule API; festivals from a hand-curated events.json (date range, affected stations, one-line impact). The core rule extends here: the LLM never asserts an event that isn't in the file/feed — it "knows" Jazz Fest exists but will hallucinate its dates without data.
- **Winter extension to the weather modifier:** in severe conditions (heavy precip, extreme cold), attach weather to BUS queries too, not just BIXI — RT predictions degrade and buses bunch in storms, and the answer should carry one clause of caveat. Event/weather context attaches only when the query touches an affected station, line, or time window — never as boilerplate on every answer.
- **The synthesis principle:** Prochaine's value is not aggregating more schedules (Transit app already shows every agency). It's combining feeds into one situational answer — departures + alert + weather + (later) roadwork + elevator status + event context. Every feed added should serve that synthesis, not coverage for its own sake.
- **Stage 0 must verify each feed's current URL, key requirement, and RT coverage** — the ARTM has been consolidating regional open data and endpoints/registration details shift. Budget an hour of feed archaeology.
- **Skipped deliberately:** Communauto (no official public API; unofficial access is fragile/ToS-grey), Uber pricing (API access heavily restricted), event feeds (no clean single source — scraping territory), Navitia/OpenTripPlanner routing (the correct path to real A-to-B planning eventually, but a project unto itself).

---

## 3. Data preprocessing (one-time, offline — before touching real feeds)

The full GTFS static is ~100MB+ unzipped. Don't ship it — `scripts/preprocess-gtfs.js` streams it (row-by-row for the large `stop_times.txt`, see `scripts/lib/preprocess.js`) into two compact JSON artifacts, committed to the repo since they're small and the deploy has no separate build step:

**A. `server/data/compiled/stops-index.json`** (~a few hundred KB, at real scale)
Merged across agencies. For every stop/station actually served: `{ id, name, agency, mode, lat, lon }` — `mode` is `"bus" | "metro" | "rem" | "exo"`, `id` is agency-prefixed (`stm:1234`) to avoid collisions across agencies. This is the fuzzy-matching index `server/services/stopMatcher.js` searches.

**B. `server/data/compiled/schedule-index.json`**
Not the full stop_times table. Composition:
1. **STM bus — RT-first:** no static schedule captured at all; `server/services/departures/bus.js` relies entirely on GTFS-RT Trip Updates at query time.
2. **Métro/REM:** frequency bands per time-of-day, extracted from `frequencies.txt` — `scheduleIndex.frequencies[stopId]`.
3. **exo trains:** the full weekday/weekend timetable per line — this is the one place static stop_times genuinely matter, but train service is so sparse the extracted table stays tiny (a few hundred departures across all lines) — `scheduleIndex.timetable[stopId]`, overlaid with exo RT delay data at query time.
4. If STM RT coverage proves spotty on your routes, add a static bus fallback later for the ~10–20 routes you use (not built — see the decision log).

**Refresh cadence:** STM republishes GTFS static several times a year (service changes). Re-run `npm run preprocess` when routes change. Acceptable manual chore for a personal tool.

---

## 4. Architecture (Node/Express)

```
[PWA chat UI]  (public/)
     │
     ▼
POST /chat  (server/routes/chat.js)  ← orchestrator
     │  1. intercept onboarding turns directly (no LLM call)
     │  2. parseIntent()  — LLM call 1, structured JSON
     │  3. resolve the stop (server/services/stopMatcher.js: aliases →
     │     lexicon → exact → edit-distance fallback)
     │  4. route to the matching service(s)
     │  5. formatAnswer()  — LLM call 2, DATA block → prose
     ▼
server/services/
  departures/{bus,metro,exo,index}.js   → getDepartures(): 3 resolution paths by stop.mode
                                            (live RT bus / frequency métro-REM / timetable+delay exo)
                                           → getServiceHours(): frequency window or first/last timetable entry
  alerts.js         → getRelevantAlerts(): GTFS-RT Alerts, filtered to the query's routes/stop
  bixi.js           → getNearestBixiStations(): GBFS station_information + station_status
  weather.js        → getWeatherCaveat(): one-clause caveat, folded into departure/bixi answers
  cache.js          → TTLCache: in-memory TTL cache, presets in TTL (see server/services/cache.js)
  stopMatcher.js    → findStop(): typo-tolerant resolution against stops-index.json
  onboarding.js     → home → work-or-school, skippable, work-vs-school classified from the answer text
  lexicon.js        → teachTerm/addAlias/setLanguage/forgetTerm
  userProfile.js    → loadProfile/saveProfile: server/data/user-profile.json (gitignored, single user)
```

**Secrets:** all API keys live in `.env` (gitignored), read once in `server/config.js`, never sent to the client.

**Caching:** each feed call goes through `TTLCache.getOrFetch` with a TTL matched to how fast that feed actually changes (`TTL.LIVE_RT` = 30s for bus/exo-delay overlays, `TTL.FREQUENCY_TABLE`/`TTL.TIMETABLE` = 1h for the static-derived data, `TTL.ALERTS` = 60s, `TTL.BIXI` = 30s, `TTL.WEATHER` = 10min). Only the feeds a query actually touches get called — a bus question never triggers an exo fetch.

**Dispatch logic in `getDepartures`/`getServiceHours`:** the stops index's `mode` field says which of the three paths to use. STM bus → RT trip updates; métro/REM → frequency band + any active alerts; exo train → static timetable, overlaid with RT delays/cancellations. Same call shape, three resolution paths — see `server/services/departures/index.js`.

**LLM:** direct Anthropic API calls (`server/llm/client.js`), not a routed integration — `INTENT_MODEL`/`ANSWER_MODEL` are independently configurable env vars, defaulting to Haiku; bump `ANSWER_MODEL` to Sonnet with a one-line env change if Quebec French quality disappoints (Stage 2 judgment call).

---

## 5. Intent parsing & answer formatting — the system prompts (core IP of the app)

The actual, maintained prompt text lives in `server/llm/prompts/intent-parser.md` and
`server/llm/prompts/answer-formatter.md` — this section is deliberately not a
second copy of that text (copies drift). What follows is the design
narrative behind those prompts.

**Francophone varieties:** Montreal's French is plural — France, Belgian, Swiss, Haitian, Maghrebi, West African — and the parser treats every variety as correct, never as deviation (« le car », « septante », vouvoiement, all parse identically). Haitian Creole parses as its own language. Output stays one voice: clean standard Quebec French, intelligible to every francophone — comprehension adapts to the user; the voice never does.

**Register spectrum:** spoken and written Quebec French differ for the same person — many users who speak joual write standard French to an app. The parser expects standard register by default; slang/joual/sacres coverage is recognition insurance, never an expectation or a phrase-matching strategy. Users will phrase identical needs in unlisted ways; parsing is meaning-first. Displayed examples (deck, in-app empty state) model standard register; the Stage 4 query log recalibrates the empty-state examples against how the user actually writes, not how we guessed they would.

**Comprehension robustness (Montreal is an allophone city):** the parser never lets spelling, grammar, missing accents, phonetic joual, or SMS compression affect intent; it corrects obvious stop-name typos into `stopQuery`; and it parses questions arriving in any language, answering in simple French or English. `server/services/stopMatcher.js` backs this with an edit-distance fallback for typos (« atwatter » → Atwater) that only runs on total misses. Answers use plain language — short sentences, common words, digits — and NEVER correct or comment on the user's writing.

**Stop resolution happens in code, not in the LLM:** `findStop()` checks personal aliases/lexicon first, then an exact match, then fuzzy-matches `stopQuery` against `stops-index.json` (normalized, accent-insensitive). Geolocation-boosted matching and a multi-candidate clarifying question are not built yet — single best match only (see the decision log).

**Standing language preference:** set conversationally (« réponds toujours en français » → `set_language` intent) and persists in `profile.language`; « just match me » (`languagePref: "auto"`) clears it back to per-message detection. It controls the *answer* language regardless of the question's language — ask in English, receive Quebec French — which doubles as a low-stakes language-learning surface. No UI control exists or is needed. The intent parser stays language-agnostic on input as already specified — it detects the question's language, but the stored preference wins for output (`server/routes/chat.js`: `const language = profile.language ?? intent.language`).

---

## 6. UI requirements (keep it spartan)

- Single chat screen. Message list + input. That's it.
- Empty-state example queries (tap-to-send) instead of always-visible
  chips for now — `public/index.html`'s `#empty-state`; the four
  examples come straight from the parser prompt's own calibration
  examples. Revisit as dynamic quick-chips from the query log in Stage 5.
- Geolocation is not wired yet (`useGeolocation` is captured in the
  intent schema but unused) — Stage 5 candidate.
- No language toggle. The bot answers in the language the user leads with (franglais input included — one clean language out, never mixed). A standing preference is set conversationally and persists in the profile. The theme toggle (auto/light/dark, `public/app.js`) is the header's only control.
- PWA manifest so it installs to the Pixel home screen with an icon.

---

## 7. Build sequence

See `docs/BUILD-STAGES.md` for the current, authoritative stage-by-stage
plan with exit criteria — it supersedes the phase outline that used to
live in this section.

---

## 8. Base44 kickoff prompt

*(Legacy path — superseded by the custom Node build in this repo before
its first commit; kept only as a historical record of the original plan,
not as instructions to follow.)*

> Build a mobile-first PWA chat app called "Prochaine". Single screen: a chat message list and a text input, with 3 tappable quick-query chips above the input. No language control — language is detected and handled by the prompts. Dark theme, system fonts, no branding flourishes. Empty state shows the placeholder "Prochaine station?"
>
> Backend (this is the important part — build it exactly like this):
> - Store API keys in Secrets as STM_API_KEY (and EXO_API_KEY if needed).
> - Entity RtCache: fields feed_type (string: stm_trips, stm_alerts, exo_trips, exo_alerts), payload_json (json), fetched_at (datetime). One row per feed.
> - Backend function refreshRtCache(feed_type): fetches the corresponding GTFS-realtime feed (STM or exo) using gtfs-realtime-bindings to decode protobuf, stores decoded JSON in RtCache with timestamp.
> - Backend functions getDepartures(stop_id) and getAlerts(): read RtCache; if fetched_at older than 60 seconds (180 for exo feeds), call refreshRtCache first, then serve from cache. Only refresh feeds relevant to the query. getDepartures resolves by mode from the stops index: STM bus stops use real-time trip updates; métro and REM stations use a stored frequency/first-last table; exo train stations use a stored static timetable overlaid with exo real-time delays and cancellations.
> - Backend function getBixi(lat, lon): fetches BIXI GBFS station_information and station_status JSON, returns the 3 nearest stations with bikes/docks available.
> - Backend function getWeather(): fetches current conditions and next-2-hour precipitation for Montreal, cached for 10 minutes. When the user's question involves BIXI or comparing ways to travel, include the weather output in the data passed to the final answer step.
> - Backend function chat(message, lat?, lon?): (1) calls Invoke LLM with a system prompt that parses the message into structured JSON intent — I will supply this prompt; (2) resolves stop names by fuzzy-matching against a StopsIndex entity I will upload as JSON (multi-agency: STM, REM, exo); (3) calls the matching data function; (4) calls Invoke LLM again to write a concise answer in the language the user led with, or their stored preference (Quebec French or English), using only the returned data — I will supply this prompt too. Both prompts include handling for frustrated or profanity-laden messages (treat them as normal transit questions, acknowledge briefly, answer); do not add any separate profanity filter or content moderation layer that would block these messages before they reach the LLM.
> - The LLM must never invent schedule data. If a data call returns nothing, the answer says the data is unavailable.
>
> Do not add authentication, user accounts, or any pages beyond the chat screen and a hidden /debug page that shows raw output of getDepartures for a stop_id I type in.

---

## 9. Decision log

| Decision | Choice | Revisit when |
|---|---|---|
| Name | Prochaine | — |
| Web vs native | PWA | Never, probably |
| Build platform | Node/Express (Railway) | Was originally scoped as a Base44 prototype; ported to Node before this repo's first commit — see §8 |
| Network scope | STM + REM + exo trains + BIXI loaded; RTL/STL/exo-bus architecture-ready but not loaded | Load an agency when the Stage 4 log shows real cross-bridge queries (afternoon of work each) |
| Context feeds | Weather in v1 (provider still unresolved — see §2); elevator status + Info-Entraves + NHL schedule + events.json in Stage 5 | — |
| Crowding | Explain from known events, never predict | If STM ever publishes crowding data beyond the orange line pilot, revisit |
| Profile / habits | Conversational onboarding + home/work/school aliases; habit defaults from query log deferred to v2 | `server/data/user-profile.json` is personal location data — re-examine before any shared deployment |
| Proactive notifications | Out — attention on the bot's schedule, not the user's | Only if the Stage 4 log shows the identical manual query at the identical time daily |
| Communauto / Uber / events | Skipped — no official API, restricted API, no clean feed respectively | Communauto: if an official API ever ships, it's the perfect "no bus for 25 min" answer |
| Trip planning | Out of scope (`out_of_scope` intent); deep-link out | If the Stage 4 log shows constant A-to-B queries. First candidate: the YUL comparison ("REM or the 747?") |
| X / crowdsourced | Out | If alerts feed proves slow vs reality; then evaluate third-party X data (ToS grey zone) or Reddit |
| LLM provider | Direct Anthropic API | Already direct — was Base44 Invoke LLM in the original plan, changed with the Node port |
| Static bus stop_times | Skipped (RT-first) | If STM RT coverage is spotty on your routes. (exo train timetables ARE static-first by design) |
| Stop disambiguation | Single best fuzzy match only, no clarifying question yet | If Stage 2 testing shows frequent wrong-stop resolution on ambiguous names |
