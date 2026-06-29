import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMobileBootstrapPayload } from "./bootstrap";

describe("mobile bootstrap payload", () => {
  it("returns a schema-valid payload without emails, tokens, or fake pending features", () => {
    const payload = getMobileBootstrapPayload({
      now: new Date("2026-06-26T12:00:00.000Z"),
      user: {
        avatarUrl: null,
        displayName: "CodeX",
        id: "user_123",
        locale: "tr",
        status: "online",
        username: "codex",
      },
    });
    const serialized = JSON.stringify(payload);

    assert.equal(payload.app.name, "Whispr");
    assert.equal(payload.app.serverTime, "2026-06-26T12:00:00.000Z");
    assert.equal(payload.features.messages.status, "available");
    assert.equal(payload.features.pushNotifications.status, "requires-server-contract");
    assert.equal(payload.features.nativeAuthTokenExchange.status, "available");
    assert.equal(serialized.includes("email"), false);
    assert.equal(serialized.includes("access_token"), false);
    assert.equal(serialized.includes("refresh_token"), false);
  });
});
