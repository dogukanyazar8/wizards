import React from "react";
import { Pressable, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  BADGE_CATALOG,
  type BadgeProgress,
  type EarnedBadge,
  type MobileUserProfile,
} from "@wizards/types";

const mockFetchUserBadges = jest.fn();
const mockFetchOwnBadges = jest.fn();
let mockProfile: MobileUserProfile;
let mockBadges: readonly EarnedBadge[];
let mockProgress: readonly BadgeProgress[];

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    session: { user: { id: "user-1" } },
    status: "signed-in",
  }),
}));

/**
 * 07 §2 sends your own `+N` to "Rozetlerim" instead of the in-card list, so the
 * route intent is what these tests watch.
 */
const mockNavigate = jest.fn();

jest.mock("../src/navigation/mobile-navigation-ref", () => ({
  isMobileNavigationReady: () => true,
  mobileNavigationRef: { isReady: () => true, goBack: jest.fn(), navigate: jest.fn() },
  navigateMobileRouteIntent: (...args: unknown[]) => mockNavigate(...args),
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ dismissToast: jest.fn(), showToast: jest.fn() }),
}));

jest.mock("../src/account/mobile-account-settings-query", () => ({
  useMobileAccountSettingsQuery: () => ({ data: undefined }),
}));

const mockIdleMutation = { isPending: false, mutate: jest.fn(), mutateAsync: jest.fn() };

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileFriendsQuery: () => ({ data: undefined }),
  useMobileSocialMutations: () => ({
    acceptRequest: mockIdleMutation,
    blockFriend: mockIdleMutation,
    createRequest: mockIdleMutation,
    openDM: mockIdleMutation,
    rejectRequest: mockIdleMutation,
    reportUser: mockIdleMutation,
    unblockFriend: mockIdleMutation,
  }),
  useMobileUserProfileQuery: () => ({ data: mockProfile, isError: false, refetch: jest.fn() }),
}));

/**
 * The transport is mocked, not the query hooks: "opening the detail costs no
 * extra request" and "a peer's sheet never asks for progress" are claims about
 * what leaves the device, so the tests have to watch the fetchers themselves.
 */
jest.mock("../src/social/mobile-badges-client", () => ({
  BADGE_QUERY_STALE_TIME_MS: 300_000,
  fetchOwnBadges: (...args: unknown[]) => mockFetchOwnBadges(...args),
  fetchUserBadges: (...args: unknown[]) => mockFetchUserBadges(...args),
}));

// The 11e sheets carry their own clients; this suite is about the badge sheet.
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
import {
  MOBILE_PROFILE_BADGE_DETAIL_OVERLAY_ID,
  mobileOverlayRegistry,
} from "../src/app/components/kit/overlay-registry";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";
import { MobileProfileCardProvider, useMobileProfileCard } from "../src/social/profile-card";

const copy = mobileCopy.tr;
const anyElement = { includeHiddenElements: true } as const;
const CHIP = "mobile-profile-card-badges";
const DETAIL = "mobile-profile-badge-detail";

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

function badge(
  id: EarnedBadge["id"],
  tier = 1,
  earnedAt = "2026-08-05T10:00:00.000Z",
): EarnedBadge {
  return { earnedAt, expiresAt: null, id, tier };
}

function Opener({ userId }: { readonly userId: string }) {
  const { openProfileCard } = useMobileProfileCard();

  return (
    <Pressable onPress={() => openProfileCard({ userId })} testID="open-profile-card">
      <Text>open</Text>
    </Pressable>
  );
}

async function openCard(userId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileProfileCardProvider>
            <MobileOverlayContentScope style={{ flex: 1 }}>
              <Opener userId={userId} />
            </MobileOverlayContentScope>
            <MobileOverlayHost />
          </MobileProfileCardProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );

  await act(async () => {
    fireEvent.press(view.getByTestId("open-profile-card"));
  });
  await waitFor(() => expect(view.getByTestId(`${CHIP}-${mockBadges[0]?.id}`, anyElement)));

  return view;
}

async function press(view: Awaited<ReturnType<typeof openCard>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID, anyElement));
  });
}

function badgeSheetEntries() {
  return mobileOverlayRegistry
    .getEntries()
    .filter((entry) => entry.id === MOBILE_PROFILE_BADGE_DETAIL_OVERLAY_ID);
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

beforeEach(() => {
  mobileOverlayRegistry.reset();
  mockNavigate.mockReset();
  mockFetchUserBadges.mockReset();
  mockFetchOwnBadges.mockReset();
  mockProfile = peerProfile;
  mockBadges = [badge("staff")];
  mockProgress = [];
  mockFetchUserBadges.mockImplementation(async () => ({ badges: mockBadges }));
  mockFetchOwnBadges.mockImplementation(async () => ({
    badges: mockBadges,
    progress: mockProgress,
  }));
});

describe("profile badge detail", () => {
  it("opens the sheet on a chip touch with the catalog name and description", async () => {
    const view = await openCard("user-2");
    await press(view, `${CHIP}-staff`);

    expect(view.getByTestId(`${DETAIL}-name`, anyElement).props.children).toBe(
      BADGE_CATALOG.staff.copy.tr.name,
    );
    expect(view.getByTestId(`${DETAIL}-description`, anyElement).props.children).toBe(
      BADGE_CATALOG.staff.copy.tr.description,
    );
    // The detail draws from the badges the card already loaded (06 §4).
    expect(mockFetchUserBadges).toHaveBeenCalledTimes(1);
  });

  /**
   * 00 §4 / 06 §1. A `regular` day count or a `voice` hour count is a usage
   * habit; nobody reads one off someone else's profile, and the request that
   * carries it is never issued there.
   */
  it("shows no progress at all on someone else's profile", async () => {
    mockBadges = [badge("streak", 1)];
    const view = await openCard("user-2");
    await press(view, `${CHIP}-streak`);

    expect(view.getByTestId(`${DETAIL}-badge`, anyElement)).toBeTruthy();
    expect(view.queryByTestId(`${DETAIL}-progress`, anyElement)).toBeNull();
    expect(view.queryByTestId(`${DETAIL}-progress-label`, anyElement)).toBeNull();
    expect(mockFetchOwnBadges).not.toHaveBeenCalled();
  });

  it("shows the progress bar and its value on your own profile", async () => {
    mockProfile = selfProfile;
    mockBadges = [badge("streak", 1)];
    mockProgress = [{ id: "streak", nextThreshold: 30, tier: 1, value: 9 }];
    const view = await openCard("user-1");
    await press(view, `${CHIP}-streak`);

    await waitFor(() => expect(mockFetchOwnBadges).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(view.getByTestId(`${DETAIL}-progress-label`, anyElement).props.children).toBe(
        `9/30 ${copy.profileBadgesUnitDay}`,
      ),
    );
  });

  /** Seconds are stored, hours are shown: 36 000 reads as 10 (06 §1). */
  it("prints a voice badge in hours, never in seconds", async () => {
    mockProfile = selfProfile;
    mockBadges = [badge("voice", 1)];
    mockProgress = [{ id: "voice", nextThreshold: 360_000, tier: 1, value: 36_000 }];
    const view = await openCard("user-1");
    await press(view, `${CHIP}-voice`);

    await waitFor(() =>
      expect(view.getByTestId(`${DETAIL}-progress-label`, anyElement).props.children).toBe(
        `10/100 ${copy.profileBadgesUnitHour}`,
      ),
    );
    expect(view.queryByText(/36000|36 000/)).toBeNull();
  });

  it("reads the top tier as a full bar with no numbers", async () => {
    mockProfile = selfProfile;
    mockBadges = [badge("regular", 3)];
    mockProgress = [{ id: "regular", nextThreshold: null, tier: 3, value: 400 }];
    const view = await openCard("user-1");
    await press(view, `${CHIP}-regular`);

    await waitFor(() =>
      expect(view.getByTestId(`${DETAIL}-progress-label`, anyElement).props.children).toBe(
        copy.profileBadgesMaxTier,
      ),
    );
    expect(
      flattenStyle(view.getByTestId(`${DETAIL}-progress-fill`, anyElement).props.style).width,
    ).toBe("100%");
  });

  /**
   * The `+N` chip and the row it opens are one surface: picking a badge from the
   * list swaps this sheet's body instead of stacking a second sheet on top.
   */
  it("opens the full list from +N and drills into a badge without a second sheet", async () => {
    mockBadges = [
      badge("staff"),
      badge("supporter"),
      badge("streak", 2),
      badge("voice", 1),
      badge("veteran", 3),
    ];
    const view = await openCard("user-2");
    await press(view, `${CHIP}-overflow`);

    expect(view.getByTestId(`${DETAIL}-list`, anyElement)).toBeTruthy();
    expect(badgeSheetEntries()).toHaveLength(1);

    await press(view, `${DETAIL}-list-voice`);

    expect(view.getByTestId(`${DETAIL}-name`, anyElement).props.children).toBe(
      BADGE_CATALOG.voice.copy.tr.name,
    );
    expect(view.queryByTestId(`${DETAIL}-list`, anyElement)).toBeNull();
    expect(badgeSheetEntries()).toHaveLength(1);

    // Back returns to the list it came from, still in the same sheet.
    await press(view, `${DETAIL}-back`);
    expect(view.getByTestId(`${DETAIL}-list`, anyElement)).toBeTruthy();
    expect(badgeSheetEntries()).toHaveLength(1);
  });

  it("sends your own +N to Rozetlerim instead of the in-card list", async () => {
    mockProfile = selfProfile;
    mockBadges = [badge("staff"), badge("supporter"), badge("streak", 2), badge("voice", 1)];
    const view = await openCard("user-1");
    await press(view, `${CHIP}-overflow`);

    expect(mockNavigate).toHaveBeenCalledWith({
      name: "SettingsDetail",
      params: { section: "badges" },
      type: "route",
    });
    await waitFor(() => expect(view.queryByTestId("mobile-profile-card", anyElement)).toBeNull());
    // The card's own list sheet stays shut: "Rozetlerim" is the fuller surface.
    expect(view.queryByTestId(`${DETAIL}-list`, anyElement)).toBeNull();
  });

  it("keeps a peer's +N on the in-card list and navigates nowhere", async () => {
    mockProfile = peerProfile;
    mockBadges = [badge("staff"), badge("supporter"), badge("streak", 2), badge("voice", 1)];
    const view = await openCard("user-2");
    await press(view, `${CHIP}-overflow`);

    expect(view.getByTestId(`${DETAIL}-list`, anyElement)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("dates the badge by month and year, never by day", async () => {
    mockBadges = [badge("staff", 1, "2026-08-05T10:00:00.000Z")];
    const view = await openCard("user-2");
    await press(view, `${CHIP}-staff`);

    const earned = view.getByTestId(`${DETAIL}-earned`, anyElement).props.children as string;

    expect(earned).toContain("2026");
    expect(earned).toContain(copy.profileBadgesEarnedTemplate.split("{date}")[1]);
    // The day of the month is the leak this rule exists to prevent.
    expect(earned).not.toMatch(/\b5\b/);
  });

  /**
   * 06 kabul kriteri 1: the same fields in the same order as the web panel,
   * which asserts this identical list in
   * `apps/web/src/components/shared/profile-badge-detail.test.ts`.
   */
  it("lays the fields out in the contract's order", async () => {
    mockProfile = selfProfile;
    mockBadges = [{ ...badge("voice", 1), expiresAt: "2027-01-05T00:00:00.000Z" }];
    mockProgress = [{ id: "voice", nextThreshold: 360_000, tier: 1, value: 36_000 }];
    const view = await openCard("user-1");
    await press(view, `${CHIP}-voice`);

    await waitFor(() => expect(view.getByTestId(`${DETAIL}-progress-label`, anyElement)));

    const seen: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        for (const child of node) {
          walk(child);
        }
        return;
      }
      if (node === null || typeof node !== "object") {
        return;
      }
      const element = node as { children?: unknown; props?: { testID?: unknown } };
      const testID = element.props?.testID;
      if (typeof testID === "string" && testID.startsWith(`${DETAIL}-`)) {
        const field = testID.slice(DETAIL.length + 1);
        // The sheet shell shares the prefix; only the panel's own fields count.
        const shell = ["backdrop", "panel", "badge", "back", "list"];
        if (!shell.includes(field) && !seen.includes(field)) {
          seen.push(field);
        }
      }
      walk(element.children);
    };
    walk(view.toJSON());

    expect(seen).toEqual([
      "glyph",
      "name",
      "tier",
      "description",
      "earned",
      "expires",
      "progress",
      "progress-fill",
      "progress-label",
    ]);
  });

  it("leaves the card mounted underneath the open sheet", async () => {
    const view = await openCard("user-2");
    await press(view, `${CHIP}-staff`);

    expect(view.getByTestId(`${DETAIL}-badge`, anyElement)).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card", anyElement)).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-name", anyElement)).toBeTruthy();
  });
});
