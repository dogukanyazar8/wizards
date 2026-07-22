import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_INCOMING_CALL_ACTIONS,
  MOBILE_PUSH_INCOMING_CALL_CATEGORY,
  parseMobilePushData,
  resolveMobilePushNavigationPath,
  shouldPresentMobilePushInForeground,
} from "../src/notifications/mobile-push-display-contract";

describe("mobile push display contract", () => {
  it("pins channel and category ids to the server contract", () => {
    assert.equal(MOBILE_PUSH_ANDROID_CHANNELS.default, "whispr-default");
    assert.equal(MOBILE_PUSH_ANDROID_CHANNELS.calls, "whispr-calls");
    assert.equal(MOBILE_PUSH_INCOMING_CALL_CATEGORY, "incomingcall");
    assert.deepEqual(
      MOBILE_PUSH_INCOMING_CALL_ACTIONS.map((action) => action.identifier),
      ["answer", "decline"],
    );
  });

  it("parses trusted push payload shapes and rejects junk", () => {
    assert.deepEqual(
      parseMobilePushData({
        actionUrl: "/channels/@me/c1",
        kind: "notification",
        notificationId: "n1",
        type: "DM",
      }),
      {
        actionUrl: "/channels/@me/c1",
        kind: "notification",
        notificationId: "n1",
        type: "DM",
      },
    );
    assert.deepEqual(
      parseMobilePushData({
        callType: "video",
        conversationId: "c1",
        fromUserId: "u9",
        kind: "dm-call",
      }),
      {
        callType: "video",
        conversationId: "c1",
        fromUserId: "u9",
        kind: "dm-call",
      },
    );
    assert.equal(parseMobilePushData(null), null);
    assert.equal(parseMobilePushData("nope"), null);
    assert.equal(parseMobilePushData({ kind: "unknown" }), null);
    assert.equal(parseMobilePushData({ kind: "notification" }), null);
    assert.equal(parseMobilePushData({ callType: "video", kind: "dm-call" }), null);
  });

  it("suppresses feed pushes in the foreground but always presents calls", () => {
    const feed = parseMobilePushData({
      actionUrl: "/x",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
    const call = parseMobilePushData({
      callType: "voice",
      conversationId: "c1",
      fromUserId: "u9",
      kind: "dm-call",
    });
    assert.equal(shouldPresentMobilePushInForeground(feed), false);
    assert.equal(shouldPresentMobilePushInForeground(call), true);
    assert.equal(shouldPresentMobilePushInForeground(null), true);
  });

  it("maps push payloads to navigation paths", () => {
    const feed = parseMobilePushData({
      actionUrl: "/channels/@me/c1",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
    const call = parseMobilePushData({
      callType: "voice",
      conversationId: "c2",
      fromUserId: "u9",
      kind: "dm-call",
    });
    assert.equal(resolveMobilePushNavigationPath(feed), "/channels/@me/c1");
    assert.equal(resolveMobilePushNavigationPath(call), "/channels/@me/c2");
    const feedWithoutUrl = parseMobilePushData({
      actionUrl: "",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
    assert.equal(resolveMobilePushNavigationPath(feedWithoutUrl), "/notifications");
    assert.equal(resolveMobilePushNavigationPath(null), "/notifications");
  });
});
