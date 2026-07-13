import {
  MobileMediaClaimRequestSchema,
  MobileMediaClaimResponseSchema,
  type MobileMediaClaimRequest,
  type MobileMediaClaimResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export function buildMobileMediaClaimPath(): string {
  return "/api/v1/mobile/uploads";
}

export async function claimMobileMediaUpload(
  client: MobileApiClient,
  input: MobileMediaClaimRequest,
): Promise<MobileMediaClaimResponse> {
  const body = MobileMediaClaimRequestSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileMediaClaimPath(), {
    body,
    method: "POST",
  });

  return MobileMediaClaimResponseSchema.parse(payload);
}
