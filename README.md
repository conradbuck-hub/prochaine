# Prochaine

A personal, bilingual transit chatbot for Montreal — one chat window covering
STM métro and bus, REM, exo commuter trains, BIXI, and weather, installed as a
PWA on a phone.

**Core rule:** the LLM parses the question and phrases the answer; code
queries the real feeds. The model never invents a schedule.

**Voice doctrine:** comprehension adapts to the user — any register, any
spelling, any language Montrealers actually write in — while the output voice
never changes: clean, neutral Quebec French or plain English, one language
per reply.

See `docs/SPEC.md` for the full working spec, `docs/BUILD-STAGES.md` for
where the project stands and what's left, and `docs/BRAND.md` for the visual
and voice guide.

## Status

Stage 0 (keys & feeds) is the current blocker — see `docs/BUILD-STAGES.md`.
Everything buildable without live credentials is in this repo, smoke-tested
against synthetic fixtures.

## Setup

```bash
npm install
cp .env.example .env   # fill in keys as they become available
npm test                # smoke tests against synthetic fixtures
npm run test:feeds      # checks the 5 live sources (expected to fail until Stage 0 keys exist)
npm run preprocess      # streams GTFS static data into server/data/compiled/*.json
npm run dev             # start the server locally
```

## Layout

```
docs/       working spec, build stages, brand guide, pitch deck
server/     Express backend — departures engine, LLM layer, routes
scripts/    feed verification + GTFS preprocessing tooling
public/     PWA frontend (single chat screen)
test/       fixtures + smoke tests
```
