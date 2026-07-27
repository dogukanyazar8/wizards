import type { Prisma, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";

export type EvidenceCaptureInput = {
  attachmentId?: string | undefined;
  caseId: string;
  dmMessageId?: string | undefined;
  messageId?: string | undefined;
  reportId: string;
  reporterId: string;
};

export type EvidenceSnapshot = {
  attachments: string[];
  authorHandle: string;
  authorId: string;
  content: string;
  scope: string;
  sentAt: string;
  source: "channel" | "dm";
};

export type EvidenceStore = Pick<
  PrismaClient,
  "dMMessage" | "dMParticipant" | "message" | "moderationEvidence" | "serverMember"
>;

/**
 * Evidence is only captured from what the reporter could already see. A report
 * that names a message in a channel the reporter never joined is still filed —
 * the pointer is simply dropped, so the report cannot be used to read private
 * conversations through the moderation queue.
 */
export async function captureEvidenceForReport(
  input: EvidenceCaptureInput,
  client: EvidenceStore = prisma,
): Promise<{ captured: boolean }> {
  const snapshot = input.messageId
    ? await captureChannelMessage(input.messageId, input.reporterId, client)
    : input.dmMessageId
      ? await captureDirectMessage(input.dmMessageId, input.reporterId, client)
      : null;

  if (!snapshot) {
    return { captured: false };
  }

  await client.moderationEvidence.create({
    data: {
      caseId: input.caseId,
      ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}),
      ...(input.dmMessageId ? { dmMessageId: input.dmMessageId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      reportId: input.reportId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  return { captured: true };
}

async function captureChannelMessage(
  messageId: string,
  reporterId: string,
  client: EvidenceStore,
): Promise<EvidenceSnapshot | null> {
  const message = await client.message.findUnique({
    where: { id: messageId },
    select: {
      attachments: { select: { url: true } },
      author: { select: { id: true, username: true } },
      channel: { select: { id: true, name: true, serverId: true } },
      content: true,
      createdAt: true,
    },
  });

  if (!message?.channel.serverId) {
    return null;
  }

  const membership = await client.serverMember.findFirst({
    where: { pending: false, serverId: message.channel.serverId, userId: reporterId },
    select: { id: true },
  });

  if (!membership) {
    return null;
  }

  return {
    attachments: message.attachments.map((attachment) => attachment.url),
    authorHandle: message.author.username,
    authorId: message.author.id,
    content: message.content,
    scope: `#${message.channel.name}`,
    sentAt: message.createdAt.toISOString(),
    source: "channel",
  };
}

async function captureDirectMessage(
  dmMessageId: string,
  reporterId: string,
  client: EvidenceStore,
): Promise<EvidenceSnapshot | null> {
  const message = await client.dMMessage.findUnique({
    where: { id: dmMessageId },
    select: {
      attachments: { select: { url: true } },
      author: { select: { id: true, username: true } },
      content: true,
      conversationId: true,
      createdAt: true,
    },
  });

  if (!message) {
    return null;
  }

  const participant = await client.dMParticipant.findFirst({
    where: { conversationId: message.conversationId, userId: reporterId },
    select: { id: true },
  });

  if (!participant) {
    return null;
  }

  return {
    attachments: message.attachments.map((attachment) => attachment.url),
    authorHandle: message.author.username,
    authorId: message.author.id,
    content: message.content,
    scope: message.conversationId,
    sentAt: message.createdAt.toISOString(),
    source: "dm",
  };
}

/** Evidence outlives the decision by six months, then only the copy is dropped. */
export const EVIDENCE_RETENTION_DAYS = 180;

export type EvidencePurgeStore = {
  moderationCase: {
    findMany(args: {
      select: { id: true };
      take: number;
      where: { evidencePurgeAt: { lt: Date } };
    }): Promise<Array<{ id: string }>>;
    updateMany(args: {
      data: { evidencePurgeAt: null };
      where: { id: { in: string[] } };
    }): Promise<{ count: number }>;
  };
  moderationEvidence: {
    deleteMany(args: { where: { caseId: { in: string[] } } }): Promise<{ count: number }>;
  };
};

/**
 * Purging removes the snapshots, never the case or its events: the record that
 * a decision was made has to outlast the material it was made from.
 */
export async function purgeExpiredEvidence(
  args: { now?: Date } = {},
  client: EvidencePurgeStore = prisma as unknown as EvidencePurgeStore,
) {
  const now = args.now ?? new Date();
  const cases = await client.moderationCase.findMany({
    select: { id: true },
    take: 200,
    where: { evidencePurgeAt: { lt: now } },
  });

  if (cases.length === 0) {
    return { casesPurged: 0, evidenceDeleted: 0 };
  }

  const caseIds = cases.map((moderationCase) => moderationCase.id);
  const removed = await client.moderationEvidence.deleteMany({
    where: { caseId: { in: caseIds } },
  });

  await client.moderationCase.updateMany({
    data: { evidencePurgeAt: null },
    where: { id: { in: caseIds } },
  });

  return { casesPurged: caseIds.length, evidenceDeleted: removed.count };
}
