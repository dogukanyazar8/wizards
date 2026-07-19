import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DM_CALL_RING_TTL_MS,
  createIncomingCall,
  createOutgoingCall,
  hasRingExpired,
  isRinging,
  markCallConnected,
  markCallConnecting,
  signalMatchesSession,
} from "./call-state";

const peer = {
  avatarUrl: null,
  displayName: "Ada",
  id: "user-ada",
  username: "ada",
};

describe("DM call state", () => {
  it("gives an outgoing call the shared ring deadline", () => {
    const session = createOutgoingCall({
      conversationId: "dm-1",
      now: 1_000,
      peer,
      video: false,
    });

    assert.equal(session.status, "ringing-out");
    assert.equal(session.ringExpiresAt, 1_000 + DM_CALL_RING_TTL_MS);
    assert.equal(session.isVideo, false);
  });

  it("takes the ring deadline of an incoming call from the server payload", () => {
    const session = createIncomingCall({
      conversationId: "dm-1",
      expiresAt: new Date(5_000).toISOString(),
      peer,
      video: true,
    });

    assert.equal(session.status, "ringing-in");
    assert.equal(session.ringExpiresAt, 5_000);
    assert.equal(session.isVideo, true);
  });

  it("survives an unparsable expiry instead of expiring instantly", () => {
    const session = createIncomingCall({
      conversationId: "dm-1",
      expiresAt: "not-a-date",
      peer,
      video: false,
    });

    assert.equal(session.ringExpiresAt, null);
    assert.equal(hasRingExpired(session, Date.now()), false);
  });

  it("clears the ring deadline once the call is answered", () => {
    const ringing = createOutgoingCall({ conversationId: "dm-1", now: 0, peer, video: false });

    const connecting = markCallConnecting(ringing);
    assert.equal(connecting.status, "connecting");
    assert.equal(connecting.ringExpiresAt, null);

    const connected = markCallConnected(connecting, true);
    assert.equal(connected.status, "connected");
    assert.equal(connected.isVideo, true);
    assert.equal(isRinging(connected), false);
  });

  it("expires the ring only while it is still ringing", () => {
    const ringing = createOutgoingCall({ conversationId: "dm-1", now: 0, peer, video: false });

    assert.equal(hasRingExpired(ringing, DM_CALL_RING_TTL_MS - 1), false);
    assert.equal(hasRingExpired(ringing, DM_CALL_RING_TTL_MS), true);
    assert.equal(hasRingExpired(markCallConnected(ringing), DM_CALL_RING_TTL_MS), false);
    assert.equal(hasRingExpired(null, DM_CALL_RING_TTL_MS), false);
  });

  it("ignores signals addressed to another conversation", () => {
    const session = createOutgoingCall({ conversationId: "dm-1", now: 0, peer, video: false });

    assert.equal(signalMatchesSession(session, "dm-1"), true);
    assert.equal(signalMatchesSession(session, "dm-2"), false);
    assert.equal(signalMatchesSession(null, "dm-1"), false);
  });
});

describe("DM call ring contract", () => {
  it("keeps the client ring deadline in step with the socket handler", async () => {
    const { readFileSync } = await import("node:fs");
    const handlerSource = readFileSync(
      new URL("../socket/handlers/dm.ts", import.meta.url),
      "utf8",
    );

    const rawTtl = handlerSource.match(/DM_CALL_RING_TTL_MS = ([\d_]+)/)?.[1];
    assert.ok(rawTtl, "socket handler must define the ring TTL");
    assert.equal(Number(rawTtl.replace(/_/g, "")), DM_CALL_RING_TTL_MS);
  });
});
