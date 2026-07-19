import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockMutateAsync = jest.fn();
const mockRefetch = jest.fn();
let mockFriendsQuery: Record<string, unknown>;

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {}, status: "signed-in" }),
}));

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileFriendsQuery: () => mockFriendsQuery,
  useMobileSocialMutations: () => ({
    acceptRequest: { isPending: false, mutate: jest.fn() },
    blockFriend: { isPending: false, mutate: jest.fn() },
    createRequest: { isPending: false, mutateAsync: mockMutateAsync },
    openDM: { isPending: false, mutateAsync: mockMutateAsync },
    rejectRequest: { isPending: false, mutate: jest.fn() },
    removeFriend: { isPending: false, mutate: jest.fn() },
    unblockFriend: { isPending: false, mutate: jest.fn() },
    updatePresence: { isPending: false, mutate: jest.fn() },
    updateProfile: { isPending: false, mutate: jest.fn() },
  }),
}));

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  mobileNavigationRef: { isReady: () => false, navigate: jest.fn() },
}));

import { FriendsHub, createFriendsHubStyles } from "../src/social/friends-hub";
import { lightTheme } from "../src/design/themes";

describe("5c friends screen", () => {
  it("groups live friend records by presence and keeps offline rows message-only", async () => {
    mockFriendsQuery = {
      data: {
        blocked: [],
        friends: [
          {
            avatarUrl: null,
            customStatus: "Odaklanma zamanı",
            displayName: "Ada Lovelace",
            id: "friend-online",
            presence: { customStatus: "Odaklanma zamanı", status: "ONLINE" },
            status: "ONLINE",
            username: "ada",
          },
          {
            avatarUrl: null,
            customStatus: null,
            displayName: "Grace Hopper",
            id: "friend-offline",
            presence: { customStatus: null, status: "OFFLINE" },
            status: "OFFLINE",
            username: "grace",
          },
        ],
        pending: { incoming: [], outgoing: [] },
      },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    };
    const onBack = jest.fn();
    const onSelectMode = jest.fn();
    const view = await render(
      <FriendsHub mode="friends" onBack={onBack} onSelectMode={onSelectMode} />,
    );

    expect(view.getByTestId("mobile-friends-screen")).toBeTruthy();
    expect(view.getByText("ÇEVRİMİÇİ — 1")).toBeTruthy();
    expect(view.getByText("ÇEVRİMDIŞI — 1")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-message-friend-online")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-voice-friend-online")).toBeTruthy();
    expect(view.getByTestId("mobile-friend-message-friend-offline")).toBeTruthy();
    expect(view.queryByTestId("mobile-friend-voice-friend-offline")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-friends-back"));
    await fireEvent.press(view.getByTestId("mobile-friends-segment-requests"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSelectMode).toHaveBeenCalledWith("requests");
  });

  it("colours friend presence dots with the web status palette", async () => {
    mockFriendsQuery = {
      data: {
        blocked: [],
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
        pending: { incoming: [], outgoing: [] },
      },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    };
    const view = await render(<FriendsHub mode="friends" />);

    const dotColors = view
      .getAllByTestId("mobile-avatar-status-dot")
      .map((dot) => (dot.props.style as Array<{ backgroundColor?: string }>).at(-1)?.backgroundColor);
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
