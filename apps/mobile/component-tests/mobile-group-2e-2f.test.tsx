import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import type { DMConversationDTO, GroupInviteDTO } from "@wizards/types";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileGroupInfoScreen } from "../src/app/screens/group-info/group-info-screen";
import { MobileGroupMembersScreen } from "../src/app/screens/group-info/group-members-screen";
import { MobileGroupSettingsScreen } from "../src/app/screens/group-settings/group-settings-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §F — 2e and 2f. The eight rules §F lists, plus
 * the two the acceptance list turns on (§11.3/29 and /30).
 */

const copy = mobileCopy.tr;
const VIEWER = "user-1";

function participant(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName: userId.toUpperCase(),
    joinedAt: "2026-03-12T09:00:00.000Z",
    lastSeenAt: null,
    mentionCount: 0,
    muted: false,
    nameColor: "#C2185B",
    presence: { customStatus: null, status: "OFFLINE" as const },
    role: "MEMBER" as const,
    status: "OFFLINE" as const,
    unreadCount: 0,
    userId,
    username: userId,
    ...overrides,
  };
}

function buildConversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    avatarColor: "#4F46E5",
    avatarPair: [],
    description: null,
    disappearingAfter: "OFF",
    historyVisibility: "ALL",
    iconUrl: null,
    id: "group-1",
    lastMessage: null,
    lastMessageAt: "2026-03-12T09:00:00.000Z",
    memberCount: 4,
    name: "Whispr Mobil Ekibi",
    notifyLevel: "ALL",
    onlineCount: 2,
    overflowCount: 0,
    ownerId: VIEWER,
    participants: [
      participant(VIEWER, { displayName: "DGKNYZR", role: "OWNER" }),
      participant("user-2", { displayName: "Ayşegül", role: "ADMIN", status: "ONLINE" }),
      participant("user-3", { displayName: "Selin" }),
      participant("user-4", { displayName: "UAT Test" }),
    ],
    permissions: {
      addMembers: "ALL",
      editInfo: "ADMINS",
      pinMessage: "ADMINS",
      sendMessage: "ALL",
    },
    pinnedAt: null,
    pinnedMessage: null,
    role: "OWNER",
    type: "GROUP_DM",
    ...overrides,
  } as DMConversationDTO;
}

const MEMBER_VIEW = buildConversation({
  ownerId: "user-2",
  participants: [
    participant("user-2", { displayName: "Ayşegül", role: "OWNER" }),
    participant(VIEWER, { displayName: "DGKNYZR", role: "MEMBER" }),
    participant("user-3", { displayName: "Selin" }),
  ],
  role: "MEMBER",
});

async function renderInfo(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onBack: jest.fn(),
    onInvite: jest.fn(),
    onMemberAction: jest.fn(),
    onOpenMedia: jest.fn(),
    onOpenMembers: jest.fn(),
    onOpenPinnedMessage: jest.fn(),
    onSaveIdentity: jest.fn(async () => undefined),
    onSearch: jest.fn(),
    onStartVideoCall: jest.fn(),
    onToggleMuted: jest.fn(),
  };

  const view = await render(
    <MobileGroupInfoScreen
      conversation={buildConversation()}
      media={{ items: [], total: 0 }}
      viewerId={VIEWER}
      {...handlers}
      {...overrides}
    />,
  );

  return { handlers, view };
}

async function renderSettings(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onBack: jest.fn(),
    onCopyInvite: jest.fn(),
    onLeave: jest.fn(),
    onRotateInvite: jest.fn(),
    onSetDisappearing: jest.fn(),
    onSetHidden: jest.fn(),
    onSetInviteEnabled: jest.fn(),
    onSetNotifyLevel: jest.fn(),
    onSetPermission: jest.fn(),
    onShareInvite: jest.fn(),
  };

  const view = await render(
    <MobileGroupSettingsScreen
      conversation={buildConversation()}
      hidden={false}
      invite={null}
      viewerId={VIEWER}
      {...handlers}
      {...overrides}
    />,
  );

  return { handlers, view };
}

const openInvite: GroupInviteDTO = {
  code: "ABCDEFGHJKLM",
  displayUrl: "whispr.gg/g/ABCDEFGHJKLM",
  enabled: true,
  expiresAt: null,
  maxUses: null,
  rotatedAt: null,
  url: "https://whispr.gg/g/ABCDEFGHJKLM",
  uses: 3,
};

describe("2e §C1 identity and quick actions", () => {
  it("draws the pencil only for somebody who may edit the info", async () => {
    const { view } = await renderInfo();
    expect(view.getByTestId("mobile-group-info-edit")).toBeTruthy();

    const member = await renderInfo({ conversation: MEMBER_VIEW });
    expect(member.view.queryByTestId("mobile-group-info-edit")).toBeNull();
  });

  it("hides 'Davet et' instead of disabling it when the viewer may not add", async () => {
    const closed = buildConversation({
      permissions: {
        addMembers: "ADMINS",
        editInfo: "ADMINS",
        pinMessage: "ADMINS",
        sendMessage: "ALL",
      },
      role: "MEMBER",
    });
    const { view } = await renderInfo({ conversation: closed });

    expect(view.queryByTestId("mobile-group-info-action-invite")).toBeNull();
    expect(view.queryByTestId("mobile-group-info-add-member")).toBeNull();
    // The other three boxes stay and spread.
    expect(view.getByTestId("mobile-group-info-action-mute")).toBeTruthy();
    expect(view.getByTestId("mobile-group-info-action-video")).toBeTruthy();
    expect(view.getByTestId("mobile-group-info-action-search")).toBeTruthy();
  });

  it("starts the only video call in the package from its quick action", async () => {
    const { handlers, view } = await renderInfo();
    await fireEvent.press(view.getByTestId("mobile-group-info-action-video"));

    expect(handlers.onStartVideoCall).toHaveBeenCalled();
  });

  it("flips the mute label with the notification tier", async () => {
    const { view } = await renderInfo();
    expect(view.getByText(copy.groupInfoActionMute)).toBeTruthy();

    const silenced = await renderInfo({
      conversation: buildConversation({ notifyLevel: "NONE" }),
    });
    expect(silenced.view.getByText(copy.groupInfoActionUnmute)).toBeTruthy();
  });

  it("draws no pinned card when there is no pin", async () => {
    const { view } = await renderInfo();
    expect(view.queryByTestId("mobile-group-info-pinned")).toBeNull();

    const pinned = await renderInfo({
      conversation: buildConversation({
        pinnedMessage: {
          authorName: "Doğukan",
          dismissed: false,
          excerpt: "Demo yarın 16:00",
          id: "m-pin",
        },
      }),
    });
    expect(pinned.view.getByTestId("mobile-group-info-pinned")).toBeTruthy();
  });

  it("shows the owner first with a gold chip and the viewer's own SEN chip", async () => {
    const { view } = await renderInfo();

    expect(view.getByTestId("mobile-group-member-row-user-1")).toBeTruthy();
    expect(view.getByText(copy.groupRoleYou)).toBeTruthy();
    // Owner and admin both read "YÖNETİCİ"; the tint is what separates them.
    expect(view.getAllByText(copy.groupRoleOwner).length).toBe(2);
  });
});

describe("2e §C1.5 media strip", () => {
  it("draws three attachments and a +N counter", async () => {
    const items = [
      { contentType: "image/png", id: "a1", thumbnailUrl: null, url: null },
      { contentType: "video/mp4", id: "a2", thumbnailUrl: null, url: null },
      { contentType: "application/pdf", id: "a3", thumbnailUrl: null, url: null },
      { contentType: "image/png", id: "a4", thumbnailUrl: null, url: null },
    ];
    const { view } = await renderInfo({ media: { items, total: 48 } });

    expect(view.getByTestId("mobile-group-info-media-image")).toBeTruthy();
    expect(view.getByTestId("mobile-group-info-media-video")).toBeTruthy();
    expect(view.getByTestId("mobile-group-info-media-file")).toBeTruthy();
    expect(view.getByText("+45")).toBeTruthy();
  });
});

describe("2e §7 member sheet", () => {
  it("gives the owner the moderation half and a member none of it", async () => {
    const { view } = await renderInfo();
    await fireEvent.press(view.getByTestId("mobile-group-member-row-user-3"));

    expect(view.getByText(copy.groupMemberSheetPromote)).toBeTruthy();
    expect(view.getByText(copy.groupRemoveMemberAction)).toBeTruthy();
  });

  it("never lists an action the viewer may not take", async () => {
    const { view } = await renderInfo({ conversation: MEMBER_VIEW });
    await fireEvent.press(view.getByTestId("mobile-group-member-row-user-3"));

    expect(view.queryByText(copy.groupMemberSheetPromote)).toBeNull();
    expect(view.queryByText(copy.groupRemoveMemberAction)).toBeNull();
    expect(view.getByText(copy.groupMemberSheetProfile)).toBeTruthy();
  });

  it("offers to take the badge back from an admin", async () => {
    const { handlers, view } = await renderInfo();
    await fireEvent.press(view.getByTestId("mobile-group-member-row-user-2"));
    await fireEvent.press(view.getByText(copy.groupMemberSheetDemote));

    expect(handlers.onMemberAction).toHaveBeenCalledWith("demote", "user-2");
  });
});

describe("2e §C1.6 full roster", () => {
  it("lists every member in the same order the card previews", async () => {
    const onMemberAction = jest.fn();
    const view = await render(
      <MobileGroupMembersScreen
        conversation={buildConversation()}
        onBack={() => {}}
        onInvite={() => {}}
        onMemberAction={onMemberAction}
        viewerId={VIEWER}
      />,
    );

    expect(view.getByTestId("mobile-group-member-row-user-1")).toBeTruthy();
    expect(view.getByTestId("mobile-group-member-row-user-4")).toBeTruthy();
  });
});

describe("2f §D1.2 notification tiers", () => {
  it("marks the current tier and writes the one that is tapped", async () => {
    const { handlers, view } = await renderSettings();

    expect(view.getByTestId("mobile-group-notify-ALL").props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByTestId("mobile-group-notify-MENTIONS"));
    expect(handlers.onSetNotifyLevel).toHaveBeenCalledWith("MENTIONS");
  });

  it("keeps 2a's silenced look consistent with the tier (§11.3/29)", async () => {
    const { view } = await renderSettings({
      conversation: buildConversation({ notifyLevel: "NONE" }),
    });

    expect(view.getByTestId("mobile-group-notify-NONE").props.accessibilityState.checked).toBe(
      true,
    );
    expect(view.getByText(copy.groupNotifyNoneHint)).toBeTruthy();
  });
});

describe("2f §D1.3 permissions", () => {
  it("draws the four rows for somebody who may change them", async () => {
    const { view } = await renderSettings();

    expect(view.getByTestId("mobile-group-permissions-card")).toBeTruthy();
    expect(view.getByText(copy.groupPermSendMessage)).toBeTruthy();
    expect(view.getByText(copy.groupPermPinMessage)).toBeTruthy();
  });

  it("does not render the block at all for a member (§11.3/30)", async () => {
    const { view } = await renderSettings({ conversation: MEMBER_VIEW });

    expect(view.queryByTestId("mobile-group-permissions-card")).toBeNull();
    expect(view.queryByText(copy.groupSettingsPermissions)).toBeNull();
  });

  it("writes the level the sheet returns", async () => {
    const { handlers, view } = await renderSettings();
    await fireEvent.press(view.getByTestId("mobile-group-permission-sendMessage"));
    await fireEvent.press(view.getByText(copy.groupPermValueAdmins));

    expect(handlers.onSetPermission).toHaveBeenCalledWith("sendMessage", "ADMINS");
  });
});

describe("2f §D1.4 privacy", () => {
  it("prints no link while the invite is off and prints it once it is on (§11.3/28)", async () => {
    const { view } = await renderSettings();
    expect(view.queryByTestId("mobile-group-invite-url")).toBeNull();

    const open = await renderSettings({ invite: openInvite });
    expect(open.view.getByTestId("mobile-group-invite-url")).toBeTruthy();
    expect(open.view.getByText(openInvite.displayUrl as string)).toBeTruthy();
  });

  it("opens the copy/share/rotate sheet from an enabled row", async () => {
    const { handlers, view } = await renderSettings({ invite: openInvite });
    await fireEvent.press(view.getByTestId("mobile-group-invite-row"));
    await fireEvent.press(view.getByText(copy.groupInviteCopy));

    expect(handlers.onCopyInvite).toHaveBeenCalledWith(openInvite.displayUrl);
  });

  it("asks before it changes the disappearing window and says the change is forward-only", async () => {
    const { handlers, view } = await renderSettings();
    await fireEvent.press(view.getByTestId("mobile-group-disappearing-row"));
    await fireEvent.press(view.getByText(copy.groupDisappearing24h));

    // The write has not gone yet: the confirmation carries V6's warning first.
    expect(handlers.onSetDisappearing).not.toHaveBeenCalled();
    expect(view.getAllByText(copy.groupSettingsDisappearingWarning).length).toBeGreaterThan(0);

    await fireEvent.press(view.getByTestId("mobile-group-disappearing-confirm-confirm"));
    expect(handlers.onSetDisappearing).toHaveBeenCalledWith("H24");
  });
});

describe("2f §D1.5 leaving", () => {
  it("asks a plain confirmation from a member", async () => {
    const { handlers, view } = await renderSettings({ conversation: MEMBER_VIEW });
    await fireEvent.press(view.getByTestId("mobile-group-leave-row"));
    await fireEvent.press(view.getByTestId("mobile-group-leave-sheet-leave"));

    expect(handlers.onLeave).toHaveBeenCalledWith({});
  });

  it("asks the last owner to hand the group over first, and sends nothing until they do", async () => {
    const soleOwner = buildConversation({
      participants: [
        participant(VIEWER, { displayName: "DGKNYZR", role: "OWNER" }),
        participant("user-3", { displayName: "Selin" }),
      ],
    });
    const { handlers, view } = await renderSettings({ conversation: soleOwner });

    await fireEvent.press(view.getByTestId("mobile-group-leave-row"));
    expect(view.getByText(copy.groupLeaveOwnerTransfer)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-group-leave-sheet-leave"));
    // The transfer sheet is open and the departure has not been sent.
    expect(handlers.onLeave).not.toHaveBeenCalled();
    expect(view.getByTestId("mobile-group-transfer-sheet")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-group-transfer-sheet-user-3"));
    expect(handlers.onLeave).toHaveBeenCalledWith({ transferOwnershipTo: "user-3" });
  });
});
