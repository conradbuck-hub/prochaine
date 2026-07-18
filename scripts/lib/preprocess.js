// Core GTFS aggregation logic, split out from the CLI wrapper
// (scripts/preprocess-gtfs.js) so it can be exercised directly against the
// synthetic fixture in tests without shelling out to a subprocess.

import { createGtfsSource } from "./gtfsSource.js";

export const CALENDAR_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

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
  const frequencyDedup = new Map(); // stopId -> Map(signature -> entry)
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
      if (!freqList) continue;
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
