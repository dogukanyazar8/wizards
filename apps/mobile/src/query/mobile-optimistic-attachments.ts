import type { DMMessageAttachmentPayload, MessageAttachment } from "@wizards/types";

/**
 * The send request only carries attachment ids, so optimistic bubbles would
 * render without their cards until the server echo arrives. The composer hands
 * the uploaded metadata along as a preview and these helpers widen it into the
 * shape each message surface stores in its query cache.
 */
export function toMobileOptimisticChannelAttachments(
  previews: readonly MessageAttachment[] | undefined,
): MessageAttachment[] {
  return previews ? [...previews] : [];
}

export function toMobileOptimisticDMAttachments(
  previews: readonly MessageAttachment[] | undefined,
): DMMessageAttachmentPayload[] {
  return (previews ?? []).map((preview) => ({
    contentType: preview.contentType,
    duration: preview.duration ?? null,
    filename: preview.filename,
    height: preview.height ?? null,
    id: preview.id,
    size: preview.size,
    thumbnailUrl: preview.thumbnailUrl ?? null,
    url: preview.url,
    width: preview.width ?? null,
    ...(preview.scanStatus ? { scanStatus: preview.scanStatus } : {}),
  }));
}
