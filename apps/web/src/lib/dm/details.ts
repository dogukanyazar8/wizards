import type { ChatMessage, MessageAttachment } from "@wizards/types";
import {
  isMessageFileContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
} from "@/lib/messages/attachment-rules";

export type DmSharedAttachment = {
  attachment: MessageAttachment;
  messageCreatedAt: string;
  messageId: string;
};

export type DmSharedAttachmentSummary = {
  files: DmSharedAttachment[];
  media: DmSharedAttachment[];
};

export const DM_DETAILS_DEFAULT_SHARED_FILE_LIMIT = 5;
export const DM_DETAILS_DEFAULT_SHARED_MEDIA_LIMIT = 6;

function isMediaAttachment(attachment: MessageAttachment) {
  return (
    isMessageImageContentType(attachment.contentType) ||
    isMessageVideoContentType(attachment.contentType)
  );
}

function isFileAttachment(attachment: MessageAttachment) {
  return isMessageFileContentType(attachment.contentType);
}

export function getDmSharedAttachmentSummary(
  messages: readonly ChatMessage[],
  options: {
    fileLimit?: number;
    mediaLimit?: number;
  } = {},
): DmSharedAttachmentSummary {
  const fileLimit = options.fileLimit ?? DM_DETAILS_DEFAULT_SHARED_FILE_LIMIT;
  const mediaLimit = options.mediaLimit ?? DM_DETAILS_DEFAULT_SHARED_MEDIA_LIMIT;
  const files: DmSharedAttachment[] = [];
  const media: DmSharedAttachment[] = [];
  const seenAttachmentIds = new Set<string>();

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message || message.deletedAt || message.attachments.length === 0) {
      continue;
    }

    for (
      let attachmentIndex = message.attachments.length - 1;
      attachmentIndex >= 0;
      attachmentIndex -= 1
    ) {
      const attachment = message.attachments[attachmentIndex];
      if (!attachment || seenAttachmentIds.has(attachment.id)) {
        continue;
      }

      if (isMediaAttachment(attachment) && media.length < mediaLimit) {
        seenAttachmentIds.add(attachment.id);
        media.push({
          attachment,
          messageCreatedAt: message.createdAt,
          messageId: message.id,
        });
        continue;
      }

      if (isFileAttachment(attachment) && files.length < fileLimit) {
        seenAttachmentIds.add(attachment.id);
        files.push({
          attachment,
          messageCreatedAt: message.createdAt,
          messageId: message.id,
        });
      }

      if (media.length >= mediaLimit && files.length >= fileLimit) {
        return { files, media };
      }
    }
  }

  return { files, media };
}
