// Exactly two conversational questions: home, then work-or-school. No
// form, no settings screen — just two chat turns the first time, each
// skippable ("skip" / "passer").

const SCHOOL_KEYWORDS = /(école|ecole|cégep|cegep|campus|university|université|universite|school)/i;
const SKIP_PATTERN = /^(skip|passer)$/i;

export function nextOnboardingStep(profile) {
  const skipped = profile.skippedOnboarding ?? [];
  if (!profile.home && !skipped.includes("home")) return "home";
  if (!profile.work && !profile.school && !skipped.includes("workOrSchool")) return "workOrSchool";
  return null;
}

export function onboardingPrompt(step, language = "fr") {
  const prompts = {
    home: {
      fr: "Bienvenue! Pour commencer, c'est où chez vous?",
      en: "Welcome! To start, where's home?",
    },
    workOrSchool: {
      fr: "Parfait. Et le travail ou l'école?",
      en: "Got it. And work or school?",
    },
  };
  return prompts[step]?.[language] ?? prompts[step]?.en;
}

export function isOnboardingSkip(message) {
  return SKIP_PATTERN.test(message.trim());
}

// A bare answer to the work-or-school question defaults to "work" unless
// the message names a school (école, cégep, campus, university...).
export function classifyWorkOrSchool(rawMessage) {
  return SCHOOL_KEYWORDS.test(rawMessage) ? "school" : "work";
}

export function skipOnboardingStep(profile, step) {
  const skipped = profile.skippedOnboarding ?? [];
  const updated = { ...profile, skippedOnboarding: [...skipped, step] };
  updated.onboarded = nextOnboardingStep(updated) === null;
  return updated;
}

// Applies a resolved stop to the current onboarding step, returns the
// updated profile. `rawMessage` is only needed for the work-or-school step,
// to classify the answer as a workplace or a school.
export function applyOnboardingAnswer(profile, step, resolvedStop, rawMessage = "") {
  const updated = { ...profile };
  if (step === "home") {
    updated.home = { id: resolvedStop.id, name: resolvedStop.name };
  } else if (step === "workOrSchool") {
    const key = classifyWorkOrSchool(rawMessage);
    updated[key] = { id: resolvedStop.id, name: resolvedStop.name };
  }
  updated.onboarded = nextOnboardingStep(updated) === null;
  return updated;
}
