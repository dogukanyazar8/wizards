import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { MobileUserProfile } from "@wizards/types";

import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { ProfileCardMenu } from "../src/social/profile-card/profile-card-menu";
import {
  ProfileCardErrorState,
  ProfileCardSkeleton,
  ProfileCardView,
} from "../src/social/profile-card/profile-card-view";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const copy = mobileCopy.tr;

/**
 * Two `fireEvent.press` calls in one test leave overlapping act() scopes, after
 * which every later render in the file resolves to null. Settling each press
 * with `waitFor` is what keeps the file honest — same trap as the 10g
 * navigation tests.
 */
async function press(view: Awaited<ReturnType<typeof render>>, testID: string, handler: unknown) {
  fireEvent.press(view.getByTestId(testID));
  await waitFor(() => expect(handler).toHaveBeenCalled());
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

const baseProfile: MobileUserProfile = {
  badges: ["earlyMember", "supporter"],
  bannerColor: null,
  bannerUrl: null,
  bio: "UAT",
  blocked: false,
  blockedBy: false,
  mutualFriends: { count: 5, preview: [] },
  mutualServers: {
    count: 3,
    preview: [
      { iconUrl: null, id: "server-1", memberCount: 128, name: "UAT ENV", shortName: "UE" },
    ],
  },
  note: null,
  presence: { customStatus: "Test ediyor", status: "ONLINE" },
  pronouns: null,
  registeredAt: "2025-04-02T09:00:00.000Z",
  relationship: "friend",
  self: false,
  serverContext: {
    joinedAt: "2026-01-04T10:00:00.000Z",
    roles: [{ color: 5_198_053, id: "role-1", name: "Geliştirici" }],
    serverId: "server-1",
    serverName: "UAT ENV",
  },
  user: { avatarUrl: null, displayName: "aysegul_dev", id: "user-2", username: "aysegul_dev" },
};

function createHandlers() {
  return {
    onAddFriend: jest.fn(),
    onEditProfile: jest.fn(),
    onMessage: jest.fn(),
    onOpenCustomStatus: jest.fn(),
    onOpenMutuals: jest.fn(),
    onOpenStatusPicker: jest.fn(),
    onRespondToRequest: jest.fn(),
    onUnblock: jest.fn(),
    onVideoCall: jest.fn(),
    onViewProfile: jest.fn(),
    onVoiceCall: jest.fn(),
  };
}

function renderCard(
  profile: MobileUserProfile,
  options: {
    handlers?: ReturnType<typeof createHandlers>;
    onOpenMenu?: (() => void) | null;
    serverId?: string | undefined;
  } = {},
) {
  return render(
    <ProfileCardView
      {...(options.handlers ?? createHandlers())}
      busy={false}
      menu={null}
      onOpenMenu={options.onOpenMenu === undefined ? jest.fn() : options.onOpenMenu}
      profile={profile}
      serverId={options.serverId}
    />,
  );
}

describe("profile card variants", () => {
  it("gives a friend the message + call set and the server role chips", async () => {
    const handlers = createHandlers();
    const view = await renderCard(baseProfile, { handlers, serverId: "server-1" });

    expect(view.getByTestId("mobile-profile-card-variant-friend")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-roles")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-role-role-1")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-video-action")).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-card-calls-notice")).toBeNull();
    expect(view.getByText(copy.profileCardMessageAction)).toBeTruthy();

    await press(view, "mobile-profile-card-primary-action", handlers.onMessage);
    await press(view, "mobile-profile-card-voice-action", handlers.onVoiceCall);
  });

  it("hides the role section in a DM context", async () => {
    const view = await renderCard(baseProfile, { serverId: undefined });

    expect(view.queryByTestId("mobile-profile-card-roles")).toBeNull();
    expect(view.getByTestId("mobile-profile-card-mutuals")).toBeTruthy();
  });

  it("offers add-friend, a message square and the calls-disabled notice to a stranger", async () => {
    const handlers = createHandlers();
    const view = await renderCard(
      { ...baseProfile, relationship: "none", serverContext: null },
      { handlers },
    );

    expect(view.getByTestId("mobile-profile-card-variant-stranger")).toBeTruthy();
    expect(view.getByText(copy.profileCardAddFriendAction)).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-message-action")).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-card-voice-action")).toBeNull();
    expect(view.getByText(copy.profileCardCallsDisabledNotice)).toBeTruthy();

    await press(view, "mobile-profile-card-primary-action", handlers.onAddFriend);
  });

  it("turns the primary into a disabled 'request sent' after an outgoing request", async () => {
    const handlers = createHandlers();
    const view = await renderCard(
      { ...baseProfile, relationship: "outgoing", serverContext: null },
      { handlers },
    );

    expect(view.getByText(copy.profileCardRequestSentAction)).toBeTruthy();
    fireEvent.press(view.getByTestId("mobile-profile-card-primary-action"));
    expect(handlers.onAddFriend).not.toHaveBeenCalled();
  });

  it("swaps your own card for the edit chip and the status rows", async () => {
    const handlers = createHandlers();
    const view = await renderCard(
      { ...baseProfile, relationship: "none", self: true },
      { handlers, serverId: "server-1" },
    );

    expect(view.getByTestId("mobile-profile-card-variant-self")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-edit-chip")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-custom-status")).toBeTruthy();
    // Your own card carries no three-dot menu and no mutual summary.
    expect(view.queryByTestId("mobile-profile-card-menu-trigger")).toBeNull();
    expect(view.queryByTestId("mobile-profile-card-mutuals")).toBeNull();
    expect(view.getByText(copy.profileCardEditProfileAction)).toBeTruthy();

    await press(view, "mobile-profile-card-status-picker", handlers.onOpenStatusPicker);
    await press(view, "mobile-profile-card-edit-chip", handlers.onEditProfile);
  });

  it("reduces a blocked user to identity plus unblock", async () => {
    const handlers = createHandlers();
    const view = await renderCard(
      { ...baseProfile, badges: [], blocked: true, relationship: "blocked", serverContext: null },
      { handlers, serverId: "server-1" },
    );

    expect(view.getByTestId("mobile-profile-card-variant-blocked")).toBeTruthy();
    expect(view.getByText(copy.profileCardUnblockAction)).toBeTruthy();
    expect(view.queryByTestId("mobile-profile-card-badges")).toBeNull();
    expect(view.queryByTestId("mobile-profile-card-roles")).toBeNull();
    expect(view.queryByTestId("mobile-profile-card-mutuals")).toBeNull();
    expect(view.queryByTestId("mobile-profile-card-view-profile")).toBeNull();

    await press(view, "mobile-profile-card-primary-action", handlers.onUnblock);
  });

  it("colours your own status dot red on DND instead of a fixed online green", async () => {
    const view = await renderCard({
      ...baseProfile,
      presence: { customStatus: null, status: "DND" },
      relationship: "none",
      self: true,
      serverContext: null,
    });

    const dot = view.getByTestId("mobile-profile-card-self-status-dot");
    expect(flattenStyle(dot.props.style).backgroundColor).toBe(lightTheme.profileCard.statusDnd);
    expect(view.getByText(copy.profileCardStatusDnd)).toBeTruthy();
  });

  it("greys your own status dot when you are invisible", async () => {
    const view = await renderCard({
      ...baseProfile,
      presence: { customStatus: null, status: "OFFLINE" },
      relationship: "none",
      self: true,
      serverContext: null,
    });

    const dot = view.getByTestId("mobile-profile-card-self-status-dot");
    expect(flattenStyle(dot.props.style).backgroundColor).toBe(
      lightTheme.profileCard.statusOffline,
    );
  });

  it("says only 'Çevrimdışı' for an offline user with a stale custom status", async () => {
    const view = await renderCard({
      ...baseProfile,
      presence: { customStatus: "Tatilde", status: "OFFLINE" },
      serverContext: null,
    });

    expect(view.getByText(copy.profileCardStatusOffline)).toBeTruthy();
    expect(view.queryByText(/Tatilde/)).toBeNull();
  });
});

describe("profile card menu and states", () => {
  it("runs the block and report actions from the three-dot menu", async () => {
    const onBlock = jest.fn();
    const onReport = jest.fn();
    const view = await render(
      <ProfileCardMenu
        items={[
          {
            destructive: true,
            icon: "block",
            id: "block",
            label: copy.profileCardMenuBlock,
            onPress: onBlock,
          },
          {
            destructive: true,
            icon: "flag",
            id: "report",
            label: copy.profileCardMenuReport,
            onPress: onReport,
          },
        ]}
      />,
    );

    await press(view, "mobile-profile-card-menu-block", onBlock);
    await press(view, "mobile-profile-card-menu-report", onReport);
  });

  it("opens the three-dot menu from the banner on someone else's card", async () => {
    const onOpenMenu = jest.fn();
    const view = await renderCard(baseProfile, { onOpenMenu });

    await press(view, "mobile-profile-card-menu-trigger", onOpenMenu);
  });

  it("opens with a skeleton that keeps the loaded row geometry", async () => {
    const view = await render(<ProfileCardSkeleton />);

    expect(view.getByTestId("mobile-profile-card-skeleton")).toBeTruthy();
    expect(view.getByTestId("mobile-profile-card-banner")).toBeTruthy();
  });

  it("keeps the card open with a retry when the profile fails to load", async () => {
    const onRetry = jest.fn();
    const view = await render(<ProfileCardErrorState onRetry={onRetry} />);

    expect(view.getByText(copy.profileCardLoadFailed)).toBeTruthy();
    await press(view, "mobile-profile-card-retry", onRetry);
  });
});
