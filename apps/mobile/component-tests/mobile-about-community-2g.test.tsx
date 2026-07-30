import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileInvitePreviewResponse } from "@wizards/types";
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

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileCommunityInviteScreen } from "../src/app/screens/about/about-community-invite-screen";
import { lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";

type CommunityInviteScreenProps = {
  readonly onBack: () => void;
  readonly onOpenServer: (serverId: string) => void;
  readonly slug: string;
  readonly webUrl: string;
};

const CommunityInviteScreen =
  MobileCommunityInviteScreen as unknown as React.ComponentType<CommunityInviteScreenProps>;

function previewFixture({
  joined = false,
  mutualFriendCount = 12,
}: {
  readonly joined?: boolean;
  readonly mutualFriendCount?: number;
} = {}): MobileInvitePreviewResponse {
  return {
    bannerUrl: null,
    channels: [
      { liveCount: null, name: "duyurular", readOnly: true, type: "text" },
      { liveCount: 0, name: "yol-haritası", readOnly: false, type: "text" },
      { liveCount: null, name: "beta-geri-bildirim", readOnly: false, type: "text" },
      { liveCount: 14, name: "topluluk-sesli", readOnly: false, type: "voice" },
    ],
    description:
      "Yol haritasını burada tartışıyoruz. Beta duyuruları, erken testler ve ekiple doğrudan soru-cevap.",
    iconUrl: null,
    joined,
    memberCount: 12_400,
    mutualFriendCount,
    mutualFriends:
      mutualFriendCount === 0
        ? []
        : [
            {
              avatarUrl: "https://cdn.whispr.test/ada.png",
              displayName: "Ada",
              id: "friend-1",
            },
            { avatarUrl: null, displayName: "Mert", id: "friend-2" },
            { avatarUrl: null, displayName: "Ece", id: "friend-3" },
          ],
    name: "Whispr Topluluk",
    onlineCount: 1_200,
    serverId: "server-1",
    slug: "whispr-community",
    verified: true,
  };
}

function createApiClient({
  joinRejects = false,
  preview = previewFixture(),
  previewError,
}: {
  readonly joinRejects?: boolean;
  readonly preview?: MobileInvitePreviewResponse;
  readonly previewError?: Error;
} = {}) {
  return {
    requestJson: jest.fn(
      async (path: string, init?: { readonly body?: unknown; readonly method?: string }) => {
        if (path === "/api/v1/mobile/invites/whispr-community/preview") {
          if (previewError) {
            throw previewError;
          }
          return preview;
        }
        if (path === "/api/v1/mobile/servers/join" && init?.method === "POST") {
          if (joinRejects) {
            throw new Error("join unavailable");
          }
          return { server: { id: "server-1" } };
        }
        throw new Error(`Unexpected 2g request: ${path}`);
      },
    ),
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

async function renderScreen({
  apiClient = createApiClient(),
  onBack = jest.fn(),
  onOpenServer = jest.fn(),
}: {
  readonly apiClient?: ReturnType<typeof createApiClient>;
  readonly onBack?: () => void;
  readonly onOpenServer?: (serverId: string) => void;
} = {}) {
  mockUseMobileAuth.mockReturnValue({
    apiClient,
    session: { user: { id: "user-1" } },
    status: "signed-in",
  });

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 0 },
      }}
    >
      <QueryClientProvider client={createQueryClient()}>
        <MobileThemeProvider>
          <MobileLocaleProvider>
            <CommunityInviteScreen
              onBack={onBack}
              onOpenServer={onOpenServer}
              slug="whispr-community"
              webUrl="https://whispr.team/base"
            />
          </MobileLocaleProvider>
        </MobileThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

describe("2g community invite screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pins the 92px banner, -26px icon overlap, and 3px white frame", async () => {
    const view = await renderScreen();
    await view.findByText("Whispr Topluluk");

    expect(flattenStyle(view.getByTestId("mobile-community-banner").props.style)).toMatchObject({
      height: 92,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-community-icon-overlap").props.style),
    ).toMatchObject({
      marginTop: -26,
    });
    expect(flattenStyle(view.getByTestId("mobile-community-icon-frame").props.style)).toMatchObject(
      {
        borderColor: lightTheme.about.card,
        borderRadius: 18,
        borderWidth: 3,
        height: 56,
        width: 56,
      },
    );
  });

  it("overlaps mutual avatars by -9px and gives every avatar a 2px card border", async () => {
    const view = await renderScreen();
    await view.findByText("Arkadaşlarından 12 kişi bu sunucuda");

    for (const index of [0, 1, 2, 3]) {
      expect(
        flattenStyle(view.getByTestId(`mobile-community-mutual-avatar-${index}-frame`).props.style),
      ).toMatchObject({
        borderColor: lightTheme.about.card,
        borderWidth: 2,
        ...(index === 0 ? {} : { marginLeft: -9 }),
      });
    }
  });

  it("hides the entire social proof row when there are no mutual friends", async () => {
    const view = await renderScreen({
      apiClient: createApiClient({ preview: previewFixture({ mutualFriendCount: 0 }) }),
    });

    await view.findByText("Whispr Topluluk");
    expect(view.queryByTestId("mobile-community-social-proof")).toBeNull();
  });

  it("renders the four distinct channel trailing states from server data", async () => {
    const view = await renderScreen();
    await view.findByText("Whispr Topluluk");

    expect(view.getByText("KANALLAR")).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-community-channel-row-0")).getByText("salt okunur"),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-community-channel-row-1")).getByText("CANLI"),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-community-channel-row-2")).queryByTestId(
        "mobile-community-channel-status",
      ),
    ).toBeNull();
    expect(
      within(view.getByTestId("mobile-community-channel-row-3")).getByText("14 kişi"),
    ).toBeTruthy();
  });

  it("shows join for non-members and open for existing members", async () => {
    const joinView = await renderScreen();
    expect(await joinView.findByText("Sunucuya katıl")).toBeTruthy();
    await cleanup();

    const openView = await renderScreen({
      apiClient: createApiClient({ preview: previewFixture({ joined: true }) }),
    });
    expect(await openView.findByText("Sunucuyu aç")).toBeTruthy();
  });

  it("optimistically changes the label after a successful join", async () => {
    const apiClient = createApiClient();
    const view = await renderScreen({ apiClient });

    await fireEvent.press(await view.findByTestId("mobile-community-primary-action"));

    expect(await view.findByText("Sunucuyu aç")).toBeTruthy();
    expect(apiClient.requestJson).toHaveBeenCalledWith("/api/v1/mobile/servers/join", {
      body: { inviteCode: "whispr-community" },
      method: "POST",
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      title: "Sunucuya katıldın",
      variant: "success",
    });
  });

  it("copies the configured invite URL from both share affordances", async () => {
    const view = await renderScreen();
    await view.findByText("Whispr Topluluk");

    await fireEvent.press(view.getByTestId("mobile-community-share"));
    await fireEvent.press(view.getByTestId("mobile-community-copy"));

    expect(Clipboard.setStringAsync).toHaveBeenNthCalledWith(
      1,
      "https://whispr.team/invite/whispr-community",
    );
    expect(Clipboard.setStringAsync).toHaveBeenNthCalledWith(
      2,
      "https://whispr.team/invite/whispr-community",
    );
  });

  it("renders the invalid-invite empty state and a working back action on 404", async () => {
    const onBack = jest.fn();
    const view = await renderScreen({
      apiClient: createApiClient({
        previewError: new MobileApiError("not found", {
          code: "INVITE_NOT_FOUND",
          status: 404,
        }),
      }),
      onBack,
    });

    expect(await view.findByText("Bu davet artık geçerli değil")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-community-invalid-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reserves scroll padding for the fixed footer and safe area", async () => {
    const view = await renderScreen();
    await view.findByText("Whispr Topluluk");

    expect(
      flattenStyle(view.getByTestId("mobile-community-scroll").props.contentContainerStyle),
    ).toMatchObject({
      paddingBottom: 26 + 48 + 34,
    });
    const actionStyle = flattenStyle(view.getByTestId("mobile-community-actions").props.style);
    expect(actionStyle).toMatchObject({
      bottom: mobileAboutMetrics.footerButtonBottom,
      gap: 9,
      left: mobileAboutMetrics.cardMargin,
      right: mobileAboutMetrics.cardMargin,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-community-primary-action").props.style),
    ).toMatchObject({
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      minHeight: 48,
      paddingVertical: 14,
    });
    expect(flattenStyle(view.getByTestId("mobile-community-copy").props.style)).toMatchObject({
      borderRadius: mobileAboutMetrics.footerButtonRadius,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 14,
    });
  });
});
