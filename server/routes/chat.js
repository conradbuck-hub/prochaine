import { Router } from "express";
import { loadProfile, saveProfile } from "../services/userProfile.js";
import {
  nextOnboardingStep,
  onboardingPrompt,
  applyOnboardingAnswer,
} from "../services/onboarding.js";
import { findStop } from "../services/stopMatcher.js";
import { teachTerm, setLanguage } from "../services/lexicon.js";
import { getDepartures } from "../services/departures/index.js";
import { getRelevantAlerts } from "../services/alerts.js";
import { getWeatherCaveat } from "../services/weather.js";
import { getAnthropicClient } from "../llm/client.js";
import { parseIntent } from "../llm/intentParser.js";
import { formatAnswer } from "../llm/answerFormatter.js";

const FRUSTRATION_PATTERN = /\b(ugh|ostie|tabarnak|come on|again\?!|encore\?!)\b/i;

function resolveNamedStop(name, profile, stopIndex) {
  const anchor = name.toLowerCase() === "home" ? profile.home : name.toLowerCase() === "work" ? profile.work : null;
  if (!anchor) return null;
  const full = stopIndex.find((s) => s.id === anchor.id);
  return full ? { stop: full, source: "anchor" } : { stop: anchor, source: "anchor" };
}

export function createChatRouter({ config, cache, stopIndex, scheduleIndex, profilePath }) {
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
      const client = getAnthropicClient(config);

      const pendingStep = nextOnboardingStep(profile);
      if (pendingStep) {
        const resolved = findStop(message, stopIndex, profile);
        if (!resolved) {
          return res.json({ reply: onboardingPrompt(pendingStep, profile.language ?? "fr") });
        }
        profile = applyOnboardingAnswer(profile, pendingStep, resolved.stop);
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

      if (intent.language && intent.language !== profile.language) {
        profile = setLanguage(profile, intent.language);
        await saveProfile(profile, profilePath);
      }

      if (intent.type === "teach_lexicon" && intent.teach?.term && intent.teach?.target) {
        profile = teachTerm(profile, intent.teach.term, intent.teach.target);
        await saveProfile(profile, profilePath);
        const reply =
          profile.language === "en"
            ? `Got it — "${intent.teach.term}" means ${intent.teach.target}.`
            : `Compris — « ${intent.teach.term} » veut dire ${intent.teach.target}.`;
        return res.json({ reply });
      }

      if (intent.type === "departure_query") {
        const query = intent.stopQuery ?? "home";
        const resolved = resolveNamedStop(query, profile, stopIndex) ?? findStop(query, stopIndex, profile);

        if (!resolved) {
          const reply =
            profile.language === "en"
              ? "I couldn't find that stop — try naming it differently?"
              : "Je n'ai pas trouvé cet arrêt — essaie de le nommer autrement?";
          return res.json({ reply });
        }

        const departures = await getDepartures({ stop: resolved.stop, scheduleIndex, config, cache });

        const alerts = await getRelevantAlerts({
          url: config.stm.alertsUrl,
          apiKey: config.stm.apiKey,
          routeIds: departures.map((d) => d.route),
          stopIds: [resolved.stop.id],
          cache,
        });

        const weatherCaveat = await getWeatherCaveat({
          config,
          cache,
          language: profile.language ?? "fr",
        });

        const reply = await formatAnswer({
          departures,
          alerts,
          weatherCaveat,
          language: profile.language ?? "fr",
          frustrated: FRUSTRATION_PATTERN.test(message),
          client,
          model: config.answerModel,
        });

        return res.json({ reply, departures });
      }

      const reply =
        profile.language === "en"
          ? "Not sure what you're asking — try naming a stop, or teach me a term."
          : "Je ne suis pas sûr de comprendre — nomme un arrêt, ou apprends-moi un terme.";
      return res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
