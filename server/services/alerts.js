// Multi-agency GTFS-RT Alerts, surfaced only when they affect a route/stop
// the user actually asked about — not a general news feed.

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export async function fetchAlerts(url, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: apiKey ? { apiKey } : {} });
  if (!res.ok) throw new Error(`Alerts fetch failed: ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
}

// feedMessage: decoded (or fixture) FeedMessage with entity[].alert
// routeIds/stopIds: the ones relevant to the user's current query
export function relevantAlerts(feedMessage, { routeIds = [], stopIds = [] } = {}) {
  const results = [];

  for (const entity of feedMessage.entity ?? []) {
    const alert = entity.alert;
    if (!alert) continue;

    const affectsQuery = (alert.informedEntity ?? []).some(
      (informed) =>
        (informed.routeId && routeIds.includes(informed.routeId)) ||
        (informed.stopId && stopIds.includes(informed.stopId))
    );
    if (!affectsQuery) continue;

    const text =
      alert.headerText?.translation?.[0]?.text ??
      alert.descriptionText?.translation?.[0]?.text ??
      "";
    if (text) results.push(text);
  }

  return results;
}

export async function getRelevantAlerts({ url, apiKey, routeIds, stopIds, cache, fetchImpl }) {
  if (!url) return [];
  const feedMessage = await cache.getOrFetch(
    `alerts:${url}`,
    60_000,
    () => fetchAlerts(url, apiKey, fetchImpl)
  );
  return relevantAlerts(feedMessage, { routeIds, stopIds });
}
