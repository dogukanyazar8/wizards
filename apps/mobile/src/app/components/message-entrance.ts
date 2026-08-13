/**
 * Which transcript rows are arrivals, decided once for the whole list.
 *
 * A row cannot answer this about itself. Every row of a conversation mounts for
 * the first time when the screen opens, so the row's own `useEffect(..., [])`
 * played the "a message just arrived" entrance for all thirty messages of a
 * conversation the reader was merely reopening — old messages looked new, and a
 * device run measured ~337ms between `mounted` and `content` on a chat open with
 * no network in it at all, thirty simultaneous 180ms timing animations included.
 *
 * The list holds the tracker, so the decision is made where the difference
 * between "this is the transcript" and "this just landed" is actually visible.
 */
export type MobileMessageEntranceInput = {
  readonly createdAt: string;
  readonly id: string;
};

export interface MobileMessageEntranceTracker {
  /**
   * The ids that should animate for this batch.
   *
   * Returns the same Set object every call, mutated in place: the list's
   * `renderItem` memoizes on it, and a fresh identity per batch would re-mint
   * the callback — and with it every mounted row — on each socket event.
   */
  select(messages: readonly MobileMessageEntranceInput[]): ReadonlySet<string>;
}

export type MobileReactionEntranceInput = {
  readonly id: string;
  readonly reactions: readonly { readonly emoji: string }[];
};

export interface MobileReactionEntranceTracker {
  select(messages: readonly MobileReactionEntranceInput[]): ReadonlySet<string>;
}

function parseCreatedAt(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Seeded by the first non-empty batch, which is the transcript rather than an
 * arrival.
 *
 * After that a message animates only when it is both unknown *and* at least as
 * new as the newest message already on screen. The second half is what keeps
 * pagination quiet: an older page prepends thirty unknown ids at once, and none
 * of them is an arrival.
 */
export function createMobileMessageEntranceTracker(): MobileMessageEntranceTracker {
  const knownIds = new Set<string>();
  const entering = new Set<string>();
  let seeded = false;
  let newestAtMs = 0;

  return {
    select(messages) {
      if (messages.length === 0) {
        entering.clear();
        return entering;
      }

      // A batch that shares nothing with the last one is a different transcript,
      // not thirty arrivals: the same list renders whichever conversation the
      // reader opened, and a newer conversation's messages are all both unknown
      // and newer than the one before it.
      const isSameTranscript = messages.some((message) => knownIds.has(message.id));
      if (!seeded || !isSameTranscript) {
        seeded = true;
        entering.clear();
        knownIds.clear();
        newestAtMs = 0;
        for (const message of messages) {
          knownIds.add(message.id);
          newestAtMs = Math.max(newestAtMs, parseCreatedAt(message.createdAt));
        }
        return entering;
      }

      let nextNewestAtMs = newestAtMs;
      for (const message of messages) {
        const createdAtMs = parseCreatedAt(message.createdAt);
        if (!knownIds.has(message.id)) {
          knownIds.add(message.id);
          if (createdAtMs >= newestAtMs) {
            entering.add(message.id);
          }
        }
        nextNewestAtMs = Math.max(nextNewestAtMs, createdAtMs);
      }
      newestAtMs = nextNewestAtMs;

      // Both sets are pruned to the batch so a long-lived conversation does not
      // accumulate ids for messages that are no longer anywhere on screen.
      const presentIds = new Set(messages.map((message) => message.id));
      for (const id of knownIds) {
        if (!presentIds.has(id)) {
          knownIds.delete(id);
        }
      }
      for (const id of entering) {
        if (!presentIds.has(id)) {
          entering.delete(id);
        }
      }

      return entering;
    },
  };
}

/**
 * Tracks reaction chips at list scope, where an initial transcript can be
 * distinguished from a reaction arriving on an already mounted message.
 */
export function createMobileReactionEntranceTracker(): MobileReactionEntranceTracker {
  const knownMessageIds = new Set<string>();
  const knownReactionIds = new Set<string>();
  const entering = new Set<string>();
  let seeded = false;

  return {
    select(messages) {
      const presentMessageIds = new Set(messages.map((message) => message.id));
      const presentReactionIds = new Set<string>();

      for (const message of messages) {
        const wasKnownMessage = knownMessageIds.has(message.id);
        for (const reaction of message.reactions) {
          const reactionId = `${message.id}:${reaction.emoji}`;
          presentReactionIds.add(reactionId);
          if (seeded && wasKnownMessage && !knownReactionIds.has(reactionId)) {
            entering.add(reactionId);
          }
          knownReactionIds.add(reactionId);
        }
        knownMessageIds.add(message.id);
      }

      seeded ||= messages.length > 0;
      for (const messageId of knownMessageIds) {
        if (!presentMessageIds.has(messageId)) knownMessageIds.delete(messageId);
      }
      for (const reactionId of knownReactionIds) {
        if (!presentReactionIds.has(reactionId)) knownReactionIds.delete(reactionId);
      }
      for (const reactionId of entering) {
        if (!presentReactionIds.has(reactionId)) entering.delete(reactionId);
      }

      return entering;
    },
  };
}
