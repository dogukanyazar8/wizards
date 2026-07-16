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

export const MESSAGE_VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const MESSAGE_AUDIO_CONTENT_TYPES = ["audio/mp4"] as const;

export const MESSAGE_ATTACHMENT_CONTENT_TYPES = [
  ...MESSAGE_IMAGE_CONTENT_TYPES,
  ...MESSAGE_FILE_CONTENT_TYPES,
  ...MESSAGE_VIDEO_CONTENT_TYPES,
  ...MESSAGE_AUDIO_CONTENT_TYPES,
] as const;

export const MESSAGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MESSAGE_GIF_MAX_BYTES = 8 * 1024 * 1024;
export const MESSAGE_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const MESSAGE_VIDEO_MAX_BYTES = 32 * 1024 * 1024;
export const MESSAGE_AUDIO_MAX_BYTES = 16 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_COUNT = 5;

const MESSAGE_IMAGE_CONTENT_TYPE_SET = new Set<string>(MESSAGE_IMAGE_CONTENT_TYPES);
const MESSAGE_FILE_CONTENT_TYPE_SET = new Set<string>(MESSAGE_FILE_CONTENT_TYPES);
const MESSAGE_VIDEO_CONTENT_TYPE_SET = new Set<string>(MESSAGE_VIDEO_CONTENT_TYPES);
const MESSAGE_AUDIO_CONTENT_TYPE_SET = new Set<string>(MESSAGE_AUDIO_CONTENT_TYPES);
const MESSAGE_ATTACHMENT_CONTENT_TYPE_SET = new Set<string>(
  MESSAGE_ATTACHMENT_CONTENT_TYPES,
);
const MESSAGE_ATTACHMENT_EXTENSIONS_BY_TYPE = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/rtf", [".rtf"]],
  ["application/vnd.ms-excel", [".xls"]],
  ["application/vnd.ms-powerpoint", [".ppt"]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", [".pptx"]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".xlsx"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["audio/mp4", [".m4a"]],
  ["image/gif", [".gif"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["video/mp4", [".mp4"]],
  ["video/quicktime", [".mov", ".qt"]],
  ["video/webm", [".webm"]],
  ["text/csv", [".csv"]],
  ["text/markdown", [".md", ".markdown"]],
  ["text/plain", [".txt"]],
]);
const UNSAFE_FILENAME_PATTERN = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

export const MESSAGE_ATTACHMENT_ACCEPT = [
  ...MESSAGE_ATTACHMENT_CONTENT_TYPES,
  ".csv",
  ".doc",
  ".docx",
  ".md",
  ".mov",
  ".mp4",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rtf",
  ".txt",
  ".xls",
  ".xlsx",
  ".webm",
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

export function isMessageVideoContentType(
  contentType: string,
): contentType is (typeof MESSAGE_VIDEO_CONTENT_TYPES)[number] {
  return MESSAGE_VIDEO_CONTENT_TYPE_SET.has(contentType);
}

export function isMessageAudioContentType(
  contentType: string,
): contentType is (typeof MESSAGE_AUDIO_CONTENT_TYPES)[number] {
  return MESSAGE_AUDIO_CONTENT_TYPE_SET.has(contentType);
}

export function isSupportedMessageAttachmentContentType(contentType: string) {
  return MESSAGE_ATTACHMENT_CONTENT_TYPE_SET.has(contentType);
}

export function normalizeMessageAttachmentFilename(filename: string) {
  const normalized = filename
    .split(/[/\\]/)
    .pop()
    ?.replace(UNSAFE_FILENAME_PATTERN, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "attachment";
  }

  return normalized.slice(0, 180);
}

export function isMessageAttachmentFilenameAllowed(contentType: string, filename: string) {
  const allowedExtensions = MESSAGE_ATTACHMENT_EXTENSIONS_BY_TYPE.get(contentType);
  if (!allowedExtensions) {
    return false;
  }

  const normalizedFilename = normalizeMessageAttachmentFilename(filename).toLowerCase();
  const lastDotIndex = normalizedFilename.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return isMessageImageContentType(contentType);
  }

  const extension = normalizedFilename.slice(lastDotIndex);
  return allowedExtensions.includes(extension);
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

  if (isMessageVideoContentType(contentType)) {
    return MESSAGE_VIDEO_MAX_BYTES;
  }

  if (isMessageAudioContentType(contentType)) {
    return MESSAGE_AUDIO_MAX_BYTES;
  }

  return 0;
}
