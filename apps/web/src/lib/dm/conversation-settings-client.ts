"use client";

import {
  ConversationPrivacySchema,
  MobileUserReportResponseSchema,
  type ConversationPrivacy,
  type DMNotifyLevel,
  type MobileUserReportReason,
  type SetMutedRequest,
  type UpdatePrivacyRequest,
} from "@wizards/types";

/**
 * Mesajlar §15.5 / §17 — the mutations behind the profile panel's privacy card,
 * the header's `Sessize al` submenu and its `Bildir` row.
 *
 * A separate module from `lib/dm/client.ts` on purpose: that file owns the
 * conversation list's React Query cache, and these three writes touch account
 * preferences and the moderation queue instead. Nothing here caches.
 */

export class ConversationSettingsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ConversationSettingsError";
  }
}

type RequestOptions = {
  body?: unknown;
  method: string;
};

async function requestJson<T>(
  url: string,
  options: RequestOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const init: RequestInit = {
    headers: { "Content-Type": "application/json" },
    method: options.method,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetchImpl(url, init);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new ConversationSettingsError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

export type SetConversationMutedResult = {
  muted: boolean;
  /** ISO instant, or null for `Süresiz`. */
  mutedUntil: string | null;
  notifyLevel: DMNotifyLevel;
  success: true;
};

/**
 * §17's submenu. Omitting `duration` means `Süresiz`, which is also what the
 * pre-submenu body meant — so an older caller sending `{ muted: true }` keeps
 * getting the same result.
 *
 * The deadline comes back in the response rather than being recomputed on the
 * client: the server's clock is the one the expiry is measured against, and a
 * client that derived its own would draw a pill that runs out at a different
 * minute than the notifications do.
 */
export async function setConversationMutedRequest(
  conversationId: string,
  /**
   * The shared request schema rather than a local shape: `exactOptionalPropertyTypes`
   * treats `duration?: T` and `duration?: T | undefined` as different types, so a
   * hand-written twin here rejected the very bodies `muteRequestBody` produces.
   */
  input: SetMutedRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SetConversationMutedResult> {
  return requestJson<SetConversationMutedResult>(
    `/api/v1/dm/${encodeURIComponent(conversationId)}/mute`,
    { body: input, method: "PATCH" },
    fetchImpl,
  );
}

export async function fetchMessagingPrivacy(
  fetchImpl: typeof fetch = fetch,
): Promise<ConversationPrivacy> {
  return ConversationPrivacySchema.parse(
    await requestJson<unknown>("/api/v1/users/me/privacy", { method: "GET" }, fetchImpl),
  );
}

/**
 * §15.5 madde 2. Sends only the switch that moved; the response carries both, so
 * the card never has to guess what the other row says after a write.
 */
export async function updateMessagingPrivacyRequest(
  input: UpdatePrivacyRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ConversationPrivacy> {
  return ConversationPrivacySchema.parse(
    await requestJson<unknown>(
      "/api/v1/users/me/privacy",
      { body: input, method: "PATCH" },
      fetchImpl,
    ),
  );
}

/**
 * §15.5's `Bildir` row (karar K12). The response is only a report id — nothing
 * about the reported account travels back — so there is nothing here to cache
 * or to render beyond the confirmation toast.
 */
export async function reportUserRequest(
  userId: string,
  body: { details?: string | null; reason: MobileUserReportReason },
  fetchImpl: typeof fetch = fetch,
): Promise<{ reportId: string }> {
  return MobileUserReportResponseSchema.parse(
    await requestJson<unknown>(
      `/api/v1/users/${encodeURIComponent(userId)}/report`,
      { body, method: "POST" },
      fetchImpl,
    ),
  );
}
