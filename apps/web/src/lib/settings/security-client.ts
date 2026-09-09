"use client";

import {
  AccountSessionSchema,
  SecurityEventSchema,
  type AccountConnection,
  type AccountSession,
  type AuthSession,
  type SecurityEvent,
} from "@wizards/types";
import { z } from "zod";

/**
 * Ayarlar Ş3 — Hesabım › Güvenlik'in istemci yüzeyi.
 *
 * Dalga 3 şeritleri **yalnız** buradan çağırır. Yanıtlar burada zod ile ayrıştırılır, böylece
 * "sunucu bunu döndürüyor" varsayımı tek bir yerde doğrulanır.
 */

export const securityQueryKeys = {
  connections: ["user", "account-connections"] as const,
  events: ["user", "security-events"] as const,
  sessions: ["user", "auth-sessions"] as const,
};

export const SECURITY_EVENTS_ENDPOINT = "/api/v1/users/me/security-events";
export const SESSIONS_ENDPOINT = "/api/v1/users/me/sessions";
export const PASSWORD_ENDPOINT = "/api/v1/users/me/password";

export class SecurityClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly failedRules: readonly string[] = [],
  ) {
    super(code);
    this.name = "SecurityClientError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
    failedRules?: unknown;
  } | null;

  if (!response.ok) {
    throw new SecurityClientError(
      typeof payload?.code === "string" ? payload.code : "SECURITY_REQUEST_FAILED",
      response.status,
      Array.isArray(payload?.failedRules)
        ? payload.failedRules.filter((rule): rule is string => typeof rule === "string")
        : [],
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Güvenlik günlüğü
// ---------------------------------------------------------------------------

const SecurityEventsResponseSchema = z.object({ events: z.array(SecurityEventSchema).max(10) });

export async function fetchSecurityEvents(
  fetchImpl: typeof fetch = fetch,
): Promise<SecurityEvent[]> {
  const response = await fetchImpl(SECURITY_EVENTS_ENDPOINT, { cache: "no-store" });
  return SecurityEventsResponseSchema.parse(await readJson(response)).events;
}

// ---------------------------------------------------------------------------
// Oturumlar
// ---------------------------------------------------------------------------

const AuthSessionsResponseShape = z.object({ sessions: z.array(z.unknown()) });

/**
 * SPEC §5.1 draws a `Masaüstü` / `Web` split, and `/users/me/sessions` speaks `clientType`
 * (`WEB · DESKTOP · MOBILE · UNKNOWN`). The mapping lives here rather than in the endpoint: the
 * sessions API is shared with mobile and its wire shape is frozen (Ş3 "okunur, yazılmaz").
 *
 * `UNKNOWN` falls back to `web`, which is what an unlabelled browser session is.
 */
export function toAccountSessionPlatform(
  clientType: AuthSession["clientType"],
): AccountSession["platform"] {
  switch (clientType) {
    case "DESKTOP":
      return "desktop";
    case "MOBILE":
      return "mobile";
    default:
      return "web";
  }
}

/**
 * The device label the row shows. Built from the columns the session table actually stores —
 * never from a raw user agent, which the endpoint deliberately does not send.
 */
export function toAccountSessionDevice(session: AuthSession): string {
  return [session.browser, session.os].filter(Boolean).join(" · ") || session.deviceType;
}

export function toAccountSession(session: AuthSession): AccountSession {
  return AccountSessionSchema.parse({
    browser: session.browser,
    current: session.current,
    device: toAccountSessionDevice(session),
    id: session.id,
    lastActive: session.lastSeenAt,
    location: session.countryCode,
    os: session.os ?? session.deviceType,
    platform: toAccountSessionPlatform(session.clientType),
  });
}

export async function fetchAccountSessions(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountSession[]> {
  const response = await fetchImpl(SESSIONS_ENDPOINT, { cache: "no-store" });
  const payload = AuthSessionsResponseShape.parse(await readJson(response));
  return payload.sessions.map((session) => toAccountSession(session as AuthSession));
}

export async function revokeAccountSession(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await readJson(
    await fetchImpl(`${SESSIONS_ENDPOINT}/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  );
}

export async function revokeOtherAccountSessions(fetchImpl: typeof fetch = fetch): Promise<number> {
  const payload = await readJson<{ revokedCount?: unknown }>(
    await fetchImpl(`${SESSIONS_ENDPOINT}/revoke-others`, { method: "POST" }),
  );
  return typeof payload.revokedCount === "number" ? payload.revokedCount : 0;
}

// ---------------------------------------------------------------------------
// Parola
// ---------------------------------------------------------------------------

export type ChangePasswordInput = {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  changedAt: string;
  revokedOtherSessions: number;
};

export async function changePassword(
  input: ChangePasswordInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ChangePasswordResult> {
  const response = await fetchImpl(PASSWORD_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await readJson<ChangePasswordResult>(response);
  return { changedAt: payload.changedAt, revokedOtherSessions: payload.revokedOtherSessions };
}

// ---------------------------------------------------------------------------
// Hesap silme doğrulama cümlesi
// ---------------------------------------------------------------------------

/**
 * SPEC §5.1 asks the person to type `hesabımı kalıcı olarak sil`; the wire literal the server
 * checks is `ACCOUNT_DELETION_CONFIRMATION_PHRASE` (`DELETE MY ACCOUNT`), which is locale-free by
 * design. The screen therefore compares against the **localised** sentence and sends the
 * protocol literal — the server checks the literal again (`AccountDeletionRequestSchema`), so a
 * client that skips this step still cannot delete an account.
 */
export function matchesDeletionConfirmation(typed: string, localizedPhrase: string): boolean {
  return typed.trim().toLocaleLowerCase("tr") === localizedPhrase.trim().toLocaleLowerCase("tr");
}

// ---------------------------------------------------------------------------
// Bağlı hesaplar (K5)
// ---------------------------------------------------------------------------

/**
 * TODO(api): GitHub / Spotify / Steam / Xbox OAuth uygulamaları kurulunca gerçek uca bağlanır.
 *
 * There is no `GET /api/v1/users/me/connections` and this adapter does not call one. Four
 * services have no credentials configured, so their rows draw `disabled` (K5). `google` is the
 * one provider with a real implementation, but reading its link state needs the same endpoint,
 * so it reports `available: false` here too rather than guessing.
 */
export const STATIC_CONNECTIONS: readonly AccountConnection[] = [
  { available: false, connected: false, connectedAt: null, handle: null, service: "github" },
  { available: false, connected: false, connectedAt: null, handle: null, service: "spotify" },
  { available: false, connected: false, connectedAt: null, handle: null, service: "steam" },
  { available: false, connected: false, connectedAt: null, handle: null, service: "xbox" },
];

export function fetchConnections(): Promise<AccountConnection[]> {
  return Promise.resolve(STATIC_CONNECTIONS.map((connection) => ({ ...connection })));
}
