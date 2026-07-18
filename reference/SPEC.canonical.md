# Prochaine — Build Spec (v1, personal prototype)

**Owner:** Conrad
**Platform:** Base44 (Builder plan required — backend functions are gated to Builder+)
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
**In-scope context (v1):** weather (Open-Meteo) — informs bike-vs-transit answers.
**Design constraint:** ingestion is **agency-agnostic** — every transit source is just a feed row + entries in the stops index. RTL (Longueuil), STL (Laval), and exo suburban buses all publish GTFS/GTFS-RT via ARTM open data, so adding any of them later must be an afternoon (register feed, merge stops), not a redesign. Don't load them until the usage log demands it.
**Explicitly out of scope for v1:** A-to-B trip planning (deep-link to Google Maps transit instead), X/social data, RTL/STL/exo-bus *data loading* (architecture-ready, not loaded), push notifications, accounts, offline mode.

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
| Open-Meteo | Current conditions + short-term forecast for Montreal | Open JSON, no key | Free |
| *(Phase 3)* STM elevator status | Métro elevator outages | STM open data / alerts | Free |
| *(Phase 3)* Info-Entraves (Ville de Montréal) | Roadwork, street closures — explains bus detours, affects bike routes | Montreal open data portal, JSON/GeoJSON | Free |
| *(Phase 3)* NHL schedule API | Canadiens home games → Bonaventure / Lucien-L'Allier crowd warnings | Open JSON, no key, fetch daily | Free |
| *(Phase 3)* events.json (hand-curated) | ~15 festival date ranges/yr (Jazz Fest, Osheaga, GP, Francos...) → affected stations + impact note | Static file in repo, updated ~2×/yr | Free |
| *(deferred)* RTL / STL / exo bus GTFS+RT | South Shore / Laval / suburban buses | ARTM open data | Free |

Notes:
- Métro has **no real-time vehicle data** — métro answers come from static frequency/first-last-train data plus the alerts feed.
- **REM behaves like the métro:** high-frequency automated service, so static frequency bands + service alerts answer "when's the next one" well enough; don't build around per-train RT for it. Verify what RT the REM feed actually carries during Phase 0 and treat anything beyond alerts as a bonus.
- **exo trains are the opposite:** low-frequency, timetable-driven (some lines run a handful of departures a day). Static timetables are *essential* here, not optional — a rider needs "the 17:15 from Gare Centrale," not a frequency band. Delay/cancellation info comes from the exo RT/alerts feed.
- GTFS-RT feeds are protobuf: use `gtfs-realtime-bindings` (npm) inside Base44 backend functions.
- BIXI GBFS endpoints: `station_information.json` (static-ish, cache daily) and `station_status.json` (live).
- **Weather is a modifier, not an intent:** Open-Meteo gets called whenever intent = "bixi" (or a mode-comparison question) and its output is passed to the answer-formatting LLM call — "8 bikes at Greene, but it's −12 with freezing rain; the 24 is in 4 minutes." One API call, no key, and it's what turns the BIXI feature from novelty into judgment. Cache 10 min.
- **Events are explanation, not prediction:** the bot never forecasts crowding; it warns from known facts ("Canadiens home tonight — expect Bonaventure and Lucien-L'Allier to be packed after the game"). Hockey comes from the open NHL schedule API; festivals from a hand-curated events.json (date range, affected stations, one-line impact). The core rule extends here: the LLM never asserts an event that isn't in the file/feed — it "knows" Jazz Fest exists but will hallucinate its dates without data.
- **Winter extension to the weather modifier:** in severe conditions (heavy precip, extreme cold), attach weather to BUS queries too, not just BIXI — RT predictions degrade and buses bunch in storms, and the answer should carry one clause of caveat. Event/weather context attaches only when the query touches an affected station, line, or time window — never as boilerplate on every answer.
- **The synthesis principle:** Prochaine's value is not aggregating more schedules (Transit app already shows every agency). It's combining feeds into one situational answer — departures + alert + weather + (later) roadwork + elevator status + event context. Every feed added should serve that synthesis, not coverage for its own sake.
- **Phase 0 must verify each feed's current URL, key requirement, and RT coverage** — the ARTM has been consolidating regional open data and endpoints/registration details shift. Budget an hour of feed archaeology.
- **Skipped deliberately:** Communauto (no official public API; unofficial access is fragile/ToS-grey), Uber pricing (API access heavily restricted), event feeds (no clean single source — scraping territory), Navitia/OpenTripPlanner routing (the correct path to real A-to-B planning eventually, but a project unto itself).

---

## 3. Data preprocessing (one-time, offline — do this BEFORE touching Base44)

The full GTFS static is ~100MB+ unzipped. Do NOT load it into Base44's database raw. Preprocess it locally (Claude Code is ideal for this) into two compact JSON artifacts:

**A. `stops_index.json`** (~a few hundred KB)
Merged across agencies. For every stop/station: `{ agency: "stm"|"rem"|"exo", stop_id, stop_code, name, lat, lon, modes: ["bus"|"metro"|"rem"|"train"], routes: ["24","144","exo4",...] }`
This is the fuzzy-matching / geolocation index. Small enough to load client-side or into a single Base44 entity — same pattern as QBOT's client-side catalog search. Prefix stop_ids with agency to avoid collisions.

**B. `schedule_core.json`**
Not the full stop_times table. Composition:
1. **STM bus — RT-first (recommended):** rely on GTFS-RT Trip Updates for bus departure times. Keep static only for métro frequency bands, first/last departures per métro station, and night bus (ligne 300s) frequencies.
2. **REM:** frequency bands per time-of-day + first/last trains per station, extracted from the REM GTFS. Small and stable.
3. **exo trains:** the full weekday/weekend timetable per line — this is the one place static stop_times genuinely matter, but train service is so sparse the extracted table stays tiny (a few hundred departures across all lines). Overlay exo RT delay/cancellation data at query time.
4. If STM RT coverage proves spotty on your routes, add a static bus fallback later for the ~10–20 routes you use.

**Refresh cadence:** STM republishes GTFS static several times a year (service changes). Re-run the preprocessing script when routes change. Acceptable manual chore for a personal tool.

---

## 4. Architecture (Base44)

```
[PWA chat UI]
     │
     ▼
[backend function: chat()]  ← orchestrator
     │  1. Invoke LLM (intent parse → structured JSON)
     │  2. route to data function(s)
     │  3. Invoke LLM (format answer, user's language)
     ▼
[backend functions]
  getDepartures(stop_id, route?, direction?)   → reads RT cache (STM) or timetable+RT overlay (exo) or frequency table (métro/REM)
  getAlerts(agency?, line?)                     → reads RT cache, merged across agencies
  getBixi(lat, lon)                             → live GBFS fetch (cheap)
  getWeather()                                  → Open-Meteo, cached 10 min; auto-called for bixi/mode-comparison intents
  refreshRtCache(feed)                          → fetches any registered GTFS-RT feed (STM / exo today; RTL/STL later = new rows, zero new code)
     │
     ▼
[Base44 DB entities]
  RtCache      { feed_type, payload_json, fetched_at }   ← one row per feed: stm_trips, stm_alerts, exo_trips, exo_alerts, weather (+ rtl_*, stl_* if ever loaded)
  StopsIndex   { payload_json }                           ← merged multi-agency index
  ChatHistory  { role, content, ts }                      ← session context
```

**Secrets:** STM API key (and exo key if their feed requires one) live in Base44 Secrets, only touched by backend functions. Never client-side.

**Caching rule:** on any data request, if `fetched_at` for the relevant feed is older than **60 seconds**, refresh first, else serve cache. (STM updates ~every 10s; 60s staleness is fine for personal use and keeps you politely under everyone's limits.) exo train RT can tolerate a longer window (2–3 min) given service frequency. BIXI status can be fetched live per request — it's a lightweight open JSON. Only refresh the feeds a query actually touches — a bus question shouldn't trigger an exo fetch.

**Dispatch logic in getDepartures:** the stops index tells you the mode. STM bus → RT trip updates; métro/REM → frequency band + first/last times + any active alerts; exo train → static timetable, overlaid with RT delays/cancellations. Same function signature, three resolution paths.

**LLM:** use Base44's built-in Invoke LLM integration for v1 — zero key management. If response quality on FR intent parsing disappoints, swap to a direct Anthropic API call from a backend function later.

---

## 5. Intent parsing — the system prompt (core IP of the app)

Call 1 to the LLM per user message. Instruct it to return ONLY JSON:

```
You parse Montreal transit questions (French or English) into a structured query.
Return ONLY valid JSON, no prose, matching:

{
  "intent": "departures" | "alerts" | "bixi" | "service_hours" | "smalltalk" | "out_of_scope",
  "mode_hint": "bus" | "metro" | "rem" | "train" | null,   // only if the user names a mode
  "route": string | null,          // e.g. "24", "144", "orange", "verte", "exo4", "Vaudreuil"
  "stop_query": string | null,     // raw stop/intersection/station text, e.g. "Sherbrooke/Atwater", "Berri", "Gare Centrale"
  "direction": "E"|"W"|"N"|"S"|"inbound"|"outbound"|null,
  "when": "now" | "tonight" | "specific" | null,
  "use_geolocation": boolean,      // true if user implies "near me / from here"
  "frustrated": boolean,           // heated tone, swearing, venting
  "language": "fr" | "en"
}

Rules:
- Métro line names (orange, verte/green, jaune/yellow, bleue/blue) → route = line name, mode_hint "metro".
- "REM" or REM station names (Brossard, Île-des-Sœurs, Gare Centrale...) → mode_hint "rem". Note Gare Centrale serves BOTH the REM and exo trains — leave mode_hint null there unless the user specifies, and let the app return both.
- exo line names or termini ("le train de Vaudreuil", "Saint-Jérôme line", "train de banlieue") → mode_hint "train"; put the line/branch name in route.
- Commuter trains use "inbound" (toward downtown/Gare Centrale or Lucien-L'Allier) and "outbound" rather than compass directions.
- "Should I bike / any BIXIs" → intent "bixi".
- A-to-B routing requests ("how do I get to X from Y") → intent "out_of_scope".
- Never guess a stop_id. Pass raw text in stop_query; the app resolves it.
- Profanity and Quebec sacres (tabarnak, osti, câlisse, criss...) are common
  and usually just intensifiers. NEVER classify a message as out_of_scope
  or smalltalk because of swearing — extract the transit question underneath.
  "où est l'osti de 24" = departures, route 24. "fucking orange line again" =
  alerts, orange line. Set "frustrated": true when the message is heated.
- Users write in Quebec French slang / joual and franglais. Understand it;
  it never affects intent classification. Comprehension guide:
  "y'a-tu" = is there ("y'a-tu un bus qui s'en vient?" = departures);
  "chu pogné à X" = I'm stuck at X (stop_query = X, likely alerts or
  departures); "ça niaise" / "le bus niaise" = it's late/not coming;
  "fucké" / "brisé" / "toute croche" = broken (alerts); "à soir" = tonight;
  "drette là" / "là là" = right now; "pis" = and ("Sherbrooke pis Atwater"
  is an intersection); "faque" = so; "s'en vient-tu" = is it coming;
  "l'aut' bord" = the other direction; "en calvaire" / "en maudit" =
  intensifier (frustrated: true); "le métro a lâché" = service failure;
  "char" = car (mode comparison); dropped ne ("j'ai pas", "y passe pas").
  When in doubt, resolve toward a transit intent, not smalltalk.
```

**Francophone varieties:** Montreal's French is plural — France, Belgian, Swiss, Haitian, Maghrebi, West African — and the parser treats every variety as correct, never as deviation (« le car », « septante », vouvoiement, all parse identically). Haitian Creole parses as its own language. Output stays one voice: clean standard Quebec French, intelligible to every francophone — comprehension adapts to the user; the voice never does.

**Register spectrum:** spoken and written Quebec French differ for the same person — many users who speak joual write standard French to an app. The parser expects standard register by default; slang/joual/sacres coverage is recognition insurance, never an expectation or a phrase-matching strategy. Users will phrase identical needs in unlisted ways; parsing is meaning-first. Displayed examples (deck, in-app) model standard register; the Phase 4 query log recalibrates chips and empty-state examples against how the user actually writes, not how we guessed they would.

**Comprehension robustness (Montreal is an allophone city):** the parser never lets spelling, grammar, missing accents, phonetic joual, or SMS compression affect intent; it corrects obvious stop-name typos into stop_query; and it parses questions arriving in any language, answering in simple French or English. The matcher backs this with an edit-distance fallback for typos (« atwatter » → Atwater) that only runs on total misses. Answers use plain language — short sentences, common words, digits — and NEVER correct or comment on the user’s writing.

**Stop resolution happens in code, not in the LLM:** fuzzy-match `stop_query` against `stops_index.json` (normalize accents, handle "/" intersections, boost by geolocation proximity when available). If >1 strong candidate, the bot asks a one-line clarifying question with the top 3.

Call 2: hand the structured data result + original question back to the LLM. The answer language is the language the user is **leading with** (detected by the parser — franglais resolves to the dominant language), unless a standing conversational preference is stored in the profile, which wins:

```
Answer concisely using ONLY the data provided. Include relevant service
alerts unprompted. If data is empty or stale, say so plainly.

Answer language "fr-qc": respond in clean, standard Quebec French —
the register of a good STM service announcement, not France French and
not street slang. Quebec norms apply: "présentement", "l'autobus",
"le métro", "en direction est/ouest", "hors service", 24-hour clock
("17 h 40"). Polite-neutral register (vous or impersonal). Avoid
France-isms ("prochainement", "au sein de").

ABSOLUTE RULE — never use slang, joual, sacres, anglicisms, or casual
contractions in responses, even if the user does, and even when
mirroring their vocabulary would feel friendly. No "c'est plate", no
"tantôt", no "ouais", no "fucké", no "tsé". Understand the user's slang;
answer in clean French. Same in English: understand casual/profane
input, respond in plain professional English.

Answer language "en": plain English, 24-hour or 12-hour clock, either
is fine. STM line names stay in French (ligne orange = orange line is fine
either way).

Tone when the user is frustrated or swearing:
- Stay completely unbothered. Never comment on their language, never
  lecture, never mirror the profanity or slang back.
- Acknowledge in ONE short clause of clean language, then answer
  immediately. Vary the acknowledgment — never a stock phrase twice in
  a row. Good: "Je comprends la frustration — prochain passage à
  17 h 42." / "Not a great morning for it — next 24 is in 6 minutes."
- If a real disruption explains their mood, LEAD with it: "Effectivement,
  la ligne orange est interrompue entre Berri et Jean-Talon — un service
  de navettes est en place." Validation through facts beats validation
  through sympathy.
- Never apologize on behalf of the STM/exo or promise anything about
  service. You report; you don't represent.
- If the message is pure venting with no question, respond with one
  calm line and offer the obvious next thing: "Je comprends. Voulez-vous
  l'état du service sur cette ligne?"
```

Two implementation notes:
- The **standing language preference** is set conversationally (« réponds toujours en français » → set_language intent) and persists in the profile; « just match me » returns to auto. It controls the *answer* language regardless of the question's language — ask in English, receive Quebec French — which doubles as a low-stakes language-learning surface. No UI control exists or is needed.
- Keep the intent parser (Call 1) language-agnostic as already specified — it detects the question's language but the setting wins for output.

---

## 6. UI requirements (keep it spartan)

- Single chat screen. Message list + input. That's it.
- Chips above the input for your recurring queries ("Next bus home", "Orange line status", "BIXI near me") — tap instead of type. These are just canned messages.
- Geolocation permission requested on first "near me" query, not on load.
- No language toggle. The bot answers in the language the user leads with (franglais input included — one clean language out, never mixed). A standing preference is set conversationally (« réponds toujours en français ») and persists in the profile. The theme toggle is the header's only control.
- PWA manifest so it installs to the Pixel home screen with an icon.

---

## 7. Build sequence

**Phase 0 — prerequisites (before Base44)**
1. Register at developers.stm.info → get GTFS-RT API key. Verify you can pull Trip Updates + Alerts (a 10-line local script).
2. Locate the current exo/ARTM open data endpoints for exo train GTFS static + RT and REM GTFS. Verify access and check what the REM RT feed actually carries. (Feed archaeology — budget an hour.)
3. Download all GTFS statics; run preprocessing → merged `stops_index.json` + métro/REM frequency tables + exo train timetable extract.
4. Confirm Base44 Builder plan (backend functions).

**Phase 1 — data spine (no chat yet)**
Backend functions `refreshRtCache`, `getAlerts`, `getDepartures` with all three resolution paths (RT bus / frequency métro-REM / timetable train) + a debug page that shows raw output for a hardcoded stop. *Milestone: live departure times for your home bus stop AND the next Vaudreuil train from Gare Centrale, both on screen.*

**Phase 2 — chat layer**
`chat()` orchestrator, intent-parse prompt, stop fuzzy-matching (including the Gare Centrale REM-vs-train case), answer formatting. *Milestone: "when's the next 24 from Sherbrooke/Atwater" and "prochain REM pour Brossard" both answered correctly in both languages.*

**Phase 2.5 — profile & conversational onboarding**
First run, the bot asks two base questions in chat (no settings form): where's home, then where do you work or study — each skippable, asked in consecutive turns. Answers resolve through the stops matcher, with Nominatim geocoding as the address fallback (free OSM, personal volume). Places (home/work/school) persist in data/profile.json (gitignored — it's a location diary). Thereafter "when's my bus home" / "métro chez moi" resolve instantly; setting or changing a place is a sentence ("mon arrêt travail est Gare Centrale"), and referencing an unset place triggers a one-clause offer to save it. Aliases fill gaps in a query; they never override an explicitly named stop. **Personal lexicon (v1):** users teach shorthand in a sentence — "quand je dis mon bus, je parle du 24" → set_term intent → stored in the profile and injected into every parse call, so "mon bus s’en vient?" parses as departures/route 24. Explicit, confirmable, correctable — the honest version of "learns how I speak". Doctrine: comprehension adapts to the user; the voice never does. v2 seed: the Phase 4 query log + these anchors enable habit-based defaults ("Pour ton trajet habituel du matin…") and confirmed lexicon inference ("quand vous dites « le bus », c’est le 24 — je le retiens?") — always stated, never silent.

**Phase 3 — Montreal polish**
Weather-aware BIXI/mode answers (getWeather wired into the formatting call) plus the winter extension to bus queries, métro/REM hours, alert injection ("the 24 is coming in 6 min — note there's a detour on this line"), STM elevator status in métro answers, Info-Entraves roadwork context for detours and bike routes, event context (NHL schedule fetch + events.json for festivals — crowd warnings for affected stations/times), quick-query chips, geolocation, PWA install.

**Phase 4 — live with it for two weeks**
Log every query that fails or annoys. That log — not imagination — decides v2 (static bus schedule fallback? X chatter? trip planning? the YUL "REM vs 747" comparison?).

---

## 8. Base44 kickoff prompt (paste this to start the app)

*(Legacy path — superseded by the custom Node build in the repo; kept for reference only.)*

> Build a mobile-first PWA chat app called "Prochaine". Single screen: a chat message list and a text input, with 3 tappable quick-query chips above the input. No language control — language is detected and handled by the prompts. Dark theme, system fonts, no branding flourishes. Empty state shows the placeholder "Prochaine station?"
>
> Backend (this is the important part — build it exactly like this):
> - Store API keys in Secrets as STM_API_KEY (and EXO_API_KEY if needed).
> - Entity RtCache: fields feed_type (string: stm_trips, stm_alerts, exo_trips, exo_alerts), payload_json (json), fetched_at (datetime). One row per feed.
> - Backend function refreshRtCache(feed_type): fetches the corresponding GTFS-realtime feed (STM or exo) using gtfs-realtime-bindings to decode protobuf, stores decoded JSON in RtCache with timestamp.
> - Backend functions getDepartures(stop_id) and getAlerts(): read RtCache; if fetched_at older than 60 seconds (180 for exo feeds), call refreshRtCache first, then serve from cache. Only refresh feeds relevant to the query. getDepartures resolves by mode from the stops index: STM bus stops use real-time trip updates; métro and REM stations use a stored frequency/first-last table; exo train stations use a stored static timetable overlaid with exo real-time delays and cancellations.
> - Backend function getBixi(lat, lon): fetches BIXI GBFS station_information and station_status JSON, returns the 3 nearest stations with bikes/docks available.
> - Backend function getWeather(): fetches current conditions and next-2-hour precipitation for Montreal from the Open-Meteo API (no key needed), cached in RtCache for 10 minutes. When the user's question involves BIXI or comparing ways to travel, include the weather output in the data passed to the final answer step.
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
| Build platform | Base44 prototype | If it outgrows Base44 → port to Node app (Railway/Render); the preprocessing artifacts and prompts carry over unchanged |
| Network scope | STM + REM + exo trains + BIXI loaded; RTL/STL/exo-bus architecture-ready but not loaded | Load an agency when the 2-week log shows real cross-bridge queries (afternoon of work each) |
| Context feeds | Weather (Open-Meteo) in v1; elevator status + Info-Entraves + NHL schedule + events.json in Phase 3 | — |
| Crowding | Explain from known events, never predict | If STM ever publishes crowding data beyond the orange line pilot, revisit |
| Profile / habits | Conversational onboarding + home/work/school aliases (Phase 2.5); habit defaults from query log deferred to v2 | Profile.json is personal location data — re-examine before any shared deployment |
| Proactive notifications | Out — attention on the bot's schedule, not the user's | Only if the Phase 4 log shows the identical manual query at the identical time daily |
| Communauto / Uber / events | Skipped — no official API, restricted API, no clean feed respectively | Communauto: if an official API ever ships, it's the perfect "no bus for 25 min" answer |
| Trip planning | Out of scope; deep-link out | If 2-week log shows constant A-to-B queries. First candidate: the YUL comparison ("REM or the 747?") |
| X / crowdsourced | Out | If alerts feed proves slow vs reality; then evaluate third-party X data (ToS grey zone) or Reddit |
| LLM provider | Base44 Invoke LLM | If FR intent parsing or Quebec French output is weak → direct Anthropic API from backend function |
| Static bus stop_times | Skipped (RT-first) | If STM RT coverage is spotty on your routes. (exo train timetables ARE static-first by design) |
