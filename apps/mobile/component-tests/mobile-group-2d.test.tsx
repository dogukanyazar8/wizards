import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import type { DMConversationDTO } from "@wizards/types";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { DMConversationScreen } from "../src/app/screens/dm-conversation-screen";
import type { MobileGroupChatBindings } from "../src/app/screens/dm-conversation-screen";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §F — 2d. The nine rules §F lists, each against
 * the rendered screen rather than the model underneath it (the model has its own
 * 106 tests in `scripts/mobile-group-chat-model.test.ts`).
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

function message(id: string, authorId: string, overrides: Record<string, unknown> = {}) {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: authorId.toUpperCase(),
      id: authorId,
      status: "OFFLINE" as const,
      username: authorId,
    },
    content: `mesaj ${id}`,
    conversationId: "group-1",
    createdAt: "2026-08-11T12:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    reactions: [],
    replyTo: null,
    replyToId: null,
    systemTargetUserIds: [],
    systemType: null,
    systemValue: null,
    threadParentId: null,
    userId: authorId,
    ...overrides,
  };
}

function buildConversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    avatarPair: [
      { accent: "#C2185B", avatarUrl: null, initials: "AY", userId: "user-2" },
      { accent: "#C77A2B", avatarUrl: null, initials: "SL", userId: "user-3" },
    ],
    avatarColor: "#4F46E5",
    description: null,
    disappearingAfter: "OFF",
    historyVisibility: "ALL",
    iconUrl: null,
    id: "group-1",
    lastMessage: null,
    lastMessageAt: "2026-08-11T12:00:00.000Z",
    memberCount: 6,
    name: "Whispr Mobil Ekibi",
    notifyLevel: "ALL",
    onlineCount: 3,
    overflowCount: 4,
    ownerId: VIEWER,
    participants: [
      participant(VIEWER, { displayName: "DGKNYZR", nameColor: "#8A46C7", role: "OWNER" }),
      participant("user-2", { displayName: "Ayşegül", nameColor: "#C2185B" }),
      participant("user-3", { displayName: "Selin", nameColor: "#C77A2B" }),
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

function buildGroup(
  conversation: DMConversationDTO,
  overrides: Partial<MobileGroupChatBindings> = {},
): MobileGroupChatBindings {
  const base: MobileGroupChatBindings = {
    muted: false,
    onJoinCall: jest.fn(),
    onLeave: jest.fn(),
    onOpenSearch: jest.fn(),
    onToggleMuted: jest.fn(),
    state: {
      callBanner: { count: 0, status: "idle", video: false },
      capabilities: {
        canAddMembers: true,
        canEditInfo: true,
        canManageRoles: true,
        canPin: true,
        canSend: true,
        canTransferOwnership: true,
      },
      details: conversation,
      members: conversation.participants,
      mentionCandidates: [],
      onDismissPin: jest.fn(),
      onOpenInfo: jest.fn(),
      onOpenMembers: jest.fn(),
      onOpenSettings: jest.fn(),
      pinnedStrip: { messageId: null, preview: "", visible: false },
      title: conversation.name,
    },
  };

  return {
    ...base,
    ...overrides,
    state: { ...base.state, ...(overrides.state ?? {}) },
  };
}

async function renderChat({
  conversation = buildConversation(),
  group,
  messages = [message("m1", "user-2"), message("m2", "user-2"), message("m3", VIEWER)],
  participantReadStates,
}: {
  conversation?: DMConversationDTO;
  group?: Partial<MobileGroupChatBindings>;
  messages?: readonly ReturnType<typeof message>[];
  participantReadStates?: readonly { lastReadAt: string | null; userId: string }[];
} = {}) {
  const bindings = buildGroup(conversation, group ?? {});

  const view = await render(
    <DMConversationScreen
      attachmentsFeature={null}
      conversation={
        {
          avatarPair: conversation.avatarPair,
          id: conversation.id,
          lastMessageAt: conversation.lastMessageAt,
          muted: false,
          name: conversation.name,
          overflowCount: conversation.overflowCount,
          participantCount: conversation.memberCount,
          participants: [],
          type: "GROUP_DM",
          unreadCount: 0,
        } as never
      }
      currentUserId={VIEWER}
      group={bindings}
      isReactionMutationPending={false}
      mediaState={{ selectedAsset: null, status: "idle" } as never}
      onBack={() => {}}
      onClearSelectedMediaAsset={() => {}}
      onDeleteMessage={async () => true}
      onDiscardMessage={() => {}}
      onDraftChange={() => {}}
      onEditMessage={async () => true}
      onRefreshConversation={() => {}}
      onRefreshVisibleData={() => {}}
      onRequestDocumentPicker={async () => {}}
      onRequestPhotoLibraryPicker={async () => {}}
      onRetryMessage={() => {}}
      onSendMessage={async () => true}
      onStartVoiceCall={() => {}}
      onToggleMessageReaction={() => {}}
      state={
        {
          payload: {
            conversation,
            messages,
            nextCursor: null,
            ...(participantReadStates ? { participantReadStates } : {}),
          },
          status: "ready",
        } as never
      }
      syncHealth={{ severity: "ok", staleQueries: [] } as never}
      typingLabel={null}
    />,
  );

  return { bindings, view };
}

describe("2d §B1 header", () => {
  it("draws exactly two icon buttons and no video call", async () => {
    const { view } = await renderChat();

    expect(view.getByTestId("mobile-group-chat-voice-call")).toBeTruthy();
    expect(view.getByTestId("mobile-group-chat-menu")).toBeTruthy();
    // §11.3/23: the video entry point exists only on 2e.
    expect(view.queryByTestId("mobile-dm-video-call-button")).toBeNull();
  });

  it("keeps a 40-character name on one line beside the buttons (§11.3/24)", async () => {
    const name = "Whispr Mobil Ekibi Tasarım ve QA Ekibi!!";
    expect(name.length).toBe(40);
    const { view } = await renderChat({ conversation: buildConversation({ name }) });

    const title = view.getByText(name);
    expect(title.props.numberOfLines).toBe(1);
    expect(view.getByTestId("mobile-group-chat-voice-call")).toBeTruthy();
  });

  it("prints the member count and the online count, and drops the online half at zero", async () => {
    const { view } = await renderChat();
    expect(view.getByText("6 üye")).toBeTruthy();
    expect(view.getByText("3 çevrimiçi")).toBeTruthy();

    const quiet = await renderChat({
      conversation: buildConversation({ onlineCount: 0 }),
    });
    expect(quiet.view.queryByText("0 çevrimiçi")).toBeNull();
  });

  it("opens 2e from the title", async () => {
    const { bindings, view } = await renderChat();
    await fireEvent.press(view.getByTestId("mobile-group-chat-title"));

    expect(bindings.state.onOpenInfo).toHaveBeenCalled();
  });
});

function named(
  id: string,
  authorId: string,
  label: string,
  overrides: Record<string, unknown> = {},
) {
  const base = message(id, authorId, overrides);
  return { ...base, author: { ...base.author, displayName: label } };
}

function colorOf(node: { props: { style: unknown } }): string | undefined {
  return (
    [node.props.style]
      .flat(3)
      .find((entry) => entry && typeof entry === "object" && "color" in entry) as
      { color: string } | undefined
  )?.color;
}

describe("2d §11.0 sender identity", () => {
  it("names the sender on the group's first bubble and not on the next one", async () => {
    const { view } = await renderChat({
      messages: [
        named("m1", "user-2", "Ayşegül"),
        named("m2", "user-2", "Ayşegül"),
        named("m3", VIEWER, "DGKNYZR"),
      ],
    });

    // Two consecutive messages from Ayşegül: one name between them, and the
    // outgoing block never carries one at all.
    expect(view.getAllByTestId("mobile-group-sender-name")).toHaveLength(1);
    expect(view.getByText("Ayşegül")).toBeTruthy();
  });

  it("gives two different members two different colours", async () => {
    const { view } = await renderChat({
      messages: [named("m1", "user-2", "Ayşegül"), named("m2", "user-3", "Selin")],
    });

    const colors = view
      .getAllByTestId("mobile-group-sender-name")
      .map((node) => colorOf(node as never));

    expect(new Set(colors).size).toBe(2);
    expect(colors).toEqual(expect.arrayContaining(["#C2185B", "#C77A2B"]));
  });

  it("keeps the avatar column when the name is gone", async () => {
    const { view } = await renderChat({
      messages: [named("m1", "user-2", "Ayşegül"), named("m2", "user-2", "Ayşegül")],
    });

    // The avatar sits on the group's last bubble; the one above it reserves the
    // same 30px column so the block never shifts left.
    expect(view.getByTestId("mobile-dm-message-avatar-spacer-m1")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-message-author-avatar-m2")).toBeTruthy();
  });

  it("colours a reply quote with the quoted member's colour", async () => {
    const { view } = await renderChat({
      messages: [
        named("m1", "user-2", "Ayşegül"),
        named("m2", "user-3", "Selin", {
          replyTo: { ...named("m1", "user-2", "Ayşegül"), userId: "user-2" },
        }),
      ],
    });

    expect(view.getByTestId("mobile-dm-reply-quote-m2")).toBeTruthy();
    // The quote names Ayşegül, and its rule takes *her* colour rather than the
    // colour of the person who replied.
    const quoted = view.getAllByText("Ayşegül").map((node) => colorOf(node as never));
    expect(quoted).toContain("#C2185B");
  });
});

describe("2d §B3 read receipt", () => {
  const withReceipt = (count: number, everyone: boolean) => [
    message("m1", "user-2"),
    message("m3", VIEWER, {
      readReceipt: { count, everyone, readerIds: ["user-2", "user-3"] },
    }),
  ];

  it("draws under the last outgoing bubble only", async () => {
    const { view } = await renderChat({ messages: withReceipt(4, false) });

    expect(view.getAllByTestId("mobile-group-read-receipt")).toHaveLength(1);
    expect(view.getByText("4 kişi okudu")).toBeTruthy();
  });

  it("follows the live read states over the fetch-time snapshot", async () => {
    // The payload was captured when three people had read it. Since then the
    // socket has said only one of them actually has — the line must follow the
    // read states, not the snapshot the fetch happened to carry.
    const sentAt = message("m3", VIEWER).createdAt;
    const { view } = await renderChat({
      messages: [
        message("m1", "user-2"),
        message("m3", VIEWER, {
          readReceipt: { count: 3, everyone: true, readerIds: ["user-2", "user-3"] },
        }),
      ],
      participantReadStates: [
        { lastReadAt: new Date(Date.parse(sentAt) + 1000).toISOString(), userId: "user-2" },
        { lastReadAt: new Date(Date.parse(sentAt) - 1000).toISOString(), userId: "user-3" },
        { lastReadAt: new Date(Date.parse(sentAt) + 3000).toISOString(), userId: VIEWER },
      ],
    });

    expect(view.getByText("1 kişi okudu")).toBeTruthy();
  });

  it("drops the line when the live states show nobody has read it yet", async () => {
    const sentAt = message("m3", VIEWER).createdAt;
    const { view } = await renderChat({
      messages: [
        message("m3", VIEWER, {
          readReceipt: { count: 3, everyone: true, readerIds: ["user-2", "user-3"] },
        }),
      ],
      participantReadStates: [
        { lastReadAt: new Date(Date.parse(sentAt) - 1000).toISOString(), userId: "user-2" },
        { lastReadAt: null, userId: "user-3" },
      ],
    });

    expect(view.queryByTestId("mobile-group-read-receipt")).toBeNull();
  });

  it("draws nothing when nobody has read it", async () => {
    const { view } = await renderChat({
      messages: [
        message("m3", VIEWER, { readReceipt: { count: 0, everyone: false, readerIds: [] } }),
      ],
    });

    expect(view.queryByTestId("mobile-group-read-receipt")).toBeNull();
  });

  it("says 'Herkes okudu' when everybody has", async () => {
    const { view } = await renderChat({ messages: withReceipt(5, true) });

    expect(view.getByText(copy.groupChatReadByAll)).toBeTruthy();
  });

  it("draws nothing when somebody else spoke last", async () => {
    const { view } = await renderChat({
      messages: [
        message("m3", VIEWER, {
          readReceipt: { count: 2, everyone: false, readerIds: ["user-2"] },
        }),
        message("m4", "user-2"),
      ],
    });

    expect(view.queryByTestId("mobile-group-read-receipt")).toBeNull();
  });

  it("opens the readers sheet when tapped", async () => {
    const { view } = await renderChat({ messages: withReceipt(2, false) });
    await fireEvent.press(view.getByTestId("mobile-group-read-receipt"));

    expect(view.getByTestId("mobile-group-readers-sheet")).toBeTruthy();
  });
});

describe("2d §B2 pinned strip", () => {
  const pinned = {
    authorName: "Doğukan",
    dismissed: false,
    excerpt: "Demo yarın 16:00",
    id: "m-pin",
  };

  it("draws the strip and hides it locally when the cross is pressed", async () => {
    const onDismissPin = jest.fn();
    const { view } = await renderChat({
      conversation: buildConversation({ pinnedMessage: pinned }),
      group: {
        state: {
          onDismissPin,
          pinnedStrip: { messageId: "m-pin", preview: "Doğukan: Demo yarın 16:00", visible: true },
        } as never,
      },
    });

    expect(view.getByText(copy.groupChatPinned)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-group-pinned-dismiss"));
    expect(onDismissPin).toHaveBeenCalled();
  });

  it("draws nothing once this viewer has dismissed that pin", async () => {
    const { view } = await renderChat({
      conversation: buildConversation({ pinnedMessage: { ...pinned, dismissed: true } }),
      group: {
        state: { pinnedStrip: { messageId: "m-pin", preview: "", visible: false } } as never,
      },
    });

    expect(view.queryByTestId("mobile-group-pinned-strip")).toBeNull();
  });
});

describe("2d §B4 permission gate", () => {
  it("replaces the composer with a notice when only admins may send", async () => {
    const { view } = await renderChat({
      conversation: buildConversation({
        permissions: {
          addMembers: "ALL",
          editInfo: "ADMINS",
          pinMessage: "ADMINS",
          sendMessage: "ADMINS",
        },
        role: "MEMBER",
      }),
      group: {
        state: {
          capabilities: {
            canAddMembers: true,
            canEditInfo: false,
            canManageRoles: false,
            canPin: false,
            canSend: false,
            canTransferOwnership: false,
          },
        } as never,
      },
    });

    expect(view.getByTestId("mobile-group-send-blocked")).toBeTruthy();
    expect(view.getByText(copy.groupChatSendBlocked)).toBeTruthy();
    expect(view.queryByTestId("mobile-dm-composer-input")).toBeNull();
  });
});

describe("2d §B5 call banner", () => {
  it("draws the join banner while a call is running and sends the join", async () => {
    const onJoinCall = jest.fn();
    const { view } = await renderChat({
      group: {
        onJoinCall,
        state: { callBanner: { count: 3, status: "ongoing", video: false } } as never,
      },
    });

    expect(view.getByText("3 kişi görüşüyor")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-group-call-join"));
    expect(onJoinCall).toHaveBeenCalled();
  });

  it("draws nothing when the viewer is already inside", async () => {
    const { view } = await renderChat({
      group: { state: { callBanner: { count: 3, status: "joined", video: false } } as never },
    });

    expect(view.queryByTestId("mobile-group-call-banner")).toBeNull();
  });
});
