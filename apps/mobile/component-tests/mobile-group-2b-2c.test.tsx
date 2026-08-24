import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent } from "@testing-library/react-native";
import { GROUP_SELECTABLE_MAX } from "@wizards/types";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileGroupCreateScreen } from "../src/app/screens/group-create/group-create-screen";
import { MobileGroupMemberStep } from "../src/app/screens/group-create/member-step";
import { createGroupChatStyles } from "../src/app/screens/group-chat.styles";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;
const NOW = new Date("2026-08-11T12:00:00.000Z");

jest.mock("@shopify/flash-list", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  const ReactNative = jest.requireActual<typeof import("react-native")>("react-native");
  const renderSlot = (slot: any) =>
    typeof slot === "function" ? ReactRuntime.createElement(slot) : slot;
  return {
    FlashList: ({
      data = [],
      keyExtractor,
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      renderItem,
      ...props
    }: any) => (
      <ReactNative.View {...props} data={data}>
        {renderSlot(ListHeaderComponent)}
        {data.length === 0
          ? renderSlot(ListEmptyComponent)
          : data.map((item: unknown, index: number) => (
              <ReactRuntime.Fragment key={keyExtractor?.(item, index) ?? index}>
                {renderItem?.({ index, item })}
              </ReactRuntime.Fragment>
            ))}
        {renderSlot(ListFooterComponent)}
      </ReactNative.View>
    ),
  };
});

function friend(id: string, displayName: string, overrides: Record<string, unknown> = {}) {
  return {
    allowsGroupInvites: true,
    avatarUrl: null,
    displayName,
    id,
    online: false,
    username: displayName.toLocaleLowerCase("tr").replace(/\s+/gu, "_"),
    ...overrides,
  };
}

const FRIENDS = [
  friend("user-2", "Atakan"),
  friend("user-3", "UAT Test"),
  friend("user-4", "DY"),
  friend("user-5", "Selin Kaya"),
  friend("user-6", "Mert Baran", { allowsGroupInvites: false }),
];

function conversationResult(id = "dm-group-1") {
  return {
    iconUrl: null,
    id,
    lastMessage: null,
    lastMessageAt: "2026-08-11T12:00:00.000Z",
    name: null,
    ownerId: "user-1",
    participants: [],
    type: "GROUP_DM" as const,
  };
}

async function renderScreen(props: Record<string, unknown> = {}) {
  const onSubmit = jest.fn(async () => conversationResult());
  const view = await render(
    <MobileGroupCreateScreen
      friends={FRIENDS}
      now={NOW}
      onCancel={() => {}}
      onCreated={() => {}}
      onSubmit={onSubmit as never}
      {...props}
    />,
  );

  return { onSubmit, view };
}

async function pick(view: Awaited<ReturnType<typeof render>>, ...ids: readonly string[]) {
  for (const id of ids) {
    await fireEvent.press(view.getByTestId(`mobile-group-create-friend-${id}`));
  }
}

describe("2b §8 selection floor", () => {
  it("keeps İleri shut below the two-friend minimum and opens it at it", async () => {
    const { view } = await renderScreen();
    const next = () => view.getByTestId("mobile-group-create-next");

    expect(next().props.accessibilityState.disabled).toBe(true);

    await pick(view, "user-2");
    expect(next().props.accessibilityState.disabled).toBe(true);

    // GROUP_DM_MIN_PARTICIPANTS is 3 and the creator counts, so two picks open it.
    await pick(view, "user-3");
    expect(next().props.accessibilityState.disabled).toBe(false);
    expect(view.getByTestId("mobile-group-create-next-count").children.join("")).toBe("3");
  });

  it("counts the creator in the header counter", async () => {
    const { view } = await renderScreen();

    await pick(view, "user-2", "user-3");
    expect(view.getByTestId("mobile-group-create-counter")).toHaveTextContent("3/250");
  });
});

describe("2b §6 all friends", () => {
  /**
   * The section used to list `friends − frequent`, so anybody whose whole
   * roster fitted in the five shortcuts saw a heading, a total, and no rows.
   */
  it("lists every friend even when the shortcuts already name them all", async () => {
    const { view } = await renderScreen({
      conversations: FRIENDS.map((entry, index) => ({
        counterpartId: entry.id,
        id: `dm-${index}`,
        lastMessageAt: `2026-08-1${index}T09:00:00.000Z`,
        type: "DM",
      })),
    });

    expect(view.getByTestId("mobile-group-create-frequent-section")).toBeTruthy();
    for (const entry of FRIENDS) {
      expect(view.getByTestId(`mobile-group-create-friend-${entry.id}`)).toBeTruthy();
    }
    expect(view.getByTestId("mobile-group-create-friend-count").children.join("")).toBe(
      String(FRIENDS.length),
    );
    const list = view.getByTestId("mobile-group-create-member-list");
    expect(list.props.data.length).toBeGreaterThan(FRIENDS.length);
    expect(new Set(list.props.data.map((item: unknown) => list.props.getItemType(item)))).toEqual(
      new Set(["section", "friend"]),
    );
  });

  it("counts what it lists once a search narrows the roster", async () => {
    const { view } = await renderScreen();

    await fireEvent.changeText(view.getByTestId("mobile-group-create-search"), "atakan");
    expect(view.getByTestId("mobile-group-create-friend-count").children.join("")).toBe("1");
    expect(view.queryByTestId("mobile-group-create-friend-user-4")).toBeNull();
  });
});

describe("2b §4 chips", () => {
  it("wraps the picked members instead of running off the right edge", () => {
    const styles = createGroupChatStyles(lightTheme);

    expect(styles.selectedChipRow.flexWrap).toBe("wrap");
    expect(styles.selectedChip).toMatchObject({ flexShrink: 1, maxWidth: "100%" });
  });

  it("draws the strip as a plain row, so it cannot grow into the list's space", async () => {
    const { view } = await renderScreen();

    await pick(view, "user-2");
    // A horizontal ScrollView would report a horizontal `contentContainerStyle`
    // prop; a wrapping View carries the row style itself.
    const strip = view.getByTestId("mobile-group-create-chips");
    expect(strip.props.horizontal).toBeUndefined();
    expect(strip.props.style).toMatchObject({ flexWrap: "wrap" });
  });

  it("clears the row checkbox when the chip is removed", async () => {
    const { view } = await renderScreen();

    await pick(view, "user-2");
    expect(
      view.getByTestId("mobile-group-create-friend-user-2").props.accessibilityState.checked,
    ).toBe(true);

    await fireEvent.press(view.getByTestId("mobile-group-create-selected-user-2"));
    expect(
      view.getByTestId("mobile-group-create-friend-user-2").props.accessibilityState.checked,
    ).toBe(false);
    expect(view.queryByTestId("mobile-group-create-selected-user-2")).toBeNull();
  });
});

describe("2b §7 closed to invites", () => {
  it("refuses the tap and says why", async () => {
    const { view } = await renderScreen();
    const row = view.getByTestId("mobile-group-create-friend-user-6");

    expect(row.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(row);
    expect(view.queryByTestId("mobile-group-create-selected-user-6")).toBeNull();
    expect(view.getByText(copy.groupCreateBlocked)).toBeTruthy();
  });

  it("dims the row rather than hiding it", () => {
    const styles = createGroupChatStyles(lightTheme);

    expect(styles.pickerRowBlocked.opacity).toBe(0.55);
    expect(styles.pickerRowCapped.opacity).toBe(0.4);
  });
});

describe("2b §8 ceiling", () => {
  it("freezes the unpicked rows at the ceiling and keeps picked rows interactive", async () => {
    const selectedUserIds = Array.from(
      { length: GROUP_SELECTABLE_MAX },
      (_, index) => `bulk-${index}`,
    );
    const many = [
      ...selectedUserIds.map((id, index) => friend(id, `Kişi ${index}`)),
      friend("bulk-overflow", "Kişi taşan"),
    ];
    const onToggleMember = jest.fn();
    const view = await render(
      <MobileGroupMemberStep
        conversations={[]}
        friends={many}
        friendsById={new Map(many.map((entry) => [entry.id, entry]))}
        now={NOW}
        onToggleMember={onToggleMember}
        state={{
          avatarColor: "primary",
          description: "",
          historyVisibility: "ALL",
          inviteEnabled: true,
          name: "",
          permAddMembers: "ALL",
          selectedUserIds,
          step: "members",
        }}
      />,
    );

    const overflowRow = view.getByTestId("mobile-group-create-friend-bulk-overflow");
    expect(overflowRow.props.accessibilityState.disabled).toBe(true);

    const selectedRow = view.getByTestId("mobile-group-create-friend-bulk-0");
    expect(selectedRow.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(view.getByTestId("mobile-group-create-friend-bulk-0"));
    expect(onToggleMember).toHaveBeenCalledWith("bulk-0");
  });
});

describe("2b §5 frequent contacts (V9)", () => {
  it("draws the section from the inbox when three counterparts qualify", async () => {
    const { view } = await renderScreen({
      conversations: [
        {
          counterpartId: "user-4",
          id: "dm-1",
          lastMessageAt: "2026-08-11T09:00:00.000Z",
          type: "DM",
        },
        {
          counterpartId: "user-3",
          id: "dm-2",
          lastMessageAt: "2026-08-10T09:00:00.000Z",
          type: "DM",
        },
        {
          counterpartId: "user-2",
          id: "dm-3",
          lastMessageAt: "2026-08-09T09:00:00.000Z",
          type: "DM",
        },
      ],
    });

    expect(view.getByTestId("mobile-group-create-frequent-section")).toBeTruthy();
    expect(view.getByText(copy.groupCreateFrequent)).toBeTruthy();
  });

  it("draws nothing above the list when only two would qualify", async () => {
    const { view } = await renderScreen({
      conversations: [
        {
          counterpartId: "user-4",
          id: "dm-1",
          lastMessageAt: "2026-08-11T09:00:00.000Z",
          type: "DM",
        },
        {
          counterpartId: "user-3",
          id: "dm-2",
          lastMessageAt: "2026-08-10T09:00:00.000Z",
          type: "DM",
        },
      ],
    });

    expect(view.queryByTestId("mobile-group-create-frequent-section")).toBeNull();
  });
});

describe("2c identity step", () => {
  async function openIdentity(props: Record<string, unknown> = {}) {
    const rendered = await renderScreen(props);
    await pick(rendered.view, "user-2", "user-3");
    await fireEvent.press(rendered.view.getByTestId("mobile-group-create-next"));
    return rendered;
  }

  it("shows the live hint but requires an explicit group name before submit", async () => {
    const { onSubmit, view } = await openIdentity();

    expect(view.getByTestId("mobile-group-create-hint")).toBeTruthy();
    // §4.4: the hint is the name, not a sentence about it.
    expect(view.getByText("Atakan ve UAT Test")).toBeTruthy();

    const submit = view.getByTestId("mobile-group-create-submit");
    expect(submit.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByTestId("mobile-group-create-name-input"), "Mobil Ekip");
    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));
    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.name).toBe("Mobil Ekip");
    expect(request.userIds).toEqual(["user-2", "user-3"]);
  });

  it("drops the hint once the group is named and counts both fields", async () => {
    const { view } = await openIdentity();

    await fireEvent.changeText(
      view.getByTestId("mobile-group-create-name-input"),
      "Whispr Mobil Ekibi",
    );
    expect(view.queryByTestId("mobile-group-create-hint")).toBeNull();
    expect(view.getByTestId("mobile-group-create-name-counter")).toHaveTextContent("18/32");

    await fireEvent.changeText(view.getByTestId("mobile-group-create-description-input"), "Mobil");
    expect(view.getByTestId("mobile-group-create-description-counter")).toHaveTextContent("5/120");
  });

  it("stops the name field at the limit rather than counting past it", async () => {
    const { view } = await openIdentity();
    const input = view.getByTestId("mobile-group-create-name-input");

    expect(input.props.maxLength).toBe(32);
    expect(view.getByTestId("mobile-group-create-description-input").props.maxLength).toBe(120);
  });

  /**
   * The hint sat between the name field and the description and vanished on the
   * first keystroke, taking ~41pt of the form with it while the reader was
   * typing into it. The space is held for as long as the field has focus.
   */
  it("holds the hint's space while the name field is focused", async () => {
    const { view } = await openIdentity();
    const input = view.getByTestId("mobile-group-create-name-input");

    await fireEvent(view.getByTestId("mobile-group-create-hint"), "layout", {
      nativeEvent: { layout: { height: 41, width: 320, x: 0, y: 0 } },
    });
    await fireEvent(input, "focus");
    await fireEvent.changeText(input, "A");

    expect(view.queryByTestId("mobile-group-create-hint")).toBeNull();
    expect(view.getByTestId("mobile-group-create-hint-spacer").props.style).toMatchObject({
      height: 41,
    });

    // Blur gives the space back: the hole is a typing aid, not a layout.
    await fireEvent(input, "blur");
    expect(view.queryByTestId("mobile-group-create-hint-spacer")).toBeNull();
  });

  it("keeps every swatch in one row and rings only the picked one", async () => {
    const { view } = await openIdentity();
    const styles = createGroupChatStyles(lightTheme);
    const swatch = (color: string) => view.getByTestId(`mobile-group-create-color-${color}`);
    const boxOf = (color: string) =>
      (swatch(color).props.style as readonly unknown[])
        .flat(2)
        .find(
          (entry): entry is { height: number; width: number } =>
            typeof entry === "object" && entry !== null && "width" in entry,
        );

    await fireEvent.press(swatch("success"));

    // Same box picked or not: the ring is reserved, never grown into.
    expect(boxOf("success")).toEqual(boxOf("primary"));
    // 2c §2's `0 0 0 2px zemin, 0 0 0 4px renk`: a 28pt swatch in a 36pt box,
    // so the five of them keep the design's `28 + 8` pitch and stay on one row.
    expect(styles.colorSwatchButton.width).toBe(styles.colorSwatch.width + 8);
    expect(styles.colorSwatchButton.borderWidth).toBe(2);
    expect(styles.colorSwatchRow.gap).toBe(0);
    expect(styles.colorSwatchRow.alignItems).toBe("center");
    expect(styles.colorSwatchRow.flexWrap).toBeUndefined();
    expect(
      (swatch("success").props.style as readonly unknown[])
        .flat(2)
        .some((entry) =>
          typeof entry === "object" && entry !== null && "borderColor" in entry
            ? (entry as { borderColor: string }).borderColor === "hsl(154 60% 42%)"
            : false,
        ),
    ).toBe(true);
  });

  /**
   * The photo used to upload in silence: the tile looked untouched for as long
   * as the file was on the wire, and a failed upload said nothing at all.
   */
  it("says the photo is uploading and refuses a second tap until it lands", async () => {
    let release: ((url: string | null) => void) | null = null;
    const { view } = await openIdentity({
      onPickPhoto: () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    });

    expect(view.queryByTestId("mobile-group-create-photo-busy")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-group-create-photo"));
    const button = view.getByTestId("mobile-group-create-photo");
    expect(view.getByTestId("mobile-group-create-photo-busy")).toBeTruthy();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(button.props.accessibilityLabel).toBe(copy.groupPhotoUploadingTitle);

    await act(async () => {
      release?.("https://utfs.io/f/group.png");
    });
    expect(view.queryByTestId("mobile-group-create-photo-busy")).toBeNull();
  });

  it("carries the colour and the KATILIM trio into the request", async () => {
    const { onSubmit, view } = await openIdentity();

    await fireEvent.press(view.getByTestId("mobile-group-create-color-success"));
    await fireEvent.changeText(view.getByTestId("mobile-group-create-name-input"), "Mobil Ekip");
    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));

    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.avatarColor).toBe("success");
    expect(request.inviteEnabled).toBe(true);
    expect(request.historyVisibility).toBe("ALL");
    expect(request.permAddMembers).toBe("ALL");
  });

  it("starts with the invite link on", async () => {
    const { onSubmit, view } = await openIdentity();

    expect(
      view.getByTestId("mobile-group-create-invite-toggle").props.accessibilityState.checked,
    ).toBe(true);

    await fireEvent.changeText(view.getByTestId("mobile-group-create-name-input"), "Mobil Ekip");
    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));
    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.inviteEnabled).toBe(true);
  });

  it("offers the create-history choices in their product order", async () => {
    const { view } = await openIdentity();

    await fireEvent.press(view.getByTestId("mobile-group-create-history-row"));

    expect(view.getByTestId("mobile-group-create-history-sheet-ALL")).toBeTruthy();
    expect(view.getByTestId("mobile-group-create-history-sheet-LAST_30D")).toBeTruthy();
    expect(view.getByTestId("mobile-group-create-history-sheet-LAST_7D")).toBeTruthy();
    expect(view.getByTestId("mobile-group-create-history-sheet-NONE")).toBeTruthy();
    expect(view.queryByTestId("mobile-group-create-history-sheet-LAST_24H")).toBeNull();
  });

  it("returns to the picker from Düzenle with the selection intact", async () => {
    const { view } = await openIdentity();

    await fireEvent.press(view.getByTestId("mobile-group-create-edit-members"));

    expect(view.getByTestId("mobile-group-create-next")).toBeTruthy();
    expect(
      view.getByTestId("mobile-group-create-friend-user-2").props.accessibilityState.checked,
    ).toBe(true);
    expect(view.getByTestId("mobile-group-create-selected-user-3")).toBeTruthy();
  });

  it("fills both step bars on the second step", async () => {
    const { view } = await openIdentity();

    expect(view.getByTestId("mobile-group-step-bar-2").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: lightTheme.groupChat.stepBar.filled }),
      ]),
    );
  });
});

describe("2b/2c exit", () => {
  it("asks before dropping a started selection and leaves at once when nothing is picked", async () => {
    const onCancel = jest.fn();
    const { view } = await renderScreen({ onCancel });

    await fireEvent.press(view.getByTestId("mobile-group-create-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await pick(view, "user-2");
    await fireEvent.press(view.getByTestId("mobile-group-create-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(view.getByText(copy.groupCreateCancelTitle)).toBeTruthy();
  });
});
