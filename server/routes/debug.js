import { Router } from "express";
import { getDepartures } from "../services/departures/index.js";
import { findStop } from "../services/stopMatcher.js";

// Bypasses chat/LLM entirely — used in Stage 1 to spot-check each of the
// three departure paths directly against a stop ID.
export function createDebugRouter({ config, cache, stopIndex, scheduleIndex }) {
  const router = Router();

  router.get("/debug/departures/:stopId", async (req, res, next) => {
    try {
      const stop = stopIndex.find((s) => s.id === req.params.stopId);
      if (!stop) {
        return res.status(404).json({ error: `Unknown stop id: ${req.params.stopId}` });
      }
      const departures = await getDepartures({ stop, scheduleIndex, config, cache });
      res.json({ stop, departures });
    } catch (err) {
      next(err);
    }
  });

  router.get("/debug/stops", (req, res) => {
    res.json({ count: stopIndex.length, stops: stopIndex.slice(0, 50) });
  });

  // Exercises the same typo-tolerant matcher chat.js uses, without an LLM
  // call — the Stage 1 spot-check for "does my home stop resolve?".
  router.get("/debug/match", (req, res) => {
    const q = req.query.q;
    if (typeof q !== "string" || !q.trim()) {
      return res.status(400).json({ error: "?q=<stop text> is required" });
    }
    const result = findStop(q, stopIndex);
    res.json({ query: q, match: result });
  });

  return router;
}
