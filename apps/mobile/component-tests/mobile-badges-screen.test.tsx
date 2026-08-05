import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BADGE_CATALOG, BADGE_IDS, type OwnBadgesResponse } from "@wizards/types";

const mockFetchOwnBadges = jest.fn();
const mockNavigate = jest.fn();
let mockOwnBadges: OwnBadgesResponse;

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    session: { user: { id: "user-1" } },
    status: "signed-in",
  }),
}));

/**
 * The transport is mocked rather than the query hook: "Rozetlerim" reads the
 * same `badges.own()` entry the detail sheet does, and mocking the hook would
 * hide whether the two share it.
 */
jest.mock("../src/social/mobile-badges-client", () => ({
  BADGE_QUERY_STALE_TIME_MS: 300_000,
  fetchOwnBadges: (...args: unknown[]) => mockFetchOwnBadges(...args),
  fetchUserBadges: jest.fn(),
}));

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  isMobileNavigationReady: () => true,
  mobileNavigationRef: { isReady: () => true, goBack: jest.fn(), navigate: jest.fn() },
  navigateMobileRouteIntent: (...args: unknown[]) => mockNavigate(...args),
}));

import {
  MobileOverlayContentScope,
  MobileOverlayHost,
} from "../src/app/components/kit/overlay-host";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";
import { createMobileNotificationActions } from "../src/app/features/mobile-notification-actions";
import { MobileBadgesScreen } from "../src/social/profile-badges/mobile-badges-screen";

const copy = mobileCopy.tr;
const anyElement = { includeHiddenElements: true } as const;
const SCREEN = "mobile-badges-screen";
const DETAIL = "mobile-profile-badge-detail";

const RESPONSE: OwnBadgesResponse = {
  badges: [
    { id: "staff", tier: 1, earnedAt: "2026-08-05T10:00:00.000Z", expiresAt: null },
    { id: "inviter", tier: 2, earnedAt: "2026-07-01T10:00:00.000Z", expiresAt: null },
    { id: "regular", tier: 1, earnedAt: "2026-06-01T10:00:00.000Z", expiresAt: null },
    { id: "verified", tier: 1, earnedAt: "2026-05-01T10:00:00.000Z", expiresAt: null },
  ],
  progress: [
    { id: "inviter", tier: 2, value: 12, nextThreshold: 50 },
    { id: "regular", tier: 1, value: 63, nextThreshold: 100 },
    { id: "streak", tier: 0, value: 3, nextThreshold: 7 },
    { id: "voice", tier: 0, value: 7_200, nextThreshold: 36_000 },
  ],
};

async function renderScreen(initialBadgeId?: string, waitForData = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileOverlayContentScope style={{ flex: 1 }}>
            <MobileBadgesScreen
              {...(initialBadgeId === undefined ? {} : { initialBadgeId })}
              onBack={() => undefined}
            />
          </MobileOverlayContentScope>
          <MobileOverlayHost />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );

  if (waitForData) {
    await waitFor(() => expect(view.getByTestId(`${SCREEN}-row-staff`, anyElement)));
  }

  return view;
}

beforeEach(() => {
  mockOwnBadges = RESPONSE;
  mockFetchOwnBadges.mockReset();
  mockFetchOwnBadges.mockImplementation(async () => mockOwnBadges);
  mockNavigate.mockReset();
});

describe("Rozetlerim ekranı", () => {
  it("splits earned from locked and counts against the whole catalog", async () => {
    const view = await renderScreen();

    expect(view.getByTestId(`${SCREEN}-summary`, anyElement).props.children).toBe(
      `4/${BADGE_IDS.length}`,
    );
    expect(view.getByTestId(`${SCREEN}-earned`, anyElement)).toBeTruthy();
    expect(view.getByTestId(`${SCREEN}-locked`, anyElement)).toBeTruthy();

    // Every catalog badge is a row, including the ones this account cannot earn.
    for (const id of BADGE_IDS) {
      expect(view.getByTestId(`${SCREEN}-row-${id}`, anyElement)).toBeTruthy();
    }
  });

  it("gives an earned row a tier label and a locked row a progress line", async () => {
    const view = await renderScreen();

    expect(view.getByTestId(`${SCREEN}-tier-inviter`, anyElement).props.children).toBe(
      BADGE_CATALOG.inviter.copy.tr.tiers?.[1],
    );
    expect(view.getByTestId(`${SCREEN}-date-inviter`, anyElement)).toBeTruthy();

    expect(view.getByTestId(`${SCREEN}-progress-streak`, anyElement).props.children).toBe(
      `3/7 ${copy.profileBadgesUnitDay}`,
    );
    expect(view.queryByTestId(`${SCREEN}-tier-streak`, anyElement)).toBeNull();
    // Seconds are stored, hours are shown.
    expect(view.getByTestId(`${SCREEN}-progress-voice`, anyElement).props.children).toBe(
      `2/10 ${copy.profileBadgesUnitHour}`,
    );
  });

  it("groups both sections by family, in the catalog's family order", async () => {
    const view = await renderScreen();

    expect(view.getByTestId(`${SCREEN}-earned-identity`, anyElement)).toBeTruthy();
    expect(view.getByTestId(`${SCREEN}-earned-contribution`, anyElement)).toBeTruthy();
    expect(view.getByTestId(`${SCREEN}-locked-commerce`, anyElement)).toBeTruthy();
    // Nothing is earned in the commerce family, so it has no earned heading.
    expect(view.queryByTestId(`${SCREEN}-earned-commerce`, anyElement)).toBeNull();
  });

  it("opens the detail sheet from a row without a second request", async () => {
    const view = await renderScreen();
    const requestsBefore = mockFetchOwnBadges.mock.calls.length;

    await act(async () => {
      fireEvent.press(view.getByTestId(`${SCREEN}-row-inviter`, anyElement));
    });

    await waitFor(() => expect(view.getByTestId(`${DETAIL}-name`, anyElement)));
    expect(view.getByTestId(`${DETAIL}-name`, anyElement).props.children).toBe(
      BADGE_CATALOG.inviter.copy.tr.name,
    );
    expect(mockFetchOwnBadges.mock.calls.length).toBe(requestsBefore);
  });

  it("opens a locked badge's detail with its progress and no tier line", async () => {
    const view = await renderScreen();

    await act(async () => {
      fireEvent.press(view.getByTestId(`${SCREEN}-row-streak`, anyElement));
    });

    await waitFor(() => expect(view.getByTestId(`${DETAIL}-name`, anyElement)));
    expect(view.queryByTestId(`${DETAIL}-tier`, anyElement)).toBeNull();
    expect(view.queryByTestId(`${DETAIL}-earned`, anyElement)).toBeNull();
    expect(view.getByTestId(`${DETAIL}-progress-label`, anyElement).props.children).toBe(
      `3/7 ${copy.profileBadgesUnitDay}`,
    );
  });

  it("opens straight onto the badge a notification named", async () => {
    const view = await renderScreen("regular");

    await waitFor(() => expect(view.getByTestId(`${DETAIL}-name`, anyElement)));
    expect(view.getByTestId(`${DETAIL}-name`, anyElement).props.children).toBe(
      BADGE_CATALOG.regular.copy.tr.name,
    );
  });

  it("shows the empty line before anything is earned", async () => {
    mockOwnBadges = { badges: [], progress: [] };
    const view = await renderScreen();

    expect(view.getByTestId(`${SCREEN}-summary`, anyElement).props.children).toBe(
      `0/${BADGE_IDS.length}`,
    );
    expect(view.getByText(copy.profileBadgesEmpty, anyElement)).toBeTruthy();
    expect(view.queryByTestId(`${SCREEN}-earned`, anyElement)).toBeNull();
  });

  it("keeps loading distinct from a real empty badge response", async () => {
    mockFetchOwnBadges.mockImplementation(() => new Promise(() => undefined));
    const view = await renderScreen(undefined, false);

    await waitFor(() => expect(view.getByTestId(`${SCREEN}-loading`, anyElement)).toBeTruthy());
    expect(view.queryByTestId(`${SCREEN}-summary`, anyElement)).toBeNull();
    expect(view.queryByText(copy.profileBadgesEmpty, anyElement)).toBeNull();
  });

  it("shows a retryable error instead of claiming the account has no badges", async () => {
    mockFetchOwnBadges
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(RESPONSE);
    const view = await renderScreen(undefined, false);

    await waitFor(() => expect(view.getByTestId(`${SCREEN}-error`, anyElement)).toBeTruthy());
    expect(view.queryByTestId(`${SCREEN}-summary`, anyElement)).toBeNull();
    expect(view.queryByText(copy.profileBadgesEmpty, anyElement)).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId(`${SCREEN}-retry`, anyElement));
    });
    await waitFor(() => expect(view.getByTestId(`${SCREEN}-row-staff`, anyElement)).toBeTruthy());
    expect(mockFetchOwnBadges).toHaveBeenCalledTimes(2);
  });
});

describe("BADGE bildirimi yönlendirmesi", () => {
  const actions = () => createMobileNotificationActions({ joinVoiceChannel: async () => true });

  const notification = (overrides: Record<string, unknown>) =>
    ({
      actionUrl: null,
      actor: null,
      badgeId: null,
      body: "body",
      channel: null,
      createdAt: "2026-08-05T10:00:00.000Z",
      eventKind: null,
      friendRequestId: null,
      id: "00000000-0000-4000-8000-000000000001",
      messageQuote: null,
      read: false,
      readAt: null,
      server: null,
      serverInviteCode: null,
      type: "BADGE",
      ...overrides,
    }) as Parameters<ReturnType<typeof actions>["onOpenNotification"]>[0];

  it("opens Rozetlerim on the badge the row names", () => {
    actions().onOpenNotification(notification({ badgeId: "streak" }));

    expect(mockNavigate).toHaveBeenCalledWith({
      name: "SettingsDetail",
      params: { badgeId: "streak", section: "badges" },
      type: "route",
    });
  });

  it("still opens Rozetlerim for a BADGE row that carries no id or URL", () => {
    actions().onOpenNotification(notification({}));

    expect(mockNavigate).toHaveBeenCalledWith({
      name: "SettingsDetail",
      params: { section: "badges" },
      type: "route",
    });
  });

  it("leaves every other type on its action URL", () => {
    actions().onOpenNotification(
      notification({ actionUrl: "/channels/@me/conversation-1", type: "DM" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      name: "DirectMessage",
      params: { conversationId: "conversation-1" },
      type: "route",
    });
  });
});
