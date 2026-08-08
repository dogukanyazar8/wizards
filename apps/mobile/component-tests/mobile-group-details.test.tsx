import { fireEvent, render } from "@testing-library/react-native";

import { MobileGroupDetailsScreen } from "../src/dm/mobile-group-details-screen";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { mobileCopy } from "../src/locale/mobile-copy";

/** RNTL 14 renders asynchronously; every caller must await this. */
async function renderInTheme(node: React.ReactElement) {
  return render(<MobileThemeProvider>{node}</MobileThemeProvider>);
}

const MEMBERS = [
  {
    avatarUrl: null,
    displayName: "Ada",
    id: "user-1",
    isOwner: true,
    status: "ONLINE",
    username: "ada",
  },
  {
    avatarUrl: null,
    displayName: "Selin",
    id: "user-2",
    isOwner: false,
    status: "OFFLINE",
    username: "selin_qa",
  },
];

const CONVERSATION = {
  iconUrl: null,
  id: "dm-group-1",
  name: "Takım",
  ownerId: "user-1",
};

function renderDetails(
  currentUserId: string,
  overrides: Partial<Parameters<typeof MobileGroupDetailsScreen>[0]> = {},
) {
  return renderInTheme(
    <MobileGroupDetailsScreen
      conversation={CONVERSATION}
      currentUserId={currentUserId}
      members={MEMBERS}
      onAddMembers={() => {}}
      onBack={() => {}}
      onLeave={() => {}}
      onRemoveMember={() => {}}
      {...overrides}
    />,
  );
}

describe("Faz 5 §17 group details", () => {
  it("gives the owner the add and remove controls", async () => {
    const screen = await renderDetails("user-1");

    expect(screen.getByTestId("mobile-group-add-member")).toBeTruthy();
    expect(screen.getByTestId("mobile-group-remove-user-user-2")).toBeTruthy();
    // The owner never removes themselves through the roster; leaving is its own
    // labelled action.
    expect(screen.queryByTestId("mobile-group-remove-user-user-1")).toBeNull();
  });

  it("gives a plain member only the exit", async () => {
    const screen = await renderDetails("user-2");

    expect(screen.queryByTestId("mobile-group-add-member")).toBeNull();
    expect(screen.queryByTestId("mobile-group-remove-user-user-1")).toBeNull();
    expect(screen.getByTestId("mobile-group-leave")).toBeTruthy();
  });

  it("marks the owner row with the admin badge", async () => {
    const screen = await renderDetails("user-2");

    expect(screen.getByText(mobileCopy.tr.groupOwnerBadge)).toBeTruthy();
  });

  it("draws no mutual-servers block", async () => {
    const screen = await renderDetails("user-2");

    expect(
      screen.queryByText(mobileCopy.tr.profilePageMutualServersHeading.replace("{count}", "1")),
    ).toBeNull();
    expect(screen.queryByTestId("mobile-profile-mutual-servers")).toBeNull();
  });

  it("lets the owner rename the group and clear the name", async () => {
    const onUpdate = jest.fn();
    const screen = await renderDetails("user-1", { onUpdate });

    expect(screen.getByTestId("mobile-group-name-save").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.changeText(screen.getByTestId("mobile-group-name-input"), "  Yeni ad  ");
    await fireEvent.press(screen.getByTestId("mobile-group-name-save"));
    expect(onUpdate).toHaveBeenCalledWith({ name: "Yeni ad" });

    await fireEvent.changeText(screen.getByTestId("mobile-group-name-input"), "   ");
    await fireEvent.press(screen.getByTestId("mobile-group-name-save"));
    expect(onUpdate).toHaveBeenLastCalledWith({ name: null });
  });

  it("sends the picked photo as an icon patch", async () => {
    const onUpdate = jest.fn();
    const screen = await renderDetails("user-1", {
      onPickPhoto: async () => "https://utfs.io/f/group.png",
      onUpdate,
    });

    await fireEvent.press(screen.getByTestId("mobile-group-photo"));

    expect(onUpdate).toHaveBeenCalledWith({ iconUrl: "https://utfs.io/f/group.png" });
  });

  it("shows a member the name as text, with no editor", async () => {
    const screen = await renderDetails("user-2", { onUpdate: jest.fn() });

    expect(screen.queryByTestId("mobile-group-name-input")).toBeNull();
    expect(screen.queryByTestId("mobile-group-photo")).toBeNull();
  });

  it("flips mute to the opposite of the current state and hides on demand", async () => {
    const onHide = jest.fn();
    const onSetMuted = jest.fn();
    const screen = await renderDetails("user-2", { isMuted: true, onHide, onSetMuted });

    await fireEvent.press(screen.getByTestId("mobile-group-mute"));
    expect(onSetMuted).toHaveBeenCalledWith(false);

    await fireEvent.press(screen.getByTestId("mobile-group-hide"));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("adds several picked friends in one write", async () => {
    const onAddMembers = jest.fn();
    const screen = await renderDetails("user-1", {
      friends: [
        { avatarUrl: null, displayName: "Kaan", id: "user-3", username: "kaan" },
        { avatarUrl: null, displayName: "Ece", id: "user-4", username: "ece" },
      ],
      onAddMembers,
    });

    await fireEvent.press(screen.getByTestId("mobile-group-add-member"));
    // Nothing picked yet: the confirm button cannot send an empty request.
    expect(screen.getByTestId("mobile-group-add-confirm").props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-add-user-user-3"));
    await fireEvent.press(screen.getByTestId("mobile-group-add-user-user-4"));
    await fireEvent.press(screen.getByTestId("mobile-group-add-confirm"));

    expect(onAddMembers).toHaveBeenCalledTimes(1);
    expect(onAddMembers).toHaveBeenCalledWith(["user-3", "user-4"]);
  });

  it("stops picking once the roster would pass 32", async () => {
    const members = Array.from({ length: 32 }, (_, index) => ({
      avatarUrl: null,
      displayName: `Member ${index}`,
      id: `member-${index}`,
      isOwner: index === 0,
      status: "OFFLINE",
      username: `member${index}`,
    }));
    const screen = await renderInTheme(
      <MobileGroupDetailsScreen
        conversation={{ ...CONVERSATION, ownerId: "member-0" }}
        currentUserId="member-0"
        friends={[{ avatarUrl: null, displayName: "Kaan", id: "user-3", username: "kaan" }]}
        members={members}
        onAddMembers={() => {}}
        onBack={() => {}}
        onLeave={() => {}}
        onRemoveMember={() => {}}
        onUpdate={() => {}}
      />,
    );

    await fireEvent.press(screen.getByTestId("mobile-group-add-member"));

    // No seat left, so the row is inert; the server's GROUP_FULL is the backstop,
    // not the first line of defence.
    expect(
      screen.getByTestId("mobile-group-add-user-user-3").props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("leaves the group with the viewer's own id once the sheet is confirmed", async () => {
    const onLeave = jest.fn();
    const screen = await renderDetails("user-2", { onLeave });

    await fireEvent.press(screen.getByTestId("mobile-group-leave"));
    await fireEvent.press(screen.getByText(mobileCopy.tr.groupLeaveAction, { exact: true }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
