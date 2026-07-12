import {
  MobileTwoFactorConfirmRequestSchema,
  MobileTwoFactorConfirmResponseSchema,
  MobileTwoFactorDisableRequestSchema,
  MobileTwoFactorDisableResponseSchema,
  MobileTwoFactorSetupResponseSchema,
  type MobileTwoFactorDisableRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

const TWO_FACTOR_PATH = "/api/v1/mobile/account/two-factor";

export async function setupMobileTwoFactor(client: MobileApiClient) {
  return MobileTwoFactorSetupResponseSchema.parse(
    await client.requestJson(`${TWO_FACTOR_PATH}/setup`, { method: "POST" }),
  );
}

export async function confirmMobileTwoFactor(client: MobileApiClient, code: string) {
  const body = MobileTwoFactorConfirmRequestSchema.parse({ code });
  return MobileTwoFactorConfirmResponseSchema.parse(
    await client.requestJson(`${TWO_FACTOR_PATH}/confirm`, { body, method: "POST" }),
  );
}

export async function disableMobileTwoFactor(
  client: MobileApiClient,
  input: MobileTwoFactorDisableRequest,
) {
  const body = MobileTwoFactorDisableRequestSchema.parse(input);
  return MobileTwoFactorDisableResponseSchema.parse(
    await client.requestJson(TWO_FACTOR_PATH, { body, method: "DELETE" }),
  );
}
