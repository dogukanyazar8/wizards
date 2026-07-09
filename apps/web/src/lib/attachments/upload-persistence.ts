import { type Prisma } from "@wizards/db";
import { UploadThingError } from "uploadthing/server";
import {
  getMessageAttachmentMaxBytes,
  isMessageAttachmentFilenameAllowed,
  isSupportedMessageAttachmentContentType,
  normalizeMessageAttachmentFilename,
} from "@/lib/messages/attachments";
import { enqueueAttachmentScanJob } from "@/lib/outbox/service";

type MessageAttachmentUploadFile = {
  name: string;
  size: number;
  type: string;
  ufsUrl: string;
};

type MessageAttachmentUploadMetadata = {
  userId: string;
};

type MessageAttachmentUploadClient = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export const messageAttachmentUploadSelect = {
  id: true,
  url: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  duration: true,
  thumbnailUrl: true,
  scanStatus: true,
} as const;

export async function createPendingMessageAttachmentUpload(
  client: MessageAttachmentUploadClient,
  file: MessageAttachmentUploadFile,
  metadata: MessageAttachmentUploadMetadata,
) {
  const maxBytes = getMessageAttachmentMaxBytes(file.type);

  if (
    !isSupportedMessageAttachmentContentType(file.type) ||
    !isMessageAttachmentFilenameAllowed(file.type, file.name) ||
    file.size <= 0 ||
    file.size > maxBytes
  ) {
    throw new UploadThingError("Unsupported attachment upload");
  }

  return client.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        userId: metadata.userId,
        url: file.ufsUrl,
        filename: normalizeMessageAttachmentFilename(file.name),
        contentType: file.type,
        size: file.size,
        scanStatus: "PENDING",
      },
      select: messageAttachmentUploadSelect,
    });

    await enqueueAttachmentScanJob(tx, { attachmentId: attachment.id });

    return attachment;
  });
}
