import { prisma } from "@wizards/db";
import type { MobileDMConversationPreviewKind } from "@wizards/types";

/**
 * Messaging redesign 1a. The conversation row wants four facts the DM DTO never
 * carried: the mention badge, whether a participant is a bot, what kind of
 * message the preview is describing, and whether the viewer's own last message
 * has been read.
 *
 * `DMParticipant.mentionCount` and `User.isBot` already exist in the schema —
 * they were simply never selected into the list payload — so this is a read
 * beside `listDirectMessages`, not a new column.
 */

export type MobileDMConversationContext = {
  /** Mentions of the viewer waiting in this conversation. */
  readonly mentionCount: number;
  /**
   * Newest `lastDeliveredAt` across every participant that is not the viewer:
   * "it reached somebody else's device", which is the grey two-tick state.
   */
  readonly othersLastDeliveredAt: Date | null;
  /**
   * Newest `lastReadAt` across every participant that is not the viewer. In a
   * group DM that means "someone else has read this far", which is what the
   * two-tick state claims on a list row.
   */
  readonly othersLastReadAt: Date | null;
  /** Participant ids flagged as bots, for the "BOT" badge. */
  readonly botUserIds: ReadonlySet<string>;
};

const EMPTY_CONTEXT: MobileDMConversationContext = Object.freeze({
  botUserIds: new Set<string>(),
  mentionCount: 0,
  othersLastDeliveredAt: null,
  othersLastReadAt: null,
});

export function getEmptyMobileDMConversationContext(): MobileDMConversationContext {
  return EMPTY_CONTEXT;
}

export async function loadMobileDMConversationContext(
  viewerId: string,
  conversationIds: readonly string[],
): Promise<Map<string, MobileDMConversationContext>> {
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) {
    return new Map();
  }

  const participants = await prisma.dMParticipant.findMany({
    where: { conversationId: { in: ids } },
    select: {
      conversationId: true,
      lastDeliveredAt: true,
      lastReadAt: true,
      mentionCount: true,
      userId: true,
      user: { select: { isBot: true } },
    },
  });

  const contexts = new Map<
    string,
    {
      botUserIds: Set<string>;
      mentionCount: number;
      othersLastDeliveredAt: Date | null;
      othersLastReadAt: Date | null;
    }
  >(
    ids.map((id) => [
      id,
      {
        botUserIds: new Set<string>(),
        mentionCount: 0,
        othersLastDeliveredAt: null,
        othersLastReadAt: null,
      },
    ]),
  );

  for (const participant of participants) {
    const context = contexts.get(participant.conversationId);
    if (!context) {
      continue;
    }

    if (participant.user.isBot) {
      context.botUserIds.add(participant.userId);
    }

    if (participant.userId === viewerId) {
      context.mentionCount = participant.mentionCount;
      continue;
    }

    if (
      participant.lastReadAt &&
      (!context.othersLastReadAt || participant.lastReadAt > context.othersLastReadAt)
    ) {
      context.othersLastReadAt = participant.lastReadAt;
    }

    if (
      participant.lastDeliveredAt &&
      (!context.othersLastDeliveredAt ||
        participant.lastDeliveredAt > context.othersLastDeliveredAt)
    ) {
      context.othersLastDeliveredAt = participant.lastDeliveredAt;
    }
  }

  return new Map(contexts);
}

/**
 * What the preview is describing.
 *
 * Any `audio/*` attachment reads as a voice note: the mobile recorder is the
 * only producer of one, and a hand-picked audio file is still an audio message,
 * so the microphone row is the honest rendering either way. `durationSec` is
 * whatever the attachment recorded and is simply absent when nothing did.
 */
export function resolveMobileDMPreviewKind(
  contentType: string | null | undefined,
): MobileDMConversationPreviewKind {
  const normalized = (contentType ?? "").trim().toLowerCase();
  if (normalized.startsWith("audio/")) {
    return "voice";
  }
  if (normalized.startsWith("image/")) {
    return "image";
  }
  return "file";
}

export function resolveMobileDMPreviewDurationSec(
  duration: number | null | undefined,
): number | null {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return Math.min(Math.round(duration), 86_400);
}
