import {
  MobileVoiceHeartbeatResponseSchema,
  MobileVoiceStateLeaveResponseSchema,
  MobileVoiceStateMutationResponseSchema,
  MobileVoiceStatesResponseSchema,
  MobileVoiceTokenResponseSchema,
  type MobileVoiceHeartbeatResponse,
  type MobileVoiceStateLeaveResponse,
  type MobileVoiceStateMutationResponse,
  type MobileVoiceStatesResponse,
  type MobileVoiceTokenResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_VOICE_STATES_ENDPOINT = "/api/v1/mobile/voice/states";
export const MOBILE_VOICE_STATE_ENDPOINT = "/api/v1/mobile/voice/state";
export const MOBILE_VOICE_HEARTBEAT_ENDPOINT = "/api/v1/mobile/voice/state/heartbeat";
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

export async function fetchMobileVoiceStates(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileVoiceStatesResponse> {
  const params = new URLSearchParams({ serverId: input.serverId });
  const payload = await client.requestJson<unknown>(
    `${MOBILE_VOICE_STATES_ENDPOINT}?${params.toString()}`,
    {
      method: "GET",
    },
  );

  return MobileVoiceStatesResponseSchema.parse(payload);
}

export async function joinMobileVoiceState(
  client: MobileApiClient,
  input: { channelId: string; serverId: string; sessionId: string },
): Promise<MobileVoiceStateMutationResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_VOICE_STATE_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileVoiceStateMutationResponseSchema.parse(payload);
}

export async function leaveMobileVoiceState(
  client: MobileApiClient,
  input: { sessionId?: string },
): Promise<MobileVoiceStateLeaveResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_VOICE_STATE_ENDPOINT, {
    body: input,
    method: "DELETE",
  });

  return MobileVoiceStateLeaveResponseSchema.parse(payload);
}

export async function sendMobileVoiceHeartbeat(
  client: MobileApiClient,
  input: {
    selfScreenShare?: boolean;
    selfStream?: boolean;
    selfVideo?: boolean;
    sessionId: string;
  },
): Promise<MobileVoiceHeartbeatResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_VOICE_HEARTBEAT_ENDPOINT, {
    body: input,
    method: "PATCH",
  });

  return MobileVoiceHeartbeatResponseSchema.parse(payload);
}
