import {
  MobileVoiceTokenResponseSchema,
  type MobileVoiceTokenResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_VOICE_TOKEN_ENDPOINT = "/api/v1/mobile/voice/token";

export async function fetchMobileVoiceToken(
  client: MobileApiClient,
  input: { channelId: string },
): Promise<MobileVoiceTokenResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_VOICE_TOKEN_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileVoiceTokenResponseSchema.parse(payload);
}
