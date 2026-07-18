// Three-path dispatcher: picks the right strategy per mode, normalizes all
// three to the same { route, headsign, minutesAway, source } shape. See
// docs/SPEC.md "Three-path departures engine".

import { getBusDepartures } from "./bus.js";
import { getMetroDepartures, getMetroServiceHours } from "./metro.js";
import { getExoDepartures, getExoServiceHours } from "./exo.js";

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

// Bus has no first/last concept in this architecture (live RT only, no
// stored static fallback yet — see docs/BUILD-STAGES.md) so it returns an
// empty result; the formatter says plainly that the data isn't available,
// per the "never invent" rule, rather than the app guessing.
export function getServiceHours({ stop, scheduleIndex, now = new Date() }) {
  switch (stop.mode) {
    case "metro":
    case "rem":
      return getMetroServiceHours({ stopId: stop.id, scheduleIndex, now });
    case "exo":
      return getExoServiceHours({ stopId: stop.id, scheduleIndex, now });
    case "bus":
      return [];
    default:
      throw new Error(`Unknown stop mode: ${stop.mode}`);
  }
}
