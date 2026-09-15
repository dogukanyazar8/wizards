export type TestCadence =
  "pre-merge" | "post-merge" | "scheduled-regression" | "release-gate" | "production-monitoring";

export type TestLayer =
  | "accessibility"
  | "api-contract"
  | "component"
  | "desktop"
  | "e2e-smoke"
  | "integration"
  | "mobile-responsive"
  | "performance"
  | "realtime"
  | "security"
  | "static"
  | "unit"
  | "voice-media";

export type ProductRiskArea =
  | "accessibility"
  | "admin-policy"
  | "attachments"
  | "auth-session"
  | "desktop-release"
  | "dm"
  | "invite"
  | "messaging"
  | "mobile-responsive"
  | "performance"
  | "permissions"
  | "realtime"
  | "release-operations"
  | "settings"
  | "voice-video";

export type TestStrategySuite = {
  automated: boolean;
  cadences: readonly TestCadence[];
  command?: string;
  id: string;
  layers: readonly TestLayer[];
  purpose: string;
  riskAreas: readonly ProductRiskArea[];
};

export const productRiskAreas = [
  "accessibility",
  "admin-policy",
  "attachments",
  "auth-session",
  "desktop-release",
  "dm",
  "invite",
  "messaging",
  "mobile-responsive",
  "performance",
  "permissions",
  "realtime",
  "release-operations",
  "settings",
  "voice-video",
] as const satisfies readonly ProductRiskArea[];

export const testStrategySuites = [
  {
    automated: true,
    cadences: ["pre-merge"],
    command: "pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build",
    id: "static-unit-integration-pr-gate",
    layers: ["static", "unit", "integration", "security"],
    purpose:
      "Fast developer-owned checks for type safety, lint rules, pure logic, integration guards, and build regressions.",
    riskAreas: [
      "admin-policy",
      "auth-session",
      "messaging",
      "permissions",
      "release-operations",
      "settings",
    ],
  },
  {
    automated: true,
    cadences: ["pre-merge"],
    command: "pnpm --filter @wizards/web e2e:api",
    id: "api-contract-pr-gate",
    layers: ["api-contract", "security"],
    purpose:
      "Fast API boundary checks for auth, schemas, rate limits, permission boundaries, and standard error contracts.",
    riskAreas: [
      "admin-policy",
      "attachments",
      "auth-session",
      "invite",
      "messaging",
      "permissions",
      "settings",
    ],
  },
  {
    automated: true,
    cadences: ["pre-merge"],
    command: "pnpm --filter @wizards/web e2e:smoke",
    id: "critical-browser-smoke-pr-gate",
    layers: ["e2e-smoke"],
    purpose:
      "Small browser smoke path for login, shell, messaging, DM, server, settings, and high-value regressions.",
    riskAreas: ["auth-session", "dm", "messaging", "settings"],
  },
  {
    automated: true,
    cadences: ["post-merge"],
    command: "pnpm --filter @wizards/web e2e:realtime",
    id: "realtime-voice-post-merge",
    layers: ["realtime", "voice-media"],
    purpose:
      "More expensive multi-user, socket, presence, voice lifecycle, and fake-media flows after merge to protected branches.",
    riskAreas: ["dm", "messaging", "realtime", "voice-video"],
  },
  {
    automated: true,
    cadences: ["scheduled-regression"],
    command: "pnpm --filter @wizards/web e2e:mobile",
    id: "mobile-responsive-regression",
    layers: ["mobile-responsive", "performance", "accessibility"],
    purpose:
      "Viewport, drawer, composer, popup, settings, reduced-motion, locale, and overflow coverage for mobile web.",
    riskAreas: ["accessibility", "dm", "messaging", "mobile-responsive", "settings"],
  },
  {
    automated: true,
    cadences: ["scheduled-regression"],
    command: "pnpm --filter @wizards/web e2e",
    id: "full-browser-regression",
    layers: ["api-contract", "e2e-smoke", "mobile-responsive", "realtime", "voice-media"],
    purpose:
      "Nightly end-to-end regression across browser flows that are too expensive or noisy for every PR.",
    riskAreas: [
      "admin-policy",
      "attachments",
      "auth-session",
      "dm",
      "invite",
      "messaging",
      "mobile-responsive",
      "permissions",
      "realtime",
      "settings",
      "voice-video",
    ],
  },
  {
    automated: true,
    cadences: ["pre-merge", "release-gate"],
    command: "pnpm --filter @wizards/desktop release:ops && pnpm --filter @wizards/desktop test",
    id: "desktop-ops-contract",
    layers: ["desktop", "security"],
    purpose:
      "Desktop release, updater, capability, signing, and generated-config contract checks before UAT or production packaging.",
    riskAreas: ["desktop-release", "release-operations"],
  },
  {
    automated: true,
    cadences: ["release-gate"],
    command: "pnpm --filter @wizards/desktop build:desktop",
    id: "desktop-release-build",
    layers: ["desktop"],
    purpose:
      "Signed or release-ring desktop package verification with updater configuration supplied by the release environment.",
    riskAreas: ["desktop-release", "release-operations"],
  },
  {
    automated: false,
    cadences: ["scheduled-regression"],
    id: "voice-qoe-and-load-regression",
    layers: ["performance", "voice-media"],
    purpose:
      "Weekly/manual media quality and load checks for jitter, reconnect, memory, CPU, socket fanout, and voice long-run stability.",
    riskAreas: ["performance", "realtime", "voice-video"],
  },
  {
    automated: false,
    cadences: ["production-monitoring"],
    id: "production-monitoring",
    layers: ["performance", "security"],
    purpose:
      "Production monitoring for crash rate, message delivery, websocket disconnects, media QoE, latency, and rollback signals.",
    riskAreas: ["performance", "release-operations", "realtime", "voice-video"],
  },
] as const satisfies readonly TestStrategySuite[];

const allTestStrategySuites: readonly TestStrategySuite[] = testStrategySuites;

export function getSuitesForCadence(cadence: TestCadence): TestStrategySuite[] {
  return allTestStrategySuites.filter((suite) => suite.cadences.includes(cadence));
}

export function getAutomatedSuitesForCadence(cadence: TestCadence): TestStrategySuite[] {
  return getSuitesForCadence(cadence).filter((suite) => suite.automated);
}

export function getRiskCoverage(): Map<ProductRiskArea, TestStrategySuite[]> {
  return productRiskAreas.reduce((coverage, riskArea) => {
    coverage.set(
      riskArea,
      allTestStrategySuites.filter((suite) => suite.riskAreas.includes(riskArea)),
    );
    return coverage;
  }, new Map<ProductRiskArea, TestStrategySuite[]>());
}

export function getUncoveredRiskAreas(): ProductRiskArea[] {
  return [...getRiskCoverage()]
    .filter(([, suites]) => suites.length === 0)
    .map(([riskArea]) => riskArea);
}
