import {
  MessageAttachmentSchema,
  type MessageAttachment,
  type UploadedAttachmentInput,
} from "@wizards/types";

export const MOBILE_MESSAGE_ATTACHMENT_MAX_COUNT = 5;

const MOBILE_MESSAGE_IMAGE_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MOBILE_MESSAGE_FILE_CONTENT_TYPES = new Set([
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
]);
const MOBILE_MESSAGE_VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MOBILE_MESSAGE_AUDIO_CONTENT_TYPES = new Set(["audio/mp4"]);
const MOBILE_LOCAL_URI_SCHEMES = new Set(["content:", "file:", "ph:"]);

export type MobileMessageAttachmentKind = "audio" | "file" | "image" | "video";

export type MobilePickedMessageAttachment = {
  readonly file: File;
  readonly kind: MobileMessageAttachmentKind;
  readonly localUri: string;
};

export type MobileMessageAttachmentDraft = {
  readonly attachment: MessageAttachment;
  readonly input: UploadedAttachmentInput;
  readonly kind: MobileMessageAttachmentKind;
  readonly localUri: string;
};

export type MobileMessageAttachmentUploadErrorCode =
  | "invalid-local-uri"
  | "invalid-upload-completion"
  | "missing-access-token"
  | "missing-file-metadata"
  | "selected-file-too-large"
  | "unsupported-content-type";

export class MobileMessageAttachmentUploadError extends Error {
  readonly code: MobileMessageAttachmentUploadErrorCode;

  constructor(code: MobileMessageAttachmentUploadErrorCode) {
    super("Mobile message attachment upload could not be completed.");
    this.code = code;
    this.name = "MobileMessageAttachmentUploadError";
  }
}

export function getMobileMessageAttachmentKind(contentType: string): MobileMessageAttachmentKind {
  if (MOBILE_MESSAGE_IMAGE_CONTENT_TYPES.has(contentType)) {
    return "image";
  }

  if (MOBILE_MESSAGE_AUDIO_CONTENT_TYPES.has(contentType)) {
    return "audio";
  }

  return MOBILE_MESSAGE_VIDEO_CONTENT_TYPES.has(contentType) ? "video" : "file";
}

export function getMobileMessageAttachmentMaxBytes(contentType: string): number {
  if (MOBILE_MESSAGE_IMAGE_CONTENT_TYPES.has(contentType)) {
    return 8 * 1024 * 1024;
  }

  if (MOBILE_MESSAGE_FILE_CONTENT_TYPES.has(contentType)) {
    return 16 * 1024 * 1024;
  }

  if (MOBILE_MESSAGE_AUDIO_CONTENT_TYPES.has(contentType)) {
    return 16 * 1024 * 1024;
  }

  if (MOBILE_MESSAGE_VIDEO_CONTENT_TYPES.has(contentType)) {
    return 32 * 1024 * 1024;
  }

  return 0;
}

export function validateMobileMessageAttachment(input: {
  readonly contentType: string | null | undefined;
  readonly name: string | null | undefined;
  readonly size: number | null | undefined;
  readonly uri: string;
}) {
  const contentType = input.contentType?.trim().toLowerCase();
  const name = input.name?.trim();
  const maxBytes = contentType ? getMobileMessageAttachmentMaxBytes(contentType) : 0;

  if (!contentType || maxBytes === 0) {
    throw new MobileMessageAttachmentUploadError("unsupported-content-type");
  }

  if (!name || !Number.isFinite(input.size) || (input.size ?? 0) <= 0) {
    throw new MobileMessageAttachmentUploadError("missing-file-metadata");
  }

  if ((input.size ?? 0) > maxBytes) {
    throw new MobileMessageAttachmentUploadError("selected-file-too-large");
  }

  if (!isMobileLocalUri(input.uri)) {
    throw new MobileMessageAttachmentUploadError("invalid-local-uri");
  }
}

export function parseMobileMessageAttachmentUploadCompletion(
  rows: unknown,
  picked: MobilePickedMessageAttachment,
): MobileMessageAttachmentDraft {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new MobileMessageAttachmentUploadError("invalid-upload-completion");
  }

  const row = rows[0];
  const serverData =
    row && typeof row === "object" && "serverData" in row
      ? (row as { readonly serverData: unknown }).serverData
      : undefined;
  const parsed = MessageAttachmentSchema.safeParse(
    normalizeMessageAttachmentUploadServerData(serverData),
  );

  if (!parsed.success) {
    throw new MobileMessageAttachmentUploadError("invalid-upload-completion");
  }

  return {
    attachment: parsed.data,
    input: {
      id: parsed.data.id,
      ...(parsed.data.width ? { width: parsed.data.width } : {}),
      ...(parsed.data.height ? { height: parsed.data.height } : {}),
    },
    kind: picked.kind,
    localUri: picked.localUri,
  };
}

function normalizeMessageAttachmentUploadServerData(serverData: unknown): unknown {
  if (!serverData || typeof serverData !== "object" || Array.isArray(serverData)) {
    return serverData;
  }

  const { height, width, ...rest } = serverData as Record<string, unknown>;
  return {
    ...rest,
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
  };
}

function isMobileLocalUri(uri: string) {
  if (uri.length === 0 || uri.length > 4_096) {
    return false;
  }

  try {
    const parsed = new URL(uri);
    return (
      MOBILE_LOCAL_URI_SCHEMES.has(parsed.protocol) &&
      (parsed.protocol !== "file:" || parsed.host.length === 0 || parsed.host === "localhost")
    );
  } catch {
    return false;
  }
}
