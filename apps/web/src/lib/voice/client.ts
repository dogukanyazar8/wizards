"use client";

import {
  type VoiceChannelStateDTO,
  type VoiceStateMutationResponse,
  VoiceStatesResponseSchema,
  VoiceStateMutationResponseSchema,
} from "@/lib/voice/types";
import { LiveKitTokenResponseSchema, type LiveKitTokenResponse } from "@/lib/livekit/types";

export class VoiceClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "VoiceClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export const voiceQueryKeys = {
  serverStates: (serverId: string) => ["voice", "states", serverId] as const,
};

async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...init } = options;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        code?: string;
      }
    | null;

  if (!response.ok) {
    throw new VoiceClientError(
      payload?.error ?? "Voice request failed",
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

export async function fetchVoiceStates(serverId: string): Promise<VoiceChannelStateDTO[]> {
  const payload = await requestJson<unknown>(
    `/api/v1/voice/states?serverId=${encodeURIComponent(serverId)}`,
  );
  return VoiceStatesResponseSchema.parse(payload).states;
}

export async function fetchLiveKitToken(input: {
  channelId?: string;
  conversationId?: string;
}): Promise<LiveKitTokenResponse> {
  const payload = await requestJson<unknown>("/api/v1/livekit/token", {
    method: "POST",
    body: input,
  });

  return LiveKitTokenResponseSchema.parse(payload);
}

export async function upsertVoiceState(input: {
  channelId: string;
  serverId: string;
  sessionId: string;
}): Promise<VoiceStateMutationResponse> {
  const payload = await requestJson<unknown>("/api/v1/voice/state", {
    method: "POST",
    body: input,
  });

  return VoiceStateMutationResponseSchema.parse(payload);
}

export async function deleteVoiceState(input: { sessionId?: string } = {}) {
  return requestJson<{ success: true }>("/api/v1/voice/state", {
    method: "DELETE",
    body: input,
  });
}

export async function sendVoiceHeartbeat(
  sessionId: string,
  state: {
    selfStream?: boolean;
    selfVideo?: boolean;
  } = {},
) {
  return requestJson<{ channelId: string; serverId: string; success: true }>(
    "/api/v1/voice/state/heartbeat",
    {
      method: "PATCH",
      body: { sessionId, ...state },
    },
  );
}
