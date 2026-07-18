// Weather is a modifier on the departure answer (e.g. flagging likely bus
// delays in freezing rain), not a separate query surface — see docs/SPEC.md.
//
// Provider: Open-Meteo — keyless, free, no signup. Chosen specifically
// because it needs no key, closing what used to be an open gap between
// this code and docs/SPEC.md's data-sources table.

const CURRENT_FIELDS = "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m";

export async function fetchWeather(url, lat, lon, fetchImpl = fetch) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: CURRENT_FIELDS,
  });
  const res = await fetchImpl(`${url}?${params}`);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  return res.json();
}

// WMO weather codes, per Open-Meteo's docs.
const FREEZING_RAIN_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

export function conditionFromWeatherCode(code) {
  if (FREEZING_RAIN_CODES.has(code)) return "freezing_rain";
  if (SNOW_CODES.has(code)) return "snow";
  if (RAIN_CODES.has(code)) return "rain";
  return "clear";
}

// Normalizes Open-Meteo's `current` block into the { tempC, condition,
// windKph } shape delayRiskModifier expects.
export function normalizeOpenMeteoResponse(data) {
  const current = data.current ?? {};
  return {
    tempC: current.temperature_2m,
    condition: conditionFromWeatherCode(current.weather_code),
    windKph: current.wind_speed_10m,
  };
}

// weatherData: normalized shape { tempC, condition, windKph }
// condition is one of: "clear" | "rain" | "freezing_rain" | "snow"
// Returns a short caveat string (bilingual pair) or null if nothing worth flagging.
export function delayRiskModifier(weatherData, language = "fr") {
  const { tempC, condition } = weatherData;

  if (condition === "freezing_rain") {
    return language === "fr"
      ? "Pluie verglaçante — attends-toi à des retards de bus."
      : "Freezing rain — expect bus delays.";
  }
  if (tempC <= -25) {
    return language === "fr"
      ? "Froid extrême — service possiblement ralenti."
      : "Extreme cold — service may be slower than usual.";
  }
  if (condition === "snow") {
    return language === "fr"
      ? "Neige — les bus peuvent être en retard."
      : "Snow — buses may be running late.";
  }
  return null;
}

export async function getWeatherCaveat({ config, cache, fetchImpl, language }) {
  if (!config.weather.apiUrl) return null;
  const raw = await cache.getOrFetch(
    `weather:${config.weather.lat},${config.weather.lon}`,
    600_000,
    () => fetchWeather(config.weather.apiUrl, config.weather.lat, config.weather.lon, fetchImpl)
  );
  return delayRiskModifier(normalizeOpenMeteoResponse(raw), language);
}
