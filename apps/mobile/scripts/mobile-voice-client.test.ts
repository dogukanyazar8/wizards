import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchMobileVoiceToken,
  MOBILE_VOICE_TOKEN_ENDPOINT,
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
