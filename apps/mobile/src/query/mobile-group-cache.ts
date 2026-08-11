import type { InfiniteData } from "@tanstack/react-query";
import type {
  DMConversationDTO,
  DMParticipantRole,
  MobileDMConversationListItem,
  MobileDMConversationsResponse,
} from "@wizards/types";

/**
 * Faz 3 §B7. The cache writes behind the group realtime events, as pure
 * functions: the bridge decides *when*, these decide *what*.
 *
 * All of them patch rather than invalidate. Re-reading a 32-member group every
 * time somebody's role changes is the cost §B7 exists to avoid, and every one of
 * them returns the input untouched when there is nothing to patch — an event for
 * a conversation this device has never cached must not seed a half-built row.
 */

export type MobileDMConversationsInfiniteData = InfiniteData<
  MobileDMConversationsResponse,
  unknown
>;

/** Patch fields a group event may move on an inbox row. */
export type MobileGroupConversationRowPatch = Partial<
  Pick<
    MobileDMConversationListItem,
    "avatarPair" | "muted" | "notifyLevel" | "overflowCount" | "pinnedAt"
  >
>;

export function patchMobileGroupConversationRow(
  data: MobileDMConversationsInfiniteData | undefined,
  conversationId: string,
  patch: MobileGroupConversationRowPatch,
): MobileDMConversationsInfiniteData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.conversations.some((conversation) => conversation.id === conversationId)) {
      return page;
    }

    changed = true;
    return {
      ...page,
      conversations: page.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, ...patch } : conversation,
      ),
    };
  });

  return changed ? { ...data, pages } : data;
}

/** What `dm:group:settings` carries; every key is optional on the DTO itself. */
export type MobileGroupSettingsPatch = Partial<
  Pick<
    DMConversationDTO,
    | "avatarColor"
    | "description"
    | "disappearingAfter"
    | "historyVisibility"
    | "permissions"
    | "pinnedMessage"
  >
>;

export function patchMobileGroupDetails(
  current: DMConversationDTO | undefined,
  patch: MobileGroupSettingsPatch,
): DMConversationDTO | undefined {
  return current ? { ...current, ...patch } : current;
}

/**
 * 2e §6/§7. A role change moves two things on the same body: the member's own
 * chip and, when the group changed hands, `ownerId`. Both are written here so a
 * screen never sees a roster where the new owner is still a member.
 */
export function patchMobileGroupMemberRole(
  current: DMConversationDTO | undefined,
  input: {
    readonly ownerId: string | null;
    readonly role: DMParticipantRole;
    readonly userId: string;
  },
): DMConversationDTO | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    ownerId: input.ownerId,
    participants: current.participants.map((participant) => {
      if (participant.userId === input.userId) {
        return { ...participant, role: input.role };
      }

      // The previous owner is demoted by the same event: the payload names only
      // the promoted member, so anyone still marked OWNER who is not the new
      // `ownerId` would otherwise keep a chip the server has taken away.
      if (participant.role === "OWNER" && participant.userId !== input.ownerId) {
        return { ...participant, role: "ADMIN" as const };
      }

      return participant;
    }),
  };
}

/** A roster cached on its own key, patched by the same event. */
export function patchMobileGroupMemberList<
  TMember extends { readonly role?: DMParticipantRole | undefined; readonly userId: string },
  TData extends { readonly members: TMember[] },
>(
  current: TData | undefined,
  input: {
    readonly ownerId: string | null;
    readonly role: DMParticipantRole;
    readonly userId: string;
  },
): TData | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    members: current.members.map((member) => {
      if (member.userId === input.userId) {
        return { ...member, role: input.role };
      }

      if (member.role === "OWNER" && member.userId !== input.ownerId) {
        return { ...member, role: "ADMIN" as const };
      }

      return member;
    }),
  };
}

/**
 * K3's `dm:message:expired`. The rows are already gone on the server, so the
 * stream drops them outright rather than tombstoning them — a purge is not a
 * delete-for-everyone and leaves no "silindi" placeholder (Faz 2 karar 4).
 */
export function removeMobileExpiredMessages<
  TMessage extends { readonly id: string },
  TPage extends { readonly messages: TMessage[] },
  TPageParam,
>(
  data: InfiniteData<TPage, TPageParam> | undefined,
  messageIds: readonly string[],
): InfiniteData<TPage, TPageParam> | undefined {
  if (!data || data.pages.length === 0 || messageIds.length === 0) {
    return data;
  }

  const expired = new Set(messageIds);
  let changed = false;
  const pages = data.pages.map((page) => {
    const messages = page.messages.filter((message) => !expired.has(message.id));
    if (messages.length === page.messages.length) {
      return page;
    }

    changed = true;
    return { ...page, messages } as TPage;
  });

  return changed ? { ...data, pages } : data;
}
