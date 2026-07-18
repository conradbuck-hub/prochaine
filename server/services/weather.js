// Weather is a modifier on the departure answer (e.g. flagging likely bus
// delays in freezing rain), not a separate query surface — see docs/SPEC.md.

export async function fetchWeather(url, apiKey, lat, lon, fetchImpl = fetch) {
  const res = await fetchImpl(`${url}?lat=${lat}&lon=${lon}&key=${apiKey}`);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  return res.json();
}

// weatherData: normalized shape { tempC, condition, windKph }
// condition is one of: "clear" | "rain" | "freezing_rain" | "snow" | "extreme_cold"
// Returns a short caveat string (bilingual pair) or null if nothing worth flagging.
export function delayRiskModifier(weatherData, language = "fr") {
  const { tempC, condition } = weatherData;

  if (condition === "freezing_rain") {
    return language === "fr"
      ? "Pluie verglaçante — attends-toi à des retards de bus."
      : "Freezing rain — expect bus delays.";
  }
  if (condition === "extreme_cold" || tempC <= -25) {
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
  if (!config.weather.apiKey || !config.weather.apiUrl) return null;
  const data = await cache.getOrFetch(
    `weather:${config.weather.lat},${config.weather.lon}`,
    600_000,
    () =>
      fetchWeather(
        config.weather.apiUrl,
        config.weather.apiKey,
        config.weather.lat,
        config.weather.lon,
        fetchImpl
      )
  );
  return delayRiskModifier(data, language);
}
