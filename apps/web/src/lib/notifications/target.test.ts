import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNotificationTarget } from "./target";

describe("notification targets", () => {
  it("maps existing badge notifications to the current settings tab", () => {
    assert.equal(resolveNotificationTarget("/settings/badges"), "/settings/account/badges");
    assert.equal(
      resolveNotificationTarget("/settings/badges/?badge=founder#details"),
      "/settings/account/badges?badge=founder#details",
    );
    assert.equal(
      resolveNotificationTarget("https://example.com/settings/badges"),
      "https://example.com/settings/badges",
    );
  });
  it("preserves existing application destinations", () => {
    for (const path of [
      "/messages/conversation",
      "/events?event=event-1",
      "/settings/account/badges",
      "/invite/code",
      "/feedback/report",
    ]) {
      assert.equal(resolveNotificationTarget(path), path);
    }
  });
  it("targets channel messages and thread parents without replacing explicit message links", () => {
    assert.equal(
      resolveNotificationTarget("/channels/s/c", { messageId: "m & 1" }),
      "/channels/s/c?message=m+%26+1",
    );
    assert.equal(
      resolveNotificationTarget("/channels/s/c?thread=parent", { messageId: "reply" }),
      "/channels/s/c?thread=parent&message=parent",
    );
    assert.equal(
      resolveNotificationTarget("/channels/s/c?message=original", { messageId: "other" }),
      "/channels/s/c?message=original",
    );
  });
  it("allows explicit web links but rejects executable and ambiguous destinations", () => {
    assert.equal(resolveNotificationTarget("https://whispr.team/news"), "https://whispr.team/news");
    for (const value of [
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "data:text/html,test",
      "//evil.test",
      "/\\evil.test",
      "/\nevil.test",
      "https://user:password@example.com",
      "/" + "x".repeat(2048),
    ]) {
      assert.equal(resolveNotificationTarget(value), null, String(value));
    }
  });
});
