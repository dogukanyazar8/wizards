import type { MobileNotificationItem } from "@wizards/types";

/**
 * Pure logic for the Sunucular (servers) redesign: rail/switcher badge
 * selection, the compact server-pill unread aggregate, channel-name slugging
 * and collision detection, the "Kaçırdıkların" notification merge, the
 * create-access gate, and per-user category collapse persistence. Kept free of
 * React/storage so every rule is unit-tested from `scripts/*.test.ts`.
 */

export type MobileServerBadge =
  | { readonly count: number; readonly kind: "mention" }
  | { readonly count: number; readonly kind: "unread" }
  | { readonly kind: "none" };

/**
 * Badge priority shared by the rail (1a), the compact pill (1b) and the switcher
 * rows (1c): a mention outranks a plain unread, which outranks nothing.
 */
export function getMobileServerBadge(server: {
  readonly mentionCount: number;
  readonly unreadCount: number;
}): MobileServerBadge {
  if (server.mentionCount > 0) {
    return { count: server.mentionCount, kind: "mention" };
  }

  if (server.unreadCount > 0) {
    return { count: server.unreadCount, kind: "unread" };
  }

  return { kind: "none" };
}

/**
 * The compact header pill shows the unread waiting on the servers you are not
 * currently looking at, so the badge is the sum of every *other* server.
 */
export function getMobileOtherServersUnreadTotal(
  servers: readonly { readonly id: string; readonly unreadCount: number }[],
  currentServerId: string | null,
): number {
  return servers.reduce(
    (total, server) => (server.id === currentServerId ? total : total + server.unreadCount),
    0,
  );
}

const TURKISH_SLUG_MAP: Readonly<Record<string, string>> = {
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

const TURKISH_SLUG_PATTERN = new RegExp(`[${Object.keys(TURKISH_SLUG_MAP).join("")}]`, "g");

/**
 * Channel-name slug rule from 1e: Turkish letters transliterate to ascii, then
 * everything lowercases, whitespace/punctuation runs become single hyphens, and
 * stray edge hyphens are trimmed. Transliteration runs before lowercasing so
 * `İ` never expands into a combining-dot sequence.
 */
export function slugifyMobileChannelName(input: string): string {
  return input
    .replace(TURKISH_SLUG_PATTERN, (char) => TURKISH_SLUG_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Live variant for the 1e name field: same rules but it keeps a trailing hyphen
 * so a space typed between two words stays visible as `-` while typing, instead
 * of being swallowed. Submit still runs {@link slugifyMobileChannelName} to trim it.
 */
export function slugifyMobileChannelNameInput(input: string): string {
  return input
    .replace(TURKISH_SLUG_PATTERN, (char) => TURKISH_SLUG_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "");
}

/**
 * Client-side pre-check for the "Bu ad zaten kullanılıyor" error. Both sides are
 * slugged so `Welcome Chat` collides with an existing `welcome-chat`.
 */
export function hasMobileChannelNameCollision(
  existingNames: readonly string[],
  candidate: string,
): boolean {
  const target = slugifyMobileChannelName(candidate);
  if (target.length === 0) {
    return false;
  }

  return existingNames.some((name) => slugifyMobileChannelName(name) === target);
}

/**
 * "Kaçırdıkların": cross-server mentions and voice-room starts merged into one
 * newest-first list, bounded to a couple of cards.
 */
export function getMobileMissedNotifications(
  notifications: readonly MobileNotificationItem[],
  options?: { readonly limit?: number },
): MobileNotificationItem[] {
  const limit = options?.limit ?? 3;

  return notifications
    .filter((item) => item.type === "MENTION" || item.eventKind === "voice-room-started")
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

/**
 * `isAdmin` gate for every create entry point (header +, FAB, category +, 1d/1e):
 * channel management is the "Kanalları Yönet"/owner permission.
 */
export function getMobileServerCreateAccess(
  capabilities: { readonly canManageChannels: boolean } | null | undefined,
): boolean {
  return capabilities?.canManageChannels === true;
}

/** "N seste": people currently across every voice channel in the server. */
export function getMobileVoiceParticipantTotal(
  voiceStates: readonly { readonly participants: readonly unknown[] }[],
): number {
  return voiceStates.reduce((total, state) => total + state.participants.length, 0);
}

/** Collapse state persists per user, keyed by server so the same section id in two servers stays independent. */
export function buildMobileCollapsedSectionKey(serverId: string, sectionId: string): string {
  return `${serverId}:${sectionId}`;
}

export function parseMobileCollapsedSections(
  raw: string | null | undefined,
): Record<string, boolean> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return {};
    }

    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) {
        result[key] = true;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function serializeMobileCollapsedSections(map: Readonly<Record<string, boolean>>): string {
  return JSON.stringify(map);
}

/** Flip one section; a collapsed section is stored as `true`, an expanded one is dropped so the map stays minimal. */
export function toggleMobileCollapsedSection(
  map: Readonly<Record<string, boolean>>,
  key: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const [existingKey, value] of Object.entries(map)) {
    if (value === true && existingKey !== key) {
      next[existingKey] = true;
    }
  }

  if (map[key] !== true) {
    next[key] = true;
  }

  return next;
}
