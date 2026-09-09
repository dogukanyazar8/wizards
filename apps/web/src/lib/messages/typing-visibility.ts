import { prisma } from "@wizards/db";
import type { ConversationPrivacy } from "@wizards/types";

import { logError } from "@/lib/logger";

/**
 * Mesajlar §15.5 madde 2 — the privacy card's two switches (`Okundu bilgisi`,
 * `Yazıyor göstergesi`), stored as `UserSettings.showReadReceipts` and
 * `UserSettings.showTypingIndicator` (karar K9).
 *
 * Both are enforced on the **publishing** side and never by filtering at the
 * reader. A stamp that is filtered on arrival has already crossed the wire, and
 * the wire is where a second client — an older build, another tab, a device
 * that reconnects with a stale cache — can still read it. A preference that is
 * off has to mean the event was never emitted.
 *
 * This module is the single decision point for both flags. Four publishers ask
 * the same question (the web DM read broadcast, its mobile twin, channel typing
 * and DM typing); four copies of the comparison would be four chances for one of
 * them to keep publishing after the switch went off.
 */

export type MessagePrivacyColumns = {
  readonly showReadReceipts: boolean;
  readonly showTypingIndicator: boolean;
};

export type MessagePrivacyLoader = (userId: string) => Promise<MessagePrivacyColumns | null>;

/** Both columns default to `true`; a user with no settings row never opted out. */
export const DEFAULT_MESSAGE_PRIVACY: ConversationPrivacy = Object.freeze({
  readReceipts: true,
  typingIndicator: true,
});

export function resolveMessagePrivacy(
  columns: MessagePrivacyColumns | null | undefined,
): ConversationPrivacy {
  if (!columns) {
    return DEFAULT_MESSAGE_PRIVACY;
  }

  return {
    readReceipts: columns.showReadReceipts,
    typingIndicator: columns.showTypingIndicator,
  };
}

export const loadMessagePrivacyColumns: MessagePrivacyLoader = (userId) =>
  prisma.userSettings.findUnique({
    where: { userId },
    select: { showReadReceipts: true, showTypingIndicator: true },
  });

/**
 * Reads the pair for one publisher.
 *
 * A failed read publishes **nothing**. The alternative — treating an unavailable
 * database as consent — turns any blip into a moment where an opted-out person
 * broadcasts. The same trade is already made one layer up: the typing rate limit
 * denies the event when Redis is unreachable rather than waving it through.
 */
export async function getMessagePrivacy(
  userId: string,
  load: MessagePrivacyLoader = loadMessagePrivacyColumns,
): Promise<ConversationPrivacy> {
  try {
    return resolveMessagePrivacy(await load(userId));
  } catch (error) {
    logError("[messages-privacy] Failed to read publish preferences", error);
    return { readReceipts: false, typingIndicator: false };
  }
}

export async function canPublishReadReceipt(
  userId: string,
  load: MessagePrivacyLoader = loadMessagePrivacyColumns,
): Promise<boolean> {
  return (await getMessagePrivacy(userId, load)).readReceipts;
}

export async function canPublishTypingIndicator(
  userId: string,
  load: MessagePrivacyLoader = loadMessagePrivacyColumns,
): Promise<boolean> {
  return (await getMessagePrivacy(userId, load)).typingIndicator;
}

export const MESSAGE_PRIVACY_CACHE_TTL_MS = 60_000;

/**
 * A socket connection asks this once per keystroke burst, so the read is cached
 * for the life of that burst rather than issued per event. The window is the one
 * the DM participant cache in the typing handler already uses: a person who
 * flips the switch stops (or starts) publishing within a minute, and nothing in
 * between is worth a query per keypress.
 *
 * Errors are not cached — a blip must not pin a connection shut for a minute.
 */
export function createMessagePrivacyCache(
  options: {
    load?: MessagePrivacyLoader;
    now?: () => number;
    ttlMs?: number;
  } = {},
) {
  const load = options.load ?? loadMessagePrivacyColumns;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? MESSAGE_PRIVACY_CACHE_TTL_MS;
  let cached: { expiresAt: number; value: ConversationPrivacy } | null = null;

  return async function readMessagePrivacy(userId: string): Promise<ConversationPrivacy> {
    if (cached && cached.expiresAt > now()) {
      return cached.value;
    }

    let columns: MessagePrivacyColumns | null;
    try {
      columns = await load(userId);
    } catch (error) {
      logError("[messages-privacy] Failed to read publish preferences", error);
      return { readReceipts: false, typingIndicator: false };
    }

    const value = resolveMessagePrivacy(columns);
    cached = { expiresAt: now() + ttlMs, value };

    return value;
  };
}
