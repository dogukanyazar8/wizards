import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { createGroupChatStyles } from "../src/app/screens/group-chat.styles";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * FlashList measures itself against a real window; the tests care about which
 * rows the list decided to draw, so it is replaced by the plain mapping its
 * props describe. `getItemType` is still called, because a wrong type is a
 * scrolling bug the mock can catch by asserting on it.
 */
const itemTypes: string[] = [];

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    ListEmptyComponent,
    ListHeaderComponent,
    data,
    getItemType,
    renderItem,
    testID,
  }: {
    readonly ListEmptyComponent?: React.ReactNode;
    readonly ListHeaderComponent?: React.ReactNode;
    readonly data: readonly unknown[];
    readonly getItemType?: (item: unknown) => string;
    readonly renderItem: (input: {
      readonly index: number;
      readonly item: unknown;
    }) => React.ReactNode;
    readonly testID?: string;
  }) => {
    const ReactLocal = require("react") as typeof React;
    const { View } = require("react-native") as typeof import("react-native");

    itemTypes.length = 0;
    for (const item of data) {
      itemTypes.push(getItemType?.(item) ?? "unknown");
    }

    return ReactLocal.createElement(
      View,
      { testID },
      ListHeaderComponent ?? null,
      data.length === 0
        ? (ListEmptyComponent ?? null)
        : data.map((item, index) =>
            ReactLocal.createElement(
              View,
              { key: String(index) },
              renderItem({ index, item }) as React.ReactNode,
            ),
          ),
    );
  },
}));

const { DMInboxFilterChips, DirectMessageConversationCard, DirectMessageListCard } =
  require("../src/app/screens/dm-inbox") as typeof import("../src/app/screens/dm-inbox");

const copy = mobileCopy.tr;

type Row = Parameters<typeof DirectMessageConversationCard>[0]["conversation"];

function participant(id: string, name: string) {
  return {
    avatarUrl: null,
    displayName: name,
    id,
    status: "ONLINE",
    username: name.toLowerCase(),
  };
}

function tile(userId: string, initials: string) {
  return { accent: "#4F46E5", avatarUrl: null, initials, userId };
}

function conversation(overrides: Partial<Row> = {}): Row {
  return {
    avatarPair: [],
    iconUrl: null,
    id: "dm-1",
    lastMessage: null,
    lastMessageAt: "2026-08-11T19:30:00.000Z",
    mentionCount: 0,
    muted: false,
    name: "Sohbet",
    notifyLevel: "ALL",
    overflowCount: 0,
    participantCount: 2,
    participants: [participant("user-1", "Ben"), participant("user-2", "Ada")],
    pinnedAt: null,
    type: "DM",
    unreadCount: 0,
    ...overrides,
  } as Row;
}

function group(overrides: Partial<Row> = {}): Row {
  return conversation({
    avatarPair: [tile("user-2", "AY"), tile("user-3", "DY")],
    id: "group-1",
    name: "Whispr Mobil Ekibi",
    participantCount: 6,
    type: "GROUP_DM",
    ...overrides,
  });
}

async function renderRow(row: Row, props: Record<string, unknown> = {}) {
  return await render(
    <DirectMessageConversationCard
      conversation={row}
      currentUserId="user-1"
      onOpenConversation={() => {}}
      selected={false}
      {...props}
    />,
  );
}

describe("2a §1 filter chips", () => {
  it("prints the live counters the chips filter by and leaves Sessiz without one", async () => {
    const view = await render(
      <DMInboxFilterChips
        counts={{ groups: 4, muted: 1, unread: 3 }}
        filter="all"
        onSelectFilter={() => {}}
      />,
    );

    expect(view.getByTestId("mobile-dm-filter-chip-count-unread").children.join("")).toBe("3");
    expect(view.getByTestId("mobile-dm-filter-chip-count-groups").children.join("")).toBe("4");
    // HTML 61: the design draws no counter beside "Sessiz".
    expect(view.queryByTestId("mobile-dm-filter-chip-count-muted")).toBeNull();
    expect(view.getByText(copy.messagesFilterAll)).toBeTruthy();
  });

  it("reports the tapped chip and marks the active one selected", async () => {
    const onSelectFilter = jest.fn();
    const view = await render(
      <DMInboxFilterChips
        counts={{ groups: 0, muted: 0, unread: 0 }}
        filter="groups"
        onSelectFilter={onSelectFilter}
      />,
    );

    expect(view.getByTestId("mobile-dm-filter-chip-groups").props.accessibilityState.selected).toBe(
      true,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-filter-chip-unread"));
    expect(onSelectFilter).toHaveBeenCalledWith("unread");
  });

  it("draws the active chip on ink and the idle ones on the field tone", () => {
    const styles = createGroupChatStyles(lightTheme);

    expect(styles.filterChip).toMatchObject({
      backgroundColor: lightTheme.groupChat.filterChip.idleBg,
      borderRadius: 11,
      height: 30,
    });
    expect(styles.filterChipActive.backgroundColor).toBe(lightTheme.groupChat.filterChip.activeBg);
  });

  /**
   * A horizontal `ScrollView` carries RN's `flexGrow: 1`. Left at that, the
   * strip grew into every spare pixel of the inbox column and centred its chips
   * in the hole — the empty bands above and below them on Sohbetler.
   */
  it("keeps the strip one chip tall instead of growing into the list's space", async () => {
    const view = await render(
      <DMInboxFilterChips
        counts={{ groups: 0, muted: 0, unread: 0 }}
        filter="all"
        onSelectFilter={() => {}}
      />,
    );

    expect(view.getByTestId("mobile-dm-filter-chips").props.style).toMatchObject({
      flexGrow: 0,
      flexShrink: 0,
    });
    expect(createGroupChatStyles(lightTheme).filterChipScroll).toEqual({
      flexGrow: 0,
      flexShrink: 0,
    });
  });
});

describe("2a §2 pinned section", () => {
  it("lifts a pinned row into its own section and leaves the rest below", async () => {
    const view = await render(
      <DirectMessageListCard
        conversations={[
          conversation({ id: "dm-plain", name: "Test1" }),
          group({ id: "group-pinned", pinnedAt: "2026-08-11T08:00:00.000Z" }),
        ]}
        currentUserId="user-1"
        hasNextPage={false}
        onLoadMore={() => {}}
        onOpenConversation={() => {}}
        selectedConversationId={null}
      />,
    );

    expect(view.getByText(copy.messagesPinnedSection)).toBeTruthy();
    // Section head, pinned row, plain row — in that order, with the pinned row
    // ahead of the newer conversation.
    expect(itemTypes).toEqual(["section", "group", "dm"]);
  });

  it("draws no pinned heading when nothing is pinned", async () => {
    const view = await render(
      <DirectMessageListCard
        conversations={[conversation()]}
        currentUserId="user-1"
        hasNextPage={false}
        onLoadMore={() => {}}
        onOpenConversation={() => {}}
        selectedConversationId={null}
      />,
    );

    expect(view.queryByText(copy.messagesPinnedSection)).toBeNull();
    expect(itemTypes).toEqual(["dm"]);
  });

  it("paints the pinned row white against the list tone", () => {
    const styles = createGroupChatStyles(lightTheme);

    expect(styles.rowPinned).toMatchObject({
      backgroundColor: lightTheme.groupChat.groupRow.pinnedBg,
      paddingVertical: 9,
    });
    expect(styles.rowHairline).toMatchObject({ height: 1, marginLeft: 79 });
  });
});

describe("2a §3 group row", () => {
  it("draws the crossed pair and the member counter", async () => {
    const view = await renderRow(group());

    expect(view.getByTestId("mobile-dm-group-avatar-pair")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-conversation-member-count").children.join("")).toBe("· 6");
    expect(view.queryByTestId("mobile-dm-group-avatar-overflow")).toBeNull();
  });

  it("turns the second tile into +N once anybody is hidden (§11.0.7)", async () => {
    const view = await renderRow(group({ overflowCount: 2, participantCount: 5 }));

    expect(view.getByTestId("mobile-dm-group-avatar-overflow")).toBeTruthy();
    // Two hidden members plus the face the badge displaced (§11.0.7).
    expect(view.getByText("+3")).toBeTruthy();
  });

  it("never draws the pair for a 1:1 row", async () => {
    const view = await renderRow(conversation());

    expect(view.queryByTestId("mobile-dm-group-avatar-pair")).toBeNull();
    expect(view.queryByTestId("mobile-dm-conversation-member-count")).toBeNull();
  });

  /**
   * The crossed pair is what a group looks like *until* somebody gives it a
   * face. The row used to keep drawing member tiles afterwards, so the inbox was
   * the one surface where a group's photo never showed up.
   */
  it("draws the group's own photo instead of the pair once it has one", async () => {
    const view = await renderRow(group({ iconUrl: "https://utfs.io/f/group.png" }));

    expect(view.getByTestId("mobile-dm-group-avatar-photo")).toBeTruthy();
    expect(view.queryByTestId("mobile-dm-group-avatar-pair")).toBeNull();
    // The member counter belongs to the row, not to the mark.
    expect(view.getByTestId("mobile-dm-conversation-member-count").children.join("")).toBe("· 6");
  });

  it("keeps the slot's shape when the photo replaces the pair", () => {
    const styles = createGroupChatStyles(lightTheme);
    const { groupRow } = lightTheme.groupChat;

    expect(styles.groupRowIcon).toMatchObject({
      height: groupRow.pairSize,
      overflow: "hidden",
      width: groupRow.pairSize,
    });
    // Same corner ratio the 30pt tiles curve at, so the mark reads as one
    // family. The sheet rounds every metric to a tenth on its way through the
    // scale, hence the tolerance rather than an equality.
    expect(styles.groupRowIcon.borderRadius).toBeCloseTo(
      (groupRow.pairSize * groupRow.tileRadius) / groupRow.tileSize,
      1,
    );
  });
});

describe("2a §4-§7 row states", () => {
  it("puts the mention badge left of the unread badge and keeps both", async () => {
    const view = await renderRow(group({ mentionCount: 2, unreadCount: 12 }));
    const badges = view.getByTestId("mobile-dm-conversation-badges");

    expect(view.getByText("@2")).toBeTruthy();
    expect(view.getByText("12")).toBeTruthy();
    // Order is the assertion: §2a.5 is about which badge sits on the left.
    const order = (badges.props.children as (null | { props: { testID: string } })[])
      .filter(Boolean)
      .map((child) => child?.props.testID);
    expect(order).toEqual([
      "mobile-dm-conversation-mention-badge",
      "mobile-dm-conversation-unread-badge",
    ]);
  });

  it("silences a row from notifyLevel, never from the muted mirror", async () => {
    const view = await renderRow(group({ notifyLevel: "MENTIONS", muted: false, unreadCount: 8 }));

    expect(view.getByTestId("mobile-dm-conversation-muted-bell")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-conversation-unread-badge").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: lightTheme.groupChat.rowBadges.mutedBg,
        }),
      ]),
    );
  });

  it("draws no bell on a row that still notifies", async () => {
    const view = await renderRow(group({ notifyLevel: "ALL", unreadCount: 8 }));

    expect(view.queryByTestId("mobile-dm-conversation-muted-bell")).toBeNull();
  });

  it("names the typist in the group instead of the preview", async () => {
    const view = await renderRow(group(), { typingNames: ["Ayşegül"] });

    expect(view.getByText("Ayşegül yazıyor…")).toBeTruthy();
  });

  it("joins two typists and counts the rest", async () => {
    const two = await renderRow(group(), { typingNames: ["Ayşegül", "UAT Test"] });
    expect(two.getByText("Ayşegül ve UAT Test yazıyor…")).toBeTruthy();

    const many = await renderRow(group(), { typingNames: ["Ayşegül", "UAT Test", "DY"] });
    expect(many.getByText("Ayşegül +2 yazıyor…")).toBeTruthy();
  });

  it("keeps the BOT chip on a bot conversation", async () => {
    const view = await renderRow(
      conversation({
        id: "dm-bot",
        name: "CodeX",
        participants: [
          participant("user-1", "Ben"),
          { ...participant("bot-1", "CodeX"), isBot: true },
        ],
      } as Partial<Row>),
    );

    expect(view.getByTestId("mobile-dm-conversation-bot-badge")).toBeTruthy();
    expect(view.getByText(copy.messageBotBadgeLabel)).toBeTruthy();
  });
});

describe("2a §5 long press", () => {
  it("hands the row up rather than opening it", async () => {
    const onLongPress = jest.fn();
    const onOpen = jest.fn();
    const view = await renderRow(group(), {
      onLongPressConversation: onLongPress,
      onOpenConversation: onOpen,
    });

    await fireEvent(view.getByTestId("mobile-dm-conversation-row"), "longPress");

    expect(onLongPress).toHaveBeenCalledWith("group-1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
