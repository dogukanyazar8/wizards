import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MentionSettings } from "@wizards/types";

import { shouldDeliverDesktopNotification } from "@/lib/notifications/desktop-mention-policy";

function settings(overrides: Partial<MentionSettings> = {}): MentionSettings {
  return {
    desktop: "mentions",
    everyone: true,
    me: true,
    quietHours: { enabled: false, from: null, timeZone: "UTC", to: null },
    role: true,
    threadReplies: false,
    ...overrides,
  };
}

describe("shouldDeliverDesktopNotification", () => {
  it("all modunda desteklenen bütün bildirimleri gösterir", () => {
    assert.equal(shouldDeliverDesktopNotification("DM", settings({ desktop: "all" })), true);
    assert.equal(shouldDeliverDesktopNotification("MENTION", settings({ desktop: "all" })), true);
  });

  it("mentions modunda yalnız bahsetmeyi gösterir", () => {
    assert.equal(shouldDeliverDesktopNotification("MENTION", settings()), true);
    assert.equal(shouldDeliverDesktopNotification("DM", settings()), false);
  });

  it("off modunda hiçbir masaüstü toast'ı göstermez", () => {
    assert.equal(shouldDeliverDesktopNotification("MENTION", settings({ desktop: "off" })), false);
  });

  it("sessiz saatte toast'ı bastırır", () => {
    const quiet = settings({
      desktop: "all",
      quietHours: { enabled: true, from: "23:00", timeZone: "UTC", to: "08:00" },
    });

    assert.equal(
      shouldDeliverDesktopNotification("MENTION", quiet, new Date("2026-08-21T23:30:00Z")),
      false,
    );
    assert.equal(
      shouldDeliverDesktopNotification("MENTION", quiet, new Date("2026-08-21T12:00:00Z")),
      true,
    );
  });
});
