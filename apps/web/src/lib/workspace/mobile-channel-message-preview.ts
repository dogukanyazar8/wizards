import type { MobileChannelLastMessagePreview } from "@wizards/types";

type MobileChannelMessagePreviewSource = {
  readonly author: {
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  };
  readonly content: string;
  readonly createdAt: Date | string;
  readonly id: string;
};

/**
 * Produces the bounded channel-list preview used by both the mobile API and
 * user-room socket events. Attachment-only messages intentionally fall back to
 * the authoritative workspace refresh rather than inventing display text.
 */
export function toMobileChannelMessagePreview(
  message: MobileChannelMessagePreviewSource,
): MobileChannelLastMessagePreview | null {
  const text = message.content.trim().replace(/\s+/g, " ").slice(0, 240);
  if (!text) {
    return null;
  }

  return {
    author: {
      displayName: message.author.displayName,
      id: message.author.id,
      username: message.author.username,
    },
    createdAt:
      typeof message.createdAt === "string" ? message.createdAt : message.createdAt.toISOString(),
    id: message.id,
    text,
  };
}
