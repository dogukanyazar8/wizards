import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileVoiceStatesResponse } from "@wizards/types";

import {
  applyMobileScreenShareWatchersUpdate,
  applyMobileVoiceScreenShareUpdate,
  applyMobileVoiceStateUpdate,
} from "../src/query/mobile-voice-states-query";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { getMobileVoiceStatesWatchPayload } from "../src/realtime/mobile-realtime-client";

const participant = {
  avatarUrl: "https://cdn.example.test/ada.png",
  displayName: "Ada",
  isScreenSharing: false,
  userId: "user-ada",
  username: "ada",
};

const initial: MobileVoiceStatesResponse = {
  states: [
    {
      channelId: "voice-general",
      participants: [participant],
    },
  ],
};

describe("mobile voice states query cache", () => {
  it("keeps watcher updates scoped and accepts a newer snapshot count, including zero", () => {
    const current: MobileVoiceStatesResponse = {
      states: [
        { channelId: "voice-general", participants: [{ ...participant, isScreenSharing: true }] },
        { channelId: "voice-other", participants: [participant] },
      ],
    };
    const watching = applyMobileScreenShareWatchersUpdate(current, {
      channelId: "voice-general",
      sharerUserId: participant.userId,
      count: 3,
      sample: [],
    });
    assert.equal(watching?.states[0]?.participants[0]?.screenShareViewerCount, 3);
    assert.equal(watching?.states[1], current.states[1]);
    assert.equal(
      applyMobileScreenShareWatchersUpdate(undefined, {
        channelId: "voice-general",
        sharerUserId: participant.userId,
        count: 3,
        sample: [],
      }),
      undefined,
    );
    for (const count of [undefined, 5, 0]) {
      const next = applyMobileVoiceStateUpdate(watching, {
        action: "join",
        channelId: "voice-general",
        serverId: "server-1",
        userId: participant.userId,
        participants: [
          { ...participant, ...(count === undefined ? {} : { screenShareViewerCount: count }) },
        ],
      });
      assert.equal(next?.states[0]?.participants[0]?.screenShareViewerCount, count ?? 3);
    }
  });
  it("uses a server-scoped query key", () => {
    assert.deepEqual(mobileQueryKeys.voiceStates("server-1"), [
      "mobile",
      "voice-states",
      "server-1",
    ]);
  });

  it("uses the server-id object required by the socket watch contract", () => {
    assert.deepEqual(getMobileVoiceStatesWatchPayload("server-1"), { serverId: "server-1" });
  });

  it("upserts join snapshots and removes an empty leave snapshot", () => {
    const joined = applyMobileVoiceStateUpdate(initial, {
      action: "join",
      channelId: "voice-general",
      participants: [participant, { ...participant, userId: "user-lin", username: "lin" }],
      serverId: "server-1",
      userId: "user-lin",
    });

    assert.equal(joined?.states[0]?.participants.length, 2);
    assert.equal(joined?.states[0]?.participants[1]?.userId, "user-lin");

    const left = applyMobileVoiceStateUpdate(joined, {
      action: "leave",
      channelId: "voice-general",
      participants: [],
      serverId: "server-1",
      userId: "user-lin",
    });

    assert.deepEqual(left, { states: [] });
  });

  it("preserves a participant's display identity when a realtime snapshot omits it", () => {
    const next = applyMobileVoiceStateUpdate(initial, {
      action: "join",
      channelId: "voice-general",
      participants: [{ ...participant, displayName: null }],
      serverId: "server-1",
      userId: "user-ada",
    });

    assert.equal(next?.states[0]?.participants[0]?.displayName, "Ada");
  });

  it("patches screen-sharing state without changing unrelated channels", () => {
    const current: MobileVoiceStatesResponse = {
      states: [
        ...initial.states,
        { channelId: "voice-ops", participants: [{ ...participant, userId: "user-ops" }] },
      ],
    };

    const next = applyMobileVoiceScreenShareUpdate(current, {
      channelId: "voice-general",
      isScreenSharing: true,
      serverId: "server-1",
      userId: "user-ada",
    });

    assert.equal(next?.states[0]?.participants[0]?.isScreenSharing, true);
    assert.equal(next?.states[1], current.states[1]);
  });
});
