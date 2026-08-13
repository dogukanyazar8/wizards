import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountDeletionPreflightSchema,
  type AccountDeletionPreflight,
} from "@wizards/types";

export class AccountPrivacyClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "AccountPrivacyClientError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = "ACCOUNT_PRIVACY_REQUEST_FAILED";
    try {
      const body = (await response.json()) as { code?: unknown };
      if (typeof body.code === "string") code = body.code;
    } catch {
      // The response may be empty or non-JSON; the status remains the safe error signal.
    }
    throw new AccountPrivacyClientError(code, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchAccountDeletionPreflight(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountDeletionPreflight> {
  const response = await fetchImpl("/api/v1/users/me/deletion", { cache: "no-store" });
  return AccountDeletionPreflightSchema.parse(await readJson(response));
}

export async function reauthenticateAccountDeletion(
  password: string,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl("/api/v1/auth/reauth", {
    body: JSON.stringify({ password, purpose: "account-delete" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return (await readJson<{ reauthToken: string }>(response)).reauthToken;
}

export async function requestAccountDeletionEmailReauth(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl("/api/v1/auth/reauth/email-challenge", {
    body: JSON.stringify({ platform: "WEB", purpose: "account-delete" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  await readJson(response);
}

export async function deleteOwnAccount(reauthToken: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl("/api/v1/users/me", {
    body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION_PHRASE }),
    headers: { "Content-Type": "application/json", "x-whispr-reauth-token": reauthToken },
    method: "DELETE",
  });
  return readJson<{ deletedAt: string; success: true }>(response);
}

export async function downloadAccountDataExport(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl("/api/v1/users/me/data-export", { cache: "no-store" });
  if (!response.ok) throw new AccountPrivacyClientError("ACCOUNT_EXPORT_FAILED", response.status);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "whispr-data-export.json";
  return { blob: await response.blob(), filename };
}

export function openAccountDataSettingsInExternalBrowser(
  currentUrl = window.location.href,
  openWindow: (url: string, target: string, features: string) => unknown = window.open,
) {
  const target = new URL("/settings#account-data", currentUrl);
  openWindow(target.toString(), "_blank", "noopener,noreferrer");
}
