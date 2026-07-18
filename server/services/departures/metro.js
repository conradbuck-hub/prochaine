// STM métro / REM: frequency-table path. These run on fixed headways rather
// than published live positions, so "every 4 min, next in ~2" is the honest
// answer — not a fake live countdown. See docs/SPEC.md.

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export function secondsSinceMidnight(date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function timeStringToSeconds(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + (s ?? 0);
}

export function weekdayName(date) {
  return WEEKDAYS[date.getDay()];
}

// frequencyEntries: [{ routeId, headsign, startTime, endTime, headwaySecs, serviceDays }]
// Models departures as periodic starting from each active period's start time.
export function departuresFromFrequencies(frequencyEntries, now = new Date()) {
  const nowSec = secondsSinceMidnight(now);
  const today = weekdayName(now);
  const results = [];

  for (const entry of frequencyEntries) {
    if (!entry.serviceDays.includes(today)) continue;
    const start = timeStringToSeconds(entry.startTime);
    const end = timeStringToSeconds(entry.endTime);
    if (nowSec < start || nowSec >= end) continue;

    const elapsed = nowSec - start;
    const secondsToNext = entry.headwaySecs - (elapsed % entry.headwaySecs);

    results.push({
      route: entry.routeId,
      headsign: entry.headsign,
      minutesAway: Math.round(secondsToNext / 60),
      headwayMinutes: Math.round(entry.headwaySecs / 60),
      source: "frequency",
    });
  }

  return results.sort((a, b) => a.minutesAway - b.minutesAway);
}

export function getMetroDepartures({ stopId, scheduleIndex, now = new Date() }) {
  const entries = scheduleIndex.frequencies?.[stopId] ?? [];
  return departuresFromFrequencies(entries, now);
}

// Service hours = the frequency window itself (start/end of the active
// period) for each route serving the stop today — the honest "first/last"
// answer for a frequency-based mode, per docs/SPEC.md.
export function serviceHoursFromFrequencies(frequencyEntries, now = new Date()) {
  const today = weekdayName(now);
  return frequencyEntries
    .filter((entry) => entry.serviceDays.includes(today))
    .map((entry) => ({
      route: entry.routeId,
      headsign: entry.headsign,
      opens: entry.startTime,
      closes: entry.endTime,
    }));
}

export function getMetroServiceHours({ stopId, scheduleIndex, now = new Date() }) {
  const entries = scheduleIndex.frequencies?.[stopId] ?? [];
  return serviceHoursFromFrequencies(entries, now);
}
