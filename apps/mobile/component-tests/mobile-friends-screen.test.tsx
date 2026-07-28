import React from "react";
import { Share, StyleSheet } from "react-native";
import { act, fireEvent } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockMutateAsync = jest.fn();
const mockRefetch = jest.fn();
const mockAcceptRequest = jest.fn();
const mockRejectRequest = jest.fn();
const mockCancelRequest = jest.fn(async () => ({ success: true }));
const mockCreateRequest = jest.fn(async () => ({ request: { id: "request-new" } }));
const mockUnblockFriend = jest.fn();
const mockRemoveFriend = jest.fn();
let mockFriendsQuery: Record<string, unknown>;
let mockUserSearchQuery: Record<string, unknown>;
let mockSuggestionsQuery: Record<string, unknown>;

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    session: { user: { id: "user-1", username: "dogukan" } },
    status: "signed-in",
  }),
}));

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileFriendsQuery: () => mockFriendsQuery,
  useMobileFriendSuggestionsQuery: () => mockSuggestionsQuery,
  useMobileUserSearchQuery: () => mockUserSearchQuery,
  useMobileSocialMutations: () => ({
    acceptRequest: { isPending: false, mutate: mockAcceptRequest },
    blockFriend: { isPending: false, mutate: jest.fn() },
    cancelRequest: { isPending: false, mutateAsync: mockCancelRequest },
    createRequest: { isPending: false, mutateAsync: mockCreateRequest },
    openDM: { isPending: false, mutateAsync: mockMutateAsync },
    rejectRequest: { isPending: false, mutate: mockRejectRequest },
    removeFriend: { isPending: false, mutate: mockRemoveFriend },
    unblockFriend: { isPending: false, mutate: mockUnblockFriend },
    updatePresence: { isPending: false, mutate: jest.fn() },
    updateProfile: { isPending: false, mutate: jest.fn() },
  }),
}));

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  mobileNavigationRef: { isReady: () => false, navigate: jest.fn() },
}));

import { FriendsHub, createFriendsHubStyles } from "../src/social/friends-hub";
import { ToastProvider } from "../src/app/components/kit/toast";
import { lightTheme } from "../src/design/themes";

const ada = { avatarUrl: null, displayName: "Ada Lovelace", id: "user-2", username: "ada" };
const grace = { avatarUrl: null, displayName: "Grace Hopper", id: "user-3", username: "grace" };

function renderHub(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function emptyOverview(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      blocked: [],
      friends: [],
      pending: { incoming: [], outgoing: [] },
      ...overrides,
    },
    isError: false,
    isLoading: false,
    refetch: mockRefetch,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserSearchQuery = { data: { results: [] }, isFetching: false, isLoading: false };
  mockSuggestionsQuery = { data: { suggestions: [] }, isLoading: false };
});

describe("5c friends screen", () => {
  it("groups live friend records by presence and keeps offline rows message-only", async () => {
    mockFriendsQuery = emptyOverview({
      friends: [
        {
          ...ada,
          customStatus: "Odaklanma zamanı",
          id: "friend-online",
          presence: { customStatus: "Odaklanma zamanı", status: "ONLINE" },
          status: "ONLINE",
        },
        {
          ...grace,
          customStatus: null,
          id: "friend-offline",
          presence: { customStatus: null, status: "OFFLINE" },
          status: "OFFLINE",
        },
      ],
    });
    const onBack = jest.fn();
    const onSelectMode = jest.fn();
    const view = await renderHub(
      <FriendsHub mode="friends" onBack={onBack} onSelectMode={onSelectMode} />,
    );

    expect(view.getByTestId("mobile-friends-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-friends-group-online")).toBeTruthy();
    expect(view.getByTestId("mobile-friends-group-offline")).toBeTruthy();
    // §2 "1b": an online row carries message + overflow; an offline row is
    // message-only. The disabled call button the 5c layout used is gone.
    expect(view.getByTestId("mobile-friend-message-friend-online")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-more-friend-online")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-message-friend-offline")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-more-friend-offline")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-friends-back"));
    await fireEvent.press(view.getByTestId("mobile-friends-segment-requests"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSelectMode).toHaveBeenCalledWith("requests");
  });

  it("opens the row menu from the overflow button instead of the conversation", async () => {
    mockFriendsQuery = emptyOverview({
      friends: [
        {
          ...ada,
          customStatus: null,
          id: "friend-online",
          presence: { customStatus: null, status: "ONLINE" },
          status: "ONLINE",
        },
      ],
    });
    const view = await renderHub(<FriendsHub embedded mode="friends" />);

    await fireEvent.press(view.getByTestId("mobile-friend-more-friend-online"));

    // §2 "1b": remove/block must be reachable with a plain tap — the overflow
    // button opens the menu and never falls through to the DM.
    expect(view.getByTestId("mobile-friend-friend-online-options")).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText("Arkadaşlıktan çıkar"));
    expect(mockRemoveFriend).toHaveBeenCalledWith("friend-online");
  });

  it("colours friend presence dots with the web status palette", async () => {
    mockFriendsQuery = emptyOverview({
      friends: [
        {
          avatarUrl: null,
          customStatus: null,
          displayName: null,
          id: "friend-idle",
          presence: { customStatus: null, status: "IDLE" },
          status: "IDLE",
          username: "idle_user",
        },
        {
          avatarUrl: null,
          customStatus: null,
          displayName: null,
          id: "friend-dnd",
          presence: { customStatus: null, status: "DND" },
          status: "DND",
          username: "dnd_user",
        },
      ],
    });
    const view = await renderHub(<FriendsHub mode="friends" />);

    const dotColors = view
      .getAllByTestId("mobile-avatar-status-dot")
      .map(
        (dot) => (dot.props.style as Array<{ backgroundColor?: string }>).at(-1)?.backgroundColor,
      );
    expect(dotColors).toContain(lightTheme.status.warning);
    expect(dotColors).toContain(lightTheme.status.danger);
  });

  it("uses the 5c card and touch geometry from semantic theme tokens", () => {
    const styles = createFriendsHubStyles(lightTheme);

    expect(styles.sectionCard).toMatchObject({
      backgroundColor: lightTheme.surface.card,
      borderColor: lightTheme.border.subtle,
      borderRadius: lightTheme.radii.cardLarge,
      borderWidth: 1,
    });
    expect(styles.headerAction).toMatchObject({
      backgroundColor: lightTheme.accent.action,
      height: lightTheme.sizing.minTouchTarget,
      width: lightTheme.sizing.minTouchTarget,
    });
  });
});

describe("9d requests segment", () => {
  it("shows the invite card, the search hint and the empty incoming state", async () => {
    mockFriendsQuery = emptyOverview();
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    const view = await renderHub(<FriendsHub embedded mode="requests" />);

    expect(view.getByTestId("mobile-friend-search-hint")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-requests-empty")).toBeTruthy();
    expect(view.getByText("Bekleyen istek yok")).toBeTruthy();
    expect(view.getByTestId("mobile-requests-group-incoming")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-search-results")).toBeNull();
    expect(view.queryByTestId("mobile-friend-blocked-toggle")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-friend-invite-card"));

    expect(shareSpy).toHaveBeenCalledWith({
      message: "Whispr'da bana katıl! Kullanıcı adım @dogukan.",
    });
    shareSpy.mockRestore();
  });

  it("debounces the username search and renders a relationship-aware action per row", async () => {
    jest.useFakeTimers();
    mockFriendsQuery = emptyOverview();
    mockUserSearchQuery = {
      data: {
        results: [
          { ...ada, relationship: "none", requestId: null },
          { ...grace, relationship: "outgoing", requestId: "request-9" },
          {
            avatarUrl: null,
            displayName: "Alan",
            id: "user-4",
            relationship: "incoming",
            requestId: "request-10",
            username: "alan",
          },
          {
            avatarUrl: null,
            displayName: "Linus",
            id: "user-5",
            relationship: "friend",
            requestId: null,
            username: "linus",
          },
          {
            avatarUrl: null,
            displayName: "Blocked",
            id: "user-6",
            relationship: "blocked",
            requestId: null,
            username: "blocked_user",
          },
        ],
      },
      isFetching: true,
      isLoading: false,
    };
    const view = await renderHub(<FriendsHub embedded mode="requests" />);

    await act(async () => {
      fireEvent.changeText(view.getByTestId("mobile-friend-search-users-input"), "@ad");
    });
    expect(view.getByTestId("mobile-friend-search-spinner")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(view.getByTestId("mobile-friend-search-row-user-2")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-search-row-user-6")).toBeNull();
    expect(view.getByTestId("mobile-friend-search-message-user-5")).toBeTruthy();
    expect(view.getByText("Arkadaşsınız")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-friend-search-add-user-2"));
    await fireEvent.press(view.getByTestId("mobile-friend-search-cancel-user-3"));
    await fireEvent.press(view.getByTestId("mobile-friend-search-accept-user-4"));

    expect(mockCreateRequest).toHaveBeenCalledWith({ userId: "user-2", username: "ada" });
    expect(mockCancelRequest).toHaveBeenCalledWith({ requestId: "request-9", userId: "user-3" });
    expect(mockAcceptRequest).toHaveBeenCalledWith({
      requestId: "request-10",
      userId: "user-4",
    });
    jest.useRealTimers();
  });

  it("renders pending rows with relative times and wires accept, reject and cancel", async () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);
    mockFriendsQuery = emptyOverview({
      pending: {
        incoming: [
          {
            createdAt: "2026-07-22T10:00:00.000Z",
            id: "request-in",
            receiver: { avatarUrl: null, displayName: "Me", id: "user-1", username: "dogukan" },
            receiverId: "user-1",
            sender: ada,
            senderId: ada.id,
            status: "PENDING",
            updatedAt: "2026-07-22T10:00:00.000Z",
          },
        ],
        outgoing: [
          {
            createdAt: "2026-07-22T11:30:00.000Z",
            id: "request-out",
            receiver: grace,
            receiverId: grace.id,
            sender: { avatarUrl: null, displayName: "Me", id: "user-1", username: "dogukan" },
            senderId: "user-1",
            status: "PENDING",
            updatedAt: "2026-07-22T11:30:00.000Z",
          },
        ],
      },
    });
    const view = await renderHub(<FriendsHub embedded mode="requests" />);

    expect(view.getByTestId("mobile-requests-group-incoming")).toBeTruthy();
    expect(view.getByTestId("mobile-requests-group-outgoing")).toBeTruthy();
    expect(view.getByText("2 saat önce")).toBeTruthy();
    expect(view.getByText("Yanıt bekleniyor · 30 dakika önce")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-requests-empty")).toBeNull();
    // §2 "1c": accept and reject sit side by side, so the row stays one notch tall.
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-friend-request-actions-request-in").props.style),
    ).toMatchObject({ alignItems: "center", flexDirection: "row" });

    await fireEvent.press(view.getByTestId("mobile-friend-request-accept-request-in"));
    await fireEvent.press(view.getByTestId("mobile-friend-request-reject-request-in"));
    await fireEvent.press(view.getByTestId("mobile-friend-request-cancel-request-out"));

    expect(mockAcceptRequest).toHaveBeenCalledWith({ requestId: "request-in", userId: "user-2" });
    expect(mockRejectRequest).toHaveBeenCalledWith({ requestId: "request-in", userId: "user-2" });
    expect(mockCancelRequest).toHaveBeenCalledWith({
      requestId: "request-out",
      userId: "user-3",
    });
    jest.useRealTimers();
  });

  it("keeps the blocked section collapsed until it is opened, then unblocks", async () => {
    mockFriendsQuery = emptyOverview({ blocked: [grace] });
    const view = await renderHub(<FriendsHub embedded mode="requests" />);

    expect(view.getByText("Engellenenler — 1")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-blocked-list")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-friend-blocked-toggle"));
    expect(view.getByTestId("mobile-friend-blocked-list")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-friend-unblock-user-3"));
    expect(mockUnblockFriend).toHaveBeenCalledWith("user-3");
  });

  it("keeps 9d request controls on token colours and 44px touch targets", () => {
    const styles = createFriendsHubStyles(lightTheme);

    expect(styles.requestCircle).toMatchObject({
      height: lightTheme.sizing.minTouchTarget,
      width: lightTheme.sizing.minTouchTarget,
    });
    expect(styles.requestCircleAccept).toMatchObject({
      backgroundColor: lightTheme.accent.action,
      borderColor: lightTheme.accent.action,
    });
    expect(styles.requestCircleReject).toMatchObject({
      backgroundColor: lightTheme.surface.base,
      borderColor: lightTheme.border.subtle,
    });
    expect(styles.rowPill.minHeight).toBe(lightTheme.sizing.minTouchTarget);
    expect(styles.rowPillFilled.backgroundColor).toBe(lightTheme.accent.action);
    expect(styles.inviteCard.backgroundColor).toBe(lightTheme.surface.card);
  });
});
