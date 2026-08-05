import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BADGE_CATALOG,
  buildBadgeDetailModel,
  formatBadgeProgressValue,
  type BadgeProgress,
  type EarnedBadge,
} from "@wizards/types";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { ProfileBadgeDetail, type ProfileBadgeDetailProps } from "./profile-badge-detail";

const TEST_ID = "profile-badge-detail";
const formatTierLabel = (tier: number) => `Kademe ${tier}`;

const VOICE: EarnedBadge = {
  id: "voice",
  tier: 1,
  earnedAt: "2026-08-05T10:00:00.000Z",
  expiresAt: null,
};

const PROGRESS: BadgeProgress[] = [
  { id: "voice", tier: 1, value: 36_000, nextThreshold: 360_000 },
  { id: "streak", tier: 1, value: 9, nextThreshold: 30 },
];

function renderDetail(props: Partial<ProfileBadgeDetailProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, {
      children: React.createElement(ProfileBadgeDetail, {
        badges: [VOICE],
        isSelf: false,
        onBack: () => undefined,
        request: { badgeId: "voice", kind: "badge" },
        ...props,
      } as ProfileBadgeDetailProps),
      initialLocale: "tr",
      initialMessages: TR_MESSAGES,
    }),
  );
}

/** The order the markup lays the panel's own blocks out in. */
function fieldOrder(markup: string): string[] {
  return [...markup.matchAll(new RegExp(`data-testid="${TEST_ID}-([a-z-]+)"`, "g"))]
    .map((match) => match[1])
    .filter((field): field is string => Boolean(field) && field !== "back" && field !== "badge");
}

describe("profile badge detail", () => {
  /**
   * 06 §1 and 00 §4: a counter on someone else's profile leaks how they use the
   * app, so the selector drops progress unless the viewer is the subject. Both
   * platforms build their surface from this one function.
   */
  it("withholds progress on a peer's profile and fills it on your own", () => {
    const peer = buildBadgeDetailModel({
      badge: VOICE,
      formatTierLabel,
      isSelf: false,
      locale: "tr",
      progress: PROGRESS,
    });
    assert.equal(peer.progress, null);

    const own = buildBadgeDetailModel({
      badge: VOICE,
      formatTierLabel,
      isSelf: true,
      locale: "tr",
      progress: PROGRESS,
    });
    assert.equal(own.progress?.value, 10);
    assert.equal(own.progress?.nextThreshold, 100);
    assert.equal(own.progress?.atMaxTier, false);

    // And the rendered panel obeys it: no bar, no label, nothing to read off.
    const peerMarkup = renderDetail({ isSelf: false, progress: PROGRESS });
    assert.doesNotMatch(peerMarkup, new RegExp(`data-testid="${TEST_ID}-progress"`));
    assert.doesNotMatch(peerMarkup, /10\/100/);

    const ownMarkup = renderDetail({ isSelf: true, progress: PROGRESS });
    assert.match(ownMarkup, new RegExp(`data-testid="${TEST_ID}-progress"`));
    assert.match(ownMarkup, /10\/100 saat/);
  });

  /**
   * The seconds→hours conversion is one function in `@wizards/types`, called by
   * both platforms, so the same account cannot read 36000 in a browser and 10 on
   * a phone.
   */
  it("converts seconds to hours the same way the mobile sheet does", () => {
    assert.deepEqual(formatBadgeProgressValue("voice", 36_000), { unit: "second", value: 10 });
    assert.deepEqual(formatBadgeProgressValue("broadcaster", 18_000), {
      unit: "second",
      value: 5,
    });
    assert.deepEqual(formatBadgeProgressValue("streak", 9), { unit: "day", value: 9 });

    const markup = renderDetail({ isSelf: true, progress: PROGRESS });
    assert.doesNotMatch(markup, /36000|360000/);
  });

  /** 06 kabul kriteri 1: the two platforms show the same fields in the same order. */
  it("lays the fields out in the contract's order", () => {
    const markup = renderDetail({
      badges: [{ ...VOICE, expiresAt: "2027-01-05T00:00:00.000Z" }],
      isSelf: true,
      progress: PROGRESS,
    });

    assert.deepEqual(fieldOrder(markup), [
      "glyph",
      "name",
      "tier",
      "description",
      "earned",
      "expires",
      "progress",
      "progress-fill",
      "progress-label",
    ]);
  });

  it("takes name, description and tier label from the catalog", () => {
    const markup = renderDetail();

    assert.match(markup, new RegExp(BADGE_CATALOG.voice.copy.tr.name));
    assert.match(markup, new RegExp(BADGE_CATALOG.voice.copy.tr.description));
    assert.match(markup, new RegExp(BADGE_CATALOG.voice.copy.tr.tiers?.[0] ?? "Sesli sohbetçi"));
    // A single-tier badge shows no tier line at all.
    const flat = renderDetail({
      badges: [{ id: "staff", tier: 1, earnedAt: VOICE.earnedAt, expiresAt: null }],
      request: { badgeId: "staff", kind: "badge" },
    });
    assert.doesNotMatch(flat, new RegExp(`data-testid="${TEST_ID}-tier"`));
  });

  it("dates the badge by month and year, never by day", () => {
    const markup = renderDetail();
    const earned = /data-testid="profile-badge-detail-earned"[^>]*>([^<]+)</.exec(markup)?.[1];

    assert.ok(earned, "earned line missing");
    assert.match(earned, /2026/);
    assert.doesNotMatch(earned, /\b5\b/);
  });

  /** `+N` shows every badge in the same panel, ordered like the chip row. */
  it("lists every badge in priority order when opened from the overflow chip", () => {
    const markup = renderDetail({
      badges: [
        { id: "veteran", tier: 3, earnedAt: VOICE.earnedAt, expiresAt: null },
        VOICE,
        { id: "staff", tier: 1, earnedAt: VOICE.earnedAt, expiresAt: null },
      ],
      request: { kind: "list" },
    });

    const listed = [
      ...markup.matchAll(new RegExp(`data-testid="${TEST_ID}-list-([a-zA-Z]+)"`, "g")),
    ].map((match) => match[1]);

    assert.deepEqual(listed, ["staff", "voice", "veteran"]);
    assert.doesNotMatch(markup, new RegExp(`data-testid="${TEST_ID}-name"`));
  });
});
