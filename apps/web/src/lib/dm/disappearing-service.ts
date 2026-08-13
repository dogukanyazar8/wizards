import { prisma } from "@wizards/db";

import { extractUploadThingFileKey } from "@/lib/account/privacy-service";
import { logError as logErrorDefault } from "@/lib/logger";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §C3. The disappearing-message sweep.
 *
 * K3 makes this an irreversible delete, not the soft delete the message
 * endpoints do: a "Bu mesaj silindi" placeholder per vanished message would
 * defeat the whole feature, and the uploaded file would outlive the message that
 * carried it. So the rows go, the attachments cascade with them, and the storage
 * objects are removed by key.
 *
 * §4.10's ordering is the invariant this module exists to hold: **delete first,
 * announce second**. The other way round, a client that receives the event can
 * still re-fetch the message and put it straight back on screen.
 */

export type ExpiredDMMessageRow = {
  readonly attachments: ReadonlyArray<{ thumbnailUrl: string | null; url: string }>;
  readonly conversationId: string;
  readonly id: string;
  /** Zero or one row — the conversation this message is the pinned one of. */
  readonly pinnedInConversations: ReadonlyArray<{ id: string }>;
};

export type DisappearingPurgeDependencies = {
  deleteMessages(messageIds: readonly string[]): Promise<number>;
  deleteStorageObjects(fileKeys: readonly string[]): Promise<void>;
  emitExpired(input: { conversationId: string; messageIds: string[] }): void;
  emitUnpinned(input: { conversationId: string }): void;
  findExpired(input: { limit: number; now: Date }): Promise<ExpiredDMMessageRow[]>;
  logError(message: string, error: unknown): void;
  now(): Date;
};

export const defaultDisappearingPurgeDependencies: DisappearingPurgeDependencies = {
  deleteMessages: async (messageIds) => {
    return prisma.$transaction(async (tx) => {
      // Replies use ON DELETE RESTRICT, while thread children use CASCADE. Clear
      // both references in the same transaction so one referenced deadline
      // cannot poison the oldest purge batch or erase a still-live thread reply.
      await tx.dMMessage.updateMany({
        where: { replyToId: { in: [...messageIds] } },
        data: { replyToId: null },
      });
      await tx.dMMessage.updateMany({
        where: { threadParentId: { in: [...messageIds] } },
        data: { threadParentId: null },
      });
      const result = await tx.dMMessage.deleteMany({
        where: { id: { in: [...messageIds] } },
      });
      return result.count;
    });
  },
  deleteStorageObjects: async (fileKeys) => {
    // Imported lazily so a deployment without UploadThing credentials can still
    // load this module — the sweep itself has no other dependency on it.
    const { UTApi } = await import("uploadthing/server");
    const result = await new UTApi().deleteFiles([...fileKeys]);

    if (!result.success) {
      throw new Error("UploadThing rejected the delete batch");
    }
  },
  emitExpired: () => undefined,
  emitUnpinned: () => undefined,
  findExpired: ({ limit, now }) =>
    prisma.dMMessage.findMany({
      where: { expiresAt: { not: null, lte: now } },
      // Oldest deadline first, so a backlog drains in the order it accumulated
      // and no message can be starved by newer ones.
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        attachments: { select: { thumbnailUrl: true, url: true } },
        conversationId: true,
        id: true,
        pinnedInConversations: { select: { id: true } },
      },
    }),
  logError: logErrorDefault,
  now: () => new Date(),
};

function toFileKeys(rows: readonly ExpiredDMMessageRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .flatMap((row) => row.attachments)
        .flatMap((attachment) => [attachment.url, attachment.thumbnailUrl])
        .map(extractUploadThingFileKey)
        .filter((key): key is string => Boolean(key)),
    ),
  );
}

export async function purgeExpiredDMMessages(
  options: { limit: number },
  dependencies: DisappearingPurgeDependencies = defaultDisappearingPurgeDependencies,
): Promise<{ deleted: number }> {
  const rows = await dependencies.findExpired({
    limit: options.limit,
    now: dependencies.now(),
  });

  if (rows.length === 0) {
    return { deleted: 0 };
  }

  const deleted = await dependencies.deleteMessages(rows.map((row) => row.id));

  // Zero means another instance won the race for these rows. Announcing anyway
  // would tell clients to drop messages this run did not remove — and, worse,
  // would fire again on the next tick for the same ids.
  if (deleted === 0) {
    return { deleted: 0 };
  }

  const messageIdsByConversation = new Map<string, string[]>();
  const unpinnedConversationIds = new Set<string>();

  for (const row of rows) {
    const existing = messageIdsByConversation.get(row.conversationId);

    if (existing) {
      existing.push(row.id);
    } else {
      messageIdsByConversation.set(row.conversationId, [row.id]);
    }

    for (const pinned of row.pinnedInConversations) {
      unpinnedConversationIds.add(pinned.id);
    }
  }

  // One event per conversation, not per message: the client removes a list.
  for (const [conversationId, messageIds] of messageIdsByConversation) {
    dependencies.emitExpired({ conversationId, messageIds });
  }

  // The foreign key already dropped `pinnedMessageId`; the open clients still
  // hold the strip until something tells them it is gone.
  for (const conversationId of unpinnedConversationIds) {
    dependencies.emitUnpinned({ conversationId });
  }

  const fileKeys = toFileKeys(rows);
  if (fileKeys.length > 0) {
    try {
      await dependencies.deleteStorageObjects(fileKeys);
    } catch (error) {
      // The messages are already gone, which is the promise the feature made. A
      // file left behind is a storage cost, not a privacy regression the user
      // can see, and retrying it would mean keeping the rows around to find it.
      dependencies.logError("[dm] Disappearing message storage cleanup failed", error);
    }
  }

  return { deleted };
}
