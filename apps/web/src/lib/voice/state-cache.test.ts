import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapVoiceScreenShareStateCache,
  mapVoiceStateCache,
  removeVoiceStateParticipantFromCache,
} from "./state-cache";
import type { VoiceChannelStateDTO } from "./types";

const participant = {
  avatarUrl: null,
  displayName: "Alice",
  isDeafened: false,
  userId: "user-1",
  username: "alice",
};

describe("voice state cache helpers", () => {
  it("adds, replaces, and removes channel voice state entries immutably", () => {
    const existing: VoiceChannelStateDTO[] = [
      {
        channelId: "channel-1",
        participants: [participant],
      },
    ];

    assert.deepEqual(mapVoiceStateCache(undefined, "channel-1", [participant]), existing);

    const replaced = mapVoiceStateCache(existing, "channel-1", [
      {
        ...participant,
        username: "alice2",
      },
    ]);

    assert.notEqual(replaced, existing);
    assert.deepEqual(replaced, [
      {
        channelId: "channel-1",
        participants: [
          {
            ...participant,
            username: "alice2",
          },
        ],
      },
    ]);
    assert.deepEqual(mapVoiceStateCache(existing, "channel-1", []), []);
  });

  it("updates only the targeted participant screen-share flag", () => {
    const existing: VoiceChannelStateDTO[] = [
      {
        channelId: "channel-1",
        participants: [
          participant,
          {
            ...participant,
            userId: "user-2",
            username: "bob",
          },
        ],
      },
      {
        channelId: "channel-2",
        participants: [
          {
            ...participant,
            userId: "user-3",
            username: "carol",
          },
        ],
      },
    ];

    assert.deepEqual(mapVoiceScreenShareStateCache(existing, "channel-1", "user-2", true), [
      {
        channelId: "channel-1",
        participants: [
          participant,
          {
            ...participant,
            isScreenSharing: true,
            userId: "user-2",
            username: "bob",
          },
        ],
      },
      existing[1],
    ]);
    assert.equal(mapVoiceScreenShareStateCache(undefined, "channel-1", "user-2", true), undefined);
  });

  it("removes only the leaving participant from a voice channel cache entry", () => {
    const bob = {
      ...participant,
      displayName: "Bob",
      userId: "user-2",
      username: "bob",
    };
    const existing: VoiceChannelStateDTO[] = [
      {
        channelId: "channel-1",
        participants: [participant, bob],
      },
    ];

    assert.deepEqual(removeVoiceStateParticipantFromCache(existing, "channel-1", "user-1"), [
      {
        channelId: "channel-1",
        participants: [bob],
      },
    ]);
    assert.deepEqual(removeVoiceStateParticipantFromCache(existing, "channel-1", "user-2"), [
      {
        channelId: "channel-1",
        participants: [participant],
      },
    ]);
  });

  it("removes the voice channel cache entry when the last participant leaves", () => {
    const existing: VoiceChannelStateDTO[] = [
      {
        channelId: "channel-1",
        participants: [participant],
      },
    ];

    assert.deepEqual(removeVoiceStateParticipantFromCache(existing, "channel-1", "user-1"), []);
  });
});
