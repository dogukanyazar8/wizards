import { type Prisma } from "@wizards/db";
import {
  UploadedAttachmentInputSchema,
  type UploadedAttachmentInput,
} from "@wizards/types";
import { z } from "zod";
import { ApiError } from "@/lib/api";

export const MESSAGE_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MESSAGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_COUNT = 5;

const UploadedAttachmentsSchema = z
  .array(UploadedAttachmentInputSchema)
  .max(MESSAGE_ATTACHMENT_MAX_COUNT);

type AttachmentTransaction = Pick<Prisma.TransactionClient, "attachment">;

type AttachmentLink =
  | { messageId: string; dmMessageId?: never }
  | { dmMessageId: string; messageId?: never };

export function parseUploadedAttachmentInputs(value: unknown): UploadedAttachmentInput[] {
  const parsed = UploadedAttachmentsSchema.safeParse(value ?? []);

  if (!parsed.success) {
    throw new ApiError("Invalid attachment payload.", 400, "INVALID_ATTACHMENT");
  }

  const seenIds = new Set<string>();
  for (const attachment of parsed.data) {
    if (seenIds.has(attachment.id)) {
      throw new ApiError("Duplicate attachment payload.", 400, "INVALID_ATTACHMENT");
    }

    seenIds.add(attachment.id);
  }

  return parsed.data;
}

export function normalizeMessageContentForSend(
  rawContent: unknown,
  attachments: UploadedAttachmentInput[],
) {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";

  if (content.length > 2000) {
    throw new ApiError("Message content must be 2000 characters or fewer.", 400);
  }

  if (!content && attachments.length === 0) {
    throw new ApiError("Message content or attachment is required.", 400);
  }

  return content;
}

function normalizeDimension(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20000
    ? value
    : undefined;
}

export async function claimUploadedMessageAttachments(
  tx: AttachmentTransaction,
  userId: string,
  inputs: UploadedAttachmentInput[],
  link: AttachmentLink,
) {
  if (inputs.length === 0) {
    return;
  }

  const ids = inputs.map((attachment) => attachment.id);
  const existingAttachments = await tx.attachment.findMany({
    where: {
      id: { in: ids },
      userId,
      messageId: null,
      dmMessageId: null,
    },
    select: {
      id: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
    },
  });

  if (existingAttachments.length !== ids.length) {
    throw new ApiError("Attachment was not found or is no longer available.", 400, "INVALID_ATTACHMENT");
  }

  const byId = new Map(existingAttachments.map((attachment) => [attachment.id, attachment]));

  for (const input of inputs) {
    const attachment = byId.get(input.id);

    if (
      !attachment ||
      !MESSAGE_IMAGE_CONTENT_TYPES.includes(
        attachment.contentType as (typeof MESSAGE_IMAGE_CONTENT_TYPES)[number],
      ) ||
      attachment.size <= 0 ||
      attachment.size > MESSAGE_IMAGE_MAX_BYTES
    ) {
      throw new ApiError("Attachment type or size is not supported.", 400, "INVALID_ATTACHMENT");
    }
  }

  await Promise.all(
    inputs.map((input) => {
      const current = byId.get(input.id);
      return tx.attachment.update({
        where: { id: input.id },
        data: {
          ...link,
          width: normalizeDimension(input.width) ?? current?.width ?? null,
          height: normalizeDimension(input.height) ?? current?.height ?? null,
        },
      });
    }),
  );
}
