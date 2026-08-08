import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServerPublicProfile } from "@wizards/types";
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
import { MobileServerProfileScreen } from "../src/app/screens/about/about-community-invite-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

type ServerProfileScreenProps = {
  readonly onBack: () => void;
  readonly onOpenServer: (serverId: string) => void;
  readonly serverId: string;
  readonly webUrl: string;
};

const ServerProfileScreen =
  MobileServerProfileScreen as unknown as React.ComponentType<ServerProfileScreenProps>;

const copy = mobileCopy.tr;
const PROFILE_PATH = "/api/v1/mobile/servers/server-1/profile";
const JOIN_PATH = "/api/v1/mobile/servers/server-1/join";

function profileFixture(joined: boolean): ServerPublicProfile {
  return {
    bannerUrl: null,
    channels: [{ liveCount: null, name: "duyurular", readOnly: true, type: "text" }],
    description: "Whispr'ın resmi topluluk sunucusu.",
    discoverable: true,
    iconUrl: null,
    isPublic: true,
    joined,
    memberCount: 12_400,
    mutualFriendCount: 0,
    mutualFriends: [],
    name: "Whispr Topluluk",
    onlineCount: 1_200,
    serverId: "server-1",
    shortName: "WT",
    type: "COMMUNITY",
    verified: true,
  };
}

/**
 * The join endpoint is bodyless and the profile read is what flips the button
 * back to the member action, so the fake client hands out a fresh `joined`
 * value per call instead of a frozen fixture.
 */
function createApiClient({ joinError }: { readonly joinError?: Error } = {}) {
  let joined = false;

  return {
    requestJson: jest.fn(async (path: string, init?: { readonly method?: string }) => {
      if (path === PROFILE_PATH) {
        return profileFixture(joined);
      }
      if (path === JOIN_PATH && init?.method === "POST") {
        if (joinError) {
          throw joinError;
        }
        joined = true;
        return { success: true };
      }
      throw new Error(`Unexpected server-profile request: ${path}`);
    }),
  };
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

  // RNTL's render resolves asynchronously in this setup; awaiting it is what
  // makes the queries below real functions instead of promise members.
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 0 },
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              mutations: { gcTime: Number.POSITIVE_INFINITY },
              queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
            },
          })
        }
      >
        <MobileThemeProvider>
          <MobileLocaleProvider>
            <ServerProfileScreen
              onBack={onBack}
              onOpenServer={onOpenServer}
              serverId="server-1"
              webUrl="https://whispr.team/base"
            />
          </MobileLocaleProvider>
        </MobileThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

  await view.findByText("Whispr Topluluk");
  return { apiClient, onBack, onOpenServer, view };
}

describe("mobile server profile join", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("joins through the real endpoint and turns the button into the member action", async () => {
    const { apiClient, onOpenServer, view } = await renderScreen();

    fireEvent.press(view.getByTestId("mobile-community-primary-action"));

    await waitFor(() => {
      expect(apiClient.requestJson).toHaveBeenCalledWith(JOIN_PATH, { method: "POST" });
    });
    await waitFor(() => {
      expect(view.getByText(copy.communityOpen)).toBeTruthy();
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      title: copy.communityJoinSuccess,
      variant: "success",
    });
    expect(onOpenServer).not.toHaveBeenCalled();
  });

  it("reports every join failure code with its own honest text", async () => {
    const cases = [
      { code: "SERVER_BANNED", status: 403, title: copy.discoverJoinBanned },
      { code: "SERVER_FULL", status: 403, title: copy.discoverJoinFull },
      { code: "SERVER_NOT_FOUND", status: 404, title: copy.discoverJoinUnavailable },
      { code: null, status: 500, title: copy.communityJoinFailed },
    ] as const;

    for (const testCase of cases) {
      const { view } = await renderScreen({
        apiClient: createApiClient({
          joinError: new MobileApiError("join failed", {
            code: "http_error",
            serverCode: testCase.code,
            status: testCase.status,
          }),
        }),
      });

      fireEvent.press(view.getByTestId("mobile-community-primary-action"));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({ title: testCase.title, variant: "error" });
      });
      expect(view.getByText(copy.communityJoin)).toBeTruthy();

      mockShowToast.mockClear();
      await cleanup();
    }
  });

  it("keeps a member on the plain open action without touching the join endpoint", async () => {
    const apiClient = {
      requestJson: jest.fn(async (path: string) => {
        if (path === PROFILE_PATH) {
          return profileFixture(true);
        }
        throw new Error(`Unexpected server-profile request: ${path}`);
      }),
    };
    const { onOpenServer, view } = await renderScreen({ apiClient });

    fireEvent.press(view.getByTestId("mobile-community-primary-action"));

    expect(onOpenServer).toHaveBeenCalledWith("server-1");
    expect(apiClient.requestJson).not.toHaveBeenCalledWith(JOIN_PATH, expect.anything());
  });
});
