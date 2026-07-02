import {
  MOBILE_NATIVE_CAPABILITIES,
  summarizeMobileNativeCapabilities,
} from "../permissions/mobile-native-capability-contract";
import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
} from "../quality/mobile-quality-gate";
import {
  MOBILE_RELEASE_PROFILES,
  validateMobileReleaseContract,
  type MobileReleaseContractInput,
  type MobileReleaseProfileConfig,
  type MobileReleaseProfileName,
} from "./mobile-release-contract";
import {
  WHISPR_MOBILE_APP_IDENTITY,
  WHISPR_MOBILE_PERMISSION_DISCLOSURES,
  WHISPR_MOBILE_PRIVACY_REQUIREMENTS,
} from "./mobile-store-contract";

export interface MobileReleaseEvidenceProfile {
  readonly autoIncrement: boolean | null;
  readonly channel: string | null;
  readonly developmentClient: boolean;
  readonly distribution: string | null;
  readonly name: MobileReleaseProfileName;
  readonly publicOrigins: {
    readonly api: string | null;
    readonly socket: string | null;
    readonly web: string | null;
  };
  readonly whisprMobileEnv: string | null;
}

export interface MobileReleaseEvidence {
  readonly automatedGates: readonly {
    readonly command: string;
    readonly id: string;
    readonly purpose: string;
  }[];
  readonly blockers: readonly string[];
  readonly budgets: readonly {
    readonly label: string;
    readonly metric: string;
    readonly target: string;
  }[];
  readonly deviceMatrix: readonly {
    readonly focus: readonly string[];
    readonly id: string;
    readonly platform: string;
    readonly sizeClass: string;
  }[];
  readonly generatedAt: string;
  readonly manualQa: readonly {
    readonly area: string;
    readonly id: string;
    readonly label: string;
    readonly risk: string;
  }[];
  readonly nativeCapabilities: readonly {
    readonly feature: string;
    readonly id: string;
    readonly permissionIntents: readonly string[];
    readonly stage: string;
    readonly userActionTrigger: string;
  }[];
  readonly nativeCapabilitySummary: ReturnType<typeof summarizeMobileNativeCapabilities>;
  readonly packageVersion: string;
  readonly productionReadiness: ReturnType<typeof validateMobileReleaseContract>["productionReadiness"];
  readonly quality: ReturnType<typeof summarizeMobileQualityGate>;
  readonly redacted: true;
  readonly releaseProfiles: readonly MobileReleaseEvidenceProfile[];
  readonly rootVersion: string;
  readonly schemaVersion: 1;
  readonly store: {
    readonly appName: string;
    readonly permissionDisclosures: readonly {
      readonly hasAndroidRuntimePermission: boolean;
      readonly hasIosUsageDescription: boolean;
      readonly id: string;
      readonly usageDescription: string;
      readonly userActionRequired: true;
    }[];
    readonly privacyRequirements: readonly string[];
    readonly scheme: string;
  };
  readonly warnings: readonly string[];
}

const SENSITIVE_EVIDENCE_PATTERN =
  /(?:access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|private[_-]?key|pfx)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{8,}/i;

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "whispr.invalid" ||
    normalized.endsWith(".local")
  );
}

function safePublicOrigin(
  value: string | undefined,
  profileName: MobileReleaseProfileName,
): string | null {
  if (!value) {
    return profileName === "development" ? "development-local" : null;
  }

  try {
    const url = new URL(value);

    if (profileName === "development" && isLocalHost(url.hostname)) {
      return "development-local";
    }

    return url.origin;
  } catch {
    return "invalid-url";
  }
}

function summarizeReleaseProfile(
  name: MobileReleaseProfileName,
  profile: MobileReleaseProfileConfig | undefined,
): MobileReleaseEvidenceProfile {
  const env = profile?.env ?? {};

  return {
    autoIncrement: typeof profile?.autoIncrement === "boolean" ? profile.autoIncrement : null,
    channel: profile?.channel ?? null,
    developmentClient: profile?.developmentClient === true,
    distribution: profile?.distribution ?? null,
    name,
    publicOrigins: {
      api: safePublicOrigin(env.EXPO_PUBLIC_WHISPR_API_URL, name),
      socket: safePublicOrigin(env.EXPO_PUBLIC_WHISPR_SOCKET_URL, name),
      web: safePublicOrigin(env.EXPO_PUBLIC_WHISPR_WEB_URL, name),
    },
    whisprMobileEnv: env.WHISPR_MOBILE_ENV ?? null,
  };
}

export function buildMobileReleaseEvidence(
  input: MobileReleaseContractInput & { generatedAt?: string },
): MobileReleaseEvidence {
  const result = validateMobileReleaseContract(input);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    automatedGates: MOBILE_AUTOMATED_GATES.map((gate) => ({
      command: gate.command,
      id: gate.id,
      purpose: gate.purpose,
    })),
    blockers: result.blockers,
    budgets: result.budgets,
    deviceMatrix: MOBILE_QA_DEVICE_MATRIX.map((target) => ({
      focus: target.focus,
      id: target.id,
      platform: target.platform,
      sizeClass: target.sizeClass,
    })),
    generatedAt,
    manualQa: MOBILE_MANUAL_QA_CHECKS.map((check) => ({
      area: check.area,
      id: check.id,
      label: check.label,
      risk: check.risk,
    })),
    nativeCapabilities: MOBILE_NATIVE_CAPABILITIES.map((capability) => ({
      feature: capability.feature,
      id: capability.id,
      permissionIntents: capability.permissionIntents,
      stage: capability.stage,
      userActionTrigger: capability.userActionTrigger,
    })),
    nativeCapabilitySummary: summarizeMobileNativeCapabilities(),
    packageVersion: input.packageVersion,
    productionReadiness: result.productionReadiness,
    quality: summarizeMobileQualityGate(),
    redacted: true,
    releaseProfiles: MOBILE_RELEASE_PROFILES.map((profileName) =>
      summarizeReleaseProfile(profileName, input.easBuildProfiles[profileName]),
    ),
    rootVersion: input.rootVersion,
    schemaVersion: 1,
    store: {
      appName: WHISPR_MOBILE_APP_IDENTITY.name,
      permissionDisclosures: WHISPR_MOBILE_PERMISSION_DISCLOSURES.map((disclosure) => ({
        hasAndroidRuntimePermission: typeof disclosure.androidPermission === "string",
        hasIosUsageDescription: typeof disclosure.iosInfoPlistKey === "string",
        id: disclosure.id,
        usageDescription: disclosure.usageDescription,
        userActionRequired: disclosure.userActionRequired,
      })),
      privacyRequirements: WHISPR_MOBILE_PRIVACY_REQUIREMENTS,
      scheme: WHISPR_MOBILE_APP_IDENTITY.scheme,
    },
    warnings: result.warnings,
  };
}

export function validateMobileReleaseEvidence(evidence: MobileReleaseEvidence): string[] {
  const issues: string[] = [];
  const serialized = JSON.stringify(evidence);

  if (evidence.schemaVersion !== 1) {
    issues.push("Mobile release evidence schemaVersion must be 1.");
  }

  if (evidence.redacted !== true) {
    issues.push("Mobile release evidence must be explicitly marked redacted.");
  }

  if (Number.isNaN(Date.parse(evidence.generatedAt))) {
    issues.push("Mobile release evidence generatedAt must be a valid ISO date.");
  }

  if (evidence.blockers.length > 0) {
    issues.push("Mobile release evidence cannot be promoted while release blockers exist.");
  }

  if (!evidence.automatedGates.some((gate) => gate.id === "mobile-release-evidence")) {
    issues.push("Mobile release evidence must include the evidence generation gate.");
  }

  if (evidence.manualQa.length < 20) {
    issues.push("Mobile release evidence must include the manual QA checklist.");
  }

  if (evidence.deviceMatrix.length < 4) {
    issues.push("Mobile release evidence must include the Android/iOS device matrix.");
  }

  if (evidence.nativeCapabilities.length < 5 || evidence.nativeCapabilitySummary.total < 5) {
    issues.push("Mobile release evidence must cover native capability readiness.");
  }

  if (evidence.productionReadiness.stageCount !== 4) {
    issues.push("Mobile release evidence must cover all production readiness stages.");
  }

  if (SENSITIVE_EVIDENCE_PATTERN.test(serialized)) {
    issues.push("Mobile release evidence contains sensitive-looking text.");
  }

  for (const profile of evidence.releaseProfiles) {
    if (profile.name !== "development") {
      for (const [key, origin] of Object.entries(profile.publicOrigins)) {
        if (!origin || origin === "invalid-url" || origin === "development-local") {
          issues.push(`${profile.name} release evidence has invalid ${key} origin.`);
        }
      }
    }
  }

  return issues;
}
