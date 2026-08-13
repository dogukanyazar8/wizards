import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent } from "@testing-library/react-native";
import { GROUP_SELECTABLE_MAX } from "@wizards/types";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileGroupCreateScreen } from "../src/app/screens/group-create/group-create-screen";
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
    expect(view.getByTestId("mobile-group-create-counter")).toHaveTextContent("3/32");
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
  it("freezes the unpicked rows at 31 and still lets a pick be undone", async () => {
    const many = Array.from({ length: GROUP_SELECTABLE_MAX + 1 }, (_, index) =>
      friend(`bulk-${index}`, `Kişi ${index}`),
    );
    const view = await render(
      <MobileGroupCreateScreen
        friends={many}
        now={NOW}
        onCancel={() => {}}
        onCreated={() => {}}
        onSubmit={(async () => conversationResult()) as never}
      />,
    );

    for (let index = 0; index < GROUP_SELECTABLE_MAX; index += 1) {
      await fireEvent.press(view.getByTestId(`mobile-group-create-friend-bulk-${index}`));
    }

    const overflowRow = view.getByTestId(`mobile-group-create-friend-bulk-${GROUP_SELECTABLE_MAX}`);
    expect(overflowRow.props.accessibilityState.disabled).toBe(true);

    // The ceiling must never be a dead end: an already-picked row still toggles.
    await fireEvent.press(view.getByTestId("mobile-group-create-friend-bulk-0"));
    expect(
      view.getByTestId("mobile-group-create-friend-bulk-0").props.accessibilityState.checked,
    ).toBe(false);
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

  it("shows the live hint while the name is empty and submits that exact name", async () => {
    const { onSubmit, view } = await openIdentity();

    expect(view.getByTestId("mobile-group-create-hint")).toBeTruthy();
    // §4.4: the hint is the name, not a sentence about it.
    expect(view.getByText("Atakan ve UAT Test")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));
    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    // An empty name is left out entirely, so the server derives it with the
    // same rule the hint just printed.
    expect("name" in request).toBe(false);
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

    await fireEvent.press(swatch("1B8A55"));

    // Same box picked or not: the ring is reserved, never grown into.
    expect(boxOf("1B8A55")).toEqual(boxOf("4F46E5"));
    // 2c §2's `0 0 0 2px zemin, 0 0 0 4px renk`: a 28pt swatch in a 36pt box,
    // so the five of them keep the design's `28 + 8` pitch and stay on one row.
    expect(styles.colorSwatchButton.width).toBe(styles.colorSwatch.width + 8);
    expect(styles.colorSwatchButton.borderWidth).toBe(2);
    expect(styles.colorSwatchRow.gap).toBe(0);
    expect(styles.colorSwatchRow.alignItems).toBe("center");
    expect(styles.colorSwatchRow.flexWrap).toBeUndefined();
    expect(
      (swatch("1B8A55").props.style as readonly unknown[])
        .flat(2)
        .some((entry) =>
          typeof entry === "object" && entry !== null && "borderColor" in entry
            ? (entry as { borderColor: string }).borderColor === "#1B8A55"
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

    await fireEvent.press(view.getByTestId("mobile-group-create-color-1B8A55"));
    await fireEvent.press(view.getByTestId("mobile-group-create-invite-toggle"));
    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));

    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.avatarColor).toBe("#1B8A55");
    expect(request.inviteEnabled).toBe(true);
    expect(request.historyVisibility).toBe("LAST_30D");
    expect(request.permAddMembers).toBe("ALL");
  });

  it("starts with the invite link off (K2)", async () => {
    const { onSubmit, view } = await openIdentity();

    expect(
      view.getByTestId("mobile-group-create-invite-toggle").props.accessibilityState.checked,
    ).toBe(false);

    await fireEvent.press(view.getByTestId("mobile-group-create-submit"));
    const request = (onSubmit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.inviteEnabled).toBe(false);
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
