import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  intentModel: process.env.INTENT_MODEL ?? "claude-haiku-4-5",
  answerModel: process.env.ANSWER_MODEL ?? "claude-haiku-4-5",

  stm: {
    apiKey: process.env.STM_API_KEY ?? "",
    tripUpdatesUrl: process.env.STM_GTFS_RT_TRIP_UPDATES_URL ?? "",
    vehiclePositionsUrl: process.env.STM_GTFS_RT_VEHICLE_POSITIONS_URL ?? "",
    alertsUrl: process.env.STM_GTFS_RT_ALERTS_URL ?? "",
    staticUrl: process.env.STM_GTFS_STATIC_URL ?? "",
  },
  exo: {
    staticUrl: process.env.EXO_GTFS_STATIC_URL ?? "",
    tripUpdatesUrl: process.env.EXO_GTFS_RT_TRIP_UPDATES_URL ?? "",
    alertsUrl: process.env.EXO_GTFS_RT_ALERTS_URL ?? "",
  },
  rem: {
    staticUrl: process.env.REM_GTFS_STATIC_URL ?? "",
  },
  bixi: {
    stationStatusUrl:
      process.env.BIXI_GBFS_STATION_STATUS_URL ??
      "https://gbfs.velobixi.com/gbfs/en/station_status.json",
    stationInformationUrl:
      process.env.BIXI_GBFS_STATION_INFORMATION_URL ??
      "https://gbfs.velobixi.com/gbfs/en/station_information.json",
  },
  weather: {
    // Open-Meteo — keyless, free; see server/services/weather.js.
    apiUrl: process.env.WEATHER_API_URL ?? "https://api.open-meteo.com/v1/forecast",
    lat: Number(process.env.WEATHER_LAT ?? 45.5019),
    lon: Number(process.env.WEATHER_LON ?? -73.5674),
  },

  dataDir: new URL("./data/", import.meta.url).pathname,
};
