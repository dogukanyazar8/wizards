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
