import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";

export type MobileQualityArea =
  | "auth"
  | "deep-link"
  | "dm"
  | "launch"
  | "navigation"
  | "permissions"
  | "performance"
  | "release"
  | "voice";

export type MobileQualityRisk = "critical" | "high" | "medium";

export type MobileAutomatedGate = {
  command: string;
  id: string;
  purpose: string;
  required: true;
};

export type MobileManualQACheck = {
  area: MobileQualityArea;
  id: string;
  label: string;
  required: true;
  risk: MobileQualityRisk;
};

export type MobileQAMatrixTarget = {
  focus: MobileQualityArea[];
  id: string;
  label: string;
  platform: "android" | "ios";
  sizeClass: "compact" | "regular" | "tablet";
};

export const MOBILE_AUTOMATED_GATES: MobileAutomatedGate[] = [
  {
    command: "corepack pnpm --filter @wizards/mobile typecheck",
    id: "mobile-typecheck",
    purpose: "Strict TypeScript compatibility for Expo mobile sources.",
    required: true,
  },
  {
    command: "corepack pnpm --filter @wizards/mobile test",
    id: "mobile-contract-tests",
    purpose: "Session, API, deep link, release, permission, and DM client contracts.",
    required: true,
  },
  {
    command: "corepack pnpm --filter @wizards/mobile validate:env",
    id: "mobile-env-validation",
    purpose: "Build-time endpoint and public environment validation.",
    required: true,
  },
  {
    command: "corepack pnpm --filter @wizards/mobile release:check",
    id: "mobile-release-check",
    purpose: "EAS profile, version, HTTPS, and performance budget contract.",
    required: true,
  },
  {
    command: "corepack pnpm --filter @wizards/mobile quality:check",
    id: "mobile-quality-check",
    purpose: "Manual QA matrix, automated gate, and no-secret checklist validation.",
    required: true,
  },
];

export const MOBILE_MANUAL_QA_CHECKS: MobileManualQACheck[] = [
  {
    area: "launch",
    id: "launch-shell",
    label: "App opens with the Whispr splash/icon and reaches the tab shell.",
    required: true,
    risk: "critical",
  },
  {
    area: "navigation",
    id: "tab-navigation",
    label: "Overview, Chat, Voice, and Settings tabs switch without overlap or jank.",
    required: true,
    risk: "high",
  },
  {
    area: "auth",
    id: "auth-gate",
    label: "Signed-out protected screens show the auth gate and never impersonate a user.",
    required: true,
    risk: "critical",
  },
  {
    area: "auth",
    id: "web-handoff",
    label: "Web sign-in returns to the mobile app with the one-time handoff flow.",
    required: true,
    risk: "critical",
  },
  {
    area: "deep-link",
    id: "unsafe-link-rejection",
    label: "Links carrying credential-like query values are rejected.",
    required: true,
    risk: "critical",
  },
  {
    area: "permissions",
    id: "permission-prompt-discipline",
    label: "No camera, microphone, notification, or photo prompt appears before a user action.",
    required: true,
    risk: "critical",
  },
  {
    area: "dm",
    id: "dm-bootstrap-and-preview",
    label: "Real DM list opens a real bounded conversation preview without fake messages.",
    required: true,
    risk: "high",
  },
  {
    area: "voice",
    id: "voice-disabled-contract",
    label: "Voice surfaces stay honest until native permission and LiveKit contracts are connected.",
    required: true,
    risk: "high",
  },
  {
    area: "performance",
    id: "idle-performance",
    label: "Five minutes idle shows no obvious heating, memory growth, or scroll stutter.",
    required: true,
    risk: "medium",
  },
  {
    area: "release",
    id: "release-environment",
    label: "The build displays the intended UAT/canary/production environment endpoints.",
    required: true,
    risk: "high",
  },
];

export const MOBILE_QA_DEVICE_MATRIX: MobileQAMatrixTarget[] = [
  {
    focus: ["launch", "auth", "navigation"],
    id: "android-compact",
    label: "Android compact phone",
    platform: "android",
    sizeClass: "compact",
  },
  {
    focus: ["dm", "permissions", "performance"],
    id: "android-regular",
    label: "Android regular phone",
    platform: "android",
    sizeClass: "regular",
  },
  {
    focus: ["launch", "deep-link", "navigation"],
    id: "ios-compact",
    label: "iOS compact phone",
    platform: "ios",
    sizeClass: "compact",
  },
  {
    focus: ["dm", "voice", "release"],
    id: "ios-tablet",
    label: "iOS tablet",
    platform: "ios",
    sizeClass: "tablet",
  },
];

export type MobileQualityGateSummary = {
  automatedGateCount: number;
  budgetCount: number;
  criticalManualCount: number;
  manualCheckCount: number;
  platformCount: number;
  requiredAreas: MobileQualityArea[];
  targetCount: number;
};

const REQUIRED_MANUAL_AREAS: MobileQualityArea[] = [
  "auth",
  "deep-link",
  "dm",
  "launch",
  "navigation",
  "permissions",
  "performance",
  "release",
  "voice",
];

const SENSITIVE_TEXT_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password=|secret=|bearer\s+[a-z0-9])/i;

export function summarizeMobileQualityGate(): MobileQualityGateSummary {
  const platforms = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.platform));
  const coveredAreas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));

  return {
    automatedGateCount: MOBILE_AUTOMATED_GATES.length,
    budgetCount: MOBILE_RELEASE_BUDGETS.length,
    criticalManualCount: MOBILE_MANUAL_QA_CHECKS.filter(
      (check) => check.risk === "critical",
    ).length,
    manualCheckCount: MOBILE_MANUAL_QA_CHECKS.length,
    platformCount: platforms.size,
    requiredAreas: REQUIRED_MANUAL_AREAS.filter((area) => coveredAreas.has(area)),
    targetCount: MOBILE_QA_DEVICE_MATRIX.length,
  };
}

export function validateMobileQualityGate(): string[] {
  const issues: string[] = [];
  const summary = summarizeMobileQualityGate();

  if (summary.platformCount < 2) {
    issues.push("Mobile QA matrix must cover both Android and iOS.");
  }

  if (!MOBILE_QA_DEVICE_MATRIX.some((target) => target.sizeClass === "compact")) {
    issues.push("Mobile QA matrix must include a compact phone target.");
  }

  if (!MOBILE_QA_DEVICE_MATRIX.some((target) => target.sizeClass === "tablet")) {
    issues.push("Mobile QA matrix must include a tablet target before store promotion.");
  }

  const coveredAreas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));
  for (const area of REQUIRED_MANUAL_AREAS) {
    if (!coveredAreas.has(area)) {
      issues.push(`Mobile manual QA checklist must cover ${area}.`);
    }
  }

  for (const gate of MOBILE_AUTOMATED_GATES) {
    if (!gate.command.includes("@wizards/mobile")) {
      issues.push(`Automated mobile gate ${gate.id} must target @wizards/mobile.`);
    }
  }

  for (const item of [...MOBILE_MANUAL_QA_CHECKS, ...MOBILE_AUTOMATED_GATES]) {
    const text = "label" in item ? item.label : `${item.command} ${item.purpose}`;
    if (SENSITIVE_TEXT_PATTERN.test(text)) {
      issues.push(`Mobile quality item ${item.id} contains sensitive-looking text.`);
    }
  }

  return issues;
}
