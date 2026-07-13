import sharp from "sharp";
import { extractUploadThingFileKey } from "@/lib/account/privacy-service";
import { ApiError } from "@/lib/api";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4_096;
const MAX_IMAGE_PIXELS = 16_000_000;
const FETCH_TIMEOUT_MS = 5_000;

const SHARP_OPTIONS = {
  failOn: "error",
  limitInputPixels: MAX_IMAGE_PIXELS,
} as const;

const FORMAT_CONTENT_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type VerifiedImageContentType = (typeof FORMAT_CONTENT_TYPES)[keyof typeof FORMAT_CONTENT_TYPES];

export type VerifiedMobileImage = {
  contentType: VerifiedImageContentType;
  height: number;
  sizeBytes: number;
  storageKey: string;
  url: string;
  width: number;
};

export type MobileImageVerifierDependencies = {
  createTimeoutSignal: (milliseconds: number) => AbortSignal;
  fetch: typeof fetch;
};

const defaultDependencies: MobileImageVerifierDependencies = {
  createTimeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
  fetch,
};

function uploadSourceInvalid(status = 400) {
  return new ApiError("Upload source is invalid", status, "UPLOAD_SOURCE_INVALID");
}

function uploadTooLarge() {
  return new ApiError("Uploaded image is too large", 413, "UPLOAD_TOO_LARGE");
}

function uploadImageInvalid() {
  return new ApiError("Uploaded image is invalid", 422, "UPLOAD_IMAGE_INVALID");
}

function isUploadThingHostname(hostname: string) {
  return (
    hostname === "utfs.io" ||
    hostname === "ufs.sh" ||
    hostname.endsWith(".ufs.sh") ||
    hostname === "uploadthing.com" ||
    hostname.endsWith(".uploadthing.com")
  );
}

function extractTrustedStorageKey(url: URL) {
  if (url.hostname.toLowerCase() !== "ufs.sh") {
    return extractUploadThingFileKey(url.href);
  }

  // The canonical parser predates the root ufs.sh host, so route that host
  // through an equivalent accepted UploadThing hostname without changing its path.
  const canonicalParserUrl = new URL(url.href);
  canonicalParserUrl.hostname = "uploadthing.com";
  return extractUploadThingFileKey(canonicalParserUrl.href);
}

function validateSourceUrl(urlValue: string, callbackKey: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw uploadSourceInvalid();
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !isUploadThingHostname(hostname)
  ) {
    throw uploadSourceInvalid();
  }

  let storageKey: string | null;
  try {
    storageKey = extractTrustedStorageKey(url);
  } catch {
    throw uploadSourceInvalid();
  }

  if (!callbackKey || storageKey !== callbackKey) {
    throw uploadSourceInvalid();
  }
}

function normalizeMediaType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function callbackContentType(value: string): VerifiedImageContentType {
  const normalized = normalizeMediaType(value);
  if (normalized !== "image/jpeg" && normalized !== "image/png" && normalized !== "image/webp") {
    throw uploadImageInvalid();
  }
  return normalized;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // A cleanup failure must not replace the bounded verification error.
  }
}

async function readBoundedBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_IMAGE_BYTES) {
        await cancelReader(reader);
        throw uploadTooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    await cancelReader(reader);
    throw uploadSourceInvalid(502);
  } finally {
    reader.releaseLock();
  }

  const buffer = Buffer.allocUnsafe(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function decodedContentType(format: string | undefined) {
  if (format === "jpeg" || format === "png" || format === "webp") {
    return FORMAT_CONTENT_TYPES[format];
  }
  throw uploadImageInvalid();
}

function validateDimensions(width: number | undefined, height: number | undefined) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw uploadImageInvalid();
  }
  return { height, width };
}

export async function verifyMobileUploadedImage(
  input: { key: string; size: number; type: string; url: string },
  dependencies: MobileImageVerifierDependencies = defaultDependencies,
): Promise<VerifiedMobileImage> {
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    throw uploadSourceInvalid();
  }
  if (input.size > MAX_IMAGE_BYTES) {
    throw uploadTooLarge();
  }

  validateSourceUrl(input.url, input.key);
  const callbackType = callbackContentType(input.type);

  let response: Response;
  try {
    response = await dependencies.fetch(input.url, {
      redirect: "error",
      signal: dependencies.createTimeoutSignal(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw uploadSourceInvalid(502);
  }

  if (!response.ok || !response.body) {
    throw uploadSourceInvalid(502);
  }

  const contentLengthValue = response.headers.get("content-length");
  const contentLength = contentLengthValue === null ? null : Number(contentLengthValue);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    await cancelReader(response.body.getReader());
    throw uploadTooLarge();
  }

  const responseType = normalizeMediaType(response.headers.get("content-type"));
  const buffer = await readBoundedBody(response.body);

  try {
    const metadata = await sharp(buffer, SHARP_OPTIONS).metadata();
    if (metadata.pages !== undefined && metadata.pages !== 1) {
      throw uploadImageInvalid();
    }
    const contentType = decodedContentType(metadata.format);
    const { height, width } = validateDimensions(metadata.width, metadata.height);

    if (contentType !== callbackType) {
      throw uploadImageInvalid();
    }
    if (
      responseType !== null &&
      responseType !== "application/octet-stream" &&
      responseType !== contentType
    ) {
      throw uploadImageInvalid();
    }

    await sharp(buffer, SHARP_OPTIONS).stats();

    return {
      contentType,
      height,
      sizeBytes: buffer.byteLength,
      storageKey: input.key,
      url: input.url,
      width,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw uploadImageInvalid();
  }
}
