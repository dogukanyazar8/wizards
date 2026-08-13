import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileNotificationItem } from "@wizards/types";
import { createInitialMobileNotificationRuntimeState } from "../src/notifications/mobile-notification-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockAcceptInvite = jest.fn();
const mockDeclineInvite = jest.fn();
const mockMarkRead = jest.fn();
let mockNotifications: readonly MobileNotificationItem[] = [];
let mockInvitePending = false;

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          enabled: () => gesture,
          onEnd: () => gesture,
          onUpdate: () => gesture,
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {} }),
}));

jest.mock("../src/notifications/mobile-notification-query", () => ({
  useMobileHasAnyNotification: () => mockNotifications.length > 0,
  useMobileNotificationMutations: () => ({
    clearAll: { isPending: false, mutate: jest.fn(), mutateAsync: jest.fn() },
    markAllRead: { isPending: false, mutate: jest.fn() },
    markRead: { mutate: mockMarkRead },
  }),
  useMobileNotificationsQuery: () => ({
    data: {
      pages: [
        {
          notifications: mockNotifications,
          unreadCount: mockNotifications.filter((notification) => !notification.read).length,
        },
      ],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileSocialMutations: () => ({
    acceptRequest: { isPending: false, mutate: jest.fn() },
    rejectRequest: { isPending: false, mutate: jest.fn() },
  }),
}));

jest.mock("../src/query/use-mobile-server-management-mutations", () => ({
  useMobileServerManagementMutations: () => ({
    acceptInvite: { isPending: mockInvitePending, mutate: mockAcceptInvite },
    declineInvite: { isPending: mockInvitePending, mutate: mockDeclineInvite },
  }),
}));

import { NotificationsScreen } from "../src/app/screens/notifications-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

const labels = mobileCopy.tr;
const INVITE_ID = "00000000-0000-4000-8000-000000000010";

function inviteNotification(
  overrides: Partial<MobileNotificationItem> = {},
): MobileNotificationItem {
  return {
    actionUrl: "/invite/safe_code-1",
    actor: { avatarUrl: null, displayName: "Doğukan", id: "user-1", username: "dogukanyazar" },
    body: "Doğukan seni Mobile Test sunucusuna davet etti.",
    channel: null,
    createdAt: "2026-07-16T11:00:00.000Z",
    eventKind: null,
    friendRequestId: null,
    id: INVITE_ID,
    messageQuote: null,
    read: false,
    readAt: null,
    server: { id: "server-1", name: "Mobile Test" },
    serverInviteCode: "safe_code-1",
    type: "SERVER_INVITE",
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <NotificationsScreen
      bootstrapState={{ status: "ready" } as never}
      notificationState={createInitialMobileNotificationRuntimeState()}
      onJoinVoiceNotification={jest.fn(async () => undefined)}
      onOpenNotification={jest.fn()}
      onRefreshBootstrap={jest.fn()}
      onRefreshVisibleData={jest.fn()}
      onRequestNotificationPermission={jest.fn(async () => undefined)}
      permissionReadiness={[]}
      permissionSummary={{} as never}
      syncHealth={{} as never}
    />,
  );
}

describe("server invite notification actions", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
    jest.clearAllMocks();
    mockNotifications = [inviteNotification()];
    mockInvitePending = false;
  });

  it("offers join and decline while the targeted invite is still open", async () => {
    const view = await renderScreen();

    expect(view.getByTestId(`mobile-notification-invite-accept-${INVITE_ID}`)).toBeTruthy();
    expect(view.getByTestId(`mobile-notification-invite-decline-${INVITE_ID}`)).toBeTruthy();
    expect(view.getByText(labels.notificationsAcceptServerInvite)).toBeTruthy();
    expect(view.getByText(labels.notificationsDeclineServerInvite)).toBeTruthy();
  });

  it("offers nothing once the invite is spent, revoked or expired", async () => {
    mockNotifications = [inviteNotification({ serverInviteCode: null })];
    const view = await renderScreen();

    expect(view.getByTestId(`mobile-notification-${INVITE_ID}`)).toBeTruthy();
    expect(view.queryByTestId(`mobile-notification-invite-accept-${INVITE_ID}`)).toBeNull();
    expect(view.queryByTestId(`mobile-notification-invite-decline-${INVITE_ID}`)).toBeNull();
  });

  it("declines by redemption code and marks the row read on the way", async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mobile-notification-invite-decline-${INVITE_ID}`));

    expect(mockDeclineInvite).toHaveBeenCalledWith({ code: "safe_code-1" });
    expect(mockAcceptInvite).not.toHaveBeenCalled();
    expect(mockMarkRead).toHaveBeenCalledWith(mockNotifications[0]);
  });

  it("accepts by the same code, which is what turns the invite into membership", async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mobile-notification-invite-accept-${INVITE_ID}`));

    expect(mockAcceptInvite).toHaveBeenCalledWith({ code: "safe_code-1" });
    expect(mockDeclineInvite).not.toHaveBeenCalled();
  });

  it("blocks both actions while one is in flight, so an invite is answered once", async () => {
    mockInvitePending = true;
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mobile-notification-invite-accept-${INVITE_ID}`));
    await fireEvent.press(view.getByTestId(`mobile-notification-invite-decline-${INVITE_ID}`));

    expect(mockAcceptInvite).not.toHaveBeenCalled();
    expect(mockDeclineInvite).not.toHaveBeenCalled();
  });

  it("leaves a friend request on its own actions, not the invite ones", async () => {
    mockNotifications = [
      inviteNotification({
        friendRequestId: "request-1",
        serverInviteCode: null,
        type: "FRIEND_REQUEST",
      }),
    ];
    const view = await renderScreen();

    expect(view.getByTestId(`mobile-notification-friend-accept-${INVITE_ID}`)).toBeTruthy();
    expect(view.queryByTestId(`mobile-notification-invite-accept-${INVITE_ID}`)).toBeNull();
  });
});
