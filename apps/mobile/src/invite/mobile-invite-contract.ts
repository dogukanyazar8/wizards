import type { MobileBootstrapFeature } from "@wizards/types";
import type { MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";

export type MobileInviteReadinessReason =
  | "disabled"
  | "missing-feature"
  | "not-an-invite"
  | "ready"
  | "server-contract-required"
  | "unsafe-link";

export type MobileInviteReadinessStatus =
  | "available"
  | "disabled"
  | "requires-native-permission"
  | "requires-server-contract"
  | "unknown";

export type MobileInviteReadiness = {
  canAcceptInvite: boolean;
  code: string | null;
  reason: MobileInviteReadinessReason;
  status: MobileInviteReadinessStatus;
};

export function getMobileInviteReadiness({
  invitesFeature,
  lastDeepLink,
}: {
  invitesFeature?: MobileBootstrapFeature | null;
  lastDeepLink: MobileDeepLinkParseResult | null;
}): MobileInviteReadiness {
  if (!lastDeepLink) {
    return {
      canAcceptInvite: false,
      code: null,
      reason: "not-an-invite",
      status: invitesFeature?.status ?? "unknown",
    };
  }

  if (!lastDeepLink.ok) {
    return {
      canAcceptInvite: false,
      code: null,
      reason: "unsafe-link",
      status: invitesFeature?.status ?? "unknown",
    };
  }

  if (lastDeepLink.intent.type !== "invite") {
    return {
      canAcceptInvite: false,
      code: null,
      reason: "not-an-invite",
      status: invitesFeature?.status ?? "unknown",
    };
  }

  if (!invitesFeature) {
    return {
      canAcceptInvite: false,
      code: lastDeepLink.intent.code,
      reason: "missing-feature",
      status: "unknown",
    };
  }

  switch (invitesFeature.status) {
    case "available":
      return {
        canAcceptInvite: true,
        code: lastDeepLink.intent.code,
        reason: "ready",
        status: invitesFeature.status,
      };
    case "disabled":
      return {
        canAcceptInvite: false,
        code: lastDeepLink.intent.code,
        reason: "disabled",
        status: invitesFeature.status,
      };
    case "requires-native-permission":
    case "requires-server-contract":
      return {
        canAcceptInvite: false,
        code: lastDeepLink.intent.code,
        reason: "server-contract-required",
        status: invitesFeature.status,
      };
    default:
      return {
        canAcceptInvite: false,
        code: lastDeepLink.intent.code,
        reason: "missing-feature",
        status: "unknown",
      };
  }
}

export function validateMobileInviteContract(): string[] {
  const safeInvite: MobileDeepLinkParseResult = {
    intent: {
      autoAccept: true,
      code: "ABC_def-123",
      type: "invite",
    },
    ok: true,
  };
  const unsafeLink: MobileDeepLinkParseResult = {
    ok: false,
    reason: "sensitive-query",
  };
  const issues: string[] = [];

  const pending = getMobileInviteReadiness({
    invitesFeature: {
      label: "Invites",
      reason: "Mobile invite acceptance endpoint pending.",
      status: "requires-server-contract",
    },
    lastDeepLink: safeInvite,
  });
  if (pending.canAcceptInvite || pending.reason !== "server-contract-required") {
    issues.push("Mobile invite readiness must block invite acceptance until server contract exists.");
  }

  const available = getMobileInviteReadiness({
    invitesFeature: {
      label: "Invites",
      status: "available",
    },
    lastDeepLink: safeInvite,
  });
  if (!available.canAcceptInvite || available.code !== "ABC_def-123") {
    issues.push("Mobile invite readiness must allow safe invite links only when feature is available.");
  }

  const rejected = getMobileInviteReadiness({
    invitesFeature: {
      label: "Invites",
      status: "available",
    },
    lastDeepLink: unsafeLink,
  });
  if (rejected.canAcceptInvite || rejected.reason !== "unsafe-link") {
    issues.push("Mobile invite readiness must reject unsafe invite-like links.");
  }

  return issues;
}
