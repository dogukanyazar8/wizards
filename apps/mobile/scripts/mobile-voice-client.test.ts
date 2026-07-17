import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchMobileVoiceStates,
  fetchMobileVoiceToken,
  joinMobileVoiceState,
  leaveMobileVoiceState,
  MOBILE_VOICE_HEARTBEAT_ENDPOINT,
  MOBILE_VOICE_STATE_ENDPOINT,
  MOBILE_VOICE_STATES_ENDPOINT,
  MOBILE_VOICE_TOKEN_ENDPOINT,
  sendMobileVoiceHeartbeat,
} from "../src/voice/mobile-voice-client";
import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";

describe("mobile voice client", () => {
  it("requests a bounded LiveKit voice token through the mobile voice endpoint", async () => {
    const calls: Array<{
      body: unknown;
      method: string | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return {
          channelId: "voice-channel-1",
          provider: "livekit",
          token: "livekit.jwt.token.value",
          url: "wss://voice.whispr.test",
        } as TResponse;
      },
    };

    const response = await fetchMobileVoiceToken(client, {
      channelId: "voice-channel-1",
    });

    assert.deepEqual(calls, [
      {
        body: { channelId: "voice-channel-1" },
        method: "POST",
        path: MOBILE_VOICE_TOKEN_ENDPOINT,
      },
    ]);
    assert.equal(response.provider, "livekit");
    assert.equal(response.channelId, "voice-channel-1");
    assert.equal(response.url, "wss://voice.whispr.test");
  });

  it("requests a direct-call token with only the conversation target", async () => {
    const calls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return {
          conversationId: "conversation-1",
          provider: "livekit",
          token: "livekit.jwt.token.value",
          url: "wss://voice.whispr.test",
        } as TResponse;
      },
    };

    const response = await fetchMobileVoiceToken(client, { conversationId: "conversation-1" });

    assert.deepEqual(calls, [
      {
        body: { conversationId: "conversation-1" },
        method: "POST",
        path: MOBILE_VOICE_TOKEN_ENDPOINT,
      },
    ]);
    assert.equal(response.conversationId, "conversation-1");
    assert.equal(response.channelId, undefined);
  });

  it("rejects ambiguous token targets before sending a request", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        throw new Error("request must not be sent");
      },
    };

    await assert.rejects(
      () =>
        fetchMobileVoiceToken(client, {
          channelId: "voice-channel-1",
          conversationId: "conversation-1",
        }),
      /exactly one/i,
    );
  });

  it("coordinates mobile voice state, heartbeat, and leave endpoints", async () => {
    const calls: Array<{
      body: unknown;
      method: string | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });

        if (path.startsWith(MOBILE_VOICE_STATES_ENDPOINT)) {
          return { states: [] } as TResponse;
        }

        if (path === MOBILE_VOICE_STATE_ENDPOINT && options.method === "POST") {
          return {
            channelId: "voice-channel-1",
            participants: [],
            serverId: "server-1",
            sessionId: "11111111-1111-4111-8111-111111111111",
          } as TResponse;
        }

        if (path === MOBILE_VOICE_HEARTBEAT_ENDPOINT) {
          return {
            channelId: "voice-channel-1",
            serverId: "server-1",
            success: true,
          } as TResponse;
        }

        return { success: true } as TResponse;
      },
    };

    await fetchMobileVoiceStates(client, { serverId: "server-1" });
    await joinMobileVoiceState(client, {
      channelId: "voice-channel-1",
      serverId: "server-1",
      sessionId: "11111111-1111-4111-8111-111111111111",
    });
    await sendMobileVoiceHeartbeat(client, {
      selfVideo: true,
      sessionId: "11111111-1111-4111-8111-111111111111",
    });
    await leaveMobileVoiceState(client, {
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    assert.deepEqual(calls, [
      {
        body: undefined,
        method: "GET",
        path: `${MOBILE_VOICE_STATES_ENDPOINT}?serverId=server-1`,
      },
      {
        body: {
          channelId: "voice-channel-1",
          serverId: "server-1",
          sessionId: "11111111-1111-4111-8111-111111111111",
        },
        method: "POST",
        path: MOBILE_VOICE_STATE_ENDPOINT,
      },
      {
        body: {
          selfVideo: true,
          sessionId: "11111111-1111-4111-8111-111111111111",
        },
        method: "PATCH",
        path: MOBILE_VOICE_HEARTBEAT_ENDPOINT,
      },
      {
        body: {
          sessionId: "11111111-1111-4111-8111-111111111111",
        },
        method: "DELETE",
        path: MOBILE_VOICE_STATE_ENDPOINT,
      },
    ]);
  });

  it("rejects malformed LiveKit token responses before native voice can trust them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          channelId: "voice-channel-1",
          provider: "livekit",
          token: "",
          url: "wss://voice.whispr.test",
        } as TResponse;
      },
    };

    await assert.rejects(
      () => fetchMobileVoiceToken(client, { channelId: "voice-channel-1" }),
      /too_small/i,
    );
  });
});
