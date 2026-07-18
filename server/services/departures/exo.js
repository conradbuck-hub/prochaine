// exo commuter rail: timetable + delays path. Trains run on a real published
// timetable; the only live component worth fetching is the delay overlay.
// See docs/SPEC.md.

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { secondsSinceMidnight, timeStringToSeconds, weekdayName } from "./metro.js";

export async function fetchExoTripUpdates(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`exo GTFS-RT trip updates fetch failed: ${res.status}`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
}

// Extracts { tripId: delaySeconds } from a decoded (or fixture) FeedMessage.
export function delayMapFromFeedMessage(feedMessage) {
  const delays = {};
  for (const entity of feedMessage.entity ?? []) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.trip?.tripId) continue;
    const firstUpdate = tripUpdate.stopTimeUpdate?.[0];
    const delay = firstUpdate?.arrival?.delay ?? firstUpdate?.departure?.delay ?? 0;
    delays[tripUpdate.trip.tripId] = Number(delay);
  }
  return delays;
}

// timetableEntries: [{ routeId, tripId, headsign, departureTime, serviceDays }]
// delayMap: { tripId: delaySeconds }
export function departuresFromTimetable(timetableEntries, now = new Date(), delayMap = {}, limit = 5) {
  const nowSec = secondsSinceMidnight(now);
  const today = weekdayName(now);
  const results = [];

  for (const entry of timetableEntries) {
    if (!entry.serviceDays.includes(today)) continue;
    const scheduled = timeStringToSeconds(entry.departureTime);
    const delay = delayMap[entry.tripId] ?? 0;
    const effective = scheduled + delay;
    if (effective < nowSec) continue;

    results.push({
      route: entry.routeId,
      headsign: entry.headsign,
      minutesAway: Math.round((effective - nowSec) / 60),
      delayMinutes: Math.round(delay / 60),
      source: "timetable",
    });
  }

  return results.sort((a, b) => a.minutesAway - b.minutesAway).slice(0, limit);
}

export async function getExoDepartures({ stopId, scheduleIndex, config, cache, now = new Date(), fetchImpl }) {
  const entries = scheduleIndex.timetable?.[stopId] ?? [];
  let delayMap = {};
  if (config?.exo?.tripUpdatesUrl) {
    delayMap = await cache.getOrFetch(
      `exo-delays:${config.exo.tripUpdatesUrl}`,
      30_000,
      async () => delayMapFromFeedMessage(await fetchExoTripUpdates(config.exo.tripUpdatesUrl, fetchImpl))
    );
  }
  return departuresFromTimetable(entries, now, delayMap);
}

// Service hours for a timetable-driven mode = the day's first and last
// scheduled departure per route/headsign — trains are sparse enough that
// this is a genuinely useful answer, unlike a frequency band.
export function serviceHoursFromTimetable(timetableEntries, now = new Date()) {
  const today = weekdayName(now);
  const byRoute = new Map();

  for (const entry of timetableEntries) {
    if (!entry.serviceDays.includes(today)) continue;
    const key = `${entry.routeId}|${entry.headsign}`;
    const seconds = timeStringToSeconds(entry.departureTime);
    const existing = byRoute.get(key);
    if (!existing) {
      byRoute.set(key, { route: entry.routeId, headsign: entry.headsign, first: entry.departureTime, last: entry.departureTime, firstSec: seconds, lastSec: seconds });
    } else {
      if (seconds < existing.firstSec) { existing.first = entry.departureTime; existing.firstSec = seconds; }
      if (seconds > existing.lastSec) { existing.last = entry.departureTime; existing.lastSec = seconds; }
    }
  }

  return [...byRoute.values()].map(({ route, headsign, first, last }) => ({ route, headsign, first, last }));
}

export function getExoServiceHours({ stopId, scheduleIndex, now = new Date() }) {
  const entries = scheduleIndex.timetable?.[stopId] ?? [];
  return serviceHoursFromTimetable(entries, now);
}
