/**
 * Shared contract between server push payloads (apps/web/src/lib/mobile/push-sender.ts)
 * and the mobile display/navigation layer. Pure logic — no expo imports — so the
 * node:test contract suite can execute it.
 */

export const MOBILE_PUSH_ANDROID_CHANNELS = {
  calls: "whispr-calls",
  default: "whispr-default",
} as const;

// No ":" or "-" allowed: expo-notifications category identifiers with those
// characters are documented as unreliable.
export const MOBILE_PUSH_INCOMING_CALL_CATEGORY = "incomingcall";

export const MOBILE_PUSH_INCOMING_CALL_ACTIONS = [
  { buttonTitle: "Answer", identifier: "answer", opensAppToForeground: true },
  { buttonTitle: "Decline", identifier: "decline", opensAppToForeground: false },
] as const;

export type MobilePushData =
  | {
      actionUrl: string;
      kind: "notification";
      notificationId: string;
      type: string;
    }
  | {
      callType: "video" | "voice";
      conversationId: string;
      fromUserId: string;
      kind: "dm-call";
    };

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseMobilePushData(raw: unknown): MobilePushData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.kind === "notification") {
    const notificationId = readString(record.notificationId);
    const type = readString(record.type);
    if (notificationId === null || type === null) {
      return null;
    }
    return {
      actionUrl: readString(record.actionUrl) ?? "",
      kind: "notification",
      notificationId,
      type,
    };
  }

  if (record.kind === "dm-call") {
    const conversationId = readString(record.conversationId);
    const fromUserId = readString(record.fromUserId);
    const callType =
      record.callType === "video" ? "video" : record.callType === "voice" ? "voice" : null;
    if (conversationId === null || fromUserId === null || callType === null) {
      return null;
    }
    return { callType, conversationId, fromUserId, kind: "dm-call" };
  }

  return null;
}

/**
 * Foreground policy: the in-app UI already renders feed activity, so feed
 * pushes stay silent while the app is open; incoming calls must always ring.
 * Unparseable payloads present (fail-open) so a contract drift never silently
 * swallows notifications.
 */
export function shouldPresentMobilePushInForeground(data: MobilePushData | null): boolean {
  if (data === null) {
    return true;
  }
  return data.kind === "dm-call";
}

export function resolveMobilePushNavigationPath(data: MobilePushData | null): string {
  if (data?.kind === "dm-call") {
    return `/channels/@me/${data.conversationId}`;
  }
  if (data?.kind === "notification" && data.actionUrl.length > 0) {
    return data.actionUrl;
  }
  return "/notifications";
}
