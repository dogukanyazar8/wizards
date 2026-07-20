import {
  MobilePasswordChangeRequestSchema,
  MobilePasswordChangeResponseSchema,
  type MobilePasswordChangeRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export type MobilePasswordChangeFailure =
  | "invalid-credentials"
  | "password-unavailable"
  | "rate-limited"
  | "unknown"
  | "weak-password";

/**
 * Maps the password endpoint's error contract onto localizable outcomes. The
 * raw server message is never surfaced; it can carry credential detail.
 */
export function getMobilePasswordChangeFailure(error: unknown): MobilePasswordChangeFailure {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

  switch (status) {
    case 400:
      return "weak-password";
    case 401:
      return "invalid-credentials";
    case 409:
      return "password-unavailable";
    case 429:
      return "rate-limited";
    default:
      return "unknown";
  }
}

export async function changeMobilePassword(
  client: MobileApiClient,
  input: MobilePasswordChangeRequest,
) {
  const body = MobilePasswordChangeRequestSchema.parse(input);
  return MobilePasswordChangeResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/password", {
      body,
      method: "POST",
    }),
  );
}
