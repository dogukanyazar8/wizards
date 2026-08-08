import { fireEvent, render } from "@testing-library/react-native";

import { DMInboxHeader } from "../src/app/screens/dm-inbox";
import { MobileGroupCreateScreen } from "../src/app/screens/group-create-screen";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";

/** RNTL 14 renders asynchronously; every caller must await this. */
async function renderInTheme(node: React.ReactElement) {
  return render(<MobileThemeProvider>{node}</MobileThemeProvider>);
}

const FRIENDS = [
  { avatarUrl: null, displayName: "Selin", id: "user-2", username: "selin_qa" },
  { avatarUrl: null, displayName: "Kaan", id: "user-3", username: "kaan" },
  { avatarUrl: null, displayName: "Ada", id: "user-4", username: "ada" },
];

function conversationResult(id = "dm-group-1") {
  return {
    iconUrl: null,
    id,
    lastMessage: null,
    lastMessageAt: "2026-08-07T10:00:00.000Z",
    name: null,
    ownerId: "user-1",
    participants: [],
    type: "GROUP_DM" as const,
  };
}

describe("Faz 5 §13.1 inbox group entry point", () => {
  it("offers group creation on the chats tab and keeps compose intact", async () => {
    const onCompose = jest.fn();
    const onCreateGroup = jest.fn();
    const screen = await renderInTheme(
      <DMInboxHeader onCompose={onCompose} onCreateGroup={onCreateGroup} segment="conversations" />,
    );

    await fireEvent.press(screen.getByTestId("mobile-dm-create-group-button"));
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
    expect(onCompose).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("mobile-dm-compose-button"));
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
  });

  it("does not draw the group button on the friends tab", async () => {
    const screen = await renderInTheme(
      <DMInboxHeader onCompose={() => {}} onCreateGroup={() => {}} segment="friends" />,
    );

    expect(screen.queryByTestId("mobile-dm-create-group-button")).toBeNull();
    expect(screen.getByTestId("mobile-dm-compose-button")).toBeTruthy();
  });
});

describe("Faz 5 §15.2 group create screen", () => {
  it("keeps the next step shut until two friends are picked", async () => {
    const screen = await renderInTheme(
      <MobileGroupCreateScreen
        friends={FRIENDS}
        onCancel={() => {}}
        onCreated={() => {}}
        onSubmit={async () => conversationResult()}
      />,
    );

    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    expect(screen.getByTestId("mobile-group-create-next").props.accessibilityState.disabled).toBe(
      false,
    );
    expect(screen.getByTestId("mobile-group-create-counter").children.join("")).toBe(
      mobileCopy.tr.groupCreateCounter.replace("{count}", "3"),
    );
  });

  it("keeps the selection when the identity step is backed out of", async () => {
    const screen = await renderInTheme(
      <MobileGroupCreateScreen
        friends={FRIENDS}
        onCancel={() => {}}
        onCreated={() => {}}
        onSubmit={async () => conversationResult()}
      />,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-next"));
    expect(screen.getByTestId("mobile-group-create-name-input")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("mobile-group-create-back"));
    expect(
      screen.getByTestId("mobile-group-create-friend-user-2").props.accessibilityState.selected,
    ).toBe(true);
    expect(screen.getByTestId("mobile-group-create-selected-user-3")).toBeTruthy();
  });

  it("submits the trimmed name with the picked ids and opens the new conversation", async () => {
    const onCreated = jest.fn();
    const onSubmit = jest.fn(async () => conversationResult("dm-group-9"));
    const screen = await renderInTheme(
      <MobileGroupCreateScreen
        friends={FRIENDS}
        onCancel={() => {}}
        onCreated={onCreated}
        onSubmit={onSubmit}
      />,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-2"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-friend-user-3"));
    await fireEvent.press(screen.getByTestId("mobile-group-create-next"));
    await fireEvent.changeText(screen.getByTestId("mobile-group-create-name-input"), "  Takım  ");
    await fireEvent.press(screen.getByTestId("mobile-group-create-submit"));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Takım", userIds: ["user-2", "user-3"] });
    expect(onCreated).toHaveBeenCalledWith("dm-group-9");
  });
});
