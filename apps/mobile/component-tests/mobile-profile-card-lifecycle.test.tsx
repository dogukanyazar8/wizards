import React from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileUserProfile } from "@wizards/types";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockShowToast = jest.fn();
const mockOpenDM = jest.fn();
const mockCreateRequest = jest.fn();
const mockReportUser = jest.fn();
const mockUnblockFriend = jest.fn();
let mockProfile: MobileUserProfile | null = null;

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    session: { user: { id: "user-1" } },
    status: "signed-in",
  }),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ dismissToast: jest.fn(), showToast: mockShowToast }),
}));

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({
    enabled: true,
    impact: jest.fn(),
    notification: jest.fn(),
    selection: jest.fn(),
    setEnabled: jest.fn(),
  }),
}));

jest.mock("../src/account/mobile-account-settings-query", () => ({
  useMobileAccountSettingsQuery: () => ({ data: undefined }),
}));

const mockIdleMutation = { isPending: false, mutate: jest.fn(), mutateAsync: jest.fn() };

jest.mock("../src/social/mobile-game-activity", () => ({
  useMobileGameActivity: () => null,
}));

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileFriendsQuery: () => ({ data: undefined }),
  useMobileSocialMutations: () => ({
    acceptRequest: mockIdleMutation,
    blockFriend: mockIdleMutation,
    createRequest: { isPending: false, mutate: jest.fn(), mutateAsync: mockCreateRequest },
    openDM: { isPending: false, mutate: jest.fn(), mutateAsync: mockOpenDM },
    rejectRequest: mockIdleMutation,
    reportUser: { isPending: false, mutate: jest.fn(), mutateAsync: mockReportUser },
    unblockFriend: { isPending: false, mutate: jest.fn(), mutateAsync: mockUnblockFriend },
  }),
  useMobileUserProfileQuery: () => ({
    data: mockProfile,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// The badge row runs its own query beside the profile read; this suite is about
// the card's layer lifecycle, so it stands in as an empty result.
jest.mock("../src/social/mobile-badges-query", () => ({
  // The detail sheet reads progress from the own-badges query; it stays idle
  // here because this suite never opens it.
  useMobileOwnBadgesQuery: () => ({ data: undefined, isError: false, isLoading: false }),
  useMobileUserBadgesQuery: () => ({ data: undefined, isError: false, isLoading: false }),
}));

// The 11e sheets carry their own clients and queries; the card's mount/unmount
// contract is what this suite is about, so they stand in as inert children.
jest.mock("../src/social/mobile-user-note-sheet", () => ({ MobileUserNoteSheet: () => null }));
jest.mock("../src/social/mobile-status-picker-sheet", () => ({
  MobileStatusPickerSheet: () => null,
}));
jest.mock("../src/social/mobile-custom-status-sheet", () => ({
  MobileCustomStatusSheet: () => null,
}));

import {
  MobileOverlayContentScope,
  MobileOverlayHost,
} from "../src/app/components/kit/overlay-host";
import { mobileOverlayRegistry } from "../src/app/components/kit/overlay-registry";
import { MobileProfileCardProvider, useMobileProfileCard } from "../src/social/profile-card";

const anyElement = { includeHiddenElements: true } as const;

const peerProfile: MobileUserProfile = {
  badges: [],
  bannerColor: null,
  bannerUrl: null,
  bio: null,
  blocked: false,
  blockedBy: false,
  mutualFriends: { count: 0, preview: [] },
  mutualServers: { count: 0, preview: [] },
  note: null,
  presence: { customStatus: null, status: "ONLINE" },
  registeredAt: "2025-04-02T09:00:00.000Z",
  relationship: "friend",
  self: false,
  serverContext: null,
  user: { avatarUrl: null, displayName: "aysegul_dev", id: "user-2", username: "aysegul_dev" },
};

const selfProfile: MobileUserProfile = {
  ...peerProfile,
  relationship: "none",
  self: true,
  user: { avatarUrl: null, displayName: "dogukan", id: "user-1", username: "dogukan" },
};

function Opener({ userId }: { readonly userId: string }) {
  const { openProfileCard } = useMobileProfileCard();

  return (
    <Pressable onPress={() => openProfileCard({ userId })} testID="open-profile-card">
      <Text>open</Text>
    </Pressable>
  );
}

async function renderCardStack(userId: string) {
  return await render(
    <MobileProfileCardProvider>
      <MobileOverlayContentScope style={{ flex: 1 }}>
        <Opener userId={userId} />
      </MobileOverlayContentScope>
      <MobileOverlayHost />
    </MobileProfileCardProvider>,
  );
}

beforeEach(() => {
  mobileOverlayRegistry.reset();
  mockProfile = peerProfile;
  mockShowToast.mockReset();
  mockOpenDM.mockReset();
  mockOpenDM.mockResolvedValue({ conversation: { id: "dm-1" } });
  mockCreateRequest.mockReset();
  mockCreateRequest.mockResolvedValue({ request: { id: "request-1" } });
  mockReportUser.mockReset();
  mockReportUser.mockResolvedValue({ success: true });
  mockUnblockFriend.mockReset();
  mockUnblockFriend.mockResolvedValue({ success: true });
});

describe("profile card overlay lifecycle", () => {
  it("hands the closed card's layer back so the app stays touchable", async () => {
    const view = await renderCardStack("user-2");

    await act(async () => {
      fireEvent.press(view.getByTestId("open-profile-card"));
    });
    expect(view.getByTestId("mobile-profile-card")).toBeTruthy();
    expect(mobileOverlayRegistry.getEntries()).toHaveLength(1);

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-profile-card-backdrop", anyElement));
    });

    // A dismissed card that stays registered leaves a full-screen backdrop in
    // the host: the app still draws but every touch lands on the dead layer.
    await waitFor(() => expect(mobileOverlayRegistry.getEntries()).toHaveLength(0));
    expect(view.queryByTestId("mobile-profile-card", anyElement)).toBeNull();
    expect(
      view.getByTestId("mobile-overlay-content-scope", anyElement).props.importantForAccessibility,
    ).toBe("auto");
    expect(view.getByTestId("mobile-overlay-host").props.pointerEvents).toBe("none");
  });

  it("releases your own card's layer too", async () => {
    mockProfile = selfProfile;
    const view = await renderCardStack("user-1");

    await act(async () => {
      fireEvent.press(view.getByTestId("open-profile-card"));
    });
    // The card enters at opacity 0, so it is queried past the visibility filter.
    expect(view.getByTestId("mobile-profile-card-variant-self", anyElement)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-profile-card-backdrop", anyElement));
    });

    await waitFor(() => expect(mobileOverlayRegistry.getEntries()).toHaveLength(0));
  });

  it("reopens cleanly after a close", async () => {
    const view = await renderCardStack("user-2");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => {
        fireEvent.press(view.getByTestId("open-profile-card"));
      });
      expect(view.getAllByTestId("mobile-profile-card", anyElement)).toHaveLength(1);

      await act(async () => {
        fireEvent.press(view.getByTestId("mobile-profile-card-backdrop", anyElement));
      });
      await waitFor(() => expect(mobileOverlayRegistry.getEntries()).toHaveLength(0));
    }
  });

  it("shows a toast instead of leaking a rejected message action", async () => {
    mockOpenDM.mockRejectedValueOnce(new Error("offline"));
    const view = await renderCardStack("user-2");

    await fireEvent.press(view.getByTestId("open-profile-card"));
    await fireEvent.press(view.getByTestId("mobile-profile-card-primary-action", anyElement));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title: "İşlem tamamlanamadı. Tekrar dene.",
        variant: "error",
      }),
    );
  });

  it("maps a rejected add-friend action to request error copy", async () => {
    mockProfile = { ...peerProfile, relationship: "none" };
    mockCreateRequest.mockRejectedValueOnce(new Error("offline"));
    const view = await renderCardStack("user-2");

    await fireEvent.press(view.getByTestId("open-profile-card"));
    await fireEvent.press(view.getByTestId("mobile-profile-card-primary-action", anyElement));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title: "İstek gönderilemedi.",
        variant: "error",
      }),
    );
  });

  it("shows only the failure toast when an abuse report is rejected", async () => {
    mockReportUser.mockRejectedValueOnce(new Error("offline"));
    const view = await renderCardStack("user-2");

    await fireEvent.press(view.getByTestId("open-profile-card"));
    await fireEvent.press(view.getByTestId("mobile-profile-card-menu-trigger", anyElement));
    await fireEvent.press(view.getByTestId("mobile-profile-card-menu-report", anyElement));
    await fireEvent.press(view.getByTestId("mobile-profile-card-report-harassment", anyElement));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title: "Rapor gönderilemedi. Bağlantını kontrol edip tekrar dene.",
        variant: "error",
      }),
    );
    expect(mockShowToast).not.toHaveBeenCalledWith({
      title: "Bildirimin gönderildi",
      variant: "success",
    });
  });
});
