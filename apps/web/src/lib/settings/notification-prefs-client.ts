"use client";

import {
  NotificationPrefsPatchSchema,
  NotificationPrefsSchema,
  type NotificationPrefs,
  type NotificationPrefsPatch,
} from "@wizards/types";

/**
 * Ayarlar paketi — Dalga 1 / Ş1. The screen's only door onto `notification-prefs`.
 *
 * Dalga 2–4 call from here and never write their own `fetch`: an endpoint path spread through
 * components is an endpoint the compiler stops checking the day it moves. Responses are parsed
 * with zod so "the server returns this shape" is asserted in one place rather than assumed in
 * twenty.
 */

export const NOTIFICATION_PREFS_PATH = "/api/v1/users/me/notification-prefs";

export const notificationPrefsQueryKeys = {
  root: ["settings", "notification-prefs"] as const,
} satisfies Record<string, readonly string[]>;

export class NotificationPrefsClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "NotificationPrefsClientError";
  }
}

type JsonRequestInit = Omit<RequestInit, "body"> & { body?: unknown };

async function requestJson<T>(url: string, init: JsonRequestInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });

  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new NotificationPrefsClientError(
      payload?.error ?? `Request failed: ${response.status}`,
      response.status,
      // `LOCKED_NOTIFICATION_TYPE` reaches the screen intact: a locked row and a malformed body
      // are both 400, and only the code tells the two apart (tuzak #5).
      payload?.code,
    );
  }

  return payload as T;
}

export async function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  return NotificationPrefsSchema.parse(await requestJson(NOTIFICATION_PREFS_PATH));
}

/**
 * The response is the **whole** object, not the patch — five preferences appear on two tabs at
 * once (tuzak #4), so the caller replaces its cache entry rather than merging into it.
 */
export async function patchNotificationPrefs(
  patch: NotificationPrefsPatch,
): Promise<NotificationPrefs> {
  const body = NotificationPrefsPatchSchema.parse(patch);

  return NotificationPrefsSchema.parse(
    await requestJson(NOTIFICATION_PREFS_PATH, { body, method: "PATCH" }),
  );
}
