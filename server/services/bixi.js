// BIXI GBFS: nearest dock with bikes (or free docks) relative to a stop.

export async function fetchGbfs(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`BIXI GBFS fetch failed: ${res.status}`);
  return res.json();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// stationInformation: GBFS station_information.json `.data.stations`
// stationStatus: GBFS station_status.json `.data.stations`
// Returns stations merged with distance + availability, sorted nearest-first.
export function nearestStations(
  stationInformation,
  stationStatus,
  { lat, lon, need = "bikes", limit = 3 }
) {
  const statusById = new Map(stationStatus.map((s) => [s.station_id, s]));

  return stationInformation
    .map((info) => {
      const status = statusById.get(info.station_id);
      if (!status) return null;
      const available =
        need === "bikes" ? status.num_bikes_available : status.num_docks_available;
      return {
        name: info.name,
        distanceMeters: Math.round(haversineMeters(lat, lon, info.lat, info.lon)),
        bikesAvailable: status.num_bikes_available,
        docksAvailable: status.num_docks_available,
        available,
      };
    })
    .filter((s) => s && s.available > 0)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export async function getNearestBixiStations({ lat, lon, need, config, cache, fetchImpl }) {
  const [info, status] = await Promise.all([
    cache.getOrFetch(
      `bixi-info:${config.bixi.stationInformationUrl}`,
      86_400_000,
      async () => (await fetchGbfs(config.bixi.stationInformationUrl, fetchImpl)).data.stations
    ),
    cache.getOrFetch(
      `bixi-status:${config.bixi.stationStatusUrl}`,
      30_000,
      async () => (await fetchGbfs(config.bixi.stationStatusUrl, fetchImpl)).data.stations
    ),
  ]);
  return nearestStations(info, status, { lat, lon, need });
}
