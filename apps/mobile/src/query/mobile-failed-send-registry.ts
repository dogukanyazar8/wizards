export type MobileFailedSendScope = `channel:${string}` | `dm:${string}`;

export type MobileFailedSendMessage = {
  readonly createdAt: string;
  readonly id: string;
};

export type MobileFailedSendEntry<
  TDraft = unknown,
  TMessage extends MobileFailedSendMessage = MobileFailedSendMessage,
> = {
  readonly clientId: string;
  readonly draft: TDraft;
  readonly message: TMessage;
};

export type MobileFailedSendRegistry = {
  readonly add: (scope: MobileFailedSendScope, entry: MobileFailedSendEntry) => void;
  readonly clear: () => void;
  readonly getEntries: (scope: MobileFailedSendScope) => readonly MobileFailedSendEntry[];
  readonly remove: (
    scope: MobileFailedSendScope,
    clientId: string,
  ) => MobileFailedSendEntry | undefined;
  readonly subscribe: (listener: () => void) => () => void;
};

const EMPTY_ENTRIES: readonly MobileFailedSendEntry[] = Object.freeze([]);

export function createMobileFailedSendRegistry(): MobileFailedSendRegistry {
  const entriesByScope = new Map<MobileFailedSendScope, MobileFailedSendEntry[]>();
  // Snapshots stay referentially stable until their scope changes so
  // useSyncExternalStore does not loop on every render.
  const snapshotsByScope = new Map<MobileFailedSendScope, readonly MobileFailedSendEntry[]>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const getEntries = (scope: MobileFailedSendScope): readonly MobileFailedSendEntry[] => {
    const cached = snapshotsByScope.get(scope);
    if (cached) {
      return cached;
    }

    const entries = entriesByScope.get(scope);
    if (!entries || entries.length === 0) {
      return EMPTY_ENTRIES;
    }

    const snapshot = Object.freeze([...entries]);
    snapshotsByScope.set(scope, snapshot);
    return snapshot;
  };

  return {
    add: (scope, entry) => {
      const entries = entriesByScope.get(scope) ?? [];
      const index = entries.findIndex((current) => current.clientId === entry.clientId);
      if (index >= 0) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }
      entriesByScope.set(scope, entries);
      snapshotsByScope.delete(scope);
      notify();
    },
    clear: () => {
      entriesByScope.clear();
      snapshotsByScope.clear();
      notify();
    },
    getEntries,
    remove: (scope, clientId) => {
      const entries = entriesByScope.get(scope);
      const index = entries?.findIndex((current) => current.clientId === clientId) ?? -1;
      if (!entries || index < 0) {
        return undefined;
      }

      const [removed] = entries.splice(index, 1);
      if (entries.length === 0) {
        entriesByScope.delete(scope);
      }
      snapshotsByScope.delete(scope);
      notify();
      return removed;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const mobileFailedSendRegistry = createMobileFailedSendRegistry();

export function getMobileChannelFailedSendScope(channelId: string): MobileFailedSendScope {
  return `channel:${channelId}`;
}

export function getMobileDMFailedSendScope(conversationId: string): MobileFailedSendScope {
  return `dm:${conversationId}`;
}

/**
 * Re-attaches failed optimistic messages that a server refetch dropped, so a
 * failed bubble survives until the user retries or discards it.
 */
export function mergeMobileFailedMessages<TMessage extends MobileFailedSendMessage>(
  messages: readonly TMessage[],
  failedEntries: readonly MobileFailedSendEntry[],
): readonly TMessage[] {
  if (failedEntries.length === 0) {
    return messages;
  }

  const existingIds = new Set(messages.map((message) => message.id));
  const missing = failedEntries
    .filter((entry) => !existingIds.has(entry.message.id))
    .map((entry) => entry.message as TMessage);

  if (missing.length === 0) {
    return messages;
  }

  return [...messages, ...missing].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    }
    return left.createdAt < right.createdAt ? -1 : 1;
  });
}

/**
 * Applies {@link mergeMobileFailedMessages} to a message view state, returning
 * the original state whenever there is nothing to restore.
 */
export function withMobileFailedSendOverlay<
  TMessage extends MobileFailedSendMessage,
  TState extends { readonly payload: { readonly messages: readonly TMessage[] } | null },
>(state: TState, failedSends: readonly MobileFailedSendEntry[]): TState {
  if (!state.payload || failedSends.length === 0) {
    return state;
  }

  const messages = mergeMobileFailedMessages(state.payload.messages, failedSends);
  return messages === state.payload.messages
    ? state
    : { ...state, payload: { ...state.payload, messages } };
}
