import { Router } from "express";
import { getDepartures } from "../services/departures/index.js";
import { findStop, rankStops } from "../services/stopMatcher.js";

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

  // With ?q=, wired to the real fuzzy matcher (exact / contains /
  // edit-distance fallback) so this shows ranked candidates instead of a
  // silent full dump — the bug this fixed was returning all 9000+ stops
  // regardless of q. Without ?q=, keeps its original behavior: a raw dump
  // of the first 50 stops.
  router.get("/debug/stops", (req, res) => {
    const q = req.query.q;
    if (typeof q === "string" && q.trim()) {
      const limit = Number(req.query.limit) || 10;
      const ranked = rankStops(q, stopIndex, limit);
      return res.json({
        query: q,
        count: ranked.length,
        matches: ranked.map(({ stop, source, distance, matchedTokens }) => ({
          ...stop,
          source,
          distance,
          matchedTokens,
        })),
      });
    }
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
