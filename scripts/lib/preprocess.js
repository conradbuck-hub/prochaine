// Core GTFS aggregation logic, split out from the CLI wrapper
// (scripts/preprocess-gtfs.js) so it can be exercised directly against the
// synthetic fixture in tests without shelling out to a subprocess.

import { createGtfsSource } from "./gtfsSource.js";

export const CALENDAR_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

// Fixed time-of-day bands used to derive frequency tables for agencies
// (STM among them) that publish explicit métro trips in stop_times.txt
// instead of frequencies.txt. Seconds run past 24:00:00 for post-midnight
// GTFS times, same convention as departureTime elsewhere in this repo.
const TIME_BANDS = [
  { start: 0, end: 5.5 * 3600 },        // 00:00–05:30
  { start: 5.5 * 3600, end: 9 * 3600 }, // 05:30–09:00 (AM peak)
  { start: 9 * 3600, end: 15 * 3600 },  // 09:00–15:00 (midday)
  { start: 15 * 3600, end: 18.5 * 3600 }, // 15:00–18:30 (PM peak)
  { start: 18.5 * 3600, end: 24 * 3600 }, // 18:30–24:00 (evening)
  { start: 24 * 3600, end: 30 * 3600 },   // post-midnight continuation
];

function timeStringToSeconds(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + (s ?? 0);
}

function secondsToTimeString(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Derives one frequency-table entry per time band that has at least two
// departures (i.e. at least one real gap to measure) — first/last departure
// in the band become startTime/endTime, and headwaySecs is the median gap
// between consecutive departures. A band with 0-1 departures is dropped
// rather than guessing a headway from nothing.
function deriveFrequencyBandsForGroup({ routeId, headsign, serviceDays, seconds }) {
  const sorted = [...seconds].sort((a, b) => a - b);
  const entries = [];

  for (const band of TIME_BANDS) {
    const inBand = sorted.filter((s) => s >= band.start && s < band.end);
    if (inBand.length < 2) continue;

    const gaps = [];
    for (let i = 1; i < inBand.length; i++) gaps.push(inBand[i] - inBand[i - 1]);

    entries.push({
      routeId,
      headsign,
      startTime: secondsToTimeString(inBand[0]),
      endTime: secondsToTimeString(inBand[inBand.length - 1]),
      headwaySecs: Math.round(median(gaps)),
      serviceDays,
    });
  }

  return entries;
}

async function loadRouteTypes(source) {
  const routes = new Map();
  for await (const row of source.streamRows("routes.txt")) {
    routes.set(row.route_id, {
      routeType: row.route_type,
      shortName: row.route_short_name || row.route_long_name || row.route_id,
    });
  }
  return routes;
}

async function loadTrips(source) {
  const trips = new Map();
  for await (const row of source.streamRows("trips.txt")) {
    trips.set(row.trip_id, {
      routeId: row.route_id,
      serviceId: row.service_id,
      headsign: row.trip_headsign || "",
    });
  }
  return trips;
}

async function loadCalendar(source) {
  const calendar = new Map();
  for await (const row of source.streamRows("calendar.txt", { optional: true })) {
    calendar.set(row.service_id, CALENDAR_DAYS.filter((day) => row[day] === "1"));
  }
  return calendar;
}

async function loadFrequencies(source) {
  const frequencies = new Map();
  for await (const row of source.streamRows("frequencies.txt", { optional: true })) {
    const list = frequencies.get(row.trip_id) ?? [];
    list.push({
      startTime: row.start_time,
      endTime: row.end_time,
      headwaySecs: Number(row.headway_secs),
    });
    frequencies.set(row.trip_id, list);
  }
  return frequencies;
}

async function loadStops(source) {
  const stops = new Map();
  for await (const row of source.streamRows("stops.txt")) {
    stops.set(row.stop_id, {
      name: row.stop_name,
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
    });
  }
  return stops;
}

// Streams stop_times.txt once, building stop + schedule fragments for one
// agency. `modeForRouteType` maps a GTFS route_type to a Prochaine mode (or
// null to ignore the route); `pathStrategyForMode` says whether that mode
// needs frequency-table or timetable data captured (bus needs neither — its
// departures come live from GTFS-RT at query time).
export async function processAgency({ agencyPrefix, sourcePath, modeForRouteType, pathStrategyForMode }) {
  const source = await createGtfsSource(sourcePath);
  const [routes, trips, calendar, frequencies, stops] = await Promise.all([
    loadRouteTypes(source),
    loadTrips(source),
    loadCalendar(source),
    loadFrequencies(source),
    loadStops(source),
  ]);

  const stopModes = new Map();
  const frequencyDedup = new Map(); // stopId -> Map(signature -> entry), sourced from frequencies.txt
  // stopId -> Map(groupKey -> { routeId, headsign, serviceDays, seconds: [] })
  // Fallback source for frequency-mode stops when frequencies.txt doesn't
  // cover them — STM ships no frequencies.txt at all, so this is the
  // primary path for métro in practice (see deriveFrequencyBandsForGroup).
  const rawDepartures = new Map();
  const timetableByStop = new Map(); // stopId -> [entries]

  let rowsProcessed = 0;
  for await (const row of source.streamRows("stop_times.txt")) {
    rowsProcessed++;
    const trip = trips.get(row.trip_id);
    if (!trip) continue;
    const route = routes.get(trip.routeId);
    if (!route) continue;
    const mode = modeForRouteType(route.routeType);
    if (!mode) continue;

    stopModes.set(row.stop_id, mode);
    const serviceDays = calendar.get(trip.serviceId) ?? CALENDAR_DAYS;
    const strategy = pathStrategyForMode(mode);

    if (strategy === "frequency") {
      const freqList = frequencies.get(row.trip_id);
      if (freqList) {
        if (!frequencyDedup.has(row.stop_id)) frequencyDedup.set(row.stop_id, new Map());
        const dedupMap = frequencyDedup.get(row.stop_id);
        for (const freq of freqList) {
          const signature = `${route.shortName}|${trip.headsign}|${freq.startTime}|${freq.endTime}|${freq.headwaySecs}`;
          if (dedupMap.has(signature)) continue;
          dedupMap.set(signature, {
            routeId: route.shortName,
            headsign: trip.headsign,
            startTime: freq.startTime,
            endTime: freq.endTime,
            headwaySecs: freq.headwaySecs,
            serviceDays,
          });
        }
      }

      // Always also collect the raw departure time as a fallback source —
      // cheap (métro/REM trip volume is a small fraction of stop_times.txt
      // compared to bus), and it's what lets stops with no frequencies.txt
      // coverage still get a derived frequency table below.
      const departureTime = row.departure_time || row.arrival_time;
      if (departureTime) {
        if (!rawDepartures.has(row.stop_id)) rawDepartures.set(row.stop_id, new Map());
        const groupMap = rawDepartures.get(row.stop_id);
        const groupKey = `${route.shortName}|${trip.headsign}|${serviceDays.join(",")}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { routeId: route.shortName, headsign: trip.headsign, serviceDays, seconds: [] });
        }
        groupMap.get(groupKey).seconds.push(timeStringToSeconds(departureTime));
      }
    } else if (strategy === "timetable") {
      const list = timetableByStop.get(row.stop_id) ?? [];
      list.push({
        routeId: route.shortName,
        tripId: row.trip_id,
        headsign: trip.headsign,
        departureTime: row.departure_time,
        serviceDays,
      });
      timetableByStop.set(row.stop_id, list);
    }
    // strategy === "live" (bus): registering the stop above is all that's needed.
  }

  // Derive frequency bands (per station/line/service-day-type, first/last
  // departure + median headway per band) for any frequency-mode stop that
  // frequencies.txt didn't already cover.
  for (const [stopId, groupMap] of rawDepartures) {
    if (frequencyDedup.get(stopId)?.size > 0) continue;
    const derived = new Map();
    for (const group of groupMap.values()) {
      for (const entry of deriveFrequencyBandsForGroup(group)) {
        const signature = `${entry.routeId}|${entry.headsign}|${entry.startTime}|${entry.endTime}|${entry.headwaySecs}`;
        derived.set(signature, entry);
      }
    }
    if (derived.size > 0) frequencyDedup.set(stopId, derived);
  }

  const stopEntries = [];
  for (const [stopId, mode] of stopModes) {
    const stopInfo = stops.get(stopId);
    if (!stopInfo) continue;
    stopEntries.push({
      id: `${agencyPrefix}:${stopId}`,
      name: stopInfo.name,
      agency: agencyPrefix,
      mode,
      lat: stopInfo.lat,
      lon: stopInfo.lon,
    });
  }

  const frequenciesOut = {};
  for (const [stopId, dedupMap] of frequencyDedup) {
    frequenciesOut[`${agencyPrefix}:${stopId}`] = [...dedupMap.values()];
  }

  const timetableOut = {};
  for (const [stopId, list] of timetableByStop) {
    timetableOut[`${agencyPrefix}:${stopId}`] = list;
  }

  return { stopEntries, frequencies: frequenciesOut, timetable: timetableOut, rowsProcessed };
}

// Standard agency profiles used by the CLI — exported so tests exercise the
// exact same mode/strategy rules the real preprocessor runs.
export const AGENCY_PROFILES = {
  stm: {
    agencyPrefix: "stm",
    modeForRouteType: (t) => (t === "3" ? "bus" : t === "1" ? "metro" : null),
    pathStrategyForMode: (mode) => (mode === "bus" ? "live" : "frequency"),
  },
  rem: {
    agencyPrefix: "rem",
    modeForRouteType: () => "rem",
    pathStrategyForMode: () => "frequency",
  },
  exo: {
    agencyPrefix: "exo",
    modeForRouteType: () => "exo",
    pathStrategyForMode: () => "timetable",
  },
};

export function mergeResults(results) {
  const stopsIndex = results.flatMap((r) => r.stopEntries);
  const scheduleIndex = { frequencies: {}, timetable: {} };
  for (const r of results) {
    Object.assign(scheduleIndex.frequencies, r.frequencies);
    Object.assign(scheduleIndex.timetable, r.timetable);
  }
  return { stopsIndex, scheduleIndex };
}
