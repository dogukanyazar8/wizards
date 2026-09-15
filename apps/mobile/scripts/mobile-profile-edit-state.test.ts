import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMobileProfileEditPatch,
  createMobileProfileEditDraft,
  isMobileProfileEditDirty,
  type MobileProfileEditBaseline,
} from "../src/social/mobile-profile-edit-state";
import {
  describeMobileStatusExpiry,
  inferMobileStatusExpiryChoice,
  isMobileStatusExpired,
  resolveMobileStatusExpiresAt,
} from "../src/social/mobile-profile-status-expiry";

const NOW = new Date("2026-07-23T12:00:00.000Z");

const baseline: MobileProfileEditBaseline = {
  bannerColor: null,
  bannerOffsetX: null,
  bannerOffsetY: null,
  bannerUrl: null,
  bio: null,
  customStatus: null,
  customStatusEmoji: null,
  customStatusExpiresAt: null,
  displayName: "Ada",
  username: "ada",
};

function draftOf(overrides: Partial<ReturnType<typeof createMobileProfileEditDraft>> = {}) {
  return { ...createMobileProfileEditDraft(baseline, NOW), ...overrides };
}

describe("mobile profile edit draft state", () => {
  it("preserves the deadline after an editor stays open and only text or emoji changes", () => {
    const timed = {
      ...baseline,
      customStatus: "Release",
      customStatusEmoji: "🚀",
      customStatusExpiresAt: "2026-07-23T16:00:00.000Z",
    };
    const draft = createMobileProfileEditDraft(timed, NOW);
    const later = new Date("2026-07-23T15:30:00.000Z");
    assert.deepEqual(buildMobileProfileEditPatch({ baseline: timed, draft, now: later }), {});
    assert.deepEqual(
      buildMobileProfileEditPatch({
        baseline: timed,
        draft: { ...draft, customStatus: "Review", customStatusEmoji: "🎨" },
        now: later,
      }),
      { customStatus: "Review", customStatusEmoji: "🎨" },
    );
  });
  it("starts clean from the server values", () => {
    const draft = createMobileProfileEditDraft(baseline, NOW);

    assert.deepEqual(draft, {
      bannerColor: null,
      bannerOffsetX: null,
      bannerOffsetY: null,
      bannerUrl: null,
      bio: "",
      customStatus: "",
      customStatusEmoji: null,
      displayName: "Ada",
      statusExpiry: "never",
      initialStatusExpiry: "never",
      username: "ada",
    });
    assert.equal(isMobileProfileEditDirty({ baseline, draft, now: NOW }), false);
  });

  it("treats whitespace-only edits as unchanged", () => {
    const draft = draftOf({ bio: "   ", displayName: "  Ada  " });

    assert.equal(isMobileProfileEditDirty({ baseline, draft, now: NOW }), false);
  });

  it("sends every dirty field in one patch and clears emptied text to null", () => {
    const draft = draftOf({
      bannerColor: "#22A366",
      bio: "  Mobil ekip  ",
      displayName: "",
      username: "ada_lovelace",
    });

    assert.deepEqual(buildMobileProfileEditPatch({ baseline, draft, now: NOW }), {
      bannerColor: "#22A366",
      bio: "Mobil ekip",
      displayName: null,
      username: "ada_lovelace",
    });
  });

  it("resolves the picked duration into an absolute instant only when the status moved", () => {
    const unchanged = buildMobileProfileEditPatch({
      baseline: { ...baseline, customStatus: "Release", customStatusExpiresAt: null },
      draft: draftOf({ customStatus: "Release" }),
      now: NOW,
    });
    assert.deepEqual(unchanged, {});

    const changed = buildMobileProfileEditPatch({
      baseline,
      draft: draftOf({ customStatus: "Release", customStatusEmoji: "🎧", statusExpiry: "4h" }),
      now: NOW,
    });
    assert.deepEqual(changed, {
      customStatus: "Release",
      customStatusEmoji: "🎧",
      customStatusExpiresAt: "2026-07-23T16:00:00.000Z",
    });
  });

  it("re-sends only the deadline when the duration alone changes", () => {
    assert.deepEqual(
      buildMobileProfileEditPatch({
        baseline: {
          ...baseline,
          customStatus: "Release",
          customStatusExpiresAt: "2026-07-23T16:00:00.000Z",
        },
        draft: draftOf({ customStatus: "Release", statusExpiry: "30m" }),
        now: NOW,
      }),
      { customStatusExpiresAt: "2026-07-23T12:30:00.000Z" },
    );
  });

  it("drops the emoji and deadline when the message is cleared", () => {
    assert.deepEqual(
      buildMobileProfileEditPatch({
        baseline: {
          ...baseline,
          customStatus: "Release",
          customStatusEmoji: "🎧",
          customStatusExpiresAt: "2026-07-23T16:00:00.000Z",
        },
        draft: draftOf({ customStatus: "", customStatusEmoji: null, statusExpiry: "never" }),
        now: NOW,
      }),
      { customStatus: null, customStatusEmoji: null, customStatusExpiresAt: null },
    );
  });

  it("carries the stored banner focal point into the draft", () => {
    const positioned: MobileProfileEditBaseline = {
      ...baseline,
      bannerOffsetX: 0.25,
      bannerOffsetY: 0.8,
      bannerUrl: "https://cdn.test/b.png",
    };
    const draft = createMobileProfileEditDraft(positioned, NOW);

    assert.equal(draft.bannerOffsetX, 0.25);
    assert.equal(draft.bannerOffsetY, 0.8);
    assert.equal(isMobileProfileEditDirty({ baseline: positioned, draft, now: NOW }), false);
  });

  it("sends only the moved banner focal axis", () => {
    const positioned: MobileProfileEditBaseline = {
      ...baseline,
      bannerOffsetX: 0.5,
      bannerOffsetY: 0.5,
      bannerUrl: "https://cdn.test/b.png",
    };

    assert.deepEqual(
      buildMobileProfileEditPatch({
        baseline: positioned,
        draft: {
          ...createMobileProfileEditDraft(positioned, NOW),
          bannerOffsetY: 0.82,
        },
        now: NOW,
      }),
      { bannerOffsetY: 0.82 },
    );
  });

  it("patches a removed banner image without touching the color", () => {
    assert.deepEqual(
      buildMobileProfileEditPatch({
        baseline: { ...baseline, bannerColor: "#4F46E5", bannerUrl: "https://cdn.test/b.png" },
        draft: {
          ...createMobileProfileEditDraft(
            { ...baseline, bannerColor: "#4F46E5", bannerUrl: "https://cdn.test/b.png" },
            NOW,
          ),
          bannerUrl: null,
        },
        now: NOW,
      }),
      { bannerUrl: null },
    );
  });
});

describe("mobile status expiry", () => {
  it("converts each offered duration into an absolute instant", () => {
    assert.equal(resolveMobileStatusExpiresAt("never", NOW), null);
    assert.equal(resolveMobileStatusExpiresAt("30m", NOW), "2026-07-23T12:30:00.000Z");
    assert.equal(resolveMobileStatusExpiresAt("1h", NOW), "2026-07-23T13:00:00.000Z");
    assert.equal(resolveMobileStatusExpiresAt("4h", NOW), "2026-07-23T16:00:00.000Z");
  });

  it("keeps 'today' in the future even at the very end of the day", () => {
    const lateNight = new Date("2026-07-23T23:59:59.900Z");
    const resolved = resolveMobileStatusExpiresAt("today", lateNight);

    assert.ok(resolved !== null);
    assert.ok(Date.parse(resolved) > lateNight.getTime());
  });

  it("rounds the remaining time into minutes, hours and days", () => {
    assert.deepEqual(describeMobileStatusExpiry(null, NOW), { kind: "none" });
    assert.deepEqual(describeMobileStatusExpiry("2026-07-23T11:00:00.000Z", NOW), {
      kind: "expired",
    });
    assert.deepEqual(describeMobileStatusExpiry("2026-07-23T12:25:00.000Z", NOW), {
      count: 25,
      kind: "minutes",
    });
    assert.deepEqual(describeMobileStatusExpiry("2026-07-23T16:00:00.000Z", NOW), {
      count: 4,
      kind: "hours",
    });
    assert.deepEqual(describeMobileStatusExpiry("2026-07-25T12:00:00.000Z", NOW), {
      count: 2,
      kind: "days",
    });
  });

  it("treats a passed deadline as expired so the device hides it too", () => {
    assert.equal(isMobileStatusExpired("2026-07-23T11:59:59.000Z", NOW), true);
    assert.equal(isMobileStatusExpired("2026-07-23T12:00:01.000Z", NOW), false);
    assert.equal(isMobileStatusExpired(null, NOW), false);
  });

  it("preselects the closest offered duration for a stored deadline", () => {
    assert.equal(inferMobileStatusExpiryChoice(null, NOW), "never");
    assert.equal(inferMobileStatusExpiryChoice("2026-07-23T11:00:00.000Z", NOW), "never");
    assert.equal(inferMobileStatusExpiryChoice("2026-07-23T12:31:00.000Z", NOW), "30m");
    assert.equal(inferMobileStatusExpiryChoice("2026-07-23T15:50:00.000Z", NOW), "4h");
  });
});
