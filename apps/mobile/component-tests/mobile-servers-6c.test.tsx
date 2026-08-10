import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { WorkspaceServerMenuSheet } from "../src/app/screens/workspace-server-menu-sheet";
import { lightTheme } from "../src/design/themes";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

// The sheet's own presentation is BottomSheet's contract, tested there; here it
// is only a container, so it renders inline.
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

const LONG_SERVER_NAME =
  "Türkiye Mobil Uygulama Geliştiricileri ve Tasarımcıları Topluluğu Resmî Sunucusu";

/** A pressed-state style prop arrives as an array; assertions want it resolved. */
function flatStyle(node: { props: { style?: unknown } }): ViewStyle {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as ViewStyle;
}

function menuProps(overrides: Record<string, unknown> = {}) {
  return {
    canLeaveServer: true,
    canManageInvites: true,
    canManageServer: true,
    inviteAddress: "whispr.gg/mobile-test",
    isMuted: false,
    isStarred: false,
    memberCount: 5,
    notificationLevel: "mentions" as const,
    onClose: jest.fn(),
    onLeave: jest.fn(),
    onOpenInvite: jest.fn(),
    onOpenMembers: jest.fn(),
    onOpenProfile: jest.fn(),
    onOpenSettings: jest.fn(),
    onSelectNotificationLevel: jest.fn(),
    onShare: jest.fn(),
    onToggleMute: jest.fn(),
    onToggleStar: jest.fn(),
    open: true,
    serverIconUrl: null,
    serverId: "server-1",
    serverName: "Mobile Test Server",
    serverShortName: "MT",
    ...overrides,
  } as React.ComponentProps<typeof WorkspaceServerMenuSheet>;
}

describe("6c identity row", () => {
  it("shows the name, the invite address and a route to the profile", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);

    expect(view.getByText("Mobile Test Server")).toBeTruthy();
    expect(view.getByText("whispr.gg/mobile-test")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-server-profile-view-server-1"));
    expect(props.onOpenProfile).toHaveBeenCalledTimes(1);
  });

  // 6f's clamp applies on every surface the server name appears on, this one
  // included; a truncated single line would be acceptance 15's failure.
  it("clamps a long name to two lines instead of one truncated one", async () => {
    const view = await render(
      <WorkspaceServerMenuSheet {...menuProps({ serverName: LONG_SERVER_NAME })} />,
    );

    const name = view.getByTestId("mobile-workspace-menu-server-name");
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe("tail");
  });

  it("drops the address line when the server has no invite address", async () => {
    const view = await render(<WorkspaceServerMenuSheet {...menuProps({ inviteAddress: null })} />);

    expect(view.queryByText("whispr.gg/mobile-test")).toBeNull();
  });
});

describe("6c quick actions", () => {
  it("draws four cards and reports each one", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);

    expect(view.getByTestId("mobile-workspace-menu-actions").props.children).toHaveLength(4);

    await fireEvent.press(view.getByTestId("mobile-server-invite-share-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-mute-toggle-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-star-toggle-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-share-server-1"));

    expect(props.onOpenInvite).toHaveBeenCalledTimes(1);
    expect(props.onShare).toHaveBeenCalledTimes(1);
    // A toggle reports the state it is moving to, not the one it is leaving.
    expect(props.onToggleMute).toHaveBeenCalledWith(true);
    expect(props.onToggleStar).toHaveBeenCalledWith(true);
  });

  // 04 §F3: an entry the viewer may not use is absent, never disabled.
  it("hides the invite card without the capability and the share card without an address", async () => {
    const view = await render(
      <WorkspaceServerMenuSheet {...menuProps({ canManageInvites: false, inviteAddress: null })} />,
    );

    expect(view.queryByTestId("mobile-server-invite-share-server-1")).toBeNull();
    expect(view.queryByTestId("mobile-server-share-server-1")).toBeNull();
    // The survivors keep their equal share of the row rather than leaving a gap.
    const cards = view.getByTestId("mobile-workspace-menu-actions").props.children;
    expect(cards).toHaveLength(2);
    expect(flatStyle(view.getByTestId("mobile-server-mute-toggle-server-1")).flex).toBe(1);
  });

  it("tints a toggle that is already on", async () => {
    const view = await render(
      <WorkspaceServerMenuSheet {...menuProps({ isMuted: true, isStarred: false })} />,
    );

    const muted = view.getByTestId("mobile-server-mute-toggle-server-1");
    const starred = view.getByTestId("mobile-server-star-toggle-server-1");

    expect(flatStyle(muted).backgroundColor).toBe(lightTheme.workspace.quickActionCard.activeBg);
    expect(flatStyle(starred).backgroundColor).toBe(lightTheme.workspace.quickActionCard.bg);
    expect(muted.props.accessibilityState).toEqual({ selected: true });
  });
});

describe("6c list card", () => {
  // The access the header gave up has to survive the phase — the four ids are
  // the e2e flow's and the node contract tests' handles on these actions.
  it("carries every entry the header buttons used to own", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);

    await fireEvent.press(view.getByTestId("mobile-server-profile-open-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-members-open-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-invite-share-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-settings-open-server-1"));

    expect(props.onOpenProfile).toHaveBeenCalledTimes(1);
    expect(props.onOpenMembers).toHaveBeenCalledTimes(1);
    expect(props.onOpenInvite).toHaveBeenCalledTimes(1);
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("puts the member count and the current notification level on their rows", async () => {
    const view = await render(<WorkspaceServerMenuSheet {...menuProps()} />);

    expect(view.getByText("5")).toBeTruthy();
    expect(view.getByText("Bahsetmeler")).toBeTruthy();
  });

  it("keeps the settings entry behind a manage capability and the chip behind canManageServer", async () => {
    const member = await render(
      <WorkspaceServerMenuSheet
        {...menuProps({ canManageInvites: false, canManageServer: false })}
      />,
    );

    expect(member.getByTestId("mobile-server-profile-open-server-1")).toBeTruthy();
    expect(member.getByTestId("mobile-server-members-open-server-1")).toBeTruthy();
    expect(member.getByTestId("mobile-server-notifications-open-server-1")).toBeTruthy();
    expect(member.queryByTestId("mobile-server-settings-open-server-1")).toBeNull();

    // An invite manager reaches the settings screen (its invites row is their
    // only way in) but is not an admin, so the chip stays away.
    const inviter = await render(
      <WorkspaceServerMenuSheet {...menuProps({ canManageServer: false })} />,
    );

    expect(inviter.getByTestId("mobile-server-settings-open-server-1")).toBeTruthy();
    expect(inviter.queryByText("YÖNETİCİ")).toBeNull();
    expect(
      (await render(<WorkspaceServerMenuSheet {...menuProps()} />)).getByText("YÖNETİCİ"),
    ).toBeTruthy();
  });

  // The service refuses an owner's leave, so the row is hidden rather than
  // shown and answered with a 400.
  it("closes the card with the leave row: danger tone, no rule above it", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);
    const row = view.getByTestId("mobile-server-leave-open-server-1");

    await fireEvent.press(row);
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    expect(view.getByText("Sunucudan ayrıl").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightTheme.workspace.dangerRow })]),
    );
    expect(flatStyle(row).borderTopWidth).toBeUndefined();
    // Its neighbour above does carry one, so the missing rule is deliberate.
    expect(flatStyle(view.getByTestId("mobile-server-settings-open-server-1")).borderTopWidth).toBe(
      1,
    );

    const owner = await render(
      <WorkspaceServerMenuSheet {...menuProps({ canLeaveServer: false })} />,
    );
    expect(owner.queryByTestId("mobile-server-leave-open-server-1")).toBeNull();
  });
});

describe("6c notification level layer", () => {
  it("swaps into the same panel, marks the current level and reports a new one", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);

    await fireEvent.press(view.getByTestId("mobile-server-notifications-open-server-1"));

    // The menu layer is gone: one panel, two layers, never two stacked sheets.
    expect(view.queryByTestId("mobile-workspace-menu-actions")).toBeNull();
    expect(
      view.getByTestId("mobile-server-notification-level-mentions-server-1").props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(
      view.getByTestId("mobile-server-notification-level-all-server-1").props.accessibilityState,
    ).toEqual({ selected: false });

    await fireEvent.press(view.getByTestId("mobile-server-notification-level-none-server-1"));

    expect(props.onSelectNotificationLevel).toHaveBeenCalledWith("none");
    // Picking returns to the menu, which is where the new value is read back.
    expect(view.getByTestId("mobile-workspace-menu-actions")).toBeTruthy();
  });

  it("returns to the menu without writing anything when the back control is used", async () => {
    const props = menuProps();
    const view = await render(<WorkspaceServerMenuSheet {...props} />);

    await fireEvent.press(view.getByTestId("mobile-server-notifications-open-server-1"));
    await fireEvent.press(view.getByTestId("mobile-server-notifications-back"));

    expect(props.onSelectNotificationLevel).not.toHaveBeenCalled();
    expect(view.getByTestId("mobile-workspace-menu-actions")).toBeTruthy();
  });

  // "Sessize al" is a temporary silence, the level is a standing preference:
  // neither derives from the other, so the menu must not couple them.
  it("leaves the mute card alone whichever level is selected", async () => {
    const view = await render(
      <WorkspaceServerMenuSheet {...menuProps({ isMuted: false, notificationLevel: "none" })} />,
    );

    expect(flatStyle(view.getByTestId("mobile-server-mute-toggle-server-1")).backgroundColor).toBe(
      lightTheme.workspace.quickActionCard.bg,
    );
    expect(view.getByText("Kapalı")).toBeTruthy();
  });
});
