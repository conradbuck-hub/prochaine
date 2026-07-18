import { Router } from "express";
import { loadProfile, saveProfile } from "../services/userProfile.js";
import {
  nextOnboardingStep,
  onboardingPrompt,
  applyOnboardingAnswer,
  isOnboardingSkip,
  skipOnboardingStep,
} from "../services/onboarding.js";
import { findStop } from "../services/stopMatcher.js";
import { teachTerm, setLanguage } from "../services/lexicon.js";
import { getDepartures, getServiceHours } from "../services/departures/index.js";
import { getRelevantAlerts } from "../services/alerts.js";
import { getNearestBixiStations } from "../services/bixi.js";
import { getWeatherCaveat } from "../services/weather.js";
import { getAnthropicClient } from "../llm/client.js";
import { parseIntent } from "../llm/intentParser.js";
import { formatAnswer } from "../llm/answerFormatter.js";

const PLACE_KEYS = ["home", "work", "school"];
const STOP_LOOKUP_TYPES = new Set(["departures", "alerts", "service_hours", "bixi"]);

// Resolves "home"/"work"/"school" against the saved profile, or falls back
// to the general typo-tolerant matcher (which also checks aliases/lexicon
// terms). Distinguishes "alias referenced but never set" from "no match at
// all" so the formatter can offer to save it, per answer-formatter.md.
function resolveQueryStop(query, profile, stopIndex) {
  const key = query?.trim().toLowerCase();
  if (PLACE_KEYS.includes(key)) {
    const anchor = profile[key];
    if (!anchor) return { unset: key };
    const full = stopIndex.find((s) => s.id === anchor.id) ?? anchor;
    return { stop: full, aliasUsed: { term: key, stopName: full.name } };
  }

  const found = findStop(query, stopIndex, profile);
  if (!found) return null;
  const aliasUsed =
    found.source === "alias" || found.source === "lexicon"
      ? { term: query, stopName: found.stop.name }
      : null;
  return { stop: found.stop, aliasUsed };
}

function filterByRoute(departures, route) {
  if (!route) return departures;
  const normalized = route.trim().toLowerCase();
  const filtered = departures.filter(
    (d) => d.route?.toLowerCase() === normalized || d.headsign?.toLowerCase().includes(normalized)
  );
  // A route mention that matches nothing at this stop is more useful shown
  // unfiltered (with the mismatch visible) than silently emptied.
  return filtered.length > 0 ? filtered : departures;
}

// `client` is an optional override so tests can inject a fake Anthropic
// client without a real API key; production (server/index.js) never passes
// one, so it always resolves through getAnthropicClient(config) as before.
export function createChatRouter({ config, cache, stopIndex, scheduleIndex, profilePath, client: clientOverride }) {
  const router = Router();

  router.post("/chat", async (req, res, next) => {
    try {
      const { message } = req.body ?? {};
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }
      if (!config.anthropicApiKey) {
        return res.status(503).json({
          error: "ANTHROPIC_API_KEY not configured — see .env.example (Stage 0).",
        });
      }

      let profile = await loadProfile(profilePath);
      const client = clientOverride ?? getAnthropicClient(config);

      // Onboarding is intercepted before the LLM ever sees these turns — see
      // the note in server/llm/prompts/intent-parser.md.
      const pendingStep = nextOnboardingStep(profile);
      if (pendingStep) {
        if (isOnboardingSkip(message)) {
          profile = skipOnboardingStep(profile, pendingStep);
        } else {
          const resolved = findStop(message, stopIndex, profile);
          if (!resolved) {
            return res.json({ reply: onboardingPrompt(pendingStep, profile.language ?? "fr") });
          }
          profile = applyOnboardingAnswer(profile, pendingStep, resolved.stop, message);
        }
        await saveProfile(profile, profilePath);
        const next = nextOnboardingStep(profile);
        const reply = next
          ? onboardingPrompt(next, profile.language ?? "fr")
          : profile.language === "en"
            ? "All set. Ask me anything, anytime."
            : "C'est beau. Demande-moi n'importe quand.";
        return res.json({ reply });
      }

      const intent = await parseIntent({ message, profile, client, model: config.intentModel });
      // The standing preference (set only by an explicit set_language turn)
      // wins over whatever language this particular message happens to be
      // written in — see docs/SPEC.md's "ask in English, receive Quebec
      // French" note.
      const language = profile.language ?? intent.language;

      if (intent.type === "set_language") {
        const pref = intent.languagePref ?? intent.language;
        profile = setLanguage(profile, pref === "auto" ? null : pref);
        await saveProfile(profile, profilePath);
        const reply = await formatAnswer({
          language: pref === "auto" ? intent.language : pref,
          frustrated: intent.frustrated,
          languagePrefSaved: pref,
          client,
          model: config.answerModel,
        });
        return res.json({ reply });
      }

      if (intent.type === "set_term") {
        const termSaved = intent.teach?.term && intent.teach?.target ? intent.teach : null;
        if (termSaved) {
          profile = teachTerm(profile, termSaved.term, termSaved.target);
          await saveProfile(profile, profilePath);
        }
        const reply = await formatAnswer({
          language,
          frustrated: intent.frustrated,
          termSaved: termSaved ?? undefined,
          client,
          model: config.answerModel,
        });
        return res.json({ reply });
      }

      if (intent.type === "set_place") {
        const placeKey = PLACE_KEYS.includes(intent.placeKey) ? intent.placeKey : "work";
        const found = intent.stopQuery ? findStop(intent.stopQuery, stopIndex, profile) : null;
        if (!found) {
          const reply = await formatAnswer({
            language,
            frustrated: intent.frustrated,
            placeSaveFailed: true,
            client,
            model: config.answerModel,
          });
          return res.json({ reply });
        }
        profile = { ...profile, [placeKey]: { id: found.stop.id, name: found.stop.name } };
        await saveProfile(profile, profilePath);
        const reply = await formatAnswer({
          language,
          frustrated: intent.frustrated,
          placeSaved: { placeKey, stopName: found.stop.name },
          client,
          model: config.answerModel,
        });
        return res.json({ reply });
      }

      if (intent.type === "out_of_scope") {
        const reply = await formatAnswer({
          language,
          frustrated: intent.frustrated,
          outOfScope: true,
          client,
          model: config.answerModel,
        });
        return res.json({ reply });
      }

      if (intent.type === "smalltalk") {
        const reply = await formatAnswer({ language, frustrated: intent.frustrated, client, model: config.answerModel });
        return res.json({ reply });
      }

      if (STOP_LOOKUP_TYPES.has(intent.type)) {
        const query = intent.stopQuery ?? "home";
        const resolved = resolveQueryStop(query, profile, stopIndex);

        if (resolved?.unset) {
          const reply = await formatAnswer({
            language,
            frustrated: intent.frustrated,
            aliasUnset: { term: resolved.unset },
            client,
            model: config.answerModel,
          });
          return res.json({ reply });
        }

        if (!resolved) {
          const reply =
            language === "en"
              ? "I couldn't find that stop — try naming it differently?"
              : "Je n'ai pas trouvé cet arrêt — essaie de le nommer autrement?";
          return res.json({ reply });
        }

        const { stop, aliasUsed } = resolved;

        if (intent.type === "service_hours") {
          const serviceHours = getServiceHours({ stop, scheduleIndex });
          const reply = await formatAnswer({
            language,
            frustrated: intent.frustrated,
            serviceHours,
            aliasUsed: aliasUsed ?? undefined,
            client,
            model: config.answerModel,
          });
          return res.json({ reply, serviceHours });
        }

        if (intent.type === "alerts") {
          const alerts = await getRelevantAlerts({
            url: config.stm.alertsUrl,
            apiKey: config.stm.apiKey,
            routeIds: intent.route ? [intent.route] : [],
            stopIds: [stop.id],
            cache,
          });
          const reply = await formatAnswer({
            language,
            frustrated: intent.frustrated,
            alerts,
            aliasUsed: aliasUsed ?? undefined,
            client,
            model: config.answerModel,
          });
          return res.json({ reply, alerts });
        }

        if (intent.type === "bixi") {
          const bixiStations =
            stop.lat != null && stop.lon != null
              ? await getNearestBixiStations({ lat: stop.lat, lon: stop.lon, need: "bikes", config, cache })
              : [];
          const reply = await formatAnswer({
            language,
            frustrated: intent.frustrated,
            bixiStations,
            aliasUsed: aliasUsed ?? undefined,
            client,
            model: config.answerModel,
          });
          return res.json({ reply, bixiStations });
        }

        // departures
        let departures = await getDepartures({ stop, scheduleIndex, config, cache });
        departures = filterByRoute(departures, intent.route);

        const alerts = await getRelevantAlerts({
          url: config.stm.alertsUrl,
          apiKey: config.stm.apiKey,
          routeIds: departures.map((d) => d.route),
          stopIds: [stop.id],
          cache,
        });

        const weatherCaveat = await getWeatherCaveat({ config, cache, language });

        const reply = await formatAnswer({
          departures,
          alerts,
          weatherCaveat,
          language,
          frustrated: intent.frustrated,
          aliasUsed: aliasUsed ?? undefined,
          client,
          model: config.answerModel,
        });

        return res.json({ reply, departures });
      }

      // Every documented intent type is handled above; this is unreachable
      // unless the schema grows without a matching branch.
      const reply = await formatAnswer({ language, frustrated: intent.frustrated, client, model: config.answerModel });
      return res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
