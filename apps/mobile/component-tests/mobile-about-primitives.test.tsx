import React from "react";
import { Text } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";
import {
  AboutBrandLogo,
  AboutCard,
  AboutRow,
  AboutSearchField,
  AboutStickyFooterButton,
  AboutToggle,
  AboutTypePill,
  resolveAboutBrandLogoRadius,
} from "../src/app/screens/about/about-primitives";

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flatten(entry) }),
      {},
    );
  }

  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

describe("about primitives", () => {
  it("pads a subtitled row tighter than a single-line row and clears 44px", async () => {
    const view = await render(
      <AboutCard>
        <AboutRow isFirst testID="row-plain" title="Güncelleme kanalı" value="UAT" />
        <AboutRow
          subtitle="Yeni özellikleri iki hafta önce dene"
          testID="row-subtitled"
          title="Beta programı"
        />
      </AboutCard>,
    );

    const plain = flatten(view.getByTestId("row-plain").props.style);
    const subtitled = flatten(view.getByTestId("row-subtitled").props.style);

    expect(plain.paddingVertical).toBe(13);
    expect(subtitled.paddingVertical).toBe(11);
    expect(plain.minHeight).toBe(mobileAboutMetrics.minRowHeight);
    expect(subtitled.minHeight).toBe(mobileAboutMetrics.minRowHeight);
  });

  it("draws the hairline on every row except the first", async () => {
    const view = await render(
      <AboutCard>
        <AboutRow isFirst testID="row-first" title="Kullanım şartları" />
        <AboutRow testID="row-second" title="Gizlilik politikası" />
      </AboutCard>,
    );

    expect(flatten(view.getByTestId("row-first").props.style).borderTopWidth).toBeUndefined();
    expect(flatten(view.getByTestId("row-second").props.style).borderTopWidth).toBe(1);
  });

  it("announces a tappable row as a button and an informational row as neither", async () => {
    const onPress = jest.fn();
    const view = await render(
      <AboutCard>
        <AboutRow isFirst onPress={onPress} testID="row-action" title="Yardım merkezi" />
        <AboutRow testID="row-static" title="Servis durumu" />
      </AboutCard>,
    );

    await fireEvent.press(view.getByTestId("row-action"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("row-action").props.accessibilityRole).toBe("button");
    expect(view.getByTestId("row-static").props.accessibilityRole).toBeUndefined();
  });

  it("pins the type pill to 62px and matches each variant to its handoff colours", async () => {
    const view = await render(
      <>
        <AboutTypePill label="YENİ" testID="pill-new" variant="new" />
        <AboutTypePill label="İYİLEŞTİ" testID="pill-improved" variant="improved" />
        <AboutTypePill label="DÜZELDİ" testID="pill-fixed" variant="fixed" />
        <AboutTypePill label="YENİ · 2" testID="pill-auto" variant="new" width="auto" />
      </>,
    );

    for (const testID of ["pill-new", "pill-improved", "pill-fixed"]) {
      expect(flatten(view.getByTestId(testID).props.style)).toMatchObject({
        height: 20,
        width: mobileAboutMetrics.typePillWidth,
      });
    }
    // 2a lets the chip size to its label; only 1c needs the fixed column.
    expect(flatten(view.getByTestId("pill-auto").props.style).width).toBeUndefined();

    expect(flatten(view.getByTestId("pill-new").props.style).backgroundColor).toBe(
      lightTheme.about.accentChipSurface,
    );
    expect(flatten(view.getByTestId("pill-improved").props.style).backgroundColor).toBe(
      lightTheme.about.successChipSurface,
    );
    expect(flatten(view.getByTestId("pill-fixed").props.style).backgroundColor).toBe(
      lightTheme.about.warningChipSurface,
    );

    expect(flatten(view.getByText("YENİ").props.style).color).toBe(lightTheme.about.accent);
    expect(flatten(view.getByText("İYİLEŞTİ").props.style).color).toBe(
      lightTheme.about.successText,
    );
    expect(flatten(view.getByText("DÜZELDİ").props.style).color).toBe(lightTheme.about.warningText);
  });

  it("does not fire the sticky footer button while it is disabled", async () => {
    const onPress = jest.fn();
    // One tree, not two renders: RNTL keeps only the most recently mounted root
    // live, so pressing into an earlier one silently does nothing.
    const view = await render(
      <>
        <AboutStickyFooterButton
          disabled
          label="Kanalı kaydet"
          onPress={onPress}
          testID="footer-button"
        />
        <AboutStickyFooterButton label="Raporu gönder" onPress={onPress} testID="footer-enabled" />
      </>,
    );

    await fireEvent.press(view.getByTestId("footer-button"));
    expect(onPress).not.toHaveBeenCalled();
    expect(flatten(view.getByTestId("footer-button").props.style).opacity).toBe(0.45);

    await fireEvent.press(view.getByTestId("footer-enabled"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the search placeholder off the icon tint and reports every keystroke", async () => {
    const onChangeText = jest.fn();
    const view = await render(
      <AboutSearchField
        onChangeText={onChangeText}
        placeholder="Sürüm veya özellik ara"
        testID="search-field"
        value=""
      />,
    );

    const field = view.getByTestId("search-field");
    // §7.22: `#B9BED6` is an icon/border tint, never text.
    expect(field.props.placeholderTextColor).toBe(lightTheme.about.textMuted);
    expect(field.props.placeholderTextColor).not.toBe(lightTheme.about.iconTint);

    await fireEvent.changeText(field, "0.8.15");
    expect(onChangeText).toHaveBeenCalledWith("0.8.15");
  });

  it("moves the toggle knob 18px and reports its state to the switch role", async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <>
        <AboutToggle
          accessibilityLabel="Beta programı"
          onValueChange={onValueChange}
          testID="toggle-off"
          value={false}
        />
        <AboutToggle
          accessibilityLabel="Otomatik güncelle"
          onValueChange={onValueChange}
          testID="toggle-on"
          value
        />
      </>,
    );

    const offTrack = view.getByTestId("toggle-off");
    expect(flatten(offTrack.props.style).width).toBe(mobileAboutMetrics.toggleWidth);
    expect(flatten(offTrack.props.style).height).toBe(mobileAboutMetrics.toggleHeight);
    expect(offTrack.props.accessibilityRole).toBe("switch");
    expect(offTrack.props.accessibilityState).toMatchObject({ checked: false });
    expect(view.getByTestId("toggle-on").props.accessibilityState).toMatchObject({ checked: true });

    // 3px inset either side of a 20px knob in a 44px track: 18px of travel.
    expect(flatten(view.getByTestId("toggle-off-knob").props.style).left).toBe(3);
    expect(flatten(view.getByTestId("toggle-on-knob").props.style).left).toBe(21);

    await fireEvent.press(offTrack);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("draws the brand logo at the handoff's size and radius pairs", async () => {
    expect(resolveAboutBrandLogoRadius(60)).toBe(15);
    expect(resolveAboutBrandLogoRadius(52)).toBe(13);
    expect(resolveAboutBrandLogoRadius(50)).toBe(14);
    expect(resolveAboutBrandLogoRadius(46)).toBe(11.5);

    const view = await render(<AboutBrandLogo size={60} testID="about-brand-logo" />);
    expect(
      view.getByTestId("about-brand-logo", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 60, width: 60 });
    // About owns a measured 60px artwork variant; auth keeps its 52px geometry.
    expect(
      view.getByTestId("about-brand-logo-animated-bar-3", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 30, width: 3.5 });
  });

  it("lets a card carry anything, not only rows", async () => {
    const view = await render(
      <AboutCard padding={16} testID="card">
        <Text>BU SÜRÜMDE</Text>
      </AboutCard>,
    );

    const style = flatten(view.getByTestId("card").props.style);
    expect(style.borderRadius).toBe(mobileAboutMetrics.cardRadius);
    expect(style.padding).toBe(16);
    expect(view.getByText("BU SÜRÜMDE")).toBeTruthy();
  });
});
