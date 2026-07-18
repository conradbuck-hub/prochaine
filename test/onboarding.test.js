import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextOnboardingStep,
  onboardingPrompt,
  applyOnboardingAnswer,
  isOnboardingSkip,
  classifyWorkOrSchool,
  skipOnboardingStep,
} from "../server/services/onboarding.js";
import { teachTerm, addAlias, forgetTerm } from "../server/services/lexicon.js";
import { defaultProfile, loadProfile, saveProfile } from "../server/services/userProfile.js";
import { findStop } from "../server/services/stopMatcher.js";

test("onboarding: asks for home first, then work-or-school", () => {
  let profile = defaultProfile();
  assert.equal(nextOnboardingStep(profile), "home");
  assert.match(onboardingPrompt("home", "en"), /home/i);

  profile = applyOnboardingAnswer(profile, "home", { id: "stm:2001", name: "Sherbrooke / Atwater" });
  assert.equal(nextOnboardingStep(profile), "workOrSchool");
  assert.equal(profile.onboarded, false);

  profile = applyOnboardingAnswer(profile, "workOrSchool", { id: "exo:3001", name: "Gare Vaudreuil" }, "Gare Vaudreuil");
  assert.equal(nextOnboardingStep(profile), null);
  assert.equal(profile.onboarded, true);
  assert.equal(profile.home.name, "Sherbrooke / Atwater");
  assert.equal(profile.work.name, "Gare Vaudreuil");
  assert.equal(profile.school, null);
});

test("onboarding: work-or-school answer classifies as school when school words appear", () => {
  const key = classifyWorkOrSchool("mon cégep, c'est Gare Centrale");
  assert.equal(key, "school");
  let profile = applyOnboardingAnswer(defaultProfile(), "workOrSchool", { id: "rem:1", name: "Gare Centrale" }, "mon cégep, c'est Gare Centrale");
  assert.equal(profile.school.name, "Gare Centrale");
  assert.equal(profile.work, null);
});

test("onboarding: skip moves past a step without setting it", () => {
  assert.equal(isOnboardingSkip("skip"), true);
  assert.equal(isOnboardingSkip(" Passer "), true);
  assert.equal(isOnboardingSkip("Sherbrooke"), false);

  let profile = skipOnboardingStep(defaultProfile(), "home");
  assert.equal(profile.home, null);
  assert.equal(nextOnboardingStep(profile), "workOrSchool");

  profile = skipOnboardingStep(profile, "workOrSchool");
  assert.equal(nextOnboardingStep(profile), null);
  assert.equal(profile.onboarded, true);
});

test("onboarding answer resolves through the same typo-tolerant stop matcher", () => {
  const stopIndex = [{ id: "stm:2001", name: "Sherbrooke / Atwater", agency: "stm", mode: "bus" }];
  const resolved = findStop("sherbrook atwatter", stopIndex);
  assert.ok(resolved);
  let profile = applyOnboardingAnswer(defaultProfile(), "home", resolved.stop);
  assert.equal(profile.home.id, "stm:2001");
});

test("teach a lexicon term and resolve it via findStop", () => {
  const stopIndex = [{ id: "stm:2001", name: "Sherbrooke / Atwater", agency: "stm", mode: "bus" }];
  let profile = defaultProfile();
  profile = teachTerm(profile, "mon bus", "stm:2001");
  const resolved = findStop("mon bus", stopIndex, profile);
  assert.equal(resolved.source, "lexicon");
  assert.equal(resolved.stop.id, "stm:2001");
});

test("aliases and forgetting a taught term", () => {
  let profile = defaultProfile();
  profile = addAlias(profile, "bus home", "Sherbrooke / Atwater");
  assert.equal(profile.aliases["bus home"], "Sherbrooke / Atwater");
  profile = forgetTerm(profile, "bus home");
  assert.equal(profile.aliases["bus home"], undefined);
});

test("profile persists across a simulated restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prochaine-test-"));
  const profilePath = join(dir, "user-profile.json");

  try {
    let profile = defaultProfile();
    profile = applyOnboardingAnswer(profile, "home", { id: "stm:2001", name: "Sherbrooke / Atwater" });
    profile = applyOnboardingAnswer(profile, "workOrSchool", { id: "exo:3001", name: "Gare Vaudreuil" }, "Gare Vaudreuil");
    profile = teachTerm(profile, "mon bus", "24");
    await saveProfile(profile, profilePath);

    // Simulate a restart: fresh load from disk, no in-memory state carried over.
    const reloaded = await loadProfile(profilePath);
    assert.equal(reloaded.onboarded, true);
    assert.equal(reloaded.home.name, "Sherbrooke / Atwater");
    assert.equal(reloaded.lexicon["mon bus"], "24");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadProfile returns a default profile when no file exists yet", async () => {
  const profile = await loadProfile(join(tmpdir(), `prochaine-nonexistent-${Date.now()}.json`));
  assert.equal(profile.onboarded, false);
  assert.equal(profile.home, null);
});
