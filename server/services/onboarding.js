// Exactly two conversational questions: home, then work/school.
// No form, no settings screen — just two chat turns the first time.

export function nextOnboardingStep(profile) {
  if (!profile.home) return "home";
  if (!profile.work) return "work";
  return null;
}

export function onboardingPrompt(step, language = "fr") {
  const prompts = {
    home: {
      fr: "Bienvenue! Pour commencer, c'est où chez vous?",
      en: "Welcome! To start, where's home?",
    },
    work: {
      fr: "Parfait. Et le travail ou l'école?",
      en: "Got it. And work or school?",
    },
  };
  return prompts[step]?.[language] ?? prompts[step]?.en;
}

// Applies a resolved stop to the current onboarding step, returns the
// updated profile and whether onboarding is now complete.
export function applyOnboardingAnswer(profile, step, resolvedStop) {
  const updated = { ...profile };
  if (step === "home") {
    updated.home = { id: resolvedStop.id, name: resolvedStop.name };
  } else if (step === "work") {
    updated.work = { id: resolvedStop.id, name: resolvedStop.name };
  }
  updated.onboarded = nextOnboardingStep(updated) === null;
  return updated;
}
