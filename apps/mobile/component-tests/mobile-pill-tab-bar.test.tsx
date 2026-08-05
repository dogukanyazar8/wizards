import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import {
  createMobileBottomTabBarStyles,
  MobileBottomTabBar,
} from "../src/navigation/mobile-bottom-tab-bar";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockSelection = jest.fn();

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({ selection: mockSelection }),
}));

const routes = [
  { key: "overview-key", name: "overview" },
  { key: "messages-key", name: "messages" },
  { key: "notifications-key", name: "notifications" },
  { key: "settings-key", name: "settings" },
] as const;

function createProps(index: number, unread = 0, notificationUnread = 0) {
  return {
    bottomSafeAreaInset: 18,
    descriptors: {} as never,
    directMessageUnreadCount: unread,
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    } as never,
    notificationUnreadCount: notificationUnread,
    state: { index, routes } as never,
  };
}

function wrapTabBar(props: ReturnType<typeof createProps>) {
  return (
    <MobileThemeProvider>
      <MobileLocaleProvider>
        <MobileBottomTabBar {...props} />
      </MobileLocaleProvider>
    </MobileThemeProvider>
  );
}

describe("mobile redesign edge-to-edge tab bar", () => {
  it("renders four canonical tabs and counts the waiting direct messages", async () => {
    const props = createProps(0, 3);
    const view = await render(<MobileBottomTabBar {...props} />);

    for (const tab of ["overview", "messages", "notifications", "settings"]) {
      expect(view.getByTestId(`mobile-bottom-tab-${tab}`)).toBeTruthy();
    }
    expect(view.queryByTestId("mobile-bottom-tab-voice")).toBeNull();
    expect(view.getByTestId("mobile-bottom-tab-messages-badge")).toBeTruthy();
    expect(view.getByText("3")).toBeTruthy();
    // Aktiflik yalnızca renk/ağırlıkla belirtilir; arka plan kutusu (pill) yok.
    expect(view.getByTestId("mobile-bottom-tab-overview").props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
    );
    // Bar, safe-area insetini kendi yüzeyinin içinde 15px tabana ekleyerek kapatır.
    expect(view.getByTestId("mobile-bottom-tab-bar").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 15 + 18 })]),
    );
  });

  it("uses canonical active-tab presentation tokens", () => {
    const styles = createMobileBottomTabBarStyles(lightTheme);
    const source = readFileSync(
      join(process.cwd(), "src", "navigation", "mobile-bottom-tab-bar.tsx"),
      "utf8",
    );

    expect(styles.bottomNavSurface).toEqual(
      expect.objectContaining({
        backgroundColor: lightTheme.surface.card,
        borderTopColor: lightTheme.border.tabBarTop,
        borderTopWidth: 1,
        gap: 2,
        paddingHorizontal: 8,
        paddingTop: 8,
      }),
    );
    expect(styles.bottomNavSurface).not.toHaveProperty("borderRadius");
    expect(styles.bottomNavSurface).not.toHaveProperty("marginHorizontal");
    expect(styles.navButton).toEqual(
      expect.objectContaining({
        borderRadius: 14,
        minHeight: lightTheme.sizing.minTouchTarget,
        paddingVertical: 5,
      }),
    );
    expect(styles.navLabelActive).toEqual(
      expect.objectContaining({
        color: lightTheme.accent.tabActive,
        fontFamily: lightTheme.typography.fontFamilyBold,
      }),
    );
    expect(styles.navLabel).toEqual(
      expect.objectContaining({
        color: lightTheme.text.visualFaint,
        fontFamily: lightTheme.typography.fontFamilySemiBold,
        fontSize: 10.5,
        includeFontPadding: false,
        lineHeight: 13,
      }),
    );
    expect(styles.navVisualWrap).toEqual(expect.objectContaining({ height: 22, width: 22 }));
    expect(styles.navVisualWrap).not.toHaveProperty("position");
    expect(source).toContain("color={isActive ? theme.accent.tabActive : theme.text.visualFaint}");
    expect(source).toContain("size={22}");
  });

  it("counts every waiting notification on the notifications tab", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 0, 4)} />);

    expect(view.getByTestId("mobile-bottom-tab-notifications-badge")).toBeTruthy();
    expect(view.getByText("4")).toBeTruthy();
    // Each counter answers for its own tab: a caught-up inbox stays unmarked.
    expect(view.queryByTestId("mobile-bottom-tab-messages-badge")).toBeNull();
  });

  it("caps both counters instead of widening the tab", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 250, 250)} />);

    expect(view.getAllByText("99+")).toHaveLength(2);
  });

  it("drops each badge once its own surface is caught up", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 3, 0)} />);

    expect(view.queryByTestId("mobile-bottom-tab-notifications-badge")).toBeNull();
    expect(view.getByTestId("mobile-bottom-tab-messages-badge")).toBeTruthy();
    expect(view.getByText("3")).toBeTruthy();
  });

  /**
   * One badge shape for both tabs: two different counters in one bar would read
   * as two different kinds of urgency.
   */
  it("draws both counters from the one canonical badge", () => {
    const styles = createMobileBottomTabBarStyles(lightTheme);

    expect(styles).not.toHaveProperty("navUnreadDot");
    expect(styles.navUnreadBadge).toEqual(
      expect.objectContaining({
        backgroundColor: "#E05252",
        height: 16,
        minWidth: 16,
        position: "absolute",
      }),
    );
    expect(styles.navUnreadBadgeText).toEqual(
      expect.objectContaining({
        color: lightTheme.text.onPrimary,
        fontFamily: lightTheme.typography.fontFamilyExtraBold,
        fontSize: 9,
      }),
    );
  });

  it("names each counter for the surface it speaks for", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 2, 5)} />);

    expect(view.getByTestId("mobile-bottom-tab-messages-badge").props.accessibilityLabel).toBe(
      mobileCopy.tr.messagesUnreadBadgeLabel.replace("{count}", "2"),
    );
    expect(view.getByTestId("mobile-bottom-tab-notifications-badge").props.accessibilityLabel).toBe(
      mobileCopy.tr.notificationsUnreadBadgeLabel.replace("{count}", "5"),
    );
  });

  it("emits haptics only after a non-prevented tab selection completes", async () => {
    mockSelection.mockClear();
    const props = createProps(0);
    const view = await render(<MobileBottomTabBar {...props} />);

    await fireEvent.press(view.getByTestId("mobile-bottom-tab-overview"));
    expect(mockSelection).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId("mobile-bottom-tab-messages"));
    expect(mockSelection).not.toHaveBeenCalled();
    expect(props.navigation.navigate).toHaveBeenCalledWith("messages", undefined);

    await view.rerender(wrapTabBar(createProps(1)));
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });
});
