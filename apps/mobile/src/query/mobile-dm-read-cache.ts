import type { InfiniteData } from "@tanstack/react-query";
import type {
  MobileBootstrapDMConversationSummary,
  MobileDMConversationsResponse,
} from "@wizards/types";

/**
 * Marking a DM read used to invalidate the inbox *and* the bootstrap payload.
 * Bootstrap is the heaviest read the app makes, so every conversation the reader
 * opened — and every inbound message landing in an open conversation — put two
 * refetches on the wire next to the message fetch the reader was waiting for.
 *
 * The counters the read clears are already known locally, so they are patched
 * the way the channel read has always patched them. Drift is bounded: the
 * patched fields are re-read by the next natural bootstrap/inbox refetch
 * (staleness, reconnect, resume) and by the realtime unread events.
 */
export type MobileDMReadCachePatch<T> = {
  readonly data: T | undefined;
  readonly patched: boolean;
};

export type MobileDMConversationsCache = InfiniteData<MobileDMConversationsResponse, string | null>;

/** The bootstrap slice a DM read touches, so the helper stays testable. */
export type MobileBootstrapDMReadSlice = {
  readonly home: {
    readonly directMessages: {
      readonly recent: readonly MobileBootstrapDMConversationSummary[];
      readonly unreadCount: number;
    };
  };
};

function unchanged<T>(data: T | undefined): MobileDMReadCachePatch<T> {
  return { data, patched: false };
}

function isCleared(conversation: {
  readonly mentionCount: number;
  readonly unreadCount: number;
}): boolean {
  return conversation.unreadCount === 0 && conversation.mentionCount === 0;
}

export function readMobileDMConversationUnreadCount(
  data: MobileDMConversationsCache | undefined,
  conversationId: string,
): number {
  for (const page of data?.pages ?? []) {
    const conversation = page.conversations.find((entry) => entry.id === conversationId);
    if (conversation) {
      return conversation.unreadCount;
    }
  }

  return 0;
}

export function patchMobileDMConversationsRead(
  data: MobileDMConversationsCache | undefined,
  conversationId: string,
): MobileDMReadCachePatch<MobileDMConversationsCache> {
  if (!data) {
    return unchanged<MobileDMConversationsCache>(data);
  }

  const clearedCount = readMobileDMConversationUnreadCount(data, conversationId);
  let patched = false;
  const pages = data.pages.map((page) => {
    let pageTouched = false;
    const conversations = page.conversations.map((conversation) => {
      if (conversation.id !== conversationId || isCleared(conversation)) {
        return conversation;
      }

      pageTouched = true;
      return { ...conversation, mentionCount: 0, unreadCount: 0 };
    });
    // Every page carries the same inbox total, so all of them move together —
    // the badge reads it off whichever page it happens to hold.
    const totalUnreadCount = Math.max(0, page.totalUnreadCount - clearedCount);
    if (!pageTouched && totalUnreadCount === page.totalUnreadCount) {
      return page;
    }

    patched = true;
    return { ...page, conversations, totalUnreadCount };
  });

  return patched ? { data: { ...data, pages }, patched } : unchanged(data);
}

export function patchMobileBootstrapDMRead<T extends MobileBootstrapDMReadSlice>(
  data: T | undefined,
  input: { readonly clearedCount: number; readonly conversationId: string },
): MobileDMReadCachePatch<T> {
  if (!data) {
    return unchanged<T>(data);
  }

  const directMessages = data.home.directMessages;
  const entry = directMessages.recent.find(
    (conversation) => conversation.id === input.conversationId,
  );
  if (!entry) {
    return unchanged(data);
  }

  // The inbox cache is the better source, but a conversation the inbox has not
  // paged in yet still has its own count here.
  const clearedCount = input.clearedCount > 0 ? input.clearedCount : entry.unreadCount;
  const unreadCount = Math.max(0, directMessages.unreadCount - clearedCount);
  if (unreadCount === directMessages.unreadCount && isCleared(entry)) {
    return unchanged(data);
  }

  const recent = directMessages.recent.map((conversation) =>
    conversation.id === input.conversationId && !isCleared(conversation)
      ? { ...conversation, mentionCount: 0, unreadCount: 0 }
      : conversation,
  );

  return {
    data: {
      ...data,
      home: { ...data.home, directMessages: { ...directMessages, recent, unreadCount } },
    },
    patched: true,
  };
}
