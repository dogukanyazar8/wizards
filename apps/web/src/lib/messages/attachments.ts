import { type Prisma } from "@wizards/db";
import {
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MESSAGE_CONTENT_HARD_LIMIT,
  UploadedAttachmentInputSchema,
  type UploadedAttachmentInput,
} from "@wizards/types";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getMessageAttachmentMaxBytes,
  isMessageImageContentType,
  isSupportedMessageAttachmentContentType,
  MESSAGE_ATTACHMENT_MAX_COUNT,
} from "./attachment-rules";
export {
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_AUDIO_CONTENT_TYPES,
  MESSAGE_AUDIO_MAX_BYTES,
  MESSAGE_ATTACHMENT_CONTENT_TYPES,
  MESSAGE_ATTACHMENT_MAX_COUNT,
  MESSAGE_FILE_CONTENT_TYPES,
  MESSAGE_FILE_MAX_BYTES,
  MESSAGE_GIF_MAX_BYTES,
  MESSAGE_IMAGE_CONTENT_TYPES,
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_VIDEO_CONTENT_TYPES,
  MESSAGE_VIDEO_MAX_BYTES,
  getMessageAttachmentMaxBytes,
  isMessageAttachmentFilenameAllowed,
  isMessageAudioContentType,
  isMessageFileContentType,
  isMessageGifContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
  isSupportedMessageAttachmentContentType,
  normalizeMessageAttachmentFilename,
} from "./attachment-rules";

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
  maxLength: number | null = MESSAGE_CONTENT_DEFAULT_LIMIT,
) {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  const effectiveMaxLength =
    maxLength === null
      ? MESSAGE_CONTENT_HARD_LIMIT
      : Math.min(maxLength, MESSAGE_CONTENT_HARD_LIMIT);

  if (content.length > effectiveMaxLength) {
    throw new ApiError(
      `Message content must be ${effectiveMaxLength} characters or fewer.`,
      400,
      "MESSAGE_TOO_LONG",
    );
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
      scanStatus: true,
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
    const maxBytes = attachment ? getMessageAttachmentMaxBytes(attachment.contentType) : 0;

    if (
      !attachment ||
      attachment.scanStatus === "INFECTED" ||
      !isSupportedMessageAttachmentContentType(attachment.contentType) ||
      attachment.size <= 0 ||
      attachment.size > maxBytes
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
          width:
            current && isMessageImageContentType(current.contentType)
              ? normalizeDimension(input.width) ?? current.width ?? null
              : null,
          height:
            current && isMessageImageContentType(current.contentType)
              ? normalizeDimension(input.height) ?? current.height ?? null
              : null,
        },
      });
    }),
  );
}
