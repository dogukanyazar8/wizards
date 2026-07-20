export type MobileInfiniteMessagePage<TMessage extends { readonly id: string }> = {
  readonly messages: readonly TMessage[];
};

export function flattenMobileInfinitePages<TMessage extends { readonly id: string }>(
  pages: readonly MobileInfiniteMessagePage<TMessage>[],
): TMessage[] {
  const messages: TMessage[] = [];
  const indexById = new Map<string, number>();

  for (const page of [...pages].reverse()) {
    for (const message of page.messages) {
      const existingIndex = indexById.get(message.id);

      if (existingIndex !== undefined) {
        messages[existingIndex] = message;
        continue;
      }

      indexById.set(message.id, messages.length);
      messages.push(message);
    }
  }

  return messages;
}

export type MobileInfiniteLoadMoreSource = {
  readonly fetchNextPage: () => unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
};

/**
 * `onStartReached` fires repeatedly while the reader sits near the top of a
 * message list, so the guard matters more than it looks: without it a single
 * scroll gesture queues one request per frame.
 */
export function loadMoreMobileInfinitePages(source: MobileInfiniteLoadMoreSource): boolean {
  if (!source.hasNextPage || source.isFetchingNextPage) {
    return false;
  }

  void source.fetchNextPage();
  return true;
}
