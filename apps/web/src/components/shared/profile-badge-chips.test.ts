import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BADGE_CATALOG,
  BADGE_IDS,
  splitBadgesForCard,
  type BadgeTint,
  type EarnedBadge,
} from "@wizards/types";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { WIZARDS_THEMES, LEGACY_THEME_ALIASES } from "@/lib/appearance";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import {
  BADGE_LUCIDE_ICON,
  BADGE_TINT_VARIABLES,
  PROFILE_BADGE_CHIP_SIZE,
  ProfileBadgeChips,
} from "./profile-badge-chips";

const GLOBALS_CSS_PATH = fileURLToPath(new URL("../../app/globals.css", import.meta.url));

/** Five badges spanning the priority list, deliberately out of order. */
const FIXTURE_BADGES: EarnedBadge[] = [
  { id: "veteran", tier: 3, earnedAt: "2024-01-01T00:00:00.000Z", expiresAt: null },
  { id: "supporter", tier: 1, earnedAt: "2025-06-01T00:00:00.000Z", expiresAt: null },
  { id: "staff", tier: 1, earnedAt: "2026-02-01T00:00:00.000Z", expiresAt: null },
  { id: "earlyMember", tier: 1, earnedAt: "2024-03-01T00:00:00.000Z", expiresAt: null },
  { id: "verified", tier: 1, earnedAt: "2025-01-01T00:00:00.000Z", expiresAt: null },
];

const EXPECTED_TINTS: BadgeTint[] = [
  "amber",
  "blue",
  "green",
  "lavender",
  "neutral",
  "purple",
  "red",
];

function badgeFixture(id: EarnedBadge["id"]): EarnedBadge {
  return { id, tier: 1, earnedAt: "2026-01-01T00:00:00.000Z", expiresAt: null };
}

function renderChips(props: Parameters<typeof ProfileBadgeChips>[0]): string {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, {
      children: React.createElement(ProfileBadgeChips, props),
      initialLocale: "tr",
      initialMessages: TR_MESSAGES,
    }),
  );
}

describe("profile badge chips", () => {
  it("maps every catalog badge to a lucide icon", () => {
    assert.deepEqual(Object.keys(BADGE_LUCIDE_ICON).sort(), [...BADGE_IDS].sort());

    for (const id of BADGE_IDS) {
      // lucide ships `forwardRef` exotic components, so the guard is renderable
      // rather than callable.
      assert.ok(BADGE_LUCIDE_ICON[id], id);
      assert.match(renderChips({ badges: [badgeFixture(id)] }), /<svg/, id);
    }
  });

  it("shows the same three badges, in the same order, as the mobile card", () => {
    const { overflow, visible } = splitBadgesForCard(FIXTURE_BADGES, 3);

    assert.deepEqual(
      visible.map((badge) => badge.id),
      ["staff", "verified", "supporter"],
    );
    assert.equal(overflow, 2);

    const markup = renderChips({ badges: FIXTURE_BADGES });
    const renderedIds = [...markup.matchAll(/data-testid="profile-badge-chips-([a-zA-Z]+)"/g)]
      .map((match) => match[1])
      .filter((id): id is string => Boolean(id) && id !== "overflow");

    assert.deepEqual(renderedIds, ["staff", "verified", "supporter"]);
    assert.match(markup, /data-testid="profile-badge-chips-overflow"/);
    assert.match(markup, /\+2/);
  });

  it("covers the tint union and paints from CSS variables only", () => {
    assert.deepEqual(Object.keys(BADGE_TINT_VARIABLES).sort(), [...EXPECTED_TINTS].sort());

    for (const id of BADGE_IDS) {
      assert.ok(BADGE_TINT_VARIABLES[BADGE_CATALOG[id].tint], id);
    }

    for (const tint of EXPECTED_TINTS) {
      const variables = BADGE_TINT_VARIABLES[tint];
      assert.equal(variables.surface, `var(--badge-${tint}-surface)`);
      assert.equal(variables.border, `var(--badge-${tint}-border)`);
      assert.equal(variables.icon, `var(--badge-${tint}-icon)`);
    }

    const markup = renderChips({ badges: FIXTURE_BADGES });
    assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps the row 28px tall while the badge query is in flight", () => {
    const loadingMarkup = renderChips({ badges: [], loading: true });

    assert.match(loadingMarkup, new RegExp(`height:${PROFILE_BADGE_CHIP_SIZE}px`));
    assert.doesNotMatch(loadingMarkup, /data-testid="profile-badge-chips-[a-zA-Z]/);

    assert.equal(renderChips({ badges: [] }), "");
  });

  it("declares the badge tints for every dark theme", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
    // Only the selector list that opens the dark badge rule, not every theme
    // block that happens to sit above it.
    const darkRuleIndex = css.indexOf("--badge-lavender-surface: #2a2d55");
    const darkBlock = css.slice(css.lastIndexOf("}", darkRuleIndex) + 1, darkRuleIndex);

    assert.doesNotMatch(darkBlock, /html\.theme-light/);

    const darkThemes = WIZARDS_THEMES.filter((theme) => theme.mode === "dark").map(
      (theme) => theme.id,
    );
    const darkAliases = Object.entries(LEGACY_THEME_ALIASES)
      .filter(([alias, target]) => alias.startsWith("theme-") && darkThemes.includes(target))
      .map(([alias]) => alias);

    for (const themeClass of [...darkThemes, ...darkAliases]) {
      assert.match(darkBlock, new RegExp(`html\\.${themeClass},?\\s`), themeClass);
    }
  });
});
