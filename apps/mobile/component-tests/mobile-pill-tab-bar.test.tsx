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
  it("renders four canonical tabs with a dot-only typed DM unread indicator", async () => {
    const props = createProps(0, 3);
    const view = await render(<MobileBottomTabBar {...props} />);

    for (const tab of ["overview", "messages", "notifications", "settings"]) {
      expect(view.getByTestId(`mobile-bottom-tab-${tab}`)).toBeTruthy();
    }
    expect(view.queryByTestId("mobile-bottom-tab-voice")).toBeNull();
    expect(view.getByTestId("mobile-bottom-tab-unread-dot")).toBeTruthy();
    expect(view.queryByText("3")).toBeNull();
    // Aktiflik yalnızca renk/ağırlıkla belirtilir; arka plan kutusu (pill) yok.
    expect(view.getByTestId("mobile-bottom-tab-overview").props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
    );
    // Bar, safe-area insetini kendi yüzeyinin içinde 15px tabana ekleyerek kapatır.
    expect(view.getByTestId("mobile-bottom-tab-bar").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 15 + 18 })]),
    );
  });

  it("uses canonical active-tab and unread-dot presentation tokens", () => {
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
    expect(styles.navUnreadDot).toEqual(
      expect.objectContaining({
        backgroundColor: "#E05252",
        borderColor: lightTheme.border.onSurfaceRing,
        borderWidth: 2,
        right: 22,
        top: 5,
      }),
    );
    expect(styles.navVisualWrap).toEqual(expect.objectContaining({ height: 22, width: 22 }));
    expect(styles.navVisualWrap).not.toHaveProperty("position");
    expect(source).toContain("color={isActive ? theme.accent.tabActive : theme.text.visualFaint}");
    expect(source).toContain("size={22}");
  });

  it("counts every waiting notification on the notifications tab", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 0, 4)} />);

    const badge = view.getByTestId("mobile-bottom-tab-notification-badge");
    expect(badge).toBeTruthy();
    expect(view.getByText("4")).toBeTruthy();
    // The counter belongs to the bell, never to messages.
    expect(view.queryByTestId("mobile-bottom-tab-unread-dot")).toBeNull();
  });

  it("caps the notification counter instead of widening the tab", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 0, 250)} />);

    expect(view.getByText("99+")).toBeTruthy();
  });

  it("drops the notification badge once the feed is caught up", async () => {
    const view = await render(<MobileBottomTabBar {...createProps(0, 3, 0)} />);

    expect(view.queryByTestId("mobile-bottom-tab-notification-badge")).toBeNull();
    expect(view.getByTestId("mobile-bottom-tab-unread-dot")).toBeTruthy();
  });

  it("keeps the notification badge on the canonical danger token", () => {
    const styles = createMobileBottomTabBarStyles(lightTheme);

    expect(styles.navNotificationBadge).toEqual(
      expect.objectContaining({
        backgroundColor: "#E05252",
        height: 16,
        minWidth: 16,
        position: "absolute",
      }),
    );
    expect(styles.navNotificationBadgeText).toEqual(
      expect.objectContaining({
        color: lightTheme.text.onPrimary,
        fontFamily: lightTheme.typography.fontFamilyExtraBold,
        fontSize: 9,
      }),
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
