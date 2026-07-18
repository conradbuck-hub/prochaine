import { test } from "node:test";
import assert from "node:assert/strict";
import { departuresFromFrequencies, timeStringToSeconds } from "../server/services/departures/metro.js";
import { departuresFromTimetable, delayMapFromFeedMessage } from "../server/services/departures/exo.js";
import { departuresFromFeedMessage } from "../server/services/departures/bus.js";

test("metro: frequency path computes minutes to next periodic departure", () => {
  const now = new Date();
  now.setHours(12, 0, 2, 0); // 12:00:02 — 2s into a 240s headway starting at midnight

  const entries = [
    {
      routeId: "1",
      headsign: "Angrignon",
      startTime: "00:00:00",
      endTime: "27:00:00",
      headwaySecs: 240,
      serviceDays: [
        "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
      ],
    },
  ];

  const departures = departuresFromFrequencies(entries, now);
  assert.equal(departures.length, 1);
  assert.equal(departures[0].source, "frequency");
  // 12:00:00 is exactly on a 240s (4 min) boundary from midnight, so 2s in means ~4 min to next.
  assert.equal(departures[0].minutesAway, 4);
  assert.equal(departures[0].headwayMinutes, 4);
});

test("metro: frequency path excludes periods outside the active window or wrong day", () => {
  const now = new Date();
  now.setHours(3, 0, 0, 0); // outside a 05:30-24:00 service window

  const entries = [
    {
      routeId: "1",
      headsign: "Angrignon",
      startTime: "05:30:00",
      endTime: "24:00:00",
      headwaySecs: 240,
      serviceDays: [
        "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
      ],
    },
  ];

  assert.equal(departuresFromFrequencies(entries, now).length, 0);
});

test("exo: timetable path returns future departures sorted, applies delay overlay", () => {
  const now = new Date();
  now.setHours(8, 0, 0, 0);

  const entries = [
    {
      routeId: "exo4",
      tripId: "TEXO4-1",
      headsign: "Mont-Saint-Hilaire",
      departureTime: "08:15:00",
      serviceDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
    {
      routeId: "exo4",
      tripId: "TEXO4-2",
      headsign: "Mont-Saint-Hilaire",
      departureTime: "08:45:00",
      serviceDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  ];

  const noDelay = departuresFromTimetable(entries, now);
  assert.equal(noDelay.length, 2);
  assert.equal(noDelay[0].minutesAway, 15);
  assert.equal(noDelay[1].minutesAway, 45);

  const withDelay = departuresFromTimetable(entries, now, { "TEXO4-1": 300 }); // +5 min delay
  assert.equal(withDelay[0].minutesAway, 20);
  assert.equal(withDelay[0].delayMinutes, 5);
});

test("exo: past departures are excluded", () => {
  const now = new Date();
  now.setHours(9, 0, 0, 0);
  const entries = [
    {
      routeId: "exo4",
      tripId: "TEXO4-1",
      headsign: "Mont-Saint-Hilaire",
      departureTime: "08:15:00",
      serviceDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  ];
  assert.equal(departuresFromTimetable(entries, now).length, 0);
});

test("exo: delayMapFromFeedMessage extracts delay seconds by tripId", () => {
  const feedMessage = {
    entity: [
      {
        tripUpdate: {
          trip: { tripId: "TEXO4-1" },
          stopTimeUpdate: [{ arrival: { delay: 180 } }],
        },
      },
    ],
  };
  assert.deepEqual(delayMapFromFeedMessage(feedMessage), { "TEXO4-1": 180 });
});

test("bus: live path computes minutesAway from decoded feed entities", () => {
  const now = new Date("2026-07-18T12:00:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  const feedMessage = {
    entity: [
      {
        tripUpdate: {
          trip: { routeId: "24", tripHeadsign: "Cote-Vertu" },
          stopTimeUpdate: [
            { stopId: "2001", arrival: { time: nowSeconds + 180 } },
          ],
        },
      },
      {
        tripUpdate: {
          trip: { routeId: "24", tripHeadsign: "Cote-Vertu" },
          stopTimeUpdate: [
            { stopId: "9999", arrival: { time: nowSeconds + 60 } }, // different stop, must be excluded
          ],
        },
      },
    ],
  };

  const departures = departuresFromFeedMessage(feedMessage, "2001", now);
  assert.equal(departures.length, 1);
  assert.equal(departures[0].minutesAway, 3);
  assert.equal(departures[0].source, "live");
});

test("timeStringToSeconds handles post-midnight GTFS times", () => {
  assert.equal(timeStringToSeconds("25:30:00"), 25 * 3600 + 30 * 60);
});
