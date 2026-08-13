import {
  AuthSessionRevokeOthersResponseSchema,
  AuthSessionRevokeResponseSchema,
  AuthSessionsResponseSchema,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export async function fetchMobileAuthSessions(client: MobileApiClient) {
  return AuthSessionsResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/sessions"),
  );
}

export async function revokeMobileAuthSession(client: MobileApiClient, sessionId: string) {
  return AuthSessionRevokeResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/account/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),
  );
}

export async function revokeOtherMobileAuthSessions(client: MobileApiClient) {
  return AuthSessionRevokeOthersResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/sessions/revoke-others", {
      method: "POST",
    }),
  );
}
