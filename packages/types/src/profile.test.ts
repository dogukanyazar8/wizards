import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MobileProfileUpdateSchema } from "./mobile-social";
import {
  activeProfileStatus,
  appendProfileStatusEmoji,
  ProfileDetailsUpdateSchema,
  resolveProfileStatusExpiresAt,
  PROFILE_STATUS_EXPIRY_CHOICES,
} from "./profile";

describe("shared profile rules", () => {
  it("appends several complete emojis without splitting a complex sequence at the limit", () => {
    assert.equal(appendProfileStatusEmoji("😀", "👩🏽‍💻"), "😀👩🏽‍💻");
    const full = "😀".repeat(32);
    assert.equal(appendProfileStatusEmoji(full, "👩🏽‍💻"), full);
    for (const schema of [ProfileDetailsUpdateSchema, MobileProfileUpdateSchema]) {
      assert.equal(schema.safeParse({ customStatusEmoji: "😀👩🏽‍💻🚀" }).success, true);
      assert.equal(schema.safeParse({ customStatusEmoji: full }).success, true);
    }
  });
  it("accepts 250 characters and rejects 251 on web and mobile writes", () => {
    for (const schema of [ProfileDetailsUpdateSchema, MobileProfileUpdateSchema]) {
      assert.equal(schema.safeParse({ bio: "x".repeat(250) }).success, true);
      assert.equal(schema.safeParse({ bio: "x".repeat(251) }).success, false);
      assert.deepEqual(schema.parse({ bio: "  biography  " }), { bio: "biography" });
      assert.equal(schema.safeParse({ bio: null }).success, true);
    }
  });

  it("accepts a complete status clear and bounds text and emoji on both platforms", () => {
    const cleared = { customStatus: null, customStatusEmoji: null, customStatusExpiresAt: null };
    for (const schema of [ProfileDetailsUpdateSchema, MobileProfileUpdateSchema]) {
      assert.deepEqual(schema.parse(cleared), cleared);
      assert.equal(schema.safeParse({ customStatus: "x".repeat(129) }).success, false);
      assert.equal(schema.safeParse({ customStatusEmoji: "x".repeat(65) }).success, false);
      assert.equal(schema.safeParse({ customStatusExpiresAt: "invalid" }).success, false);
    }
  });

  it("hides expired and empty statuses together with their emoji and expiry", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    const status = {
      customStatus: "Release",
      customStatusEmoji: "🚀",
      customStatusExpiresAt: "2026-09-10T12:00:00.000Z",
    };
    assert.deepEqual(activeProfileStatus(status, now), {
      customStatus: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    });
    assert.deepEqual(activeProfileStatus(status, now - 1), status);
    assert.equal(
      activeProfileStatus({ ...status, customStatus: "", customStatusExpiresAt: null }, now)
        .customStatusEmoji,
      null,
    );
  });

  it("offers the same five expiry choices and resolves a half hour from save time", () => {
    assert.deepEqual(PROFILE_STATUS_EXPIRY_CHOICES, ["never", "30m", "1h", "4h", "today"]);
    assert.equal(
      resolveProfileStatusExpiresAt("30m", new Date("2026-09-10T12:00:00Z")),
      "2026-09-10T12:30:00.000Z",
    );
    assert.equal(resolveProfileStatusExpiresAt("never"), null);
  });
});
