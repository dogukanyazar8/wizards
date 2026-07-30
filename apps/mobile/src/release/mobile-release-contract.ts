import { MOBILE_ENVIRONMENTS, type MobileEnvironmentName } from "../config/environment";
import {
  validateMobileStoreReadiness,
  type MobileStoreReadinessResult,
} from "./mobile-store-contract";
import {
  summarizeMobileProductionReadiness,
  validateMobileProductionReadiness,
  type MobileProductionReadinessSummary,
} from "./mobile-production-readiness";

export const MOBILE_RELEASE_PROFILES = ["development", "uat", "canary", "production"] as const;

export type MobileReleaseProfileName = (typeof MOBILE_RELEASE_PROFILES)[number];
export type MobileReleasePlatform = "android" | "ios";

export type MobileReleaseBudget = {
  label: string;
  /** The p95 a release may not exceed. Enforced by `release:check`. */
  maxMs: number;
  metric: string;
  /** Human-readable form of the same budget, for the checklist. */
  target: string;
};

export type MobileReleaseProfileConfig = {
  autoIncrement?: boolean;
  channel?: string;
  developmentClient?: boolean;
  distribution?: string;
  env?: Record<string, string>;
};

export type MobileReleaseContractInput = {
  appVersionSource: string;
  easBuildProfiles: Record<string, MobileReleaseProfileConfig | undefined>;
  packageVersion: string;
  rootVersion: string;
};

export type MobileReleaseContractResult = {
  blockers: string[];
  budgets: MobileReleaseBudget[];
  checklist: string[];
  productionReadiness: MobileProductionReadinessSummary;
  storeReadiness: MobileStoreReadinessResult;
  warnings: string[];
};

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FORBIDDEN_ENV_KEY_PATTERN = /(SECRET|PASSWORD|TOKEN|PRIVATE|PFX|KEY)$/i;

export const MOBILE_RELEASE_BUDGETS: MobileReleaseBudget[] = [
  {
    label: "Cold authenticated launch",
    maxMs: 2_500,
    metric: "startup",
    target: "p95 <= 2500ms to authenticated content on a mid-tier device",
  },
  {
    label: "Warm foreground resume",
    maxMs: 700,
    metric: "resume",
    target: "p95 <= 700ms without refetching unrelated surfaces",
  },
  {
    label: "Cached chat tap to content",
    maxMs: 100,
    metric: "chat-open-cached",
    target: "p95 <= 100ms when the stream is already cached",
  },
  {
    label: "Network chat tap to content",
    maxMs: 500,
    metric: "chat-open-network",
    target: "p95 <= 500ms same-region",
  },
  {
    label: "Send tap to local echo",
    maxMs: 50,
    metric: "send-echo",
    target: "p95 <= 50ms",
  },
  {
    label: "Send tap to server ack",
    maxMs: 300,
    metric: "send-ack",
    target: "p95 <= 300ms same-region",
  },
  {
    label: "Chat input latency",
    maxMs: 50,
    metric: "composer",
    target: "p95 <= 50ms while typing",
  },
];

function isHttpsReleaseUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      hostname !== "whispr.invalid" &&
      !hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function pushEndpointBlockers(
  blockers: string[],
  profileName: MobileReleaseProfileName,
  profile: MobileReleaseProfileConfig,
) {
  const env = profile.env ?? {};

  if (profileName === "development") {
    return;
  }

  for (const key of [
    "EXPO_PUBLIC_WHISPR_API_URL",
    "EXPO_PUBLIC_WHISPR_SOCKET_URL",
    "EXPO_PUBLIC_WHISPR_WEB_URL",
  ]) {
    if (!isHttpsReleaseUrl(env[key])) {
      blockers.push(`${profileName} ${key} must be an HTTPS non-local URL.`);
    }
  }
}

function pushSecretBlockers(
  blockers: string[],
  profileName: MobileReleaseProfileName,
  profile: MobileReleaseProfileConfig,
) {
  for (const key of Object.keys(profile.env ?? {})) {
    if (!key.startsWith("EXPO_PUBLIC_") && FORBIDDEN_ENV_KEY_PATTERN.test(key)) {
      blockers.push(`${profileName} EAS env must not embed secret-like key ${key}.`);
    }
  }
}

export function validateMobileReleaseContract({
  appVersionSource,
  easBuildProfiles,
  packageVersion,
  rootVersion,
}: MobileReleaseContractInput): MobileReleaseContractResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const storeReadiness = validateMobileStoreReadiness();
  const productionReadiness = summarizeMobileProductionReadiness();

  blockers.push(...storeReadiness.blockers);
  blockers.push(...validateMobileProductionReadiness());
  warnings.push(...storeReadiness.warnings);

  if (!SEMVER_PATTERN.test(packageVersion)) {
    blockers.push(`Mobile package version '${packageVersion}' must be semver.`);
  }

  if (packageVersion !== rootVersion) {
    blockers.push(
      `Mobile package version '${packageVersion}' must match root version '${rootVersion}'.`,
    );
  }

  if (appVersionSource !== "remote") {
    blockers.push(
      "EAS appVersionSource must be remote so CI preserves monotonic native build numbers.",
    );
  }

  for (const profileName of MOBILE_RELEASE_PROFILES) {
    const profile = easBuildProfiles[profileName];

    if (!profile) {
      blockers.push(`Missing EAS build profile '${profileName}'.`);
      continue;
    }

    if (profile.channel !== profileName) {
      blockers.push(`${profileName} profile channel must be '${profileName}'.`);
    }

    if (profile.env?.WHISPR_MOBILE_ENV !== profileName) {
      blockers.push(`${profileName} profile must set WHISPR_MOBILE_ENV=${profileName}.`);
    }

    pushEndpointBlockers(blockers, profileName, profile);
    pushSecretBlockers(blockers, profileName, profile);
  }

  const uat = easBuildProfiles.uat;
  const canary = easBuildProfiles.canary;
  const production = easBuildProfiles.production;

  if (uat?.distribution !== "internal") {
    blockers.push("uat profile must use internal distribution.");
  }

  if (canary?.distribution !== "internal") {
    blockers.push("canary profile must use internal distribution until store rollout is enabled.");
  }

  if (production?.distribution !== "store") {
    blockers.push("production profile must use store distribution.");
  }

  if (
    uat?.autoIncrement !== true ||
    canary?.autoIncrement !== true ||
    production?.autoIncrement !== true
  ) {
    blockers.push("uat, canary, and production profiles must auto-increment native build numbers.");
  }

  return {
    blockers: Array.from(new Set(blockers)),
    budgets: MOBILE_RELEASE_BUDGETS,
    checklist: [
      "Run mobile typecheck, tests, and environment validation.",
      "Confirm no native permission prompt appears before a user action.",
      "Verify auth handoff never places access, refresh, or OAuth code values in URLs.",
      "Run iOS and Android smoke builds against the selected release profile.",
      "Record startup, resume, composer latency, and idle memory evidence before promotion.",
      ...storeReadiness.checklist,
    ],
    productionReadiness,
    storeReadiness,
    warnings: Array.from(new Set(warnings)),
  };
}

export function assertKnownMobileEnvironment(
  value: string,
): asserts value is MobileEnvironmentName {
  if (!MOBILE_ENVIRONMENTS.includes(value as MobileEnvironmentName)) {
    throw new Error(`Unknown mobile environment '${value}'.`);
  }
}
