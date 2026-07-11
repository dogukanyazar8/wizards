import type { InfiniteData } from "@tanstack/react-query";
import type { MessageReaction } from "@wizards/types";
import { flattenMobileInfinitePages } from "./mobile-query-pages";

type MobileCacheMessage = {
  readonly id: string;
};

type MobileCachePage<TMessage extends MobileCacheMessage> = {
  readonly messages: readonly TMessage[];
};

type MobileMessageData<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
> = InfiniteData<TPage, TPageParam>;

function replaceMatchingMobileMessages<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  matchedIds: ReadonlySet<string>,
  replacement: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let inserted = false;
  const pages = data.pages.map((page) => {
    const messages: TMessage[] = [];

    for (const message of page.messages) {
      if (!matchedIds.has(message.id)) {
        messages.push(message);
        continue;
      }

      if (!inserted) {
        messages.push(replacement);
        inserted = true;
      }
    }

    return { ...page, messages } as TPage;
  });

  if (!inserted) {
    const newestPage = pages[0]!;
    pages[0] = {
      ...newestPage,
      messages: [...newestPage.messages, replacement],
    } as TPage;
  }

  return { ...data, pages };
}

export function flattenMobileInfiniteData<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(data: MobileMessageData<TMessage, TPage, TPageParam> | undefined): TMessage[] {
  return data ? flattenMobileInfinitePages(data.pages) : [];
}

export function insertOptimisticMobileMessage<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  message: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return replaceMatchingMobileMessages(data, new Set([message.id]), message);
}

export function replaceMobileMessage<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  previousId: string,
  message: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return replaceMatchingMobileMessages(data, new Set([previousId, message.id]), message);
}

export function appendOrReplaceMobileMessage<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  message: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return replaceMatchingMobileMessages(data, new Set([message.id]), message);
}

export function removeMobileMessage<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => {
    const messages = page.messages.filter((message) => message.id !== messageId);
    if (messages.length === page.messages.length) {
      return page;
    }

    changed = true;
    return { ...page, messages } as TPage;
  });

  return changed ? { ...data, pages } : data;
}

type MobileReactionCacheMessage = MobileCacheMessage & {
  readonly reactions: readonly MessageReaction[];
};

function updateMobileMessageById<
  TMessage extends MobileCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
  update: (message: TMessage) => TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const messages = page.messages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const nextMessage = update(message);
      if (nextMessage !== message) {
        changed = true;
        pageChanged = true;
      }
      return nextMessage;
    });

    return pageChanged ? ({ ...page, messages } as TPage) : page;
  });

  return changed ? { ...data, pages } : data;
}

function getNextMobileMessageReactions(
  reactions: readonly MessageReaction[],
  emoji: string,
  userId: string,
  shouldReact: boolean,
): readonly MessageReaction[] {
  const reactionIndex = reactions.findIndex((reaction) => reaction.emoji === emoji);
  const existingReaction = reactionIndex >= 0 ? reactions[reactionIndex] : undefined;

  if (shouldReact) {
    if (!existingReaction) {
      return [...reactions, { count: 1, emoji, userIds: [userId] }];
    }
    if (existingReaction.userIds.includes(userId)) {
      return reactions;
    }

    const userIds = [...existingReaction.userIds, userId];
    return reactions.map((reaction, index) =>
      index === reactionIndex ? { ...reaction, count: userIds.length, userIds } : reaction,
    );
  }

  if (!existingReaction || !existingReaction.userIds.includes(userId)) {
    return reactions;
  }

  const userIds = existingReaction.userIds.filter((currentUserId) => currentUserId !== userId);
  if (userIds.length === 0) {
    return reactions.filter((_, index) => index !== reactionIndex);
  }

  return reactions.map((reaction, index) =>
    index === reactionIndex ? { ...reaction, count: userIds.length, userIds } : reaction,
  );
}

export function applyMobileOptimisticMessageReaction<
  TMessage extends MobileReactionCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
  emoji: string,
  userId: string,
  shouldReact: boolean,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) => {
    const reactions = getNextMobileMessageReactions(message.reactions, emoji, userId, shouldReact);
    return reactions === message.reactions ? message : { ...message, reactions };
  });
}

export function replaceMobileMessageReactions<
  TMessage extends MobileReactionCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
  reactions: readonly MessageReaction[],
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) => ({ ...message, reactions }));
}

export function restoreMobileMessageSnapshot<TData>(_current: TData, snapshot: TData): TData {
  return snapshot;
}
