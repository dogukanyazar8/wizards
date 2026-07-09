import type { InfiniteData } from "@tanstack/react-query";
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

export function restoreMobileMessageSnapshot<TData>(_current: TData, snapshot: TData): TData {
  return snapshot;
}
