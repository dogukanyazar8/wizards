import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SUITES = Object.freeze({
  safeAll: Object.freeze(["Standard", "CI", "Mobile", "Security", "Desktop"]),
  fullAcceptance: Object.freeze(["E2EFull", "MobileRelease"]),
});

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid profile registry ${label}.`);
  }
}

function validateProfile(profile, profileId) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error(`Invalid profile registry profile ${profileId}.`);
  }
  assertString(profile.description, `${profileId} description`);
  assertString(profile.estimatedImpact, `${profileId} estimated impact`);
  if (
    !Array.isArray(profile.preconditions) ||
    !Array.isArray(profile.steps) ||
    profile.steps.length === 0
  ) {
    throw new Error(`Invalid profile registry profile ${profileId}.`);
  }
  for (const step of profile.steps) {
    assertString(step?.id, `${profileId} step id`);
    assertString(step?.executable, `${profileId} executable`);
    if (
      !Array.isArray(step.arguments) ||
      step.arguments.some((argument) => typeof argument !== "string")
    ) {
      throw new Error(`Invalid profile registry ${profileId} arguments.`);
    }
  }
}

function publicProfile(profile, id) {
  return Object.freeze({
    id,
    description: profile.description,
    estimatedImpact: profile.estimatedImpact,
    destructive: id === "E2EFull",
    requiresApproval: id === "E2EFull" || id === "MobileRelease",
    preconditions: Object.freeze(
      profile.preconditions.map((precondition) =>
        Object.freeze({
          type: precondition.type,
          ...(typeof precondition.name === "string" ? { name: precondition.name } : {}),
          ...(typeof precondition.path === "string" ? { path: precondition.path } : {}),
        }),
      ),
    ),
    steps: Object.freeze(profile.steps.map((step) => Object.freeze({ id: step.id }))),
  });
}

export async function loadCatalog({ root }) {
  assertString(root, "root");
  const registryPath = join(root, "scripts", "quality", "local-gate-profiles.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (registry?.schemaVersion !== 1) {
    throw new Error("Unsupported local quality profile schema version.");
  }
  if (
    !registry.profiles ||
    typeof registry.profiles !== "object" ||
    Array.isArray(registry.profiles)
  ) {
    throw new Error("Invalid profile registry profiles object.");
  }

  const profiles = {};
  const profileOrder = Object.keys(registry.profiles);
  for (const profileId of profileOrder) {
    validateProfile(registry.profiles[profileId], profileId);
    profiles[profileId] = publicProfile(registry.profiles[profileId], profileId);
  }
  for (const profileId of [...SUITES.safeAll, ...SUITES.fullAcceptance]) {
    if (!profiles[profileId]) {
      throw new Error(`Required dashboard profile ${profileId} is missing from profile registry.`);
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    profileOrder: Object.freeze(profileOrder),
    profiles: Object.freeze(profiles),
    suites: SUITES,
  });
}
