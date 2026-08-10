import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";

import { WorkspaceChannelSectionList } from "../src/app/screens/workspace-channel-section-list";
import { WorkspaceFilterStrip } from "../src/app/screens/workspace-filter-strip";
import { WorkspaceHeaderRow } from "../src/app/screens/workspace-header-row";
import { WorkspaceMessageSearchResults } from "../src/app/screens/workspace-message-search-results";
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

/** Acceptance 15's fixture: the longest server name the handoff tests with. */
const LONG_SERVER_NAME =
  "Türkiye Mobil Uygulama Geliştiricileri ve Tasarımcıları Topluluğu Resmî Sunucusu";

function headerProps(overrides: Partial<React.ComponentProps<typeof WorkspaceHeaderRow>> = {}) {
  return {
    isLoading: false,
    layout: "rail" as const,
    meta: null,
    onOpenMenu: jest.fn(),
    onOpenSwitcher: jest.fn(),
    onToggleSearch: jest.fn(),
    otherServersUnreadTotal: 0,
    serverIconUrl: null,
    serverName: "Whispr Topluluk",
    serverShortName: "WT",
    ...overrides,
  };
}

function channel(
  overrides: Partial<MobileWorkspaceChannelSummary> = {},
): MobileWorkspaceChannelSummary {
  return {
    categoryId: "category-lobby",
    categoryName: "Lobby",
    id: "channel-1",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "genel",
    position: 0,
    readOnly: false,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
    ...overrides,
  } as MobileWorkspaceChannelSummary;
}

function section(
  id: string,
  name: string,
  channels: MobileWorkspaceChannelSummary[],
  isCollapsed = false,
) {
  return {
    channels: isCollapsed ? [] : channels,
    id,
    isCollapsed,
    name,
    totalChannelCount: channels.length,
  };
}

describe("6a/6b header", () => {
  // Acceptance 2: 6f's clamp only survives while the name owns the row.
  it("renders at most two icon buttons in the rail layout", async () => {
    const view = await render(<WorkspaceHeaderRow {...headerProps()} />);

    expect(
      view.getByTestId("mobile-workspace-header-actions").props.children.flat().filter(Boolean),
    ).toHaveLength(2);
    expect(view.getByTestId("mobile-workspace-search-toggle")).toBeTruthy();
    expect(view.getByTestId("mobile-workspace-server-menu-open")).toBeTruthy();
    expect(view.queryByTestId("mobile-server-invite-share-server-1")).toBeNull();
    expect(view.queryByTestId("mobile-workspace-create-open")).toBeNull();
  });

  it("renders a single icon button in the compact layout, which keeps its own search box", async () => {
    const view = await render(
      <WorkspaceHeaderRow {...headerProps({ layout: "compact", onToggleSearch: undefined })} />,
    );

    expect(view.queryByTestId("mobile-workspace-search-toggle")).toBeNull();
    expect(view.getByTestId("mobile-workspace-server-menu-open")).toBeTruthy();
  });

  // Acceptance 3 / 6f: two lines and an ellipsis, never one truncated line, and
  // never at the cost of the buttons.
  it.each([
    ["rail", "header"],
    ["compact", "card"],
  ] as const)("clamps a long server name to two lines in the %s layout", async (layout) => {
    const view = await render(
      <WorkspaceHeaderRow {...headerProps({ layout, serverName: LONG_SERVER_NAME })} />,
    );

    const name = view.getByTestId("mobile-workspace-server-name");
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe("tail");
    expect(view.getByTestId("mobile-workspace-server-menu-open")).toBeTruthy();
  });

  it("opens the switcher from the name and the menu from the ⋯ button", async () => {
    const props = headerProps();
    const view = await render(<WorkspaceHeaderRow {...props} />);

    await fireEvent.press(view.getByTestId("mobile-workspace-server-switcher-open"));
    await fireEvent.press(view.getByTestId("mobile-workspace-server-menu-open"));

    expect(props.onOpenSwitcher).toHaveBeenCalledTimes(1);
    expect(props.onOpenMenu).toHaveBeenCalledTimes(1);
  });
});

describe("6a filter strip", () => {
  it("reports the segment the user picked", async () => {
    const onChange = jest.fn();
    const view = await render(
      <WorkspaceFilterStrip
        filter="all"
        hasLiveVoice={false}
        onChange={onChange}
        unreadChannelCount={0}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-workspace-filter-unread"));
    await fireEvent.press(view.getByTestId("mobile-workspace-filter-voice"));

    expect(onChange).toHaveBeenNthCalledWith(1, "unread");
    expect(onChange).toHaveBeenNthCalledWith(2, "voice");
  });

  it("hides the unread badge at zero and shows the live count otherwise", async () => {
    const empty = await render(
      <WorkspaceFilterStrip
        filter="all"
        hasLiveVoice={false}
        onChange={jest.fn()}
        unreadChannelCount={0}
      />,
    );
    expect(empty.queryByTestId("mobile-workspace-filter-unread-badge")).toBeNull();
    expect(empty.queryByTestId("mobile-workspace-filter-voice-dot")).toBeNull();

    const busy = await render(
      <WorkspaceFilterStrip
        filter="unread"
        hasLiveVoice
        onChange={jest.fn()}
        unreadChannelCount={4}
      />,
    );
    expect(busy.getByTestId("mobile-workspace-filter-unread-badge").props.children).toBe(4);
    expect(busy.getByTestId("mobile-workspace-filter-voice-dot")).toBeTruthy();
  });
});

describe("6a category header", () => {
  const listProps = {
    isCollapseDisabled: false,
    layout: "rail" as const,
    onOpenChannel: jest.fn(),
    onToggleSection: jest.fn(),
    selectedChannelId: null,
  };

  // Acceptance 1/14: no create entry survives on a category header.
  it("shows the channel count and no create button", async () => {
    const view = await render(
      <WorkspaceChannelSectionList
        {...listProps}
        sections={[section("lobby", "Lobby", [channel(), channel({ id: "c2", name: "duyuru" })])]}
      />,
    );

    expect(view.getByTestId("mobile-workspace-section-count-lobby").props.children).toBe(2);
    // One tap target for the header itself plus one per channel row — the
    // trailing create button would have been a fourth.
    expect(view.getAllByRole("button")).toHaveLength(3);
  });

  // Acceptance 6.
  it("dims a collapsed category and admits the unread it is hiding", async () => {
    const view = await render(
      <WorkspaceChannelSectionList
        {...listProps}
        sections={[section("lobby", "Lobby", [channel({ unreadCount: 3 })], true)]}
        unreadSectionIds={new Set(["lobby"])}
      />,
    );

    expect(view.getByTestId("mobile-workspace-section-unread-lobby")).toBeTruthy();
    expect(view.getByText("Lobby").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: lightTheme.workspace.categoryCollapsed.label }),
      ]),
    );
  });

  it("keeps an empty category in the list and draws it collapsed", async () => {
    const view = await render(
      <WorkspaceChannelSectionList {...listProps} sections={[section("bos", "Boş", [])]} />,
    );

    expect(view.getByTestId("mobile-workspace-section-count-bos").props.children).toBe(0);
    expect(view.queryByTestId("mobile-workspace-section-unread-bos")).toBeNull();
  });

  it("opens the category editor on a long press only for a channel manager", async () => {
    const onEditSection = jest.fn();
    const view = await render(
      <WorkspaceChannelSectionList
        {...listProps}
        canEditCategories
        onEditSection={onEditSection}
        sections={[section("lobby", "Lobby", [channel()])]}
      />,
    );

    await fireEvent(view.getByTestId("mobile-workspace-section-lobby"), "longPress");
    expect(onEditSection).toHaveBeenCalledWith("lobby", "Lobby");

    const readOnly = await render(
      <WorkspaceChannelSectionList
        {...listProps}
        onEditSection={onEditSection}
        sections={[section("lobby", "Lobby", [channel()])]}
      />,
    );
    await fireEvent(readOnly.getByTestId("mobile-workspace-section-lobby"), "longPress");
    expect(onEditSection).toHaveBeenCalledTimes(1);
  });
});

describe("6b message search results", () => {
  const result = {
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: "Ada",
      id: "user-1",
      status: "ONLINE" as const,
      username: "ada",
    },
    channelId: "channel-1",
    channelName: "duyurular",
    content: "Sürüm bugün çıkıyor",
    createdAt: "2026-08-10T09:00:00.000Z",
    id: "message-1",
    messageId: "message-1",
    scope: "channel" as const,
    serverId: "server-1",
  };

  it("lists a hit with its channel, author and preview, and opens it on tap", async () => {
    const onOpenResult = jest.fn();
    const view = await render(
      <WorkspaceMessageSearchResults
        isLoading={false}
        onOpenResult={onOpenResult}
        results={[result]}
      />,
    );

    expect(view.getByText("Sürüm bugün çıkıyor")).toBeTruthy();
    expect(view.getByText("Ada")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-workspace-search-message-message-1"));
    expect(onOpenResult).toHaveBeenCalledWith(result);
  });

  it("says so when the server-wide search comes back empty, but not while it runs", async () => {
    const loading = await render(
      <WorkspaceMessageSearchResults isLoading onOpenResult={jest.fn()} results={[]} />,
    );
    expect(loading.queryByText("Mesaj bulunamadı")).toBeNull();

    const empty = await render(
      <WorkspaceMessageSearchResults isLoading={false} onOpenResult={jest.fn()} results={[]} />,
    );
    expect(empty.getByText("Mesaj bulunamadı")).toBeTruthy();
  });
});

describe("6a empty voice row", () => {
  // Acceptance 7.
  it("has no Katıl pill and connects when the row itself is tapped", async () => {
    const onOpenChannel = jest.fn();
    const voice = channel({ id: "lobi-ses", name: "lobi-ses", type: "VOICE" });
    const view = await render(
      <WorkspaceChannelSectionList
        isCollapseDisabled={false}
        layout="rail"
        onOpenChannel={onOpenChannel}
        onToggleSection={jest.fn()}
        sections={[section("lobby", "Lobby", [voice])]}
        selectedChannelId={null}
      />,
    );

    expect(view.getByTestId("mobile-workspace-voice-empty-sub").props.children).toBe(
      "Boş · sesli kanal",
    );
    expect(view.queryByTestId("mobile-workspace-voice-join-lobi-ses")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-workspace-channel-voice"));
    expect(onOpenChannel).toHaveBeenCalledWith(voice);
  });
});
