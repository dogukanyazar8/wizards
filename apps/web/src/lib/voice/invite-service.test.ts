import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getVoiceInviteKey,
  parseStoredVoiceInvite,
  toVisiblePresenceStatus,
} from "./invite-service";

describe("voice invite service helpers", () => {
  it("builds stable Redis keys for stored invites", () => {
    assert.equal(getVoiceInviteKey("invite-1"), "voice:invite:invite-1");
  });

  it("parses valid stored invite payloads", () => {
    assert.deepEqual(
      parseStoredVoiceInvite(
        JSON.stringify({
          channelId: "channel-1",
          expiresAt: "2026-05-13T10:00:00.000Z",
          fromUserId: "user-1",
          serverId: "server-1",
          targetUserId: "user-2",
        }),
      ),
      {
        channelId: "channel-1",
        expiresAt: "2026-05-13T10:00:00.000Z",
        fromUserId: "user-1",
        serverId: "server-1",
        targetUserId: "user-2",
      },
    );
  });

  it("rejects malformed stored invite payloads", () => {
    assert.equal(parseStoredVoiceInvite(null), null);
    assert.equal(parseStoredVoiceInvite("not json"), null);
    assert.equal(
      parseStoredVoiceInvite(
        JSON.stringify({
          channelId: "channel-1",
          expiresAt: "2026-05-13T10:00:00.000Z",
          fromUserId: "user-1",
          serverId: "server-1",
        }),
      ),
      null,
    );
  });

  it("normalizes unknown presence statuses to offline", () => {
    assert.equal(toVisiblePresenceStatus("ONLINE"), "ONLINE");
    assert.equal(toVisiblePresenceStatus("IDLE"), "IDLE");
    assert.equal(toVisiblePresenceStatus("DND"), "DND");
    assert.equal(toVisiblePresenceStatus("OFFLINE"), "OFFLINE");
    assert.equal(toVisiblePresenceStatus("INVISIBLE"), "OFFLINE");
  });
});
