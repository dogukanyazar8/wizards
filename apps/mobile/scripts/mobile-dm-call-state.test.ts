import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MOBILE_DM_CALL_RING_TTL_MS,
  createMobileIncomingCall,
  createMobileOutgoingCall,
  getMobileDMCallAcceptedPayload,
  getMobileDMCallIncomingPayload,
  getMobileDMCallSignalPayload,
  hasMobileRingExpired,
  isMobileCallSignalForSession,
  markMobileCallConnected,
} from "../src/voice/mobile-dm-call-state";

const peer = {
  avatarUrl: null,
  displayName: "Ada",
  id: "user-ada",
  username: "ada",
};

describe("mobile DM call state", () => {
  it("rings an outgoing call until the shared deadline", () => {
    const session = createMobileOutgoingCall({
      conversationId: "dm-1",
      now: 1_000,
      title: "Ada",
      video: true,
    });

    assert.equal(session.status, "ringing-out");
    assert.equal(session.isVideo, true);
    assert.equal(session.ringExpiresAt, 1_000 + MOBILE_DM_CALL_RING_TTL_MS);
    assert.equal(hasMobileRingExpired(session, 1_000 + MOBILE_DM_CALL_RING_TTL_MS), true);
    assert.equal(hasMobileRingExpired(session, 1_000), false);
  });

  it("takes the incoming ring deadline from the server payload", () => {
    const session = createMobileIncomingCall({
      conversationId: "dm-1",
      expiresAt: new Date(9_000).toISOString(),
      fromUser: peer,
      video: false,
    });

    assert.equal(session.status, "ringing-in");
    assert.equal(session.ringExpiresAt, 9_000);
    assert.equal(session.title, "Ada");
  });

  it("stops ringing once the call connects", () => {
    const connected = markMobileCallConnected(
      createMobileOutgoingCall({ conversationId: "dm-1", now: 0, title: "Ada", video: false }),
      true,
    );

    assert.equal(connected.status, "connected");
    assert.equal(connected.isVideo, true);
    assert.equal(connected.ringExpiresAt, null);
    assert.equal(hasMobileRingExpired(connected, MOBILE_DM_CALL_RING_TTL_MS * 4), false);
  });

  it("only accepts signals for the conversation the session is on", () => {
    const session = createMobileOutgoingCall({
      conversationId: "dm-1",
      now: 0,
      title: "Ada",
      video: false,
    });

    assert.equal(isMobileCallSignalForSession(session, "dm-1"), true);
    assert.equal(isMobileCallSignalForSession(session, "dm-2"), false);
    assert.equal(isMobileCallSignalForSession(null, "dm-1"), false);
  });

  it("rejects malformed call payloads before they reach the ring UI", () => {
    assert.equal(getMobileDMCallIncomingPayload({ conversationId: "dm-1" }), null);
    assert.equal(getMobileDMCallSignalPayload({ conversationId: "dm-1" }), null);
    assert.deepEqual(getMobileDMCallSignalPayload({ conversationId: "dm-1", userId: "user-1" }), {
      conversationId: "dm-1",
      userId: "user-1",
    });
    // video defaults so an older backend cannot break the accepted signal.
    assert.deepEqual(getMobileDMCallAcceptedPayload({ conversationId: "dm-1", userId: "user-1" }), {
      conversationId: "dm-1",
      userId: "user-1",
      video: false,
    });
  });

  it("keeps the ring deadline in step with the web client", () => {
    const webSource = readFileSync(
      new URL("../../web/src/lib/dm/call-state.ts", import.meta.url),
      "utf8",
    );
    const rawTtl = webSource.match(/DM_CALL_RING_TTL_MS = ([\d_]+)/)?.[1];

    assert.ok(rawTtl, "web client must define the ring TTL");
    assert.equal(Number(rawTtl.replace(/_/g, "")), MOBILE_DM_CALL_RING_TTL_MS);
  });
});
