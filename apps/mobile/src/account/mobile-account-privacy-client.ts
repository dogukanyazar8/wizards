import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountDeletionPreflightSchema,
  type AccountDeletionPreflight,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export async function fetchMobileAccountDeletionPreflight(
  client: MobileApiClient,
): Promise<AccountDeletionPreflight> {
  return AccountDeletionPreflightSchema.parse(
    await client.requestJson("/api/v1/users/me/deletion"),
  );
}

export async function reauthenticateMobileAccountDeletion(
  client: MobileApiClient,
  password: string,
) {
  const response = await client.requestJson<{ reauthToken: string }>("/api/v1/auth/reauth", {
    body: { password, purpose: "account-delete" },
    method: "POST",
  });
  return response.reauthToken;
}

export async function requestMobileAccountDeletionEmailReauth(client: MobileApiClient) {
  await client.requestJson("/api/v1/auth/reauth/email-challenge", {
    body: { platform: "MOBILE", purpose: "account-delete" },
    method: "POST",
  });
}

export async function confirmMobileAccountDeletionEmailReauth(
  client: MobileApiClient,
  token: string,
) {
  const response = await client.requestJson<{ reauthToken: string }>(
    "/api/v1/auth/reauth/email-confirm",
    { body: { purpose: "account-delete", token }, method: "POST" },
  );
  return response.reauthToken;
}

export async function deleteMobileAccount(client: MobileApiClient, reauthToken: string) {
  return client.requestJson<{ deletedAt: string; success: true }>("/api/v1/users/me", {
    body: { confirmation: ACCOUNT_DELETION_CONFIRMATION_PHRASE },
    headers: { "x-whispr-reauth-token": reauthToken },
    method: "DELETE",
  });
}
