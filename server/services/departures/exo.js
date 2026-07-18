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
