import type { AttachmentScanStatus, MessageAttachment } from "@wizards/types";

export type AttachmentVisibilityInput = {
  contentType: string;
  duration: number | null;
  waveform?: string | null;
  filename: string;
  height: number | null;
  id: string;
  scanStatus?: AttachmentScanStatus | null;
  size: number;
  thumbnailUrl: string | null;
  url: string | null;
  userId: string;
  width: number | null;
};

export function canViewAttachmentUrl(
  attachment: Pick<AttachmentVisibilityInput, "scanStatus"> & { userId?: string | null },
  viewerId: string | null | undefined,
) {
  const scanStatus = attachment.scanStatus ?? "PENDING";

  if (scanStatus === "INFECTED") {
    return false;
  }

  return (
    scanStatus === "CLEAN" || (!!viewerId && !!attachment.userId && attachment.userId === viewerId)
  );
}

export function mapAttachmentForViewer(
  attachment: AttachmentVisibilityInput,
  viewerId: string | null | undefined,
): MessageAttachment {
  const scanStatus = attachment.scanStatus ?? "PENDING";
  const canViewUrl = canViewAttachmentUrl(attachment, viewerId);

  return {
    id: attachment.id,
    url: canViewUrl ? attachment.url : null,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    ...(attachment.width ? { width: attachment.width } : {}),
    ...(attachment.height ? { height: attachment.height } : {}),
    duration: attachment.duration ?? undefined,
    // Dalga formu URL'nin arkasında saklanmaz: kutunun kendisi bir içerik değil,
    // uzunluğun şeklidir. Tarama bekleyen bir ek için de çizilir ve çizilmesi
    // gereken tek şey odur.
    waveform: attachment.waveform ?? undefined,
    thumbnailUrl: canViewUrl ? (attachment.thumbnailUrl ?? undefined) : undefined,
    scanStatus,
  };
}

export function mapAttachmentsForViewer(
  attachments: AttachmentVisibilityInput[],
  viewerId: string | null | undefined,
) {
  return attachments.map((attachment) => mapAttachmentForViewer(attachment, viewerId));
}

export function redactMessageAttachmentUrlsForViewer<
  TMessage extends { attachments: MessageAttachment[] },
>(message: TMessage, viewerId: string | null | undefined): TMessage {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => {
      const scanStatus = attachment.scanStatus ?? "PENDING";
      // MessageAttachment has no owner id; pretending an out-of-contract field exists made
      // uploader visibility depend on which caller happened to enrich the runtime object.
      const canView = canViewAttachmentUrl({ scanStatus }, viewerId);

      return {
        ...attachment,
        url: canView ? attachment.url : null,
        thumbnailUrl: canView ? attachment.thumbnailUrl : undefined,
        scanStatus,
      };
    }),
  };
}
