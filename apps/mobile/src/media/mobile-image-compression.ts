import { MOBILE_IMAGE_UPLOAD_MAX_BYTES } from "./mobile-image-upload-contract";

/**
 * A phone screenshot is routinely a PNG well over the 4 MB upload limit, and
 * refusing it is a poor answer for a form whose whole point is "show me what you
 * saw". Oversized images are re-encoded down instead.
 *
 * Only images that do not fit are touched: re-encoding something that already
 * fits would cost quality for nothing.
 */
export interface MobileImageCompressionStep {
  /** 0-1, passed straight to the encoder. */
  readonly compress: number;
  /** The longest edge the result may have. */
  readonly maxEdge: number;
}

/**
 * Three passes, gentlest first. Each one re-encodes the *original*, so quality
 * loss never compounds across passes, and the first result that fits wins.
 */
export const MOBILE_IMAGE_COMPRESSION_STEPS: readonly MobileImageCompressionStep[] = [
  { compress: 0.8, maxEdge: 2_048 },
  { compress: 0.6, maxEdge: 1_600 },
  { compress: 0.5, maxEdge: 1_280 },
];

export interface MobileImageCompressionResult {
  readonly sizeBytes: number;
  readonly uri: string;
}

export interface MobileImageCompressionDependencies {
  /** Re-encodes the image and resolves with the URI of the written file. */
  compress(input: {
    readonly compress: number;
    readonly maxEdge: number;
    readonly uri: string;
  }): Promise<string>;
  /** The byte count of a file on disk, or `null` when it cannot be read. */
  measure(uri: string): number | null;
}

export function needsMobileImageCompression(
  sizeBytes: number | null | undefined,
  maxBytes: number = MOBILE_IMAGE_UPLOAD_MAX_BYTES,
): boolean {
  return typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes > maxBytes;
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
  const hasDimensions = isPositive(width) && isPositive(height);
  if (!hasDimensions) {
    return null;
  }

  if (width >= height) {
    return width > maxEdge ? { width: maxEdge } : null;
  }

  return height > maxEdge ? { height: maxEdge } : null;
}

/**
 * Re-encodes an oversized image until it fits, or gives up.
 *
 * Giving up is deliberate: an image that still does not fit is refused with a
 * message the user can act on, rather than uploaded for the service to reject.
 */
export async function compressMobileImageToLimit(
  input: {
    readonly height?: number | null | undefined;
    readonly sizeBytes: number | null | undefined;
    readonly uri: string;
    readonly width?: number | null | undefined;
  },
  dependencies: MobileImageCompressionDependencies,
  options: {
    readonly maxBytes?: number;
    readonly steps?: readonly MobileImageCompressionStep[];
  } = {},
): Promise<MobileImageCompressionResult | null> {
  const maxBytes = options.maxBytes ?? MOBILE_IMAGE_UPLOAD_MAX_BYTES;

  for (const step of options.steps ?? MOBILE_IMAGE_COMPRESSION_STEPS) {
    let uri: string;
    try {
      uri = await dependencies.compress({
        compress: step.compress,
        maxEdge: step.maxEdge,
        uri: input.uri,
      });
    } catch {
      // A pass that failed natively is one failed attempt, not a broken picker.
      continue;
    }

    const sizeBytes = dependencies.measure(uri);
    if (typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes > 0) {
      if (sizeBytes <= maxBytes) {
        return { sizeBytes, uri };
      }
      continue;
    }

    // An unmeasurable result is exactly what must never be uploaded: the
    // declared size is what UploadThing presigns against.
    return null;
  }

  return null;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
