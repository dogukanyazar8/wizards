import {
  MobileLocaleUpdateRequestSchema,
  MobileLocaleUpdateResponseSchema,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileLocale } from "./mobile-locale-preferences";

export async function updateMobileAccountLocale(client: MobileApiClient, locale: MobileLocale) {
  const body = MobileLocaleUpdateRequestSchema.parse({ locale });
  return MobileLocaleUpdateResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/locale", {
      body,
      method: "PATCH",
    }),
  );
}

/**
 * Best-effort mirror of the device language onto the account. The local
 * preference is already stored, so a failed sync must never surface an error or
 * roll the selection back.
 */
export function syncMobileAccountLocale(
  client: MobileApiClient,
  locale: MobileLocale,
  isSignedIn: boolean,
): void {
  if (!isSignedIn) {
    return;
  }

  void updateMobileAccountLocale(client, locale).catch(() => undefined);
}
