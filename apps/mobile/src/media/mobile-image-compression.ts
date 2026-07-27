import { MOBILE_IMAGE_UPLOAD_MAX_BYTES } from "./mobile-image-upload-contract";

/**
 * What gets uploaded, rather than what the camera happened to produce.
 *
 * A modern phone photo is 3-12 MB of detail nobody in this product ever sees:
 * a feedback screenshot is read on a phone screen, an avatar is drawn at 96 px.
 * Sending the original costs the user's uplink, the server's verification pass
 * (which decodes every byte) and the wait in between — the whole reason an
 * upload felt slow enough to look broken.
 *
 * Two thresholds, deliberately different:
 *
 * - Over `MOBILE_IMAGE_UPLOAD_MAX_BYTES` the image cannot be uploaded at all,
 *   so it is re-encoded as JPEG, harder each pass. JPEG loses transparency; an
 *   image this size is a photo or a screenshot, and refusing it outright is the
 *   only alternative.
 * - Over the soft target — or simply larger than the screen it will be shown on
 *   — one gentle pass shrinks it *in its own format*, so a PNG with an alpha
 *   channel stays a PNG with an alpha channel.
 *
 * Anything already small enough is left untouched, byte for byte.
 */
export const MOBILE_IMAGE_UPLOAD_TARGET_BYTES = 1024 * 1024;
export const MOBILE_IMAGE_UPLOAD_MAX_EDGE = 2_048;

export type MobileImageEncodeFormat = "jpeg" | "png" | "webp";

export interface MobileImageEncodePass {
  /** 0-1, passed straight to the encoder. */
  readonly compress: number;
  readonly format: MobileImageEncodeFormat;
  /** The longest edge the result may have. */
  readonly maxEdge: number;
}

/**
 * The passes that run when an image is over the hard limit. Each one re-encodes
 * the *original*, so quality loss never compounds, and the first result that
 * fits wins.
 */
export const MOBILE_IMAGE_RESCUE_PASSES: readonly MobileImageEncodePass[] = [
  { compress: 0.8, format: "jpeg", maxEdge: 2_048 },
  { compress: 0.6, format: "jpeg", maxEdge: 1_600 },
  { compress: 0.5, format: "jpeg", maxEdge: 1_280 },
];

const SOFT_PASS_QUALITY = 0.85;

export interface MobileImageOptimizationResult {
  readonly format: MobileImageEncodeFormat;
  readonly sizeBytes: number;
  readonly uri: string;
}

export interface MobileImageOptimizationDependencies {
  /** Re-encodes the image and resolves with the URI of the written file. */
  encode(input: MobileImageEncodePass & { readonly uri: string }): Promise<string>;
  /** The byte count of a file on disk, or `null` when it cannot be read. */
  measure(uri: string): number | null;
}

export interface MobileImageOptimizationLimits {
  readonly maxBytes?: number;
  readonly maxEdge?: number;
  readonly targetBytes?: number;
}

export function toMobileImageEncodeFormat(
  mimeType: string | null | undefined,
): MobileImageEncodeFormat | null {
  switch (mimeType?.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function toMobileImageMimeType(format: MobileImageEncodeFormat): string {
  return `image/${format}`;
}

/**
 * The encode passes to try for one picked image, gentlest first. An empty list
 * means the image is already fine as it is.
 */
export function planMobileImageUploadPasses(
  input: {
    readonly height?: number | null | undefined;
    readonly mimeType?: string | null | undefined;
    readonly sizeBytes: number | null | undefined;
    readonly width?: number | null | undefined;
  },
  limits: MobileImageOptimizationLimits = {},
): readonly MobileImageEncodePass[] {
  const maxBytes = limits.maxBytes ?? MOBILE_IMAGE_UPLOAD_MAX_BYTES;
  const targetBytes = limits.targetBytes ?? MOBILE_IMAGE_UPLOAD_TARGET_BYTES;
  const maxEdge = limits.maxEdge ?? MOBILE_IMAGE_UPLOAD_MAX_EDGE;
  const sizeBytes = input.sizeBytes;

  // An unmeasurable image is refused upstream; re-encoding it would only hide
  // the one thing the upload has to know.
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return [];
  }

  // Only formats this app knows how to re-encode as a single still frame. A GIF
  // would come back as one motionless frame, and a HEIC is better refused with
  // a message than silently converted.
  const format = toMobileImageEncodeFormat(input.mimeType);
  if (!format) {
    return [];
  }

  if (sizeBytes > maxBytes) {
    return MOBILE_IMAGE_RESCUE_PASSES.map((pass) => ({
      ...pass,
      maxEdge: Math.min(pass.maxEdge, maxEdge),
    }));
  }

  const longestEdge = Math.max(numberOrZero(input.width), numberOrZero(input.height));
  if (sizeBytes <= targetBytes && longestEdge <= maxEdge) {
    return [];
  }

  return [{ compress: SOFT_PASS_QUALITY, format, maxEdge }];
}

/**
 * The resize the encoder should apply, constraining the longest edge. Returns
 * `null` when the image already fits inside the bound or when the picker did not
 * report usable dimensions — resizing on a guess would enlarge a small image
 * rather than shrink a big one.
 */
export function resolveMobileImageResizeSize(
  width: number | null | undefined,
  height: number | null | undefined,
  maxEdge: number,
): { height: number } | { width: number } | null {
  if (!isPositive(width) || !isPositive(height)) {
    return null;
  }

  if (width >= height) {
    return width > maxEdge ? { width: maxEdge } : null;
  }

  return height > maxEdge ? { height: maxEdge } : null;
}

/**
 * Runs the planned passes and returns the first result worth uploading.
 *
 * "Worth uploading" is both smaller than the original and inside the hard limit
 * — a re-encode that came out bigger is thrown away rather than sent, and an
 * image that never fits is left for validation to refuse with a message the
 * user can act on.
 */
export async function optimizeMobileImageForUpload(
  input: {
    readonly height?: number | null | undefined;
    readonly mimeType?: string | null | undefined;
    readonly sizeBytes: number | null | undefined;
    readonly uri: string;
    readonly width?: number | null | undefined;
  },
  dependencies: MobileImageOptimizationDependencies,
  limits: MobileImageOptimizationLimits = {},
): Promise<MobileImageOptimizationResult | null> {
  const passes = planMobileImageUploadPasses(input, limits);
  if (passes.length === 0) {
    return null;
  }

  const maxBytes = limits.maxBytes ?? MOBILE_IMAGE_UPLOAD_MAX_BYTES;
  const originalBytes = input.sizeBytes ?? Number.POSITIVE_INFINITY;

  for (const pass of passes) {
    let uri: string;
    try {
      uri = await dependencies.encode({ ...pass, uri: input.uri });
    } catch {
      // A pass that failed natively is one failed attempt, not a broken picker.
      continue;
    }

    const sizeBytes = dependencies.measure(uri);
    if (!isPositive(sizeBytes)) {
      // An unmeasurable result is exactly what must never be uploaded: the
      // declared size is what UploadThing presigns against.
      continue;
    }

    if (sizeBytes <= maxBytes && sizeBytes < originalBytes) {
      return { format: pass.format, sizeBytes, uri };
    }
  }

  return null;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function numberOrZero(value: number | null | undefined) {
  return isPositive(value) ? value : 0;
}
