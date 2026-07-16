import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { MobileNotificationItemSchema } from "@wizards/types";

const notification = {
  actionUrl: "/channels/server-1/channel-1",
  actor: null,
  body: "A voice room started",
  channel: { id: "channel-1", name: "Lobby" },
  createdAt: "2026-07-16T10:00:00.000Z",
  eventKind: "voice-room-started",
  id: "00000000-0000-4000-8000-000000000001",
  messageQuote: null,
  read: false,
  readAt: null,
  server: { id: "server-1", name: "Whispr" },
  type: "SYSTEM",
};

describe("mobile notification event contract", () => {
  it("preserves a structured real-time voice event without inspecting its body copy", () => {
    assert.equal(MobileNotificationItemSchema.parse(notification).eventKind, "voice-room-started");
  });

  it("exposes voice contexts only after the notification service resolves their real records", () => {
    const notificationService = readFileSync(
      resolve(process.cwd(), "../web/src/lib/notifications/service.ts"),
      "utf8",
    );

    assert.match(notificationService, /channel: channel \? \{ id: channel\.id, name: channel\.name \} : null/);
    assert.match(notificationService, /server: server \? \{ id: server\.id, name: server\.name \} : null/);
  });
});
