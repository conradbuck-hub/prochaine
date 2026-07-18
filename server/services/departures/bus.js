// STM bus: live path. Buses are frequent and traffic-affected, so only a
// live GTFS-RT TripUpdates feed is trustworthy — see docs/SPEC.md.
//
// The network fetch/decode is split from the pure computation so the
// computation can be smoke-tested against a plain fixture object without a
// real feed or the gtfs-realtime-bindings protobuf decoder.

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export async function fetchTripUpdates(url, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    headers: apiKey ? { apiKey } : {},
  });
  if (!res.ok) {
    throw new Error(`STM GTFS-RT trip updates fetch failed: ${res.status}`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
}

// feedMessage: decoded GTFS-RT FeedMessage (or an equivalent plain object for tests)
// stopId: the GTFS stop_id to look for
// now: Date, for computing minutesAway
// Returns an array of { route, headsign, minutesAway, source: "live" }, sorted ascending.
export function departuresFromFeedMessage(feedMessage, stopId, now = new Date()) {
  const results = [];
  const nowSeconds = Math.floor(now.getTime() / 1000);

  for (const entity of feedMessage.entity ?? []) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate) continue;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate ?? []) {
      if (stopTimeUpdate.stopId !== stopId) continue;

      const arrival = stopTimeUpdate.arrival ?? stopTimeUpdate.departure;
      if (!arrival) continue;
      const eventTime = Number(arrival.time?.low ?? arrival.time ?? 0);
      const minutesAway = Math.round((eventTime - nowSeconds) / 60);
      if (minutesAway < 0) continue;

      results.push({
        route: tripUpdate.trip?.routeId ?? "?",
        headsign: tripUpdate.trip?.tripHeadsign ?? entity.tripUpdate.vehicle?.label ?? "",
        minutesAway,
        source: "live",
      });
    }
  }

  return results.sort((a, b) => a.minutesAway - b.minutesAway);
}

export async function getBusDepartures({ stopId, config, cache, now = new Date(), fetchImpl }) {
  const feedMessage = await cache.getOrFetch(
    `bus-feed:${config.stm.tripUpdatesUrl}`,
    30_000,
    () => fetchTripUpdates(config.stm.tripUpdatesUrl, config.stm.apiKey, fetchImpl)
  );
  return departuresFromFeedMessage(feedMessage, stopId, now);
}
