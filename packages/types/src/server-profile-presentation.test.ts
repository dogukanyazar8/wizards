import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS,
  formatServerProfileCount,
  resolveServerProfileChannelBadge,
  resolveServerProfileFriendStack,
  resolveServerProfileJoinAction,
  resolveServerScheduledEventAction,
} from "./server-profile-presentation";

describe("formatServerProfileCount", () => {
  it("matches the 2g design's exact examples in Turkish", () => {
    assert.equal(formatServerProfileCount(12_400, "tr"), "12,4B");
    assert.equal(formatServerProfileCount(1_200, "tr"), "1,2B");
  });

  it("uses a period and K in English", () => {
    assert.equal(formatServerProfileCount(12_400, "en"), "12.4K");
    assert.equal(formatServerProfileCount(1_200, "en"), "1.2K");
  });

  it("shows sub-threshold values in full, uncompacted", () => {
    assert.equal(formatServerProfileCount(999, "tr"), "999");
    assert.equal(formatServerProfileCount(0, "tr"), "0");
  });

  it("drops a zero decimal on a whole-thousand scale", () => {
    assert.equal(formatServerProfileCount(1_000, "tr"), "1B");
    assert.equal(formatServerProfileCount(5_000, "en"), "5K");
  });

  it("rounds to one decimal place", () => {
    assert.equal(formatServerProfileCount(12_450, "tr"), "12,5B");
    assert.equal(formatServerProfileCount(12_440, "tr"), "12,4B");
  });
});

describe("resolveServerProfileChannelBadge", () => {
  it("reproduces the 2g KANALLAR list's four rows exactly", () => {
    // "duyurular"
    assert.deepEqual(
      resolveServerProfileChannelBadge({ liveCount: null, readOnly: true, type: "text" }),
      { kind: "read-only", label: "salt okunur" },
    );
    // "yol-haritası"
    assert.deepEqual(
      resolveServerProfileChannelBadge({ liveCount: 0, readOnly: false, type: "text" }),
      { kind: "live", label: "CANLI" },
    );
    // "beta-geri-bildirim"
    assert.equal(
      resolveServerProfileChannelBadge({ liveCount: null, readOnly: false, type: "text" }),
      null,
    );
    // "topluluk-sesli"
    assert.deepEqual(
      resolveServerProfileChannelBadge({ liveCount: 14, readOnly: false, type: "voice" }),
      { count: 14, kind: "live-count", label: "14 kişi" },
    );
  });

  it("never shows a live badge for a voice channel with nobody connected", () => {
    assert.equal(
      resolveServerProfileChannelBadge({ liveCount: 0, readOnly: false, type: "voice" }),
      null,
    );
    assert.equal(
      resolveServerProfileChannelBadge({ liveCount: null, readOnly: false, type: "voice" }),
      null,
    );
  });

  it("lets read-only outrank a live voice headcount", () => {
    assert.deepEqual(
      resolveServerProfileChannelBadge({ liveCount: 14, readOnly: true, type: "voice" }),
      { kind: "read-only", label: "salt okunur" },
    );
  });
});

describe("resolveServerProfileFriendStack", () => {
  const friend = (id: string) => ({
    avatarUrl: null,
    displayName: id,
    id,
    presence: "offline" as const,
    role: "member" as const,
  });

  it("matches the 2g design's 3-visible-plus-9-overflow example", () => {
    const stack = resolveServerProfileFriendStack([friend("a"), friend("b"), friend("c")], 12);

    assert.equal(stack?.visible.length, 3);
    assert.equal(stack?.overflowCount, 9);
    assert.equal(stack?.caption, "Arkadaşlarından 12 kişi bu sunucuda");
  });

  it("caps visible avatars at 4 even when more were fetched", () => {
    const eightFriends = Array.from({ length: 8 }, (_, index) => friend(`f${index}`));
    const stack = resolveServerProfileFriendStack(eightFriends, 8);

    assert.equal(stack?.visible.length, 4);
    assert.equal(stack?.overflowCount, 4);
  });

  it("returns null when there are no mutual friends", () => {
    assert.equal(resolveServerProfileFriendStack([], 0), null);
  });

  it("never reports a negative overflow when the fetched list already covers the count", () => {
    const stack = resolveServerProfileFriendStack([friend("a"), friend("b")], 2);

    assert.equal(stack?.visible.length, 2);
    assert.equal(stack?.overflowCount, 0);
  });
});

describe("resolveServerProfileJoinAction", () => {
  it("routes a member to the server", () => {
    assert.deepEqual(resolveServerProfileJoinAction(true), { kind: "go", label: "Sunucuya git" });
  });

  it("routes a non-member to the invite flow", () => {
    assert.deepEqual(resolveServerProfileJoinAction(false), {
      kind: "join",
      label: "Sunucuya katıl",
    });
  });
});

describe("resolveServerScheduledEventAction", () => {
  const startAtMs = Date.parse("2026-08-11T18:00:00.000Z");
  const scheduled = { scheduledStartAt: "2026-08-11T18:00:00.000Z", status: "SCHEDULED" };

  it("offers a reminder outside the 15 minute window", () => {
    const action = resolveServerScheduledEventAction(
      scheduled,
      startAtMs - SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS - 1,
    );

    assert.deepEqual(action, { kind: "remind", label: "Hatırlat" });
  });

  it("switches to joining exactly at the threshold", () => {
    const action = resolveServerScheduledEventAction(
      scheduled,
      startAtMs - SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS,
    );

    assert.deepEqual(action, { kind: "join", label: "Katıl" });
  });

  it("keeps joining once the event has started", () => {
    const action = resolveServerScheduledEventAction(
      { ...scheduled, status: "ACTIVE" },
      startAtMs + 60_000,
    );

    assert.deepEqual(action, { kind: "join", label: "Katıl" });
  });

  it("offers nothing for a cancelled or completed event", () => {
    assert.equal(resolveServerScheduledEventAction({ ...scheduled, status: "CANCELLED" }, 0), null);
    assert.equal(resolveServerScheduledEventAction({ ...scheduled, status: "COMPLETED" }, 0), null);
  });

  it("offers nothing when the start time is unparseable", () => {
    assert.equal(
      resolveServerScheduledEventAction({ scheduledStartAt: "yarın", status: "SCHEDULED" }, 0),
      null,
    );
  });
});
