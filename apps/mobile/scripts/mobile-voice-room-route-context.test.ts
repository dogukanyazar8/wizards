import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createInitialMobileVoiceRoomState } from "../src/voice/mobile-voice-room-contract";
import {
  clearMobileVoiceRoomRouteContext,
  getMobileVoiceRoomRouteContext,
  hasMatchingMobileVoiceRoomRouteContext,
  setMobileVoiceRoomRouteContext,
} from "../src/voice/mobile-voice-room-route-context";

describe("mobile voice room route context", () => {
  afterEach(() => clearMobileVoiceRoomRouteContext());

  it("retains only a validated in-memory channel context for the root voice route", () => {
    assert.equal(
      setMobileVoiceRoomRouteContext({ channelId: "", channelName: "Daily", serverId: "server-1" }),
      null,
    );
    assert.equal(getMobileVoiceRoomRouteContext(), null);

    setMobileVoiceRoomRouteContext({
      channelId: "voice-1",
      channelName: "Daily",
      serverId: "server-1",
    });

    assert.equal(
      hasMatchingMobileVoiceRoomRouteContext({
        ...createInitialMobileVoiceRoomState(),
        channelId: "voice-1",
        channelName: "Daily",
        serverId: "server-1",
      }),
      true,
    );
    assert.equal(
      hasMatchingMobileVoiceRoomRouteContext({
        ...createInitialMobileVoiceRoomState(),
        channelId: "voice-2",
        channelName: "Daily",
        serverId: "server-1",
      }),
      false,
    );
  });
});
