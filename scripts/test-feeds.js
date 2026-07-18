#!/usr/bin/env node
// Feed verification: checks the five external sources Prochaine depends on
// and reports PASS/FAIL with a data sample for each. This is meant to be
// run repeatedly during Stage 0 until everything is green — see
// docs/BUILD-STAGES.md.

import "dotenv/config";
import { config } from "../server/config.js";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fetchWeather, normalizeOpenMeteoResponse } from "../server/services/weather.js";

function pass(name, message, sample) {
  return { name, ok: true, message, sample };
}

function fail(name, message) {
  return { name, ok: false, message };
}

// `reportRouteIds`: for feeds where "what routes does this actually carry"
// is itself the open question (the exo feed's REM coverage — see
// docs/BUILD-STAGES.md's known risks), surface the distinct routeIds
// alongside the entity count instead of just a single sample entity.
async function checkGtfsRt(name, url, headers, { reportRouteIds = false } = {}) {
  if (!url) return fail(name, "no URL configured in .env (see .env.example)");
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return fail(name, `HTTP ${res.status}`);
    const buffer = new Uint8Array(await res.arrayBuffer());
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    const count = feed.entity?.length ?? 0;

    if (reportRouteIds) {
      const routeIds = [
        ...new Set((feed.entity ?? []).map((e) => e.tripUpdate?.trip?.routeId).filter(Boolean)),
      ].sort();
      return pass(name, `${count} feed entities`, { routeIds });
    }

    return pass(name, `${count} feed entities`, feed.entity?.[0] ?? null);
  } catch (err) {
    return fail(name, err.message);
  }
}

async function checkStaticZip(name, url) {
  if (!url) return fail(name, "no URL configured in .env (see .env.example)");
  try {
    const res = await fetch(url);
    if (!res.ok) return fail(name, `HTTP ${res.status}`);
    const contentLength = res.headers.get("content-length");
    return pass(name, `reachable${contentLength ? `, ${contentLength} bytes` : ""}`, null);
  } catch (err) {
    return fail(name, err.message);
  }
}

async function checkBixi() {
  if (!config.bixi.stationStatusUrl) return fail("BIXI", "no station_status URL configured");
  try {
    const res = await fetch(config.bixi.stationStatusUrl);
    if (!res.ok) return fail("BIXI", `HTTP ${res.status}`);
    const data = await res.json();
    const stations = data?.data?.stations ?? [];
    return pass("BIXI", `${stations.length} stations`, stations[0] ?? null);
  } catch (err) {
    return fail("BIXI", err.message);
  }
}

async function checkWeather() {
  if (!config.weather.apiUrl) {
    return fail("Weather", "no WEATHER_API_URL configured (see .env.example)");
  }
  try {
    const raw = await fetchWeather(config.weather.apiUrl, config.weather.lat, config.weather.lon);
    const normalized = normalizeOpenMeteoResponse(raw);
    return pass("Weather", "reachable", normalized);
  } catch (err) {
    return fail("Weather", err.message);
  }
}

async function main() {
  const checks = await Promise.all([
    checkGtfsRt(
      "STM (bus GTFS-RT)",
      config.stm.tripUpdatesUrl,
      config.stm.apiKey ? { apiKey: config.stm.apiKey } : {}
    ),
    checkStaticZip("REM (static GTFS)", config.rem.staticUrl),
    checkGtfsRt("exo (GTFS-RT delays)", config.exo.tripUpdatesUrl, {}, { reportRouteIds: true }),
    checkBixi(),
    checkWeather(),
  ]);

  let allPass = true;
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`[${status}] ${check.name} — ${check.message}`);
    if (check.ok && check.sample) {
      console.log(`         sample: ${JSON.stringify(check.sample).slice(0, 200)}`);
    }
    if (!check.ok) allPass = false;
  }

  console.log(allPass ? "\nAll five feeds verified." : "\nNot all feeds are up yet — see docs/BUILD-STAGES.md Stage 0.");
  process.exit(allPass ? 0 : 1);
}

main();
