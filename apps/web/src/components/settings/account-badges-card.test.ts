import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BADGE_CATALOG,
  BADGE_IDS,
  buildOwnBadgeEntries,
  groupBadgesByFamily,
  summarizeOwnBadges,
  type OwnBadgesResponse,
} from "@wizards/types";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { AccountBadgesCard, ACCOUNT_BADGES_TEST_ID } from "./account-badges-card";

const RESPONSE: OwnBadgesResponse = {
  badges: [
    { id: "staff", tier: 1, earnedAt: "2026-08-05T10:00:00.000Z", expiresAt: null },
    { id: "inviter", tier: 2, earnedAt: "2026-07-01T10:00:00.000Z", expiresAt: null },
    { id: "regular", tier: 1, earnedAt: "2026-06-01T10:00:00.000Z", expiresAt: null },
  ],
  progress: [
    { id: "inviter", tier: 2, value: 12, nextThreshold: 50 },
    { id: "regular", tier: 1, value: 63, nextThreshold: 100 },
    { id: "streak", tier: 0, value: 3, nextThreshold: 7 },
    { id: "voice", tier: 0, value: 7_200, nextThreshold: 36_000 },
  ],
};

function render(data: OwnBadgesResponse | null = RESPONSE): string {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, {
      children: React.createElement(AccountBadgesCard, { data }),
      initialLocale: "tr",
      initialMessages: TR_MESSAGES,
    }),
  );
}

describe("AccountBadgesCard", () => {
  it("prints the shared {earned}/{total} counter", () => {
    const summary = summarizeOwnBadges({ badges: RESPONSE.badges });
    const markup = render();

    assert.equal(summary.earned, 3);
    assert.equal(summary.total, BADGE_IDS.length);
    assert.ok(
      markup.includes(
        `data-testid="${ACCOUNT_BADGES_TEST_ID}-summary">${summary.earned}/${summary.total}`,
      ),
      markup,
    );
  });

  it("draws every catalog badge, earned or locked", () => {
    const markup = render();

    for (const id of BADGE_IDS) {
      assert.ok(
        markup.includes(`data-testid="${ACCOUNT_BADGES_TEST_ID}-row-${id}"`),
        `missing row: ${id}`,
      );
    }
  });

  it("puts each badge in the family group the shared grouper picks", () => {
    const entries = buildOwnBadgeEntries(RESPONSE);
    const markup = render();

    for (const section of ["earned", "locked"] as const) {
      const groups = groupBadgesByFamily(
        entries.filter((entry) => entry.earned === (section === "earned")),
      );

      for (const group of groups) {
        assert.ok(
          markup.includes(`data-testid="${ACCOUNT_BADGES_TEST_ID}-${section}-${group.family}"`),
          `missing ${section} group: ${group.family}`,
        );
      }
    }
  });

  it("shows a tier label on an earned row and progress on a locked one", () => {
    const markup = render();

    // `inviter` sits at tier 2, so its catalog tier name is printed.
    assert.ok(markup.includes(BADGE_CATALOG.inviter.copy.tr.tiers?.[1] ?? "—"), markup);
    // `streak` is locked with a counter: progress, and no tier label.
    assert.ok(markup.includes(`data-testid="${ACCOUNT_BADGES_TEST_ID}-progress-streak"`), markup);
    assert.equal(markup.includes(`${ACCOUNT_BADGES_TEST_ID}-tier-streak`), false);
    assert.ok(markup.includes(`3/7 ${TR_MESSAGES["profile.badges.unit.day"]}`), markup);
  });

  it("prints a second badge in hours, never raw seconds", () => {
    const markup = render();

    // Locked `voice` at 7 200 seconds is 2 hours toward a 10 hour threshold.
    assert.ok(markup.includes(`2/10 ${TR_MESSAGES["profile.badges.unit.hour"]}`), markup);
    assert.equal(markup.includes("7200"), false);
    assert.equal(markup.includes("36000"), false);
  });

  it("holds an empty state while the read is in flight", () => {
    const markup = render(null);

    assert.ok(markup.includes(TR_MESSAGES["settings.account.badges.empty"]), markup);
    assert.ok(markup.includes(`data-testid="${ACCOUNT_BADGES_TEST_ID}-summary">0/`), markup);
  });
});
