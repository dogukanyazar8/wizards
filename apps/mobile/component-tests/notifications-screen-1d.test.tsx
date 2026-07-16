import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileNotificationItem } from "@wizards/types";
import { createNotificationsScreenStyles } from "../src/app/screens/notifications-screen.styles";
import { lightTheme } from "../src/design/themes";
import {
  createInitialMobileNotificationRuntimeState,
  createRegisteredMobileNotificationRuntimeState,
} from "../src/notifications/mobile-notification-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockMarkAllRead = jest.fn();
const mockMarkRead = jest.fn();
const mockRefetch = jest.fn();
let mockNotifications: readonly MobileNotificationItem[] = [];
let mockQueryState = { isError: false, isLoading: false, isRefetching: false };

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {} }),
}));

jest.mock("../src/notifications/mobile-notification-query", () => ({
  useMobileNotificationMutations: () => ({
    markAllRead: { isPending: false, mutate: mockMarkAllRead },
    markRead: { mutate: mockMarkRead },
  }),
  useMobileNotificationsQuery: () => ({
    data: { pages: [{ notifications: mockNotifications }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    refetch: mockRefetch,
    ...mockQueryState,
  }),
}));

import { NotificationsScreen } from "../src/app/screens/notifications-screen";

const mention: MobileNotificationItem = {
  actionUrl: "/channels/server-1/channel-1",
  actor: { avatarUrl: null, displayName: "Ada", id: "user-1", username: "ada" },
  body: "Ada seni etiketledi",
  channel: { id: "channel-1", name: "general" },
  createdAt: "2026-07-16T10:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  messageQuote: { id: "message-1", preview: "Lütfen buna bak" },
  read: false,
  readAt: null,
  server: { id: "server-1", name: "Whispr" },
  type: "MENTION",
};

const yesterdayInvite: MobileNotificationItem = {
  ...mention,
  createdAt: "2026-07-15T10:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000002",
  type: "SERVER_INVITE",
};

const voiceRoomStarted: MobileNotificationItem = {
  ...mention,
  eventKind: "voice-room-started",
  id: "00000000-0000-4000-8000-000000000003",
  type: "SYSTEM",
};

function renderScreen(overrides: Record<string, unknown> = {}) {
  return render(
    <NotificationsScreen
      bootstrapState={{ status: "ready" } as never}
      notificationState={createInitialMobileNotificationRuntimeState()}
      onRefreshBootstrap={jest.fn()}
      onRefreshVisibleData={jest.fn()}
      onRequestNotificationPermission={jest.fn(async () => undefined)}
      permissionReadiness={[]}
      permissionSummary={{} as never}
      syncHealth={{} as never}
      {...(overrides as never)}
    />,
  );
}

describe("1d notifications screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifications = [];
    mockQueryState = { isError: false, isLoading: false, isRefetching: false };
  });

  it("requests native notification permission only after the explicit CTA press", async () => {
    const onRequestNotificationPermission = jest.fn(async () => undefined);
    const view = await renderScreen({ onRequestNotificationPermission });

    expect(onRequestNotificationPermission).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("mobile-notifications-request-permission"));
    expect(onRequestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it("hides the permission card when the real native registration state is complete", async () => {
    const view = await renderScreen({
      notificationState: createRegisteredMobileNotificationRuntimeState(
        { registeredAt: "2026-07-16T10:00:00.000Z", tokenFingerprint: "fingerprint" },
        Date.now(),
      ),
    });

    expect(view.queryByTestId("mobile-notifications-request-permission")).toBeNull();
  });

  it("marks every real unread notification read through the existing mutation", async () => {
    mockNotifications = [mention];
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-notifications-mark-all-read"));
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("groups real notifications by today and yesterday", async () => {
    mockNotifications = [mention, yesterdayInvite];
    const view = await renderScreen();

    expect(view.getByText("BUGÜN")).toBeTruthy();
    expect(view.getByText("DÜN")).toBeTruthy();
  });

  it("marks an unread notification read before opening its safe route", async () => {
    const onOpenNotification = jest.fn();
    mockNotifications = [mention];
    const view = await renderScreen({ onOpenNotification });

    await fireEvent.press(view.getByTestId(`mobile-notification-${mention.id}`));

    expect(mockMarkRead).toHaveBeenCalledWith(mention.id);
    expect(onOpenNotification).toHaveBeenCalledWith(mention.actionUrl);
  });

  it("renders a real actor avatar and mention badge instead of a fabricated identity", async () => {
    mockNotifications = [mention];
    const view = await renderScreen();

    expect(view.getByTestId(`mobile-notification-avatar-${mention.id}`)).toBeTruthy();
    expect(view.getByTestId(`mobile-notification-mention-badge-${mention.id}`)).toBeTruthy();
  });

  it("starts a real voice join only from the explicit notification join chip", async () => {
    const onJoinVoiceNotification = jest.fn(async () => undefined);
    mockNotifications = [voiceRoomStarted];
    const view = await renderScreen({ onJoinVoiceNotification });

    expect(view.getByTestId(`mobile-notification-voice-icon-${voiceRoomStarted.id}`)).toBeTruthy();
    expect(view.queryByTestId(`mobile-notification-avatar-${voiceRoomStarted.id}`)).toBeNull();
    expect(onJoinVoiceNotification).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId(`mobile-notification-voice-join-${voiceRoomStarted.id}`));
    expect(onJoinVoiceNotification).toHaveBeenCalledWith(voiceRoomStarted);
  });

  it("shows skeleton rows with the real notification geometry while loading", async () => {
    mockQueryState = { isError: false, isLoading: true, isRefetching: false };
    const view = await renderScreen();

    expect(view.getByTestId("mobile-notifications-loading-skeleton")).toBeTruthy();
  });

  it("uses the required Turkish empty-state copy when the real feed is empty", async () => {
    const view = await renderScreen();

    expect(view.getByText("Henüz gösterilecek bildirim yok.")).toBeTruthy();
  });

  it("surfaces query failure and reconnecting state through the existing sync retry boundary", async () => {
    mockQueryState = { isError: true, isLoading: false, isRefetching: false };
    const failed = await renderScreen({
      syncHealth: { failedSources: [], failureCount: 0, isRefreshing: false, status: "healthy" },
    });
    expect(failed.getByTestId("mobile-notifications-sync-status")).toBeTruthy();

    mockQueryState = { isError: false, isLoading: false, isRefetching: true };
    const reconnecting = await renderScreen({
      syncHealth: { failedSources: [], failureCount: 0, isRefreshing: true, status: "healthy" },
    });
    expect(reconnecting.getByTestId("mobile-notifications-sync-status")).toBeTruthy();
  });

  it("locks the 1d permission card and unread-card geometry to theme roles", () => {
    const styles = createNotificationsScreenStyles(lightTheme);

    expect(styles.notificationsTitle).toMatchObject({ fontSize: 26, letterSpacing: -0.52 });
    expect(styles.notificationPermissionCard).toMatchObject({
      borderRadius: 20,
      marginHorizontal: 20,
    });
    expect(styles.notificationFeedRowUnread).toMatchObject({
      borderRadius: 18,
      borderWidth: 1,
    });
    expect(styles.notificationUnreadDot).toMatchObject({ height: 8, width: 8 });
  });
});
