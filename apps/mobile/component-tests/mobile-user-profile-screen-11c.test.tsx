import React from "react";
import * as ReactNative from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFetchDMDetails = jest.fn();
const mockOpenDM = jest.fn();
const mockRefetch = jest.fn();
const mockStartCall = jest.fn();
let mockProfileQuery: Record<string, unknown>;
let mockConversations: unknown[];

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {}, status: "signed-in" }),
}));

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileFriendsQuery: () => ({ data: undefined }),
  useMobileUserProfileQuery: () => mockProfileQuery,
  useMobileSocialMutations: () => ({
    acceptRequest: { isPending: false, mutate: jest.fn() },
    blockFriend: { isPending: false, mutate: jest.fn() },
    createRequest: { isPending: false, mutateAsync: jest.fn() },
    openDM: { isPending: false, mutateAsync: mockOpenDM },
    reportUser: { isPending: false, mutate: jest.fn() },
    unblockFriend: { isPending: false, mutate: jest.fn() },
  }),
}));

jest.mock("../src/query/mobile-dm-conversations-query", () => ({
  flattenMobileDMConversationPages: () => mockConversations,
  useMobileDMConversationsQuery: () => ({ data: undefined }),
}));

jest.mock("../src/dm/mobile-dm-details-client", () => ({
  fetchMobileDMDetails: (...args: unknown[]) => mockFetchDMDetails(...args),
}));

jest.mock("../src/app/features/mobile-direct-call-bridge", () => ({
  startMobileDirectCall: (...args: unknown[]) => mockStartCall(...args),
}));

import { MobileUserProfileScreen } from "../src/social/mobile-user-profile-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { darkTheme, lightTheme } from "../src/design/themes";

const baseProfile = {
  badges: ["earlyMember", "supporter"],
  bannerColor: null,
  bannerUrl: null,
  bio: "Frontend geliştirici · tepki sistemi ekibi.",
  blocked: false,
  blockedBy: false,
  mutualFriends: {
    count: 5,
    preview: [
      { avatarUrl: null, displayName: null, id: "user-3", username: "ogi_uat" },
      { avatarUrl: null, displayName: null, id: "user-4", username: "mkaya" },
      { avatarUrl: null, displayName: null, id: "user-5", username: "elifay" },
    ],
  },
  mutualServers: {
    count: 2,
    preview: [
      { iconUrl: null, id: "server-1", memberCount: 128, name: "UAT ENV", shortName: "UE" },
      { iconUrl: null, id: "server-2", memberCount: 64, name: "CodeX", shortName: "CX" },
    ],
  },
  note: null,
  presence: { customStatus: "Yeni tepki sistemini test ediyor", status: "ONLINE" },
  pronouns: null,
  registeredAt: "2024-05-18T09:00:00.000Z",
  relationship: "friend",
  self: false,
  serverContext: {
    joinedAt: "2025-02-04T09:00:00.000Z",
    roles: [{ color: 0x4f46e5, id: "role-1", name: "Geliştirici" }],
    serverId: "server-1",
    serverName: "UAT ENV",
  },
  user: { avatarUrl: null, displayName: "aysegul_dev", id: "user-2", username: "aysegul_dev" },
};

async function renderScreen(
  overrides: Partial<React.ComponentProps<typeof MobileUserProfileScreen>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });

  return await render(
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileUserProfileScreen
            onBack={jest.fn()}
            onOpenConversation={jest.fn()}
            onOpenProfileEdit={jest.fn()}
            onOpenServer={jest.fn()}
            onOpenUserProfile={jest.fn()}
            serverId="server-1"
            userId="user-2"
            {...overrides}
          />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
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

function readSectionLabelColor(screen: Awaited<ReturnType<typeof renderScreen>>): unknown {
  const label = screen.getAllByText("HAKKINDA")[0];
  return flattenStyle(label?.props.style).color;
}

describe("11c full profile page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversations = [
      { id: "dm-1", participants: [{ id: "user-1" }, { id: "user-2" }], type: "DM" },
    ];
    mockProfileQuery = {
      data: baseProfile,
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    mockFetchDMDetails.mockResolvedValue({
      mediaCount: 1,
      mutualServers: [],
      nextCursor: null,
      participant: baseProfile.user,
      sharedAttachments: {
        files: [],
        media: [
          {
            attachment: {
              contentType: "image/png",
              filename: "one.png",
              id: "attachment-1",
              size: 1024,
              url: "https://cdn.example.com/one.png",
            },
            messageCreatedAt: "2026-07-01T10:00:00.000Z",
            messageId: "message-1",
          },
        ],
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fills every 1c section from the profile payload", async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-user-profile-identity")).toBeTruthy();
    expect(screen.getByText("aysegul_dev")).toBeTruthy();
    expect(screen.getByText("@aysegul_dev")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-status").props.children).toContain(
      "Çevrimiçi — Yeni tepki sistemini test ediyor",
    );
    expect(screen.getByText("Geliştirici")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-registered-at").props.children).toBe(
      "Mayıs 2024'te Whispr'a katıldı",
    );
    expect(screen.getByTestId("mobile-user-profile-server-joined-at").props.children).toBe(
      "Şubat 2025'te UAT ENV'e katıldı",
    );
    expect(screen.getByTestId("mobile-user-profile-note")).toBeTruthy();
    expect(screen.getByText("Not ekle (yalnız sana görünür)")).toBeTruthy();
    expect(screen.getByText("ORTAK SUNUCULAR — 2")).toBeTruthy();
    expect(screen.getByText("128 üye · Geliştirici")).toBeTruthy();
    expect(screen.getByText("64 üye")).toBeTruthy();
    expect(screen.getByText("ORTAK ARKADAŞLAR — 5")).toBeTruthy();
    expect(screen.getByText("ogi_uat, mkaya, elifay ve 2 kişi daha")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-mutual-friend-overflow")).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("mobile-user-profile-media-attachment-1")).toBeTruthy());
    expect(screen.getByText("PAYLAŞILAN MEDYA — 1")).toBeTruthy();
  });

  it("routes a mutual server to the server and a mutual friend to their page", async () => {
    const onOpenServer = jest.fn();
    const onOpenUserProfile = jest.fn();
    const screen = await renderScreen({ onOpenServer, onOpenUserProfile });

    await fireEvent.press(screen.getByTestId("mobile-user-profile-mutual-server-server-2"));
    expect(onOpenServer).toHaveBeenCalledWith("server-2");

    await fireEvent.press(screen.getByTestId("mobile-user-profile-mutual-friend-user-4"));
    expect(onOpenUserProfile).toHaveBeenCalledWith("user-4");
  });

  it("opens the existing lightbox from a media tile", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-user-profile-media-attachment-1")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("mobile-user-profile-media-attachment-1"));

    await waitFor(() => expect(screen.getByTestId("mobile-message-image-lightbox")).toBeTruthy());
  });

  it("shows the section skeleton while the profile is pending", async () => {
    mockProfileQuery = { data: undefined, isError: false, isPending: true, refetch: mockRefetch };
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-user-profile-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("mobile-user-profile-identity")).toBeNull();
  });

  it("keeps an in-page error with a retry instead of an empty screen", async () => {
    mockProfileQuery = { data: undefined, isError: true, isPending: false, refetch: mockRefetch };
    const screen = await renderScreen();

    expect(screen.getByText("Profil yüklenemedi")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("mobile-user-profile-retry"));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("hides empty sections and says so when a conversation has no media", async () => {
    mockProfileQuery = {
      data: {
        ...baseProfile,
        bio: null,
        mutualFriends: { count: 0, preview: [] },
        mutualServers: { count: 0, preview: [] },
        serverContext: null,
      },
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    mockFetchDMDetails.mockResolvedValue({
      mediaCount: 0,
      mutualServers: [],
      nextCursor: null,
      participant: baseProfile.user,
      sharedAttachments: { files: [], media: [] },
    });
    const screen = await renderScreen();

    expect(screen.queryByTestId("mobile-user-profile-mutual-servers")).toBeNull();
    expect(screen.queryByTestId("mobile-user-profile-mutual-friends")).toBeNull();
    expect(screen.queryByTestId("mobile-user-profile-roles")).toBeNull();
    // ABOUT survives an empty bio because the join dates still belong there.
    expect(screen.getByTestId("mobile-user-profile-about")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("mobile-user-profile-media-empty")).toBeTruthy(),
    );
  });

  it("drops a blocked profile to the restricted page with an unblock action", async () => {
    mockProfileQuery = {
      data: { ...baseProfile, blocked: true, relationship: "blocked" },
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-user-profile-restricted")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-unblock")).toBeTruthy();
    expect(screen.queryByTestId("mobile-user-profile-about")).toBeNull();
    expect(screen.queryByTestId("mobile-user-profile-note")).toBeNull();
    expect(screen.queryByTestId("mobile-user-profile-shared-media")).toBeNull();
  });

  it("swaps the action row for the 1b set when the viewer is not a friend", async () => {
    mockProfileQuery = {
      data: { ...baseProfile, relationship: "none", serverContext: null },
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-user-profile-add-friend")).toBeTruthy();
    expect(screen.queryByTestId("mobile-user-profile-voice-call")).toBeNull();
    expect(screen.getByText("Arkadaş olmadığınız için sesli arama kapalı")).toBeTruthy();
  });

  it("offers Profili düzenle instead of the peer actions on your own page", async () => {
    mockProfileQuery = {
      data: { ...baseProfile, note: null, self: true },
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-user-profile-edit")).toBeTruthy();
    expect(screen.queryByTestId("mobile-user-profile-message")).toBeNull();
    expect(screen.queryByTestId("mobile-user-profile-note")).toBeNull();
  });

  it("rings through the shared call starter instead of opening the conversation", async () => {
    mockStartCall.mockResolvedValue(true);
    const onOpenConversation = jest.fn();
    const screen = await renderScreen({ onOpenConversation });

    await fireEvent.press(screen.getByTestId("mobile-user-profile-voice-call"));
    await waitFor(() =>
      expect(mockStartCall).toHaveBeenCalledWith({
        conversationId: "dm-1",
        title: "aysegul_dev",
        video: false,
      }),
    );

    await fireEvent.press(screen.getByTestId("mobile-user-profile-video-call"));
    await waitFor(() =>
      expect(mockStartCall).toHaveBeenCalledWith({
        conversationId: "dm-1",
        title: "aysegul_dev",
        video: true,
      }),
    );
    // A call is not a navigation: the DM screen must stay where it was.
    expect(onOpenConversation).not.toHaveBeenCalled();
    // The DM already exists in the list cache, so no second one is opened.
    expect(mockOpenDM).not.toHaveBeenCalled();
  });

  it("hangs the overflow menu off the three-dot control and dismisses it outside", async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId("mobile-user-profile-menu"));
    await waitFor(() =>
      expect(screen.getByTestId("mobile-user-profile-menu-popover")).toBeTruthy(),
    );
    expect(screen.getByTestId("mobile-user-profile-menu-note")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-menu-block")).toBeTruthy();
    expect(screen.getByTestId("mobile-user-profile-menu-report")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("mobile-user-profile-menu-backdrop"));
    await waitFor(() =>
      expect(screen.queryByTestId("mobile-user-profile-menu-popover")).toBeNull(),
    );
  });

  it("expands the mutual friends card behind Tümünü gör", async () => {
    mockProfileQuery = {
      data: {
        ...baseProfile,
        mutualFriends: {
          count: 9,
          preview: [
            ...baseProfile.mutualFriends.preview,
            { avatarUrl: null, displayName: null, id: "user-6", username: "cemre" },
            { avatarUrl: null, displayName: null, id: "user-7", username: "deniz" },
          ],
        },
      },
      isError: false,
      isPending: false,
      refetch: mockRefetch,
    };
    const onOpenUserProfile = jest.fn();
    const screen = await renderScreen({ onOpenUserProfile });

    expect(screen.queryByTestId("mobile-user-profile-mutual-friends-list")).toBeNull();
    await fireEvent.press(screen.getByTestId("mobile-user-profile-mutual-friends-action"));

    await waitFor(() =>
      expect(screen.getByTestId("mobile-user-profile-mutual-friends-list")).toBeTruthy(),
    );
    expect(screen.getByText("@deniz")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("mobile-user-profile-mutual-friend-user-7"));
    expect(onOpenUserProfile).toHaveBeenCalledWith("user-7");
  });

  it("gives a shared video its poster frame and duration badge", async () => {
    mockFetchDMDetails.mockResolvedValue({
      // The strip shows one tile; the header still reports the whole history.
      mediaCount: 96,
      mutualServers: [],
      nextCursor: null,
      participant: baseProfile.user,
      sharedAttachments: {
        files: [],
        media: [
          {
            attachment: {
              contentType: "video/mp4",
              duration: 42,
              filename: "clip.mp4",
              id: "attachment-2",
              size: 2048,
              thumbnailUrl: "https://cdn.example.com/clip.jpg",
              url: "https://cdn.example.com/clip.mp4",
            },
            messageCreatedAt: "2026-07-02T10:00:00.000Z",
            messageId: "message-2",
          },
        ],
      },
    });
    const screen = await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("mobile-user-profile-media-attachment-2")).toBeTruthy(),
    );
    expect(screen.getByTestId("mobile-user-profile-media-duration-attachment-2")).toBeTruthy();
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByText("PAYLAŞILAN MEDYA — 96")).toBeTruthy();
  });

  it("renders the 1f dark page from the dark token family", async () => {
    const lightScreen = await renderScreen();
    expect(readSectionLabelColor(lightScreen)).toBe(lightTheme.text.visualFaint);
    lightScreen.unmount();

    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");
    const darkScreen = await renderScreen();
    expect(readSectionLabelColor(darkScreen)).toBe(darkTheme.text.visualFaint);
  });
});
