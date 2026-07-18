import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionFromWeatherCode,
  normalizeOpenMeteoResponse,
  delayRiskModifier,
} from "../server/services/weather.js";

test("conditionFromWeatherCode maps WMO codes correctly", () => {
  assert.equal(conditionFromWeatherCode(0), "clear");
  assert.equal(conditionFromWeatherCode(3), "clear");
  assert.equal(conditionFromWeatherCode(61), "rain");
  assert.equal(conditionFromWeatherCode(65), "rain");
  assert.equal(conditionFromWeatherCode(66), "freezing_rain");
  assert.equal(conditionFromWeatherCode(67), "freezing_rain");
  assert.equal(conditionFromWeatherCode(56), "freezing_rain");
  assert.equal(conditionFromWeatherCode(71), "snow");
  assert.equal(conditionFromWeatherCode(86), "snow");
});

test("normalizeOpenMeteoResponse extracts tempC/condition/windKph from the current block", () => {
  const data = {
    current: {
      temperature_2m: -12.3,
      apparent_temperature: -18.5,
      precipitation: 0.4,
      weather_code: 66,
      wind_speed_10m: 14.2,
    },
  };
  const normalized = normalizeOpenMeteoResponse(data);
  assert.equal(normalized.tempC, -12.3);
  assert.equal(normalized.condition, "freezing_rain");
  assert.equal(normalized.windKph, 14.2);
});

test("delayRiskModifier flags freezing rain", () => {
  const caveat = delayRiskModifier({ tempC: -5, condition: "freezing_rain" }, "en");
  assert.match(caveat, /freezing rain/i);
});

test("delayRiskModifier flags extreme cold from temperature alone", () => {
  const caveat = delayRiskModifier({ tempC: -28, condition: "clear" }, "fr");
  assert.match(caveat, /froid extrême/i);
});

test("delayRiskModifier flags snow", () => {
  const caveat = delayRiskModifier({ tempC: -2, condition: "snow" }, "en");
  assert.match(caveat, /snow/i);
});

test("delayRiskModifier returns null for unremarkable weather", () => {
  assert.equal(delayRiskModifier({ tempC: 15, condition: "clear" }, "en"), null);
});
