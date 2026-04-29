export const MESSAGE_IMAGE_CONTENT_TYPES = [
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MESSAGE_FILE_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;

export const MESSAGE_ATTACHMENT_CONTENT_TYPES = [
  ...MESSAGE_IMAGE_CONTENT_TYPES,
  ...MESSAGE_FILE_CONTENT_TYPES,
] as const;

export const MESSAGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MESSAGE_GIF_MAX_BYTES = 8 * 1024 * 1024;
export const MESSAGE_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_COUNT = 5;

const MESSAGE_IMAGE_CONTENT_TYPE_SET = new Set<string>(MESSAGE_IMAGE_CONTENT_TYPES);
const MESSAGE_FILE_CONTENT_TYPE_SET = new Set<string>(MESSAGE_FILE_CONTENT_TYPES);
const MESSAGE_ATTACHMENT_CONTENT_TYPE_SET = new Set<string>(
  MESSAGE_ATTACHMENT_CONTENT_TYPES,
);

export const MESSAGE_ATTACHMENT_ACCEPT = [
  ...MESSAGE_ATTACHMENT_CONTENT_TYPES,
  ".csv",
  ".doc",
  ".docx",
  ".md",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rtf",
  ".txt",
  ".xls",
  ".xlsx",
].join(",");

export function isMessageImageContentType(
  contentType: string,
): contentType is (typeof MESSAGE_IMAGE_CONTENT_TYPES)[number] {
  return MESSAGE_IMAGE_CONTENT_TYPE_SET.has(contentType);
}

export function isMessageGifContentType(contentType: string): contentType is "image/gif" {
  return contentType === "image/gif";
}

export function isMessageFileContentType(
  contentType: string,
): contentType is (typeof MESSAGE_FILE_CONTENT_TYPES)[number] {
  return MESSAGE_FILE_CONTENT_TYPE_SET.has(contentType);
}

export function isSupportedMessageAttachmentContentType(contentType: string) {
  return MESSAGE_ATTACHMENT_CONTENT_TYPE_SET.has(contentType);
}

export function getMessageAttachmentMaxBytes(contentType: string) {
  if (isMessageGifContentType(contentType)) {
    return MESSAGE_GIF_MAX_BYTES;
  }

  if (isMessageImageContentType(contentType)) {
    return MESSAGE_IMAGE_MAX_BYTES;
  }

  if (isMessageFileContentType(contentType)) {
    return MESSAGE_FILE_MAX_BYTES;
  }

  return 0;
}
