import type { InfiniteData } from "@tanstack/react-query";
import type {
  MessageReaction,
  MessageThreadParticipant,
  MessageThreadSummary,
} from "@wizards/types";
import { flattenMobileInfinitePages } from "./mobile-query-pages";

type MobileCacheMessage = {
  readonly id: string;
};

type MobileEchoableMessage = MobileCacheMessage & {
  readonly clientNonce?: string | null | undefined;
};

/**
 * The ids an incoming server message may already occupy in the cache: its own,
 * plus the optimistic id its author rendered it under. The server echoes that id
 * back as `clientNonce` on the author's copy alone, and matching on it is what
 * turns "append a second bubble" into "fill in the one already on screen".
 */
export function getMobileMessageMatchIds(message: MobileEchoableMessage): ReadonlySet<string> {
  return message.clientNonce ? new Set([message.id, message.clientNonce]) : new Set([message.id]);
}

/**
 * The nonce belongs to one delivery, not to the message. Left in the cache it
 * would differ from the copy the next refetch brings back, so an identical
 * message would look changed and re-render the row for nothing.
 */
export function stripMobileMessageClientNonce<TMessage extends MobileEchoableMessage>(
  message: TMessage,
): TMessage {
  if (message.clientNonce === undefined) {
    return message;
  }

  const { clientNonce: _clientNonce, ...rest } = message;
  return rest as TMessage;
}

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
  TMessage extends MobileEchoableMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  previousId: string,
  message: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  const matchedIds = new Set(getMobileMessageMatchIds(message));
  matchedIds.add(previousId);
  return replaceMatchingMobileMessages(data, matchedIds, stripMobileMessageClientNonce(message));
}

export function appendOrReplaceMobileMessage<
  TMessage extends MobileEchoableMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  message: TMessage,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return replaceMatchingMobileMessages(
    data,
    getMobileMessageMatchIds(message),
    stripMobileMessageClientNonce(message),
  );
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

export function softDeleteMobileMessage<
  TMessage extends MobileCacheMessage & {
    readonly attachments: readonly unknown[];
    readonly content: string;
    readonly deletedAt: string | null;
    readonly reactions: readonly MessageReaction[];
  },
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
  deletedAt: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) => ({
    ...message,
    attachments: [],
    content: "",
    deletedAt,
    reactions: [],
  }));
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

export function markMobileMessageFailed<
  TMessage extends MobileCacheMessage & {
    readonly deliveryStatus?: "sending" | "failed" | undefined;
  },
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) =>
    message.deliveryStatus === "failed" ? message : { ...message, deliveryStatus: "failed" },
  );
}

export function updateMobileMessageContent<
  TMessage extends MobileCacheMessage & {
    readonly content: string;
    readonly editedAt?: string | null;
  },
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  messageId: string,
  content: string,
  editedAt: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, messageId, (message) => ({
    ...message,
    content,
    editedAt,
  }));
}

export function getNextMobileMessageReactions(
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

type MobileThreadSummaryCacheMessage = MobileCacheMessage & {
  readonly threadSummary?: MessageThreadSummary | undefined;
};

/**
 * 8d: a thread reply bumps the parent's summary card in the channel stream
 * (reply count, last reply time, and the facepile) before the server confirms.
 */
export function applyMobileOptimisticThreadReply<
  TMessage extends MobileThreadSummaryCacheMessage,
  TPage extends MobileCachePage<TMessage>,
  TPageParam,
>(
  data: MobileMessageData<TMessage, TPage, TPageParam> | undefined,
  parentMessageId: string,
  replier: MessageThreadParticipant,
  repliedAt: string,
): MobileMessageData<TMessage, TPage, TPageParam> | undefined {
  return updateMobileMessageById(data, parentMessageId, (message) => {
    const summary = message.threadSummary ?? {
      lastReplyAt: null,
      recentRepliers: [],
      replyCount: 0,
    };
    const recentRepliers = summary.recentRepliers.some(
      (participant) => participant.userId === replier.userId,
    )
      ? summary.recentRepliers
      : [...summary.recentRepliers, replier].slice(-3);

    return {
      ...message,
      threadSummary: {
        lastReplyAt: repliedAt,
        recentRepliers,
        replyCount: summary.replyCount + 1,
      },
    };
  });
}

/**
 * 8d: thread replies stay out of the channel stream unless their author ticked
 * "also send to channel", so realtime and optimistic writes both filter them.
 */
export function shouldRenderMobileMessageInChannelStream(message: {
  readonly alsoSentToChannel?: boolean | undefined;
  readonly threadParentId?: string | null | undefined;
}): boolean {
  return !message.threadParentId || message.alsoSentToChannel === true;
}
