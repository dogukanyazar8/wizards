import { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";
import { validateMobileNativeCapabilityContract } from "../permissions/mobile-native-capability-contract";
import { validateMobileNotificationContract } from "../notifications/mobile-notification-contract";
import { validateMobileRealtimeContract } from "../realtime/mobile-realtime-contract";
import { validateMobileVoiceContract } from "../voice/mobile-voice-contract";
import { validateMobileAttachmentUploadContract } from "../media/mobile-attachment-upload-contract";
import { validateMobileInviteContract } from "../invite/mobile-invite-contract";
import { validateMobileMediaContract } from "../media/mobile-media-contract";
import { validateMobileProductionReadiness } from "../release/mobile-production-readiness";
import { validateMobileMessageSearchContract } from "../search/mobile-message-search-client";
import { validateMobileNotificationLifecycleContract } from "../notifications/mobile-notification-lifecycle-contract";
import { validateMobileVoiceLifecycleContract } from "../voice/mobile-voice-lifecycle-contract";

export type MobileQualityArea =
  | "accessibility"
  | "auth"
  | "deep-link"
  | "dm"
  | "launch"
  | "navigation"
  | "permissions"
  | "performance"
  | "release"
  | "realtime"
  | "search"
  | "store"
  | "sync"
  | "theme"
  | "voice"
  | "workspace";

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
    command: "corepack pnpm --filter @wizards/mobile test:components",
    id: "mobile-component-tests",
    purpose:
      "React Native component render tests for auth, voice, push-to-talk, and screen share UI.",
    required: true,
  },
  {
    command: "maestro test ../../.maestro/phase0-navigation.yml",
    id: "mobile-maestro-navigation",
    purpose:
      "Android device proof for hardware back plus channel, DM, invite, and settings deep links.",
    required: true,
  },
  {
    command: "maestro test ../../.maestro/phase1-dark-mode.yml",
    id: "mobile-maestro-dark-mode",
    purpose:
      "Android device proof for system, light, and dark appearance across every primary tab.",
    required: true,
  },
  {
    command: "maestro test ../../.maestro/phase2-messaging.yml",
    id: "mobile-maestro-phase2-messaging",
    purpose:
      "Android device proof for reactions, replies, edits, deletion, threads, and both themes.",
    required: true,
  },
  {
    command: "maestro test ../../.maestro/phase3-social.yml",
    id: "mobile-maestro-phase3-social",
    purpose:
      "Android device proof for settings IA, security, GIF picker, and DM details in both themes.",
    required: true,
  },
  {
    command: "maestro test ../../.maestro/phase4-server-management.yml",
    id: "mobile-maestro-phase4-server-management",
    purpose:
      "Android UAT proof for server, channel, member, media, destructive confirmation, cleanup, and both themes.",
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
    command: "corepack pnpm --filter @wizards/mobile release:evidence",
    id: "mobile-release-evidence",
    purpose: "Redacted release evidence for QA, native capability, store, and promotion gates.",
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
    label:
      "Home, DMs, Notifications, Calls, and Profile bottom tabs switch without overlap or jank.",
    required: true,
    risk: "high",
  },
  {
    area: "theme",
    id: "theme-light-dark-system",
    label:
      "System, light, and dark appearance updates app surfaces, system bars, and all primary tabs without remounting product state.",
    required: true,
    risk: "high",
  },
  {
    area: "navigation",
    id: "android-hardware-back-navigation",
    label:
      "Android hardware back pops channel and DM stacks to their parent surfaces without exiting the app.",
    required: true,
    risk: "high",
  },
  {
    area: "accessibility",
    id: "native-accessibility-touch-targets",
    label:
      "Icon-only actions expose accessibility labels, selected state, and at least 44px touch targets on compact screens.",
    required: true,
    risk: "critical",
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
    area: "deep-link",
    id: "invite-link-contract",
    label:
      "Safe invite links support native create/join and canonical share while server authorization remains enforced.",
    required: true,
    risk: "critical",
  },
  {
    area: "deep-link",
    id: "android-navigation-deep-links",
    label:
      "Android channel, DM, invite, and settings links resolve to the intended native navigation surfaces.",
    required: true,
    risk: "high",
  },
  {
    area: "permissions",
    id: "permission-prompt-discipline",
    label: "No camera, microphone, notification, or photo prompt appears before a user action.",
    required: true,
    risk: "critical",
  },
  {
    area: "permissions",
    id: "notification-user-action-runtime",
    label:
      "Notification permission is requested only from the Notifications screen action and reports server registration as pending.",
    required: true,
    risk: "critical",
  },
  {
    area: "voice",
    id: "voice-microphone-user-action-runtime",
    label:
      "Microphone permission is requested only from a voice join action; denied permissions fail closed before LiveKit starts.",
    required: true,
    risk: "critical",
  },
  {
    area: "permissions",
    id: "media-camera-photo-user-action-runtime",
    label:
      "Camera and photo library permissions are requested only from the Profile media setup actions; no picker, camera, or upload starts automatically.",
    required: true,
    risk: "critical",
  },
  {
    area: "dm",
    id: "dm-bootstrap-and-preview",
    label: "Real DM list opens a real bounded conversation preview without fabricated messages.",
    required: true,
    risk: "high",
  },
  {
    area: "dm",
    id: "dm-send-message",
    label:
      "A selected DM sends a real message through the mobile API and updates the conversation without mock content.",
    required: true,
    risk: "critical",
  },
  {
    area: "search",
    id: "message-search-contract",
    label:
      "Channel and DM search use authenticated mobile endpoints with bounded query length, pagination, and server-side permission checks.",
    required: true,
    risk: "high",
  },
  {
    area: "search",
    id: "message-search-ui",
    label:
      "Active channel and DM search forms require at least two characters, show bounded real results, and stay scoped to the selected conversation.",
    required: true,
    risk: "high",
  },
  {
    area: "workspace",
    id: "workspace-channel-read",
    label: "A real server opens with permission-filtered channels and compact category navigation.",
    required: true,
    risk: "high",
  },
  {
    area: "workspace",
    id: "server-management-authz-capabilities",
    label:
      "Server, channel, member, and icon controls appear only for server-provided capabilities while denied mutations stay safely rejected by the service.",
    required: true,
    risk: "critical",
  },
  {
    area: "workspace",
    id: "server-member-role-replacement",
    label:
      "Assigning or removing one existing role sends the complete intended role set without calculating hierarchy on the client.",
    required: true,
    risk: "critical",
  },
  {
    area: "workspace",
    id: "server-member-kick-boundaries",
    label:
      "Kick handles owner, self, and authorization denial safely and refreshes only the affected member scope.",
    required: true,
    risk: "critical",
  },
  {
    area: "workspace",
    id: "server-management-pagination-and-history",
    label:
      "Cursor member pagination preserves first-seen presence order and message-history clearing is confirmed and limited to text channels.",
    required: true,
    risk: "high",
  },
  {
    area: "accessibility",
    id: "server-management-destructive-and-theme",
    label:
      "Server management destructive actions prevent duplicate submission and remain legible in light and dark themes with accessible labels.",
    required: true,
    risk: "critical",
  },
  {
    area: "workspace",
    id: "workspace-dedicated-channel-chat",
    label:
      "Text channels open as a dedicated channel chat screen with safe-area composer behavior and real bounded messages.",
    required: true,
    risk: "high",
  },
  {
    area: "sync",
    id: "foreground-refresh",
    label:
      "Returning from background refreshes visible real data after the cooldown without request storms.",
    required: true,
    risk: "high",
  },
  {
    area: "realtime",
    id: "realtime-visible-refresh",
    label:
      "Signed-in foreground sessions receive socket updates for active channel/DM views without leaking token or message content in diagnostics.",
    required: true,
    risk: "critical",
  },
  {
    area: "voice",
    id: "voice-disabled-contract",
    label:
      "Calls validates native LiveKit join, mute, camera, audio output, disconnect cleanup, and heartbeat cleanup before release promotion.",
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
  {
    area: "release",
    id: "local-android-uat-build",
    label:
      "The local Android UAT script builds, installs, and launches on an emulator before remote EAS usage.",
    required: true,
    risk: "high",
  },
  {
    area: "release",
    id: "production-readiness-evidence",
    label:
      "Profile diagnostics shows UAT, canary, store-candidate, and production readiness gates without exposing PII or secrets.",
    required: true,
    risk: "critical",
  },
  {
    area: "store",
    id: "store-privacy-disclosures",
    label:
      "Store listing, screenshots, and privacy answers match the mobile permission disclosure contract.",
    required: true,
    risk: "critical",
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
    focus: ["dm", "workspace", "sync", "realtime", "permissions", "performance", "theme"],
    id: "android-regular",
    label: "Android regular phone",
    platform: "android",
    sizeClass: "regular",
  },
  {
    focus: ["launch", "deep-link", "navigation", "theme"],
    id: "ios-compact",
    label: "iOS compact phone",
    platform: "ios",
    sizeClass: "compact",
  },
  {
    focus: ["dm", "workspace", "sync", "voice", "release", "store"],
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
  "accessibility",
  "auth",
  "deep-link",
  "dm",
  "launch",
  "navigation",
  "permissions",
  "performance",
  "realtime",
  "release",
  "search",
  "store",
  "sync",
  "theme",
  "voice",
  "workspace",
];

const SENSITIVE_TEXT_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password=|secret=|bearer\s+[a-z0-9])/i;

export function summarizeMobileQualityGate(): MobileQualityGateSummary {
  const platforms = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.platform));
  const coveredAreas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));

  return {
    automatedGateCount: MOBILE_AUTOMATED_GATES.length,
    budgetCount: MOBILE_RELEASE_BUDGETS.length,
    criticalManualCount: MOBILE_MANUAL_QA_CHECKS.filter((check) => check.risk === "critical")
      .length,
    manualCheckCount: MOBILE_MANUAL_QA_CHECKS.length,
    platformCount: platforms.size,
    requiredAreas: REQUIRED_MANUAL_AREAS.filter((area) => coveredAreas.has(area)),
    targetCount: MOBILE_QA_DEVICE_MATRIX.length,
  };
}

export function validateMobileQualityGate(): string[] {
  const issues: string[] = Array.from(
    new Set([
      ...validateMobileNativeCapabilityContract(),
      ...validateMobileNotificationContract(),
      ...validateMobileNotificationLifecycleContract(),
      ...validateMobileVoiceContract(),
      ...validateMobileAttachmentUploadContract(),
      ...validateMobileInviteContract(),
      ...validateMobileMediaContract(),
      ...validateMobileMessageSearchContract(),
      ...validateMobileRealtimeContract(),
      ...validateMobileVoiceLifecycleContract(),
      ...validateMobileProductionReadiness(),
    ]),
  );
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
  const coveredCheckIds = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.id));
  for (const area of REQUIRED_MANUAL_AREAS) {
    if (!coveredAreas.has(area)) {
      issues.push(`Mobile manual QA checklist must cover ${area}.`);
    }
  }

  for (const requiredCheckId of ["permission-prompt-discipline", "production-readiness-evidence"]) {
    if (!coveredCheckIds.has(requiredCheckId)) {
      issues.push(`Mobile manual QA checklist must keep ${requiredCheckId}.`);
    }
  }

  for (const gate of MOBILE_AUTOMATED_GATES) {
    if (!gate.id.startsWith("mobile-maestro-") && !gate.command.includes("@wizards/mobile")) {
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
