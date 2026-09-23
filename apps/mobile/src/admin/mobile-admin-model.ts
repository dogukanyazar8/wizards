import {
  MOBILE_ADMIN_RESOLUTION_MAX_LENGTH,
  type MobileAdminCasePriority,
  type MobileAdminCaseStatus,
  type MobileAdminCaseSummary,
  type MobileAdminReportReason,
} from "@wizards/types";

import type { MobileNetworkStatus } from "../network/mobile-network-contract";

export { MOBILE_ADMIN_RESOLUTION_MAX_LENGTH };

/** The only three things the phone may do with a case. */
export const MOBILE_ADMIN_ACTIONS = ["claim", "dismiss", "escalate"] as const;

export type MobileAdminPriorityTone = "critical" | "high" | "muted" | "normal";

export function formatMobileAdminCaseNumber(publicNumber: number): string {
  return `MOD-${publicNumber}`;
}

export function getMobileAdminPriorityTone(
  priority: MobileAdminCasePriority,
): MobileAdminPriorityTone {
  switch (priority) {
    case "URGENT":
      return "critical";
    case "HIGH":
      return "high";
    case "LOW":
      return "muted";
    default:
      return "normal";
  }
}

export interface MobileAdminPriorityLabels {
  readonly high: string;
  readonly low: string;
  readonly normal: string;
  readonly urgent: string;
}

export function getMobileAdminPriorityLabel(
  priority: MobileAdminCasePriority,
  labels: MobileAdminPriorityLabels,
): string {
  switch (priority) {
    case "URGENT":
      return labels.urgent;
    case "HIGH":
      return labels.high;
    case "LOW":
      return labels.low;
    default:
      return labels.normal;
  }
}

export interface MobileAdminStatusLabels {
  readonly actioned: string;
  readonly appealed: string;
  readonly closed: string;
  readonly dismissed: string;
  readonly inReview: string;
  readonly open: string;
}

export function getMobileAdminStatusLabel(
  status: MobileAdminCaseStatus,
  labels: MobileAdminStatusLabels,
): string {
  switch (status) {
    case "IN_REVIEW":
      return labels.inReview;
    case "ACTIONED":
      return labels.actioned;
    case "DISMISSED":
      return labels.dismissed;
    case "APPEALED":
      return labels.appealed;
    case "CLOSED":
      return labels.closed;
    default:
      return labels.open;
  }
}

export interface MobileAdminReasonLabels {
  readonly harassment: string;
  readonly impersonation: string;
  readonly inappropriate: string;
  readonly other: string;
  readonly spam: string;
}

export function getMobileAdminReasonLabel(
  reason: MobileAdminReportReason,
  labels: MobileAdminReasonLabels,
): string {
  switch (reason) {
    case "HARASSMENT":
      return labels.harassment;
    case "SPAM":
      return labels.spam;
    case "INAPPROPRIATE":
      return labels.inappropriate;
    case "IMPERSONATION":
      return labels.impersonation;
    default:
      return labels.other;
  }
}

export interface MobileAdminAgeLabels {
  readonly days: string;
  readonly hours: string;
  readonly justNow: string;
  readonly minutes: string;
}

/** How long the queue has been waiting on this one: `12 dk`, `4 sa`, `2 gün`. */
export function formatMobileAdminCaseAge(
  isoTimestamp: string,
  now: Date,
  labels: MobileAdminAgeLabels,
): string {
  const timestamp = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(timestamp)) {
    return labels.justNow;
  }

  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (elapsedMinutes < 1) {
    return labels.justNow;
  }

  if (elapsedMinutes < 60) {
    return labels.minutes.replace("{count}", String(elapsedMinutes));
  }

  const hours = Math.floor(elapsedMinutes / 60);
  return hours < 24
    ? labels.hours.replace("{count}", String(hours))
    : labels.days.replace("{count}", String(Math.floor(hours / 24)));
}

/**
 * Offline means the buttons go dead, not that the taps are queued. A moderation
 * decision that fires hours later against a case someone else already closed is
 * worse than no decision, so there is no outbox on this surface — the last
 * cached queue stays readable and every action waits for the network.
 */
export function canRunMobileAdminAction(input: {
  readonly networkStatus: MobileNetworkStatus;
  readonly pending: boolean;
}): boolean {
  return input.networkStatus !== "offline" && !input.pending;
}

export function isMobileAdminResolutionValid(value: string): boolean {
  const trimmed = value.trim();

  return trimmed.length > 0 && trimmed.length <= MOBILE_ADMIN_RESOLUTION_MAX_LENGTH;
}

/**
 * A claimed case keeps its row in the queue — the phone shows who holds it so a
 * second moderator does not open the same case — but only the holder's own
 * screen offers "üstlen" again.
 */
export function canClaimMobileAdminCase(
  moderationCase: Pick<MobileAdminCaseSummary, "assigneeHandle" | "status">,
): boolean {
  return moderationCase.assigneeHandle === null && moderationCase.status === "OPEN";
}
