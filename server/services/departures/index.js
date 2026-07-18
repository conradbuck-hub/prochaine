// Three-path dispatcher: picks the right strategy per mode, normalizes all
// three to the same { route, headsign, minutesAway, source } shape. See
// docs/SPEC.md "Three-path departures engine".

import { getBusDepartures } from "./bus.js";
import { getMetroDepartures } from "./metro.js";
import { getExoDepartures } from "./exo.js";

export async function getDepartures({ stop, scheduleIndex, config, cache, now = new Date(), fetchImpl }) {
  switch (stop.mode) {
    case "bus":
      return getBusDepartures({ stopId: stop.id, config, cache, now, fetchImpl });
    case "metro":
    case "rem":
      return getMetroDepartures({ stopId: stop.id, scheduleIndex, now });
    case "exo":
      return getExoDepartures({ stopId: stop.id, scheduleIndex, config, cache, now, fetchImpl });
    default:
      throw new Error(`Unknown stop mode: ${stop.mode}`);
  }
}
