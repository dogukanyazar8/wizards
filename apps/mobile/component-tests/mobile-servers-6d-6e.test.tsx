import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServerPublicProfile } from "@wizards/types";
import * as Clipboard from "expo-clipboard";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileApiError } from "../src/api/mobile-api-client";

const mockUseMobileAuth = jest.fn();
const mockShowToast = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("expo-linear-gradient", () => {
  const ReactNative = require("react-native") as typeof import("react-native");
  return {
    LinearGradient: ({
      children,
      ...props
    }: {
      readonly children?: React.ReactNode;
      readonly [key: string]: unknown;
    }) => <ReactNative.View {...props}>{children}</ReactNative.View>,
  };
});

// 04-rapor §8.7: the 6c menu the profile reuses renders inside a BottomSheet,
// whose presentation is tested where it lives. Same mock shape as
// `mobile-servers-6c.test.tsx` so the two suites see the same component.
jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react") as typeof React;
  const { View: NativeView } = require("react-native");

  return {
    BottomSheet: ({ children, open, testID }: never) =>
      (open as unknown as boolean)
        ? ReactRuntime.createElement(NativeView, { testID }, children as never)
        : null,
  };
});

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import {
  MobileServerProfileScreen,
  type MobileServerProfileSource,
} from "../src/app/screens/server-profile/server-profile-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;
const PROFILE_PATH = "/api/v1/mobile/servers/server-1/profile";
const PREVIEW_PATH = "/api/v1/mobile/invites/whispr-community/preview";
const JOIN_PATH = "/api/v1/mobile/servers/server-1/join";
const SETTINGS_PATH = "/api/v1/mobile/servers/server-1/settings";
const queryClients: QueryClient[] = [];
const LONG_SERVER_NAME =
  "Türkiye Mobil Uygulama Geliştiricileri ve Tasarımcıları Topluluğu Resmî Sunucusu";

function channel(overrides: Partial<ServerPublicProfile["channels"][number]> = {}) {
  return {
    categoryId: "cat-1",
    categoryName: "Genel",
    id: "channel-1",
    isPrivate: false,
    lastActivityAt: "2026-07-31T09:00:00.000Z",
    liveCount: null,
    name: "duyurular",
    participants: [],
    readOnly: false,
    type: "text" as const,
    ...overrides,
  };
}

function profileFixture(overrides: Partial<ServerPublicProfile> = {}): ServerPublicProfile {
  return {
    accessLevel: "public",
    admins: [
      {
        avatarUrl: null,
        displayName: "Ada",
        id: "user-owner",
        lastSeenAt: "2026-08-10T09:00:00.000Z",
        presence: "online",
        role: "owner",
        shortName: "AD",
        username: "ada",
      },
      {
        avatarUrl: null,
        displayName: "Mert",
        id: "user-admin",
        lastSeenAt: "2026-08-10T07:00:00.000Z",
        presence: "offline",
        role: "admin",
        shortName: "ME",
        username: "mert",
      },
    ],
    bannerUrl: null,
    canManageServer: true,
    channelCount: 3,
    channels: [
      channel(),
      channel({
        id: "channel-2",
        isPrivate: true,
        lastActivityAt: null,
        name: "yonetim",
      }),
      channel({
        categoryId: "cat-2",
        categoryName: "Sesli",
        id: "channel-3",
        lastActivityAt: null,
        liveCount: 4,
        name: "topluluk-sesli",
        type: "voice",
      }),
    ],
    createdAt: "2025-03-12T10:00:00.000Z",
    description: "Whispr'ın resmi topluluk sunucusu.",
    discoverable: true,
    iconUrl: null,
    inviteAddress: "whispr.gg/whispr-community",
    isPublic: true,
    joined: true,
    joinedAt: "2026-04-10T10:00:00.000Z",
    memberCount: 12_400,
    muted: false,
    mutualFriendCount: 3,
    mutualFriends: [
      { avatarUrl: null, displayName: "Ada", id: "friend-1" },
      { avatarUrl: null, displayName: "Mert", id: "friend-2" },
    ],
    name: "Whispr Topluluk",
    notificationLevel: "all",
    onlineCount: 120,
    serverId: "server-1",
    shortName: "WT",
    starred: false,
    tags: ["turkce-sohbet"],
    type: "COMMUNITY",
    upcomingEvent: {
      attendeeCount: 3,
      channelId: "channel-3",
      channelName: "live-room",
      description: null,
      entityType: "VOICE",
      externalLocation: null,
      id: "event-1",
      interestedCount: 8,
      name: "Topluluk buluşması",
      scheduledEndAt: null,
      // Far enough out that the pill is "Hatırlat" rather than "Katıl".
      scheduledStartAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      serverId: "server-1",
      status: "SCHEDULED",
      viewerInterested: false,
    },
    verified: true,
    voiceActiveCount: 4,
    weeklyMessageCount: 218,
    ...overrides,
  };
}

function createApiClient({
  joinError,
  preview,
  previewError,
  profile = profileFixture(),
  profileError,
}: {
  readonly joinError?: Error;
  readonly preview?: ServerPublicProfile & { readonly slug: string };
  readonly previewError?: Error;
  readonly profile?: ServerPublicProfile;
  readonly profileError?: Error;
} = {}) {
  let joined = profile.joined;

  return {
    requestJson: jest.fn(
      async (path: string, init?: { readonly body?: unknown; readonly method?: string }) => {
        if (path === PROFILE_PATH) {
          if (profileError) {
            throw profileError;
          }
          return { ...profile, joined };
        }
        if (path === PREVIEW_PATH) {
          if (previewError) {
            throw previewError;
          }
          return preview ?? { ...profile, joined, slug: "whispr-community" };
        }
        if (path === JOIN_PATH && init?.method === "POST") {
          if (joinError) {
            throw joinError;
          }
          joined = true;
          return { success: true };
        }
        if (path === "/api/v1/mobile/servers/join" && init?.method === "POST") {
          joined = true;
          return { server: { id: "server-1" } };
        }
        if (path === SETTINGS_PATH && init?.method === "PATCH") {
          return {
            settings: {
              muted: false,
              mutedUntil: null,
              notificationLevel: "all" as const,
              starred: true,
            },
          };
        }
        // The workspace read (invite capability) is deliberately unanswered:
        // the screen has to survive without it, and every other path being an
        // error is what proves nothing else is fetched.
        throw new Error(`Unexpected 6d/6e request: ${path}`);
      },
    ),
  };
}

async function renderProfile({
  apiClient = createApiClient(),
  source = { kind: "server", serverId: "server-1" } as MobileServerProfileSource,
  viewerId = "user-1",
  ...handlers
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly viewerId?: string;
  readonly onBack?: () => void;
  readonly onOpenDiscover?: (tag: string) => void;
  readonly onOpenEvents?: (serverId: string) => void;
  readonly onOpenInvite?: (serverId: string) => void;
  readonly onOpenMembers?: (serverId: string) => void;
  readonly onOpenServer?: (serverId: string, channelId?: string | null) => void;
  readonly onOpenSettings?: (serverId: string) => void;
  readonly onOpenUserProfile?: (userId: string, serverId: string) => void;
  readonly source?: MobileServerProfileSource;
} = {}) {
  const props = {
    onBack: jest.fn(),
    onOpenDiscover: jest.fn(),
    onOpenEvents: jest.fn(),
    onOpenInvite: jest.fn(),
    onOpenMembers: jest.fn(),
    onOpenServer: jest.fn(),
    onOpenSettings: jest.fn(),
    onOpenUserProfile: jest.fn(),
    ...handlers,
  };

  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: viewerId } },
    status: "signed-in",
  });

  // The workspace read carries its own day-long `gcTime`, and an uncollected
  // query keeps a real timer alive past the run; every client is cleared in
  // `afterEach` so the worker can exit.
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  queryClients.push(queryClient);

  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 0 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <MobileThemeProvider>
          <MobileLocaleProvider>
            <MobileServerProfileScreen
              {...props}
              source={source}
              webUrl="https://whispr.team/base"
            />
          </MobileLocaleProvider>
        </MobileThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

  return { apiClient, props, view };
}

describe("6d server profile top block", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it("draws the identity, the four stats and the about rows from the profile read", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByTestId("mobile-server-profile-verified")).toBeTruthy();
    expect(view.getByText("120 çevrimiçi")).toBeTruthy();
    expect(view.getByText("whispr.gg/whispr-community")).toBeTruthy();
    expect(view.getByText("turkce-sohbet")).toBeTruthy();

    // Four cells in design order; the weekly count is a real number here.
    for (const [id, value, label] of [
      ["members", "12400", copy.serverProfileStatMembers],
      ["channels", "3", copy.serverProfileStatChannels],
      ["voice", "4", copy.serverProfileStatVoice],
      ["weekly", "218", copy.serverProfileStatWeekly],
    ] as const) {
      const cell = within(view.getByTestId(`mobile-server-profile-stat-${id}`));
      expect(cell.getByText(value)).toBeTruthy();
      expect(cell.getByText(label)).toBeTruthy();
    }

    expect(view.getByText("12 Mart 2025")).toBeTruthy();
    expect(view.getByTestId("mobile-server-profile-about-joined")).toBeTruthy();
    expect(view.getByText(copy.serverAccessPublic)).toBeTruthy();
  });

  it("keeps the weekly cell with an em dash rather than collapsing the card", async () => {
    const { view } = await renderProfile({
      apiClient: createApiClient({ profile: profileFixture({ weeklyMessageCount: null }) }),
    });
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByTestId("mobile-server-profile-stats")).toBeTruthy();
    expect(view.getByText("—")).toBeTruthy();
  });

  // Acceptance 19: no data means no block, never an empty card.
  it("hides the friends row, the event card, the tags and the description when there is no data", async () => {
    const { view } = await renderProfile({
      apiClient: createApiClient({
        profile: profileFixture({
          admins: [],
          description: "",
          mutualFriendCount: 0,
          mutualFriends: [],
          tags: [],
          upcomingEvent: null,
        }),
      }),
    });
    await view.findByTestId("mobile-server-profile-name");

    expect(view.queryByTestId("mobile-server-profile-friends")).toBeNull();
    expect(view.queryByTestId("mobile-server-profile-event")).toBeNull();
    expect(view.queryByTestId("mobile-server-profile-tags")).toBeNull();
    expect(view.queryByTestId("mobile-server-profile-description")).toBeNull();
    expect(view.queryByTestId("mobile-server-profile-admins")).toBeNull();
    // The stat card and the about card are unconditional; they always have data.
    expect(view.getByTestId("mobile-server-profile-stats")).toBeTruthy();
    expect(view.getByTestId("mobile-server-profile-about")).toBeTruthy();
  });

  it("copies the invite address to the clipboard with a success toast", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    await fireEvent.press(view.getByTestId("mobile-server-profile-address"));

    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith("whispr.gg/whispr-community");
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      title: copy.toastInviteLinkCopiedTitle,
      variant: "success",
    });
  });

  // 6f applies on every surface a server name is printed on, this one included.
  it("clamps a long name to two lines", async () => {
    const { view } = await renderProfile({
      apiClient: createApiClient({ profile: profileFixture({ name: LONG_SERVER_NAME }) }),
    });
    await view.findByTestId("mobile-server-profile-name");

    const name = view.getByTestId("mobile-server-profile-name");
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe("tail");
  });

  it("sends a tag straight to discovery search without slugifying it", async () => {
    const { props, view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    await fireEvent.press(view.getByTestId("mobile-server-profile-tag-turkce-sohbet"));
    expect(props.onOpenDiscover).toHaveBeenCalledWith("turkce-sohbet");
  });

  it("offers Hatırlat well before the event and routes the card into the event list", async () => {
    const { props, view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByText(copy.eventRemind)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-server-profile-event"));
    expect(props.onOpenEvents).toHaveBeenCalledWith("server-1");
  });
});

describe("6e server profile lower block", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it("groups channels by category in the order the route produced", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByTestId("mobile-server-profile-group-cat-1")).toBeTruthy();
    expect(view.getByTestId("mobile-server-profile-group-cat-2")).toBeTruthy();
    // The label is uppercased by `textTransform`, not by JS: Turkish dotted I
    // is wrong under the default locale's case mapping.
    expect(view.getByText("Genel")).toBeTruthy();
    expect(view.getByText("Sesli")).toBeTruthy();
    // A text channel prints its last activity, a voice channel its headcount.
    expect(view.getByText("31 Tem")).toBeTruthy();
    expect(view.getByText("4 kişi")).toBeTruthy();
  });

  /**
   * §C2 note: the permission filter already keeps a private channel out of a
   * non-member's list, so the row is the normal, fully opaque one with a chip —
   * there is no dimmed, untappable variant to draw.
   */
  it("marks a private channel with a chip and no dimming", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    const row = view.getByTestId("mobile-server-profile-channel-channel-2");
    expect(view.getByTestId("mobile-server-profile-private-channel-2")).toBeTruthy();
    const style = (Array.isArray(row.props.style) ? row.props.style : [row.props.style])
      .filter(Boolean)
      .reduce((merged: Record<string, unknown>, entry: Record<string, unknown>) => ({
        ...merged,
        ...entry,
      }));
    expect(style.opacity).toBeUndefined();
  });

  it("caps the preview and reveals the rest through the remaining-channels button", async () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      channel({ id: `channel-${index}`, name: `kanal-${index}` }),
    );
    const { view } = await renderProfile({
      apiClient: createApiClient({
        profile: profileFixture({ channelCount: 8, channels: many }),
      }),
    });
    await view.findByTestId("mobile-server-profile-name");

    expect(view.queryByTestId("mobile-server-profile-channel-channel-7")).toBeNull();
    await fireEvent.press(view.getByTestId("mobile-server-profile-show-remaining"));
    expect(view.getByTestId("mobile-server-profile-channel-channel-7")).toBeTruthy();
    expect(view.queryByTestId("mobile-server-profile-show-remaining")).toBeNull();
  });

  it("prints the owner and admin chips with presence from the profile payload", async () => {
    const { props, view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByText(copy.roleOwner)).toBeTruthy();
    expect(view.getByText(copy.roleAdmin)).toBeTruthy();
    expect(view.getByText(copy.profileCardStatusOnline)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-server-profile-admin-user-admin"));
    expect(props.onOpenUserProfile).toHaveBeenCalledWith("user-admin", "server-1");
  });

  it("fades the compact header in on scroll and hands it the pointer events", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    const sticky = view.getByTestId("mobile-server-profile-sticky-header");
    expect(sticky.props.pointerEvents).toBe("none");

    await fireEvent.scroll(view.getByTestId("mobile-server-profile-scroll"), {
      nativeEvent: { contentOffset: { y: 240 } },
    });

    expect(view.getByTestId("mobile-server-profile-sticky-header").props.pointerEvents).toBe(
      "box-none",
    );
    expect(view.getByTestId("mobile-server-profile-sticky-name").props.numberOfLines).toBe(1);
  });
});

describe("6d/6e bottom bar and menu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  // A0.8: one fixed bar, 6d's trio. The 6e leave button is not drawn at all.
  it("keeps one bar with open, notifications and link for a member", async () => {
    const { props, view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByText(copy.serverProfileOpen)).toBeTruthy();
    expect(view.getByTestId("mobile-server-profile-notifications")).toBeTruthy();
    expect(view.getByTestId("mobile-server-profile-copy-link")).toBeTruthy();
    expect(view.queryByText(copy.serverMenuLeave)).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-server-profile-primary-action"));
    expect(props.onOpenServer).toHaveBeenCalledWith("server-1", null);
  });

  it("switches the primary action to join and hides the bell for a non-member", async () => {
    const apiClient = createApiClient({ profile: profileFixture({ joined: false }) });
    const { view } = await renderProfile({ apiClient });
    await view.findByTestId("mobile-server-profile-name");

    expect(view.getByText(copy.serverProfileJoin)).toBeTruthy();
    expect(view.queryByTestId("mobile-server-profile-notifications")).toBeNull();
    expect(view.queryByTestId("mobile-server-profile-menu")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-server-profile-primary-action"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(JOIN_PATH, { method: "POST" });
    });
    await waitFor(() => {
      expect(view.getByText(copy.serverProfileOpen)).toBeTruthy();
    });
  });

  // A0.1/A0.2: the four preferences ride the profile read, and the one writer is
  // `runMobileServerUserSettingsUpdate` behind the settings endpoint.
  it("opens the 6c menu and writes a preference through the single settings endpoint", async () => {
    const { apiClient, view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    await fireEvent.press(view.getByTestId("mobile-server-profile-menu"));
    expect(view.getByTestId("mobile-workspace-menu-actions")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-server-star-toggle-server-1"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(SETTINGS_PATH, {
        body: { starred: true },
        method: "PATCH",
      });
    });

    // No second read of the preferences: the profile route is the only GET the
    // screen makes for this server.
    const readPaths = apiClient.requestJson.mock.calls
      .filter((call) => {
        const method = (call[1] as { method?: string } | undefined)?.method;
        return method === undefined || method === "GET";
      })
      .map((call) => call[0]);
    expect(readPaths.filter((path) => path === PROFILE_PATH)).toHaveLength(1);
  });

  it("lands the bell on the notification layer of the same panel", async () => {
    const { view } = await renderProfile();
    await view.findByTestId("mobile-server-profile-name");

    await fireEvent.press(view.getByTestId("mobile-server-profile-notifications"));

    expect(view.getByTestId("mobile-server-notification-level-all-server-1")).toBeTruthy();
    // One panel, two layers — the menu layer is not stacked underneath.
    expect(view.queryByTestId("mobile-workspace-menu-actions")).toBeNull();
  });

  // Faz 4 §A0.5: the service refuses an owner's leave, so the row is absent.
  it("never renders the leave row for the owner but does for a member", async () => {
    const owner = await renderProfile({ viewerId: "user-owner" });
    await owner.view.findByTestId("mobile-server-profile-name");
    await fireEvent.press(owner.view.getByTestId("mobile-server-profile-menu"));

    expect(owner.view.queryByTestId("mobile-server-leave-open-server-1")).toBeNull();
    await cleanup();

    const member = await renderProfile({ viewerId: "user-1" });
    await member.view.findByTestId("mobile-server-profile-name");
    await fireEvent.press(member.view.getByTestId("mobile-server-profile-menu"));

    expect(member.view.getByTestId("mobile-server-leave-open-server-1")).toBeTruthy();
  });
});

describe("one body, two routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it("reads the invite preview when the source is a slug and draws the same blocks", async () => {
    const apiClient = createApiClient({
      preview: { ...profileFixture({ joined: false }), slug: "whispr-community" },
    });
    const { view } = await renderProfile({
      apiClient,
      source: { kind: "invite", slug: "whispr-community" },
    });
    await view.findByTestId("mobile-server-profile-name");

    expect(apiClient.requestJson).toHaveBeenCalledWith(PREVIEW_PATH, { method: "GET" });
    expect(apiClient.requestJson).not.toHaveBeenCalledWith(PROFILE_PATH, expect.anything());
    expect(view.getByTestId("mobile-server-profile-stats")).toBeTruthy();
    expect(view.getByText(copy.serverProfileJoin)).toBeTruthy();
  });

  it("joins through the invite endpoint from the invite source", async () => {
    const apiClient = createApiClient({
      preview: { ...profileFixture({ joined: false }), slug: "whispr-community" },
    });
    const { view } = await renderProfile({
      apiClient,
      source: { kind: "invite", slug: "whispr-community" },
    });
    await view.findByTestId("mobile-server-profile-name");

    await fireEvent.press(view.getByTestId("mobile-server-profile-primary-action"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/servers/join", {
        body: { inviteCode: "whispr-community" },
        method: "POST",
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      title: copy.communityJoinSuccess,
      variant: "success",
    });
  });

  it("shows the invite-specific empty state on a 404 and the profile one for a server", async () => {
    const notFound = new MobileApiError("not found", { code: "INVITE_NOT_FOUND", status: 404 });
    const invite = await renderProfile({
      apiClient: createApiClient({ previewError: notFound }),
      source: { kind: "invite", slug: "whispr-community" },
    });

    expect(await invite.view.findByText(copy.communityInvalid)).toBeTruthy();
    await fireEvent.press(invite.view.getByTestId("mobile-server-profile-empty-back"));
    expect(invite.props.onBack).toHaveBeenCalledTimes(1);
    await cleanup();

    const server = await renderProfile({
      apiClient: createApiClient({ profileError: notFound }),
    });
    expect(await server.view.findByText(copy.serverProfileNotFound)).toBeTruthy();
  });
});
