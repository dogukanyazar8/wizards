import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOTIFICATION_TYPE_KEYS, type NotificationPrefs } from "@wizards/types";

import {
  IMPORTANT_NOTIFICATION_TYPE_KEYS,
  impliedTypeSet,
  isCustomLevel,
  isNotificationAllowed,
  notificationKindFromType,
  resolveNotificationDelivery,
} from "@/lib/notifications/prefs-policy";
import {
  NOTIFICATION_PREFS_ROW_DEFAULTS,
  toNotificationPrefs,
} from "@/lib/notifications/prefs-service";

/** The stored defaults, read through the same mapper the endpoint uses. */
function prefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  const base = toNotificationPrefs(NOTIFICATION_PREFS_ROW_DEFAULTS, "UTC");

  return { ...base, ...overrides };
}

function withTypes(
  level: NotificationPrefs["level"],
  types: Partial<NotificationPrefs["types"]> = {},
): NotificationPrefs {
  const base = prefs({ level });

  return { ...base, types: { ...base.types, ...types } };
}

const NOON = new Date("2026-08-24T12:00:00.000Z");
const MIDNIGHT = new Date("2026-08-24T23:30:00.000Z");

const QUIET_WINDOW = {
  allowCalls: false,
  enabled: true,
  end: "08:00",
  start: "23:00",
  tz: "UTC",
} as const;

describe("isNotificationAllowed — level", () => {
  it("lets everything through at `all` unless a type row says otherwise", () => {
    const all = withTypes("all", { badges: true, mentionEveryone: true });

    for (const key of NOTIFICATION_TYPE_KEYS) {
      assert.equal(
        isNotificationAllowed({ ...all, types: { ...all.types, [key]: true } }, key, NOON).allowed,
        true,
        `${key} must be allowed at level=all`,
      );
    }
  });

  it("holds everything outside the important set at `important`", () => {
    const important = withTypes(
      "important",
      Object.fromEntries(NOTIFICATION_TYPE_KEYS.map((key) => [key, true])),
    );

    for (const key of NOTIFICATION_TYPE_KEYS) {
      const expected = (IMPORTANT_NOTIFICATION_TYPE_KEYS as readonly string[]).includes(key);
      assert.equal(
        isNotificationAllowed(important, key, NOON).allowed,
        expected,
        `${key} at level=important`,
      );
    }
  });

  it("refuses every optional kind at `off` and says the level did it", () => {
    const off = withTypes("off", { mentionSelf: true });

    assert.deepEqual(isNotificationAllowed(off, "mentionSelf", NOON), {
      allowed: false,
      reason: "level",
    });
  });

  it("never refuses a locked type, at any level or inside a quiet window", () => {
    const off = prefs({ level: "off", quietHours: { ...QUIET_WINDOW } });

    assert.equal(isNotificationAllowed(off, "security", MIDNIGHT).allowed, true);
    assert.equal(isNotificationAllowed(off, "moderation", MIDNIGHT).allowed, true);
    assert.equal(
      isNotificationAllowed(off, "security", MIDNIGHT, { channelMuted: true }).allowed,
      true,
    );
  });
});

describe("isNotificationAllowed — type, quiet hours and channel", () => {
  it("reports the type row when the level allowed the kind", () => {
    const allOn = withTypes("all", { badges: false });

    assert.deepEqual(isNotificationAllowed(allOn, "badges", NOON), {
      allowed: false,
      reason: "type",
    });
  });

  it("silences a quiet window and lets calls through only when allowCalls is on", () => {
    const quiet = withTypes("all", { incomingCall: true });
    const closed = { ...quiet, quietHours: { ...QUIET_WINDOW } };
    const open = { ...quiet, quietHours: { ...QUIET_WINDOW, allowCalls: true } };

    assert.deepEqual(isNotificationAllowed(closed, "incomingCall", MIDNIGHT), {
      allowed: false,
      reason: "quietHours",
    });
    assert.equal(isNotificationAllowed(open, "incomingCall", MIDNIGHT).allowed, true);
    // The exception is calls and calls only.
    assert.deepEqual(isNotificationAllowed(open, "dm", MIDNIGHT), {
      allowed: false,
      reason: "quietHours",
    });
    // Outside the window nothing is held back.
    assert.equal(isNotificationAllowed(closed, "incomingCall", NOON).allowed, true);
  });

  it("reports a muted channel last, so a level refusal is never mislabelled", () => {
    const allOn = withTypes("all", { dm: true });

    assert.deepEqual(isNotificationAllowed(allOn, "dm", NOON, { channelMuted: true }), {
      allowed: false,
      reason: "channel",
    });
    assert.deepEqual(isNotificationAllowed(withTypes("off"), "dm", NOON, { channelMuted: true }), {
      allowed: false,
      reason: "level",
    });
  });
});

describe("isCustomLevel", () => {
  it("is false when the stored set is exactly what the level implies", () => {
    for (const level of ["all", "important", "off"] as const) {
      const exact = { ...prefs({ level }), types: { ...prefs().types, ...impliedTypeSet(level) } };

      assert.equal(isCustomLevel(exact), false, `level=${level}`);
    }
  });

  it("is true as soon as one row departs from the implied set", () => {
    const level = "all" as const;
    const exact = { ...prefs({ level }), types: { ...prefs().types, ...impliedTypeSet(level) } };
    const custom = { ...exact, types: { ...exact.types, badges: false } };

    assert.equal(isCustomLevel(custom), true);
  });

  it("ignores the locked pair, so `off` is not permanently custom", () => {
    const off = {
      ...prefs({ level: "off" }),
      types: { ...prefs().types, ...impliedTypeSet("off") },
    };

    assert.equal(off.types.security, true);
    assert.equal(isCustomLevel(off), false);
  });
});

describe("resolveNotificationDelivery", () => {
  it("keeps the badge alive for a refused notification — the row still exists", () => {
    const off = withTypes("off");

    const delivery = resolveNotificationDelivery(off, "mentionSelf", NOON);

    assert.equal(delivery.allowed, false);
    assert.equal(delivery.push, false);
    assert.equal(delivery.systemWhileClosed, false);
    assert.equal(delivery.sound, false);
    assert.equal(delivery.appBadge, true);
  });

  it("drops the badge too when the reader turned the counter off", () => {
    const noBadge = { ...withTypes("off"), surfaces: { ...prefs().surfaces, badge: false } };

    assert.equal(resolveNotificationDelivery(noBadge, "mentionSelf", NOON).appBadge, false);
  });

  it("holds a badge notification out of push at level=important even with the type on", () => {
    const important = withTypes("important", { badges: true });

    assert.equal(resolveNotificationDelivery(important, "badges", NOON).push, false);
  });

  it("lets `system = mentions` through for the mention family and nothing else", () => {
    const base = withTypes("all", { badges: true, dm: true, mentionSelf: true });
    const mentionsOnly = {
      ...base,
      delivery: { ...base.delivery, system: "mentions" as const },
      surfaces: { ...base.surfaces, systemWhileOpen: true },
    };

    assert.equal(
      resolveNotificationDelivery(mentionsOnly, "mentionSelf", NOON).systemWhileClosed,
      true,
    );
    // A direct message is not a mention: the label has meant "MENTION" since the mention modal.
    assert.equal(resolveNotificationDelivery(mentionsOnly, "dm", NOON).systemWhileClosed, false);
    assert.equal(
      resolveNotificationDelivery(mentionsOnly, "badges", NOON).systemWhileClosed,
      false,
    );
    assert.equal(
      resolveNotificationDelivery(mentionsOnly, "mentionSelf", NOON).systemWhileOpen,
      true,
    );
  });

  it("reports systemPreview so the caller can mask the sender and the message", () => {
    const shown = { ...withTypes("all", { dm: true }), systemPreview: true };
    const hidden = { ...withTypes("all", { dm: true }), systemPreview: false };

    assert.equal(resolveNotificationDelivery(shown, "dm", NOON).systemPreview, true);
    assert.equal(resolveNotificationDelivery(hidden, "dm", NOON).systemPreview, false);
  });

  it("does not confuse the in-app card with the system notification", () => {
    const base = withTypes("all", { dm: true });
    const noToast = { ...base, surfaces: { ...base.surfaces, inAppToast: false } };

    const delivery = resolveNotificationDelivery(noToast, "dm", NOON);

    assert.equal(delivery.inAppToast, false);
    assert.equal(delivery.push, true);
  });
});

describe("notificationKindFromType", () => {
  it("maps the nine-member column onto the type rows the Türler tab owns", () => {
    assert.equal(notificationKindFromType("MENTION"), "mentionSelf");
    assert.equal(notificationKindFromType("DM"), "dm");
    assert.equal(notificationKindFromType("FRIEND_REQUEST"), "friendRequest");
    assert.equal(notificationKindFromType("FRIEND_ACCEPTED"), "friendRequest");
    assert.equal(notificationKindFromType("SERVER_INVITE"), "serverInvite");
    assert.equal(notificationKindFromType("BADGE"), "badges");
    assert.equal(notificationKindFromType("MODERATION"), "moderation");
    assert.equal(notificationKindFromType("SYSTEM"), "announcements");
  });

  it("falls back rather than throwing on a type this build does not know", () => {
    assert.equal(notificationKindFromType("SOMETHING_NEW"), "announcements");
  });
});
