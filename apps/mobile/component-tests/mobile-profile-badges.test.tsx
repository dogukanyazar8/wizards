import React from "react";
import * as ReactNative from "react-native";
import { render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  BADGE_CATALOG,
  BADGE_IDS,
  splitBadgesForCard,
  type BadgeId,
  type EarnedBadge,
} from "@wizards/types";

const mockLocaleRuntime = jest.fn();

jest.mock("../src/app/providers/mobile-locale-provider", () => ({
  useMobileLocaleRuntime: () => mockLocaleRuntime(),
}));

import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { darkTheme, lightTheme } from "../src/design/themes";
import { MOBILE_LINE_ICON_NAMES } from "../src/design/mobile-line-icon-definitions";
import { mobileCopy } from "../src/locale/mobile-copy";
import { ProfileBadgeChips } from "../src/social/profile-badges/profile-badge-chips";
import { PROFILE_BADGE_CHIP_SIZE } from "../src/social/profile-badges/profile-badge-chips.styles";

const TEST_ID = "mobile-profile-badges";

function badge(id: BadgeId, tier = 1, earnedAt = "2026-01-01T00:00:00.000Z"): EarnedBadge {
  return { earnedAt, expiresAt: null, id, tier };
}

function renderChips(props: Partial<React.ComponentProps<typeof ProfileBadgeChips>> = {}) {
  return render(
    <MobileThemeProvider>
      <ProfileBadgeChips badges={props.badges ?? []} {...props} />
    </MobileThemeProvider>,
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }
  return (style as Record<string, unknown> | null) ?? {};
}

beforeEach(() => {
  mockLocaleRuntime.mockReset();
  mockLocaleRuntime.mockReturnValue({ locale: "tr" });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("profile badge chips", () => {
  it("draws one chip per badge and no overflow chip when they all fit", async () => {
    const view = await renderChips({
      badges: [badge("staff"), badge("supporter"), badge("inviter")],
    });

    expect(view.getByTestId(`${TEST_ID}-staff`)).toBeTruthy();
    expect(view.getByTestId(`${TEST_ID}-supporter`)).toBeTruthy();
    expect(view.getByTestId(`${TEST_ID}-inviter`)).toBeTruthy();
    expect(view.queryByTestId(`${TEST_ID}-overflow`)).toBeNull();
  });

  it("keeps three chips and spills the rest into a +N chip", async () => {
    const badges = [
      badge("veteran"),
      badge("inviter"),
      badge("staff"),
      badge("supporter"),
      badge("streak", 2),
    ];
    const view = await renderChips({ badges });
    const { visible } = splitBadgesForCard(badges);

    for (const entry of visible) {
      expect(view.getByTestId(`${TEST_ID}-${entry.id}`)).toBeTruthy();
    }
    expect(visible.map((entry) => entry.id)).toEqual(["staff", "supporter", "streak"]);
    expect(view.queryByTestId(`${TEST_ID}-inviter`)).toBeNull();
    expect(view.queryByTestId(`${TEST_ID}-veteran`)).toBeNull();
    expect(view.getByText("+2")).toBeTruthy();
  });

  /** Same account, same three chips — the order cannot depend on payload order. */
  it("picks the same three chips from a shuffled list", async () => {
    const badges = [
      badge("streak", 2),
      badge("staff"),
      badge("veteran"),
      badge("supporter"),
      badge("inviter"),
    ];
    const view = await renderChips({ badges });

    expect(view.getByTestId(`${TEST_ID}-staff`)).toBeTruthy();
    expect(view.getByTestId(`${TEST_ID}-supporter`)).toBeTruthy();
    expect(view.getByTestId(`${TEST_ID}-streak`)).toBeTruthy();
    expect(view.getByText("+2")).toBeTruthy();
  });

  /**
   * The badge read lands after the profile read. If the row collapsed while it
   * was in flight, every row under it would jump when the badges arrived.
   */
  it("holds the row height while the badges are still loading", async () => {
    const view = await renderChips({ badges: [], loading: true });
    const row = view.getByTestId(TEST_ID);

    expect(flattenStyle(row.props.style).height).toBe(PROFILE_BADGE_CHIP_SIZE);
    expect(view.queryByTestId(`${TEST_ID}-staff`)).toBeNull();
    expect(view.queryByTestId(`${TEST_ID}-overflow`)).toBeNull();
  });

  it("renders nothing at all for a user with no badges", async () => {
    const view = await renderChips({ badges: [], loading: false });

    expect(view.queryByTestId(TEST_ID)).toBeNull();
  });

  it("marks tier 3 with a thicker tinted border and a dot, tier 1 with neither", async () => {
    const view = await renderChips({ badges: [badge("staff"), badge("streak", 3)] });
    const amber = lightTheme.profileBadge.amber;
    const lavender = lightTheme.profileBadge.lavender;

    const tiered = flattenStyle(view.getByTestId(`${TEST_ID}-streak`).props.style);
    expect(tiered.borderWidth).toBe(1.5);
    expect(tiered.borderColor).toBe(amber.icon);
    expect(view.getByTestId(`${TEST_ID}-streak-tier-dot`)).toBeTruthy();

    const plain = flattenStyle(view.getByTestId(`${TEST_ID}-staff`).props.style);
    expect(plain.borderWidth).toBe(1);
    expect(plain.borderColor).toBe(lavender.border);
    expect(view.queryByTestId(`${TEST_ID}-staff-tier-dot`)).toBeNull();
  });

  it("announces the catalog name and tier, in the active language", async () => {
    const turkish = await renderChips({ badges: [badge("staff"), badge("streak", 3)] });

    expect(turkish.getByTestId(`${TEST_ID}-staff`).props.accessibilityLabel).toBe(
      BADGE_CATALOG.staff.copy.tr.name,
    );
    expect(turkish.getByTestId(`${TEST_ID}-streak`).props.accessibilityLabel).toBe(
      `${BADGE_CATALOG.streak.copy.tr.name} · ${BADGE_CATALOG.streak.copy.tr.tiers?.[2]}`,
    );
    await turkish.unmount();

    mockLocaleRuntime.mockReturnValue({ locale: "en" });
    const english = await renderChips({ badges: [badge("staff")] });

    expect(english.getByTestId(`${TEST_ID}-staff`).props.accessibilityLabel).toBe(
      BADGE_CATALOG.staff.copy.en.name,
    );
    expect(BADGE_CATALOG.staff.copy.en.name).not.toBe(BADGE_CATALOG.staff.copy.tr.name);
  });

  it("takes its chip surface from the dark token family in the dark theme", async () => {
    const light = await renderChips({ badges: [badge("staff")] });
    expect(flattenStyle(light.getByTestId(`${TEST_ID}-staff`).props.style).backgroundColor).toBe(
      lightTheme.profileBadge.lavender.surface,
    );
    await light.unmount();

    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");
    const dark = await renderChips({ badges: [badge("staff")] });
    const surface = flattenStyle(dark.getByTestId(`${TEST_ID}-staff`).props.style).backgroundColor;

    expect(surface).toBe(darkTheme.profileBadge.lavender.surface);
    expect(surface).not.toBe(lightTheme.profileBadge.lavender.surface);
  });

  /**
   * The catalog stores glyphs as strings, so this is what keeps the chip from
   * silently falling back to `star` for a badge whose icon was never drawn.
   */
  it("resolves every catalog glyph to a real line icon", () => {
    const names = new Set<string>(MOBILE_LINE_ICON_NAMES);
    const missing = BADGE_IDS.filter((id) => !names.has(BADGE_CATALOG[id].glyph));

    expect(missing).toEqual([]);
  });

  it("keeps the overflow label on the frame string, not a hardcoded plus", () => {
    expect(mobileCopy.tr.profileBadgesOverflow).toBe("+{count}");
    expect(mobileCopy.en.profileBadgesOverflow).toBe("+{count}");
  });
});
