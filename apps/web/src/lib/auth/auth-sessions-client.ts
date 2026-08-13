"use client";

import {
  AuthSessionRevokeOthersResponseSchema,
  AuthSessionRevokeResponseSchema,
  AuthSessionsResponseSchema,
} from "@wizards/types";

export const authSessionQueryKey = ["user", "auth-sessions"] as const;

async function readJson(response: Response, failureMessage: string): Promise<unknown> {
  if (!response.ok) throw new Error(failureMessage);
  return response.json();
}

export async function fetchAuthSessions() {
  const response = await fetch("/api/v1/users/me/sessions", { cache: "no-store" });
  return AuthSessionsResponseSchema.parse(await readJson(response, "Failed to load sessions"));
}

export async function revokeAuthSessionClient(sessionId: string) {
  const response = await fetch(`/api/v1/users/me/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  return AuthSessionRevokeResponseSchema.parse(
    await readJson(response, "Failed to revoke session"),
  );
}

export async function revokeOtherAuthSessionsClient() {
  const response = await fetch("/api/v1/users/me/sessions/revoke-others", { method: "POST" });
  return AuthSessionRevokeOthersResponseSchema.parse(
    await readJson(response, "Failed to revoke sessions"),
  );
}
