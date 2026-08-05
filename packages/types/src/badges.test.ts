import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as badgesModule from "./badges";
import {
  BADGE_CATALOG,
  BADGE_FAMILY_ORDER,
  BADGE_IDS,
  BADGE_MAX_TIER,
  BADGE_RARITY_MIN_TOTAL_USERS,
  BadgeIdSchema,
  BadgeProgressSchema,
  BadgeRarityEntrySchema,
  BadgeRarityResponseSchema,
  EarnedBadgeSchema,
  GRANTABLE_BADGE_IDS,
  resolveBadgeRarityDisplay,
  OwnBadgesResponseSchema,
  UserBadgesResponseSchema,
  buildBadgeDetailModel,
  buildBadgeProgressDisplay,
  buildOwnBadgeEntries,
  groupBadgesByFamily,
  summarizeOwnBadges,
  formatBadgeEarnedMonth,
  formatBadgeProgressText,
  formatBadgeProgressValue,
  nextBadgeThreshold,
  resolveBadgeTier,
  sortBadges,
  splitBadgesForCard,
  type BadgeId,
} from "./badges";
import { BADGE_CATALOG as IndexedCatalog } from "./index";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

/** 00-ortak-baglam §4 "Öncelik sırası" bloğu, birebir. */
const EXPECTED_PRIORITY_ORDER: readonly BadgeId[] = [
  "staff",
  "verified",
  "supporter",
  "earlyMember",
  "event",
  "ideaShipped",
  "contributor",
  "founder",
  "streak",
  "inviter",
  "bugHunter",
  "regular",
  "voice",
  "broadcaster",
  "betaTester",
  "veteran",
];

const TOTAL_TIER_COUNT = 28;

function earned(id: BadgeId, tier = 1, earnedAt?: string) {
  return earnedAt === undefined ? { id, tier } : { id, tier, earnedAt };
}

describe("badge catalog", () => {
  it("is reachable from the package index", () => {
    assert.equal(BADGE_CATALOG, IndexedCatalog);
  });

  it("carries sixteen ids and a definition for each", () => {
    assert.equal(BADGE_IDS.length, 16);
    assert.equal(new Set(BADGE_IDS).size, 16);
    for (const id of BADGE_IDS) {
      const definition = BADGE_CATALOG[id];
      assert.ok(definition, `${id} has no definition.`);
      assert.equal(definition.id, id, `${id} is filed under the wrong key.`);
    }
    assert.deepEqual(Object.keys(BADGE_CATALOG).sort(), [...BADGE_IDS].sort());
  });

  it("numbers priorities 1..16 without repeats and reproduces the §4 order", () => {
    const priorities = BADGE_IDS.map((id) => BADGE_CATALOG[id].priority);
    assert.deepEqual(
      [...priorities].sort((left, right) => left - right),
      Array.from({ length: 16 }, (_unused, index) => index + 1),
    );

    const sorted = sortBadges(BADGE_IDS.map((id) => earned(id)));
    assert.deepEqual(
      sorted.map((badge) => badge.id),
      EXPECTED_PRIORITY_ORDER,
    );
  });

  it("declares twenty-eight tiers in total", () => {
    const total = BADGE_IDS.reduce((sum, id) => sum + BADGE_CATALOG[id].thresholds.length, 0);
    assert.equal(total, TOTAL_TIER_COUNT);
  });

  it("keeps every threshold list strictly increasing and inside the tier ceiling", () => {
    for (const id of BADGE_IDS) {
      const { thresholds } = BADGE_CATALOG[id];
      assert.ok(thresholds.length >= 1, `${id} has no threshold.`);
      assert.ok(thresholds.length <= BADGE_MAX_TIER, `${id} declares more than three tiers.`);
      for (let index = 1; index < thresholds.length; index += 1) {
        assert.ok(
          (thresholds[index] as number) > (thresholds[index - 1] as number),
          `${id} thresholds are not strictly increasing.`,
        );
      }
    }
  });

  it("carries complete Turkish and English copy with tier names that match the tiers", () => {
    for (const id of BADGE_IDS) {
      const { copy, thresholds } = BADGE_CATALOG[id];
      for (const locale of ["tr", "en"] as const) {
        const text = copy[locale];
        assert.ok(text.name.trim().length > 0, `${id}.${locale} has no name.`);
        assert.ok(text.description.trim().length > 0, `${id}.${locale} has no description.`);
        assert.ok(
          text.description.trim().endsWith("."),
          `${id}.${locale} description is not a sentence.`,
        );
        if (text.tiers) {
          assert.equal(
            text.tiers.length,
            thresholds.length,
            `${id}.${locale} tier names do not match the thresholds.`,
          );
          for (const tierName of text.tiers) {
            assert.ok(tierName.trim().length > 0, `${id}.${locale} has an empty tier name.`);
          }
        }
      }
      const trTiers = copy.tr.tiers === undefined;
      const enTiers = copy.en.tiers === undefined;
      assert.equal(trTiers, enTiers, `${id} declares tier names in only one language.`);
    }
  });

  it("gives every badge its own glyph", () => {
    const glyphs = BADGE_IDS.map((id) => BADGE_CATALOG[id].glyph);
    assert.equal(new Set(glyphs).size, glyphs.length);
  });
});

describe("resolveBadgeTier", () => {
  it("awards a tier at the threshold and not one below it", () => {
    for (const id of BADGE_IDS) {
      const { thresholds } = BADGE_CATALOG[id];
      thresholds.forEach((threshold, index) => {
        assert.equal(resolveBadgeTier(id, threshold), index + 1, `${id} missed tier ${index + 1}.`);
        assert.equal(
          resolveBadgeTier(id, threshold - 1),
          index,
          `${id} awarded tier ${index + 1} below its threshold.`,
        );
      });
    }
  });

  it("walks the streak boundaries", () => {
    assert.equal(resolveBadgeTier("streak", 6), 0);
    assert.equal(resolveBadgeTier("streak", 7), 1);
    assert.equal(resolveBadgeTier("streak", 29), 1);
    assert.equal(resolveBadgeTier("streak", 30), 2);
    assert.equal(resolveBadgeTier("streak", 100), 3);
    assert.equal(resolveBadgeTier("streak", 1000), 3);
  });

  it("stays at zero for values below the first threshold", () => {
    assert.equal(resolveBadgeTier("voice", 0), 0);
    assert.equal(resolveBadgeTier("veteran", 364), 0);
    assert.equal(resolveBadgeTier("staff", 0), 0);
  });
});

describe("nextBadgeThreshold", () => {
  it("returns the next tier with the remaining distance", () => {
    assert.deepEqual(nextBadgeThreshold("streak", 6), { tier: 1, threshold: 7, remaining: 1 });
    assert.deepEqual(nextBadgeThreshold("streak", 7), { tier: 2, threshold: 30, remaining: 23 });
    assert.deepEqual(nextBadgeThreshold("inviter", 10), { tier: 3, threshold: 50, remaining: 40 });
  });

  it("returns null on the last tier of every badge", () => {
    for (const id of BADGE_IDS) {
      const { thresholds } = BADGE_CATALOG[id];
      const last = thresholds[thresholds.length - 1] as number;
      assert.equal(nextBadgeThreshold(id, last), null, `${id} still offers a next tier.`);
    }
  });
});

describe("sortBadges", () => {
  it("is stable under shuffling", () => {
    const badges = BADGE_IDS.map((id) => earned(id));
    const shuffled = [...badges.slice(9), ...badges.slice(0, 4).reverse(), ...badges.slice(4, 9)];
    assert.deepEqual(sortBadges(shuffled), sortBadges(badges));
  });

  it("breaks ties by tier, then earnedAt, then id", () => {
    const sameBadge = [
      earned("streak", 1, "2026-01-01T00:00:00.000Z"),
      earned("streak", 3, "2026-05-01T00:00:00.000Z"),
      earned("streak", 3, "2026-02-01T00:00:00.000Z"),
    ];
    assert.deepEqual(sortBadges(sameBadge), [
      earned("streak", 3, "2026-02-01T00:00:00.000Z"),
      earned("streak", 3, "2026-05-01T00:00:00.000Z"),
      earned("streak", 1, "2026-01-01T00:00:00.000Z"),
    ]);
  });

  it("does not mutate the input", () => {
    const badges = [earned("veteran"), earned("staff")];
    const snapshot = [...badges];
    sortBadges(badges);
    assert.deepEqual(badges, snapshot);
  });
});

describe("splitBadgesForCard", () => {
  it("shows three chips and counts the overflow", () => {
    const five = ["staff", "verified", "supporter", "earlyMember", "event"] as const;
    const result = splitBadgesForCard(five.map((id) => earned(id)));
    assert.equal(result.visible.length, 3);
    assert.equal(result.overflow, 2);
    assert.deepEqual(
      result.visible.map((badge) => badge.id),
      ["staff", "verified", "supporter"],
    );
  });

  it("reports no overflow at exactly three", () => {
    const three = ["veteran", "staff", "voice"] as const;
    const result = splitBadgesForCard(three.map((id) => earned(id)));
    assert.equal(result.visible.length, 3);
    assert.equal(result.overflow, 0);
  });

  it("handles an empty badge set", () => {
    assert.deepEqual(splitBadgesForCard([]), { visible: [], overflow: 0 });
  });

  it("honours a custom visible count", () => {
    const badges = BADGE_IDS.map((id) => earned(id));
    const result = splitBadgesForCard(badges, 5);
    assert.equal(result.visible.length, 5);
    assert.equal(result.overflow, BADGE_IDS.length - 5);
  });
});

describe("badge wire schemas", () => {
  it("defaults expiresAt to null and rejects unknown keys", () => {
    const parsed = assertAccepts(EarnedBadgeSchema, {
      id: "streak",
      tier: 2,
      earnedAt: "2026-08-05T10:00:00.000Z",
    });
    assert.equal(parsed.expiresAt, null);
    assertRejects(EarnedBadgeSchema, {
      id: "streak",
      tier: 2,
      earnedAt: "2026-08-05T10:00:00.000Z",
      revokedAt: null,
    });
  });

  it("keeps tiers inside the catalog ceiling", () => {
    assertRejects(EarnedBadgeSchema, {
      id: "streak",
      tier: 0,
      earnedAt: "2026-08-05T10:00:00.000Z",
    });
    assertRejects(EarnedBadgeSchema, {
      id: "streak",
      tier: BADGE_MAX_TIER + 1,
      earnedAt: "2026-08-05T10:00:00.000Z",
    });
  });

  it("lets progress sit at tier zero with a null next threshold", () => {
    assertAccepts(BadgeProgressSchema, { id: "voice", tier: 0, value: 0, nextThreshold: 36_000 });
    assertAccepts(BadgeProgressSchema, {
      id: "voice",
      tier: 2,
      value: 400_000,
      nextThreshold: null,
    });
    assertRejects(BadgeProgressSchema, { id: "voice", tier: 0, value: -1, nextThreshold: null });
  });

  /**
   * 06 §1. Seconds are a storage unit, not a reading unit: `voice` and
   * `broadcaster` are documented in hours and must print in hours on both
   * platforms, which is why the conversion lives here rather than in either app.
   */
  it("prints second-based badges in hours and leaves every other unit alone", () => {
    assert.deepEqual(formatBadgeProgressValue("voice", 36_000), { unit: "second", value: 10 });
    assert.deepEqual(formatBadgeProgressValue("voice", 360_000), { unit: "second", value: 100 });
    assert.deepEqual(formatBadgeProgressValue("broadcaster", 18_000), {
      unit: "second",
      value: 5,
    });
    // Partial hours round down: a bar at 9.7 hours must not claim the 10th.
    assert.deepEqual(formatBadgeProgressValue("voice", 35_999), { unit: "second", value: 9 });

    assert.deepEqual(formatBadgeProgressValue("streak", 12), { unit: "day", value: 12 });
    assert.deepEqual(formatBadgeProgressValue("inviter", 4), { unit: "invite", value: 4 });
    assert.deepEqual(formatBadgeProgressValue("founder", 30), { unit: "member", value: 30 });
    assert.deepEqual(formatBadgeProgressValue("bugHunter", 3), { unit: "count", value: 3 });
  });

  it("fills the bar on raw values while printing the converted ones", () => {
    const voice = buildBadgeProgressDisplay({
      id: "voice",
      tier: 1,
      value: 180_000,
      nextThreshold: 360_000,
    });

    assert.deepEqual(voice, {
      atMaxTier: false,
      id: "voice",
      nextThreshold: 100,
      ratio: 0.5,
      unit: "second",
      value: 50,
    });

    const capped = buildBadgeProgressDisplay({
      id: "voice",
      tier: 2,
      value: 400_000,
      nextThreshold: null,
    });

    assert.equal(capped.atMaxTier, true);
    assert.equal(capped.nextThreshold, null);
    assert.equal(capped.ratio, 1);
  });

  it("writes the progress line from the caller's frame strings", () => {
    const labels = {
      maxTierLabel: "En üst kademe",
      template: "{value}/{next} {unit}",
      unitLabels: { day: "gün", invite: "davet", member: "üye", second: "saat" },
    } as const;

    assert.equal(
      formatBadgeProgressText({
        display: buildBadgeProgressDisplay({
          id: "voice",
          tier: 1,
          value: 36_000,
          nextThreshold: 360_000,
        }),
        ...labels,
      }),
      "10/100 saat",
    );
    assert.equal(
      formatBadgeProgressText({
        display: buildBadgeProgressDisplay({
          id: "streak",
          tier: 1,
          value: 9,
          nextThreshold: 30,
        }),
        ...labels,
      }),
      "9/30 gün",
    );
    // `count` badges carry no unit word; the pair prints on its own.
    assert.equal(
      formatBadgeProgressText({
        display: buildBadgeProgressDisplay({
          id: "bugHunter",
          tier: 1,
          value: 2,
          nextThreshold: 5,
        }),
        ...labels,
      }),
      "2/5",
    );
    assert.equal(
      formatBadgeProgressText({
        display: buildBadgeProgressDisplay({
          id: "regular",
          tier: 3,
          value: 400,
          nextThreshold: null,
        }),
        ...labels,
      }),
      "En üst kademe",
    );
  });

  /** The earned line is month + year on both platforms; a day is never shown. */
  it("formats the earned date as month and year only", () => {
    const earnedAt = "2026-08-05T10:00:00.000Z";

    assert.equal(formatBadgeEarnedMonth(earnedAt, "en"), "August 2026");
    assert.doesNotMatch(formatBadgeEarnedMonth(earnedAt, "tr"), /\b5\b/);
    assert.match(formatBadgeEarnedMonth(earnedAt, "tr"), /2026$/);
    assert.equal(formatBadgeEarnedMonth("not-a-date", "tr"), "");
  });

  /**
   * 06 §1 and 00 §4: a counter on someone else's profile leaks how they use the
   * app, so the model drops progress unless the viewer is the subject.
   */
  it("hands progress to your own profile and withholds it on someone else's", () => {
    const badge = {
      id: "voice" as const,
      tier: 1,
      earnedAt: "2026-08-05T10:00:00.000Z",
      expiresAt: null,
    };
    const progress = [
      { id: "voice" as const, tier: 1, value: 72_000, nextThreshold: 360_000 },
      { id: "streak" as const, tier: 1, value: 9, nextThreshold: 30 },
    ];
    const formatTierLabel = (tier: number) => `Kademe ${tier}`;

    const own = buildBadgeDetailModel({
      badge,
      formatTierLabel,
      isSelf: true,
      locale: "tr",
      progress,
    });
    assert.deepEqual(own.progress, {
      atMaxTier: false,
      id: "voice",
      nextThreshold: 100,
      ratio: 0.2,
      unit: "second",
      value: 20,
    });

    const peer = buildBadgeDetailModel({
      badge,
      formatTierLabel,
      isSelf: false,
      locale: "tr",
      progress,
    });
    assert.equal(peer.progress, null);
  });

  it("takes name, description and tier label from the catalog", () => {
    const formatTierLabel = (tier: number) => `Kademe ${tier}`;
    const tiered = buildBadgeDetailModel({
      badge: {
        id: "streak",
        tier: 2,
        earnedAt: "2026-08-05T10:00:00.000Z",
        expiresAt: null,
      },
      formatTierLabel,
      isSelf: false,
      locale: "tr",
    });

    assert.equal(tiered.name, BADGE_CATALOG.streak.copy.tr.name);
    assert.equal(tiered.description, BADGE_CATALOG.streak.copy.tr.description);
    assert.equal(tiered.tierLabel, BADGE_CATALOG.streak.copy.tr.tiers?.[1]);
    assert.equal(tiered.glyph, BADGE_CATALOG.streak.glyph);
    assert.equal(tiered.tint, BADGE_CATALOG.streak.tint);

    // A single-tier badge shows no tier label at all (06 §1).
    const flat = buildBadgeDetailModel({
      badge: {
        id: "staff",
        tier: 1,
        earnedAt: "2026-08-05T10:00:00.000Z",
        expiresAt: null,
      },
      formatTierLabel,
      isSelf: false,
      locale: "en",
    });

    assert.equal(flat.tierLabel, null);
    assert.equal(flat.name, BADGE_CATALOG.staff.copy.en.name);

    // A tiered badge with no catalog tier names falls back to the frame string.
    const fallback = buildBadgeDetailModel({
      badge: {
        id: "supporter",
        tier: 2,
        earnedAt: "2026-08-05T10:00:00.000Z",
        expiresAt: null,
      },
      formatTierLabel: () => "Kademe 2",
      isSelf: false,
      locale: "tr",
    });
    assert.equal(fallback.tierLabel, BADGE_CATALOG.supporter.copy.tr.tiers?.[1] ?? "Kademe 2");
  });

  /**
   * These schemas are new, so `.strict()` costs nothing today: every client
   * that talks to `/badges` shipped after them. It is what keeps a later field
   * from being added on the server and silently ignored on one platform.
   */
  it("refuses an unknown key on every wire schema", () => {
    const badge = { id: "staff" as const, tier: 1, earnedAt: "2026-08-05T10:00:00.000Z" };

    assertRejects(UserBadgesResponseSchema, { badges: [], total: 0 });
    assertRejects(OwnBadgesResponseSchema, { badges: [], progress: [], total: 0 });
    assertRejects(EarnedBadgeSchema, { ...badge, label: "Ekip" });
    assertRejects(BadgeProgressSchema, {
      id: "streak",
      tier: 1,
      value: 9,
      nextThreshold: 30,
      unit: "day",
    });
    assertRejects(UserBadgesResponseSchema, { badges: [{ ...badge, label: "Ekip" }] });
  });

  it("caps both response lists at the catalog size", () => {
    const badge = { id: "staff" as const, tier: 1, earnedAt: "2026-08-05T10:00:00.000Z" };
    assertRejects(UserBadgesResponseSchema, {
      badges: Array.from({ length: BADGE_IDS.length + 1 }, () => badge),
    });
    assertAccepts(OwnBadgesResponseSchema, { badges: [badge], progress: [] });
  });

  it("covers every exported schema", () => {
    assertSchemaBehaviorCoverage(badgesModule, {
      BadgeIdSchema: { schema: BadgeIdSchema, valid: "staff", invalid: "moderator" },
      BadgeProgressSchema: {
        schema: BadgeProgressSchema,
        valid: { id: "streak", tier: 1, value: 9, nextThreshold: 30 },
        invalid: { id: "streak", tier: 1, value: 9 },
      },
      EarnedBadgeSchema: {
        schema: EarnedBadgeSchema,
        valid: { id: "staff", tier: 1, earnedAt: "2026-08-05T10:00:00.000Z" },
        invalid: { id: "staff", tier: 1, earnedAt: "not-a-date" },
      },
      OwnBadgesResponseSchema: {
        schema: OwnBadgesResponseSchema,
        valid: { badges: [], progress: [] },
        invalid: { badges: [] },
      },
      UserBadgesResponseSchema: {
        schema: UserBadgesResponseSchema,
        valid: { badges: [] },
        invalid: { badges: [{ id: "staff", tier: 1 }] },
      },
      BadgeRarityEntrySchema: {
        schema: BadgeRarityEntrySchema,
        valid: { id: "staff", holders: 12 },
        invalid: { id: "staff", holders: 12, percent: 1.2 },
      },
      BadgeRarityResponseSchema: {
        schema: BadgeRarityResponseSchema,
        valid: { badges: [], computedAt: null, totalUsers: 0 },
        invalid: { badges: [], totalUsers: 0 },
      },
    });
  });
});

describe("badge rarity", () => {
  it("hands out only the granted layer", () => {
    assert.deepEqual(GRANTABLE_BADGE_IDS, ["contributor", "event"]);

    for (const id of GRANTABLE_BADGE_IDS) {
      assert.equal(BADGE_CATALOG[id].layer, "granted", id);
    }
  });

  it("keeps the percentage hidden under the population floor", () => {
    // 08 §4: a small sample both misleads and de-anonymises.
    assert.deepEqual(
      resolveBadgeRarityDisplay({ holders: 40, totalUsers: BADGE_RARITY_MIN_TOTAL_USERS - 1 }),
      { kind: "hidden" },
    );
    assert.deepEqual(
      resolveBadgeRarityDisplay({ holders: 40, totalUsers: BADGE_RARITY_MIN_TOTAL_USERS }),
      { kind: "percent", percent: 8 },
    );
  });

  it("prints one decimal and replaces a rounded zero with the below-one form", () => {
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 634, totalUsers: 10_000 }), {
      kind: "percent",
      percent: 6.3,
    });
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 4, totalUsers: 10_000 }), {
      kind: "below-one",
    });
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 0, totalUsers: 10_000 }), {
      kind: "hidden",
    });
  });
});

describe("Rozetlerim model", () => {
  const earned = (id: BadgeId, tier: number, earnedAt: string) => ({
    earnedAt,
    expiresAt: null,
    id,
    tier,
  });

  it("counts earned against the whole catalog", () => {
    assert.deepEqual(
      summarizeOwnBadges({
        badges: [
          earned("staff", 1, "2026-01-01T00:00:00.000Z"),
          earned("streak", 2, "2026-02-01T00:00:00.000Z"),
        ],
      }),
      { earned: 2, ratio: 2 / BADGE_IDS.length, total: BADGE_IDS.length },
    );
  });

  it("never counts the same badge twice", () => {
    const summary = summarizeOwnBadges({
      badges: [
        earned("staff", 1, "2026-01-01T00:00:00.000Z"),
        earned("staff", 1, "2026-01-01T00:00:00.000Z"),
      ],
    });

    assert.equal(summary.earned, 1);
  });

  it("returns a row for every catalog badge, earned or not", () => {
    const entries = buildOwnBadgeEntries({
      badges: [earned("inviter", 2, "2026-03-01T00:00:00.000Z")],
      progress: [{ id: "inviter", nextThreshold: 50, tier: 2, value: 12 }],
    });

    assert.equal(entries.length, BADGE_IDS.length);

    const inviter = entries.find((entry) => entry.id === "inviter");
    assert.equal(inviter?.earned, true);
    assert.equal(inviter?.tier, 2);
    assert.equal(inviter?.earnedAt, "2026-03-01T00:00:00.000Z");
    assert.deepEqual(inviter?.progress, {
      atMaxTier: false,
      id: "inviter",
      nextThreshold: 50,
      ratio: 12 / 50,
      unit: "invite",
      value: 12,
    });

    // A badge nobody can earn yet is still a row (07 §1), locked and silent.
    const supporter = entries.find((entry) => entry.id === "supporter");
    assert.equal(supporter?.earned, false);
    assert.equal(supporter?.tier, 0);
    assert.equal(supporter?.earnedAt, undefined);
    assert.equal(supporter?.progress, null);
  });

  it("shows seconds as hours on a locked row too", () => {
    const entries = buildOwnBadgeEntries({
      badges: [],
      progress: [{ id: "voice", nextThreshold: 36_000, tier: 0, value: 7_200 }],
    });
    const voice = entries.find((entry) => entry.id === "voice");

    assert.equal(voice?.progress?.value, 2);
    assert.equal(voice?.progress?.nextThreshold, 10);
    assert.equal(voice?.earned, false);
  });

  it("groups by family in the documented order and drops empty families", () => {
    const groups = groupBadgesByFamily([
      { id: "voice", tier: 1 },
      { id: "staff", tier: 1 },
      { id: "inviter", tier: 1 },
    ]);

    assert.deepEqual(
      groups.map((group) => group.family),
      ["identity", "contribution", "activity"],
    );
    assert.deepEqual(
      groups.map((group) => group.badges.map((badge) => badge.id)),
      [["staff"], ["inviter"], ["voice"]],
    );
  });

  it("orders inside a family with sortBadges, not with catalog order", () => {
    const [group] = groupBadgesByFamily([
      { id: "veteran", tier: 1 },
      { id: "earlyMember", tier: 1 },
      { id: "staff", tier: 1 },
    ]);

    assert.deepEqual(
      group?.badges.map((badge) => badge.id),
      ["staff", "earlyMember", "veteran"],
    );
  });

  it("covers every family the catalog uses", () => {
    const families = new Set(BADGE_IDS.map((id) => BADGE_CATALOG[id].family));

    for (const family of families) {
      assert.equal(BADGE_FAMILY_ORDER.includes(family), true, family);
    }
    assert.equal(BADGE_FAMILY_ORDER.length, families.size);
  });
});
