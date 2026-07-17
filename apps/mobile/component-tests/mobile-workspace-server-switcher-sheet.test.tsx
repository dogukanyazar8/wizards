import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { MobileWorkspaceServerSwitcherSheet } from "../src/app/screens/mobile-workspace-server-switcher-sheet";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockBottomSystemSpacing = jest.fn(() => 28);

jest.mock("../src/app/use-mobile-bottom-system-spacing", () => ({
  useMobileBottomSystemSpacing: (minimumSpacing: number) => mockBottomSystemSpacing(minimumSpacing),
}));

const servers = [
  {
    channelCount: 5,
    iconUrl: null,
    id: "server-uat",
    memberCount: 4,
    name: "UAT ENV",
    shortName: "UA",
    unreadCount: 0,
  },
  {
    channelCount: 8,
    iconUrl: null,
    id: "server-windows",
    memberCount: 12,
    name: "Windows Ekibi",
    shortName: "WN",
    unreadCount: 5,
  },
] as const;

describe("MobileWorkspaceServerSwitcherSheet", () => {
  it("uses the real server collection for selection and routes create/join through its existing action", async () => {
    const onClose = jest.fn();
    const onOpenServer = jest.fn();
    const onOpenCreateJoin = jest.fn();
    const view = await render(
      <MobileWorkspaceServerSwitcherSheet
        activeServerId="server-uat"
        onClose={onClose}
        onOpenCreateJoin={onOpenCreateJoin}
        onOpenServer={onOpenServer}
        open
        servers={servers as never}
      />,
    );

    expect(view.getByTestId("mobile-server-switcher-sheet")).toBeTruthy();
    expect(view.getByText("Sunucuların")).toBeTruthy();
    expect(view.getByText("UAT ENV")).toBeTruthy();
    expect(view.getByText("Windows Ekibi")).toBeTruthy();
    expect(view.getByText("5")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-server-switcher-option-server-windows"));
    expect(onOpenServer).toHaveBeenCalledWith("server-windows");
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId("mobile-server-switcher-create-join"));
    expect(onOpenCreateJoin).toHaveBeenCalledTimes(1);
  });

  it("keeps the server-switcher actions above a three-button Android navigation bar", async () => {
    mockBottomSystemSpacing.mockReturnValue(48);
    const view = await render(
      <MobileWorkspaceServerSwitcherSheet
        activeServerId="server-uat"
        onClose={jest.fn()}
        onOpenCreateJoin={jest.fn()}
        onOpenServer={jest.fn()}
        open
        servers={servers as never}
      />,
    );

    expect(mockBottomSystemSpacing).toHaveBeenCalledWith(28);
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-server-switcher-sheet-panel").props.style),
    ).toMatchObject({
      paddingBottom: 48,
    });
  });
});
