import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMConversationDTO, DMParticipantDTO } from "@wizards/types";

import { DmSidebar, type DmConversationItemView } from "@/components/dm/dm-sidebar";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import {
  getGroupConversationTitle,
  getGroupPreviewAuthorPrefix,
} from "@/lib/dm/group-presentation";

function participant(userId: string, displayName: string): DMParticipantDTO {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName,
    muted: false,
    presence: { customStatus: null, status: "OFFLINE" },
    status: "OFFLINE",
    unreadCount: 0,
    userId,
    username: displayName.toLocaleLowerCase(),
  };
}

function groupConversation(name: string | null): DMConversationDTO {
  return {
    iconUrl: null,
    id: "dm-group-1",
    lastMessage: {
      attachments: [],
      author: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Selin",
        id: "user-2",
        status: "OFFLINE",
        username: "selin",
      },
      content: "deploy tamam",
      conversationId: "dm-group-1",
      createdAt: "2026-08-07T10:00:00.000Z",
      deletedAt: null,
      deletedById: null,
      editedAt: null,
      id: "message-1",
      reactions: [],
      replyTo: null,
      replyToId: null,
      systemTargetUserIds: [],
      systemType: null,
      systemValue: null,
      threadParentId: null,
      userId: "user-2",
    },
    lastMessageAt: "2026-08-07T10:00:00.000Z",
    name,
    ownerId: "user-1",
    participants: [
      participant("user-1", "Ada"),
      participant("user-2", "Selin"),
      participant("user-3", "Kaan"),
    ],
    type: "GROUP_DM",
  };
}

function buildItem(conversation: DMConversationDTO): DmConversationItemView {
  const preview = `${getGroupPreviewAuthorPrefix(conversation, "user-1", "Sen")}deploy tamam`;

  return {
    avatarUrl: conversation.iconUrl,
    conversation,
    displayName: getGroupConversationTitle(conversation, "user-1", "?", "tr"),
    groupAvatars: conversation.participants
      .filter((entry) => entry.userId !== "user-1")
      .map((entry) => ({
        avatarUrl: entry.avatarUrl,
        id: entry.userId,
        label: entry.displayName ?? entry.username,
      })),
    handle: null,
    isActive: false,
    isGroup: true,
    isMuted: false,
    memberCount: conversation.participants.length,
    preview,
    searchText: "",
    status: "OFFLINE",
    timestampLabel: null,
    unreadCount: 0,
  };
}

function renderSidebar(
  conversation: DMConversationDTO,
  overrides: Partial<DmConversationItemView> = {},
) {
  const item = { ...buildItem(conversation), ...overrides };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DmSidebar
        activeFilter="all"
        conversations={[item]}
        conversationsLoading={false}
        filteredConversations={[item]}
        hasNextPage={false}
        incomingRequests={[]}
        isFetchingNextPage={false}
        isHidingConversation={false}
        onCreateGroup={() => undefined}
        onFilterChange={() => undefined}
        onHideConversation={async () => undefined}
        onLoadMore={() => undefined}
        onMarkConversationRead={async () => undefined}
        onMarkConversationUnread={async () => undefined}
        onNavigate={() => undefined}
        onOpenConversation={() => undefined}
        onSearchChange={() => undefined}
        onSetConversationMuted={async () => undefined}
        onStartNewChat={() => undefined}
        searchQuery=""
        text={{
          all: "Tümü",
          botNotifications: "Bot",
          botNotificationsDescription: "Bot",
          createGroup: "Grup oluştur",
          directMessages: "Direkt mesajlar",
          emptyDescription: "",
          emptyRequests: "",
          emptySearch: "",
          emptyTitle: "",
          friends: "Arkadaşlar",
          groups: "Gruplar",
          hideConversation: () => "",
          loadMore: "",
          loadingMore: "",
          markRead: "",
          markUnread: "",
          memberCount: (count) => `${count} üye`,
          moreActions: () => "",
          mute: "",
          newChat: "Yeni sohbet",
          pendingRequests: "",
          pinSoon: "",
          pinned: "",
          previewBadge: "",
          quickStart: "",
          requests: "",
          requestsDescription: () => "",
          searchPlaceholder: "",
          subtitle: "",
          unmute: "",
          unread: "",
          pinnedSection: "Sabitlenen",
          unreadEmpty: "",
        }}
        unreadCount={0}
      />
    </LocaleProvider>,
  );
}

describe("DM sidebar group row", () => {
  it("offers a group-creation control beside the new-chat button", () => {
    const markup = renderSidebar(groupConversation("Takım"));

    assert.match(markup, /dm-create-group-button/);
    assert.match(markup, /dm-new-chat-button/);
  });

  it("titles a named group with its name", () => {
    assert.match(renderSidebar(groupConversation("Takım")), /Takım/);
  });

  it("titles an unnamed group with its members, viewer excluded", () => {
    const markup = renderSidebar(groupConversation(null));

    // §4.4: the same string 2c promises ("… ve DY"), built by the shared rule in
    // `@wizards/types` rather than by a comma join here.
    assert.match(markup, /Selin ve Kaan/);
  });

  it("stacks member avatars and shows the member count instead of a handle", () => {
    const markup = renderSidebar(groupConversation(null));

    assert.match(markup, /dm-conversation-dm-group-1-avatar-stack/);
    assert.match(markup, /dm-conversation-dm-group-1-member-count/);
    assert.match(markup, /3 üye/);
  });

  it("prefixes the group preview with the author", () => {
    assert.match(renderSidebar(groupConversation("Takım")), /Selin: deploy tamam/);
  });

  // K1 parity: the mobile inbox has had this filter since Faz 2.
  it("offers a groups filter beside the unread one", () => {
    const markup = renderSidebar(groupConversation("Takım"));

    assert.match(markup, /dm-filter-groups/);
    assert.match(markup, /dm-filter-unread/);
  });

  /** F2's three list indicators, in the order 2a draws them. */
  it("lifts a pinned conversation under its own heading", () => {
    const markup = renderSidebar(groupConversation("Takım"), {
      pinnedAt: "2026-08-11T08:00:00.000Z",
    });

    assert.match(markup, /dm-conversation-pinned-section/);
    assert.match(markup, /Sabitlenen/);
  });

  it("draws no pinned heading when nothing is pinned", () => {
    assert.doesNotMatch(
      renderSidebar(groupConversation("Takım")),
      /dm-conversation-pinned-section/,
    );
  });

  it("keeps the mention badge and the unread badge on the same row", () => {
    const markup = renderSidebar(groupConversation("Takım"), {
      mentionCount: 2,
      unreadCount: 12,
    });

    assert.match(markup, /dm-conversation-dm-group-1-mention-badge/);
    assert.match(markup, /dm-conversation-dm-group-1-unread-badge/);
    // 2a §5: the mention badge is the left one.
    assert.ok(
      markup.indexOf("dm-conversation-dm-group-1-mention-badge") <
        markup.indexOf("dm-conversation-dm-group-1-unread-badge"),
    );
  });
});
