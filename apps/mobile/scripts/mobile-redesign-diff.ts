import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import { ssim } from "ssim.js";

export const CANONICAL_LOGICAL_VIEWPORT = { width: 390, height: 844 } as const;
export const CANONICAL_DPR = 3 as const;
export const CANONICAL_PHYSICAL_VIEWPORT = {
  width: CANONICAL_LOGICAL_VIEWPORT.width * CANONICAL_DPR,
  height: CANONICAL_LOGICAL_VIEWPORT.height * CANONICAL_DPR,
} as const;
export const FLAT_MISMATCH_THRESHOLD = 0.1 as const;
export const FLAT_MISMATCH_RATIO_LIMIT = 0.005 as const;
export const TEXT_SSIM_MINIMUM = 0.985 as const;
export const SHADOW_SSIM_MINIMUM = 0.98 as const;
export const MAX_FLAT_COMPONENT_DIMENSION = 6 as const;

export type Point = Readonly<{ x: number; y: number }>;
export type Mask = Readonly<{ id: string; polygon: readonly Point[] }>;
export type Region = Readonly<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;
export type ShadowRegion = Region &
  Readonly<{ expectedParameters: string; actualParameters: string }>;

export type VisualDiffInput = Readonly<{
  expectedPath: string;
  actualPath: string;
  outputDirectory?: string;
  masks?: readonly Mask[];
  textRegions?: readonly Region[];
  shadowRegions?: readonly ShadowRegion[];
}>;

export type DiffComponent = Readonly<{
  pixels: number;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type VisualDiffResult = Readonly<{
  passed: boolean;
  flat: Readonly<{
    mismatchPixels: number;
    comparedPixels: number;
    mismatchRatio: number;
    components: readonly DiffComponent[];
    failures: readonly string[];
  }>;
  text: Readonly<{
    failures: readonly Readonly<{ id: string; ssim: number; minimum: number }>[];
  }>;
  shadows: Readonly<{
    failures: readonly Readonly<{
      id: string;
      reason: "declared-parameters" | "ssim";
      expected?: string;
      actual?: string;
      ssim?: number;
      minimum?: number;
    }>[];
  }>;
  overlayPath: string;
  reportPath: string;
}>;

type DecodedImage = Readonly<{ data: Buffer; width: number; height: number }>;

const defaultOutputDirectory = path.resolve("artifacts", "redesign", "visual-diff");

function assertRegion(region: Region) {
  if (
    !Number.isInteger(region.x) ||
    !Number.isInteger(region.y) ||
    !Number.isInteger(region.width) ||
    !Number.isInteger(region.height) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > CANONICAL_PHYSICAL_VIEWPORT.width ||
    region.y + region.height > CANONICAL_PHYSICAL_VIEWPORT.height
  ) {
    throw new Error(`Region ${region.id} is outside the ${CANONICAL_PHYSICAL_VIEWPORT.width}×${CANONICAL_PHYSICAL_VIEWPORT.height} DPR-3 viewport.`);
  }
}

async function decodeOpaqueSrgbRgba(filePath: string): Promise<DecodedImage> {
  const image = sharp(filePath, { animated: false, pages: 1 });
  const metadata = await image.metadata();
  if (metadata.format !== "png") {
    throw new Error(`${filePath} must be a PNG image.`);
  }
  if (
    metadata.width !== CANONICAL_PHYSICAL_VIEWPORT.width ||
    metadata.height !== CANONICAL_PHYSICAL_VIEWPORT.height
  ) {
    throw new Error(`${filePath} must be exactly ${CANONICAL_PHYSICAL_VIEWPORT.width}×${CANONICAL_PHYSICAL_VIEWPORT.height} physical pixels at DPR ${CANONICAL_DPR}; resizing is forbidden.`);
  }
  if (metadata.space !== "srgb" || metadata.channels !== 4 || metadata.depth !== "uchar") {
    throw new Error(`${filePath} must decode as 8-bit sRGB RGBA without channel conversion.`);
  }
  if (metadata.hasProfile) {
    throw new Error(`${filePath} has an embedded colour profile; colour-profile conversion is forbidden.`);
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== metadata.width || info.height !== metadata.height || info.channels !== 4) {
    throw new Error(`${filePath} did not decode to its original RGBA pixel grid.`);
  }
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) {
      throw new Error(`${filePath} must be opaque RGBA.`);
    }
  }
  return { data, width: info.width, height: info.height };
}

function pointInPolygon(x: number, y: number, polygon: readonly Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current]!;
    const previousPoint = polygon[previous]!;
    if (
      (currentPoint.y > y) !== (previousPoint.y > y) &&
      x < ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function buildExcludedMask(masks: readonly Mask[], regions: readonly Region[]) {
  const { width, height } = CANONICAL_PHYSICAL_VIEWPORT;
  const excluded = new Uint8Array(width * height);
  for (const region of regions) {
    assertRegion(region);
    for (let y = region.y; y < region.y + region.height; y += 1) {
      excluded.fill(1, y * width + region.x, y * width + region.x + region.width);
    }
  }
  for (const mask of masks) {
    if (mask.polygon.length < 3) {
      throw new Error(`Mask ${mask.id} must contain at least three points.`);
    }
    const xs = mask.polygon.map((point) => point.x);
    const ys = mask.polygon.map((point) => point.y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pointInPolygon(x + 0.5, y + 0.5, mask.polygon)) {
          excluded[y * width + x] = 1;
        }
      }
    }
  }
  return excluded;
}

function crop(image: DecodedImage, region: Region) {
  assertRegion(region);
  const pixels = new Uint8ClampedArray(region.width * region.height * 4);
  for (let y = 0; y < region.height; y += 1) {
    const sourceStart = ((region.y + y) * image.width + region.x) * 4;
    pixels.set(image.data.subarray(sourceStart, sourceStart + region.width * 4), y * region.width * 4);
  }
  return { data: pixels, width: region.width, height: region.height };
}

function calculateSsim(expected: DecodedImage, actual: DecodedImage, region: Region) {
  return ssim(crop(expected, region), crop(actual, region), {
    ssim: "original",
    downsample: false,
    maxSize: 10_000,
  }).mssim;
}

function findComponents(diffMask: Uint8Array, excluded: Uint8Array) {
  const { width, height } = CANONICAL_PHYSICAL_VIEWPORT;
  const visited = new Uint8Array(width * height);
  const components: DiffComponent[] = [];
  const offsets = [-1, 0, 1];
  for (let index = 0; index < diffMask.length; index += 1) {
    if (diffMask[index] === 0 || excluded[index] === 1 || visited[index] === 1) continue;
    const queue = [index];
    visited[index] = 1;
    let cursor = 0;
    let pixels = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (cursor < queue.length) {
      const current = queue[cursor++]!;
      const x = current % width;
      const y = Math.floor(current / width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const offsetY of offsets) {
        for (const offsetX of offsets) {
          if (offsetX === 0 && offsetY === 0) continue;
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
          const neighbor = neighborY * width + neighborX;
          if (diffMask[neighbor] === 1 && excluded[neighbor] === 0 && visited[neighbor] === 0) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
    }
    components.push({ pixels, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return components;
}

function drawRectangle(data: Buffer, region: Region, color: readonly [number, number, number]) {
  const { width, height } = CANONICAL_PHYSICAL_VIEWPORT;
  for (let x = region.x; x < region.x + region.width; x += 1) {
    for (const y of [region.y, region.y + region.height - 1]) {
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (const x of [region.x, region.x + region.width - 1]) {
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
}

export async function diffTwoLayerVisuals(input: VisualDiffInput): Promise<VisualDiffResult> {
  const [expected, actual] = await Promise.all([
    decodeOpaqueSrgbRgba(input.expectedPath),
    decodeOpaqueSrgbRgba(input.actualPath),
  ]);
  const masks = input.masks ?? [];
  const textRegions = input.textRegions ?? [];
  const shadowRegions = input.shadowRegions ?? [];
  const excluded = buildExcludedMask(masks, [...textRegions, ...shadowRegions]);
  const actualForFlat = Buffer.from(actual.data);
  let comparedPixels = 0;
  for (let index = 0; index < excluded.length; index += 1) {
    if (excluded[index] === 1) {
      expected.data.copy(actualForFlat, index * 4, index * 4, index * 4 + 4);
    } else {
      comparedPixels += 1;
    }
  }

  const diffImage = new Uint8Array(expected.data.length);
  const mismatchPixels = pixelmatch(
    expected.data,
    actualForFlat,
    diffImage,
    expected.width,
    expected.height,
    { threshold: FLAT_MISMATCH_THRESHOLD, includeAA: false, diffMask: true },
  );
  const flatDiffMask = new Uint8Array(excluded.length);
  for (let index = 0; index < flatDiffMask.length; index += 1) {
    flatDiffMask[index] = diffImage[index * 4 + 3] === 0 ? 0 : 1;
  }
  const components = findComponents(flatDiffMask, excluded);
  const mismatchRatio = mismatchPixels / comparedPixels;
  const flatFailures = [
    ...(mismatchRatio > FLAT_MISMATCH_RATIO_LIMIT
      ? [`flat mismatch ratio ${(mismatchRatio * 100).toFixed(3)}% exceeds 0.5%`]
      : []),
    ...components
      .filter((component) => component.width > MAX_FLAT_COMPONENT_DIMENSION || component.height > MAX_FLAT_COMPONENT_DIMENSION)
      .map((component) => `flat component at ${component.x},${component.y} is ${component.width}×${component.height}, above 6×6`),
  ];

  const textFailures = textRegions.flatMap((region) => {
    const value = calculateSsim(expected, actual, region);
    return value >= TEXT_SSIM_MINIMUM ? [] : [{ id: region.id, ssim: value, minimum: TEXT_SSIM_MINIMUM }];
  });
  const shadowFailures = shadowRegions.flatMap((region) => {
    const failures: VisualDiffResult["shadows"]["failures"][number][] = [];
    if (region.expectedParameters !== region.actualParameters) {
      failures.push({ id: region.id, reason: "declared-parameters", expected: region.expectedParameters, actual: region.actualParameters });
    }
    const value = calculateSsim(expected, actual, region);
    if (value < SHADOW_SSIM_MINIMUM) {
      failures.push({ id: region.id, reason: "ssim", ssim: value, minimum: SHADOW_SSIM_MINIMUM });
    }
    return failures;
  });

  const passed = flatFailures.length === 0 && textFailures.length === 0 && shadowFailures.length === 0;
  const outputDirectory = input.outputDirectory ?? defaultOutputDirectory;
  await mkdir(outputDirectory, { recursive: true });
  const overlayPath = path.join(outputDirectory, "visual-diff-overlay.png");
  const reportPath = path.join(outputDirectory, "visual-diff-report.json");
  const overlay = Buffer.from(expected.data);
  for (let index = 0; index < flatDiffMask.length; index += 1) {
    if (flatDiffMask[index] === 1) {
      overlay[index * 4] = 224;
      overlay[index * 4 + 1] = 82;
      overlay[index * 4 + 2] = 82;
    }
  }
  for (const failure of textFailures) {
    const region = textRegions.find((candidate) => candidate.id === failure.id);
    if (region) drawRectangle(overlay, region, [245, 158, 11]);
  }
  for (const failure of shadowFailures) {
    const region = shadowRegions.find((candidate) => candidate.id === failure.id);
    if (region) drawRectangle(overlay, region, [139, 92, 246]);
  }
  await sharp(overlay, { raw: { width: expected.width, height: expected.height, channels: 4 } }).png().toFile(overlayPath);

  const result: VisualDiffResult = {
    passed,
    flat: { mismatchPixels, comparedPixels, mismatchRatio, components, failures: flatFailures },
    text: { failures: textFailures },
    shadows: { failures: shadowFailures },
    overlayPath,
    reportPath,
  };
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function main() {
  const expectedPath = process.env.WHISPR_DIFF_EXPECTED;
  const actualPath = process.env.WHISPR_DIFF_ACTUAL;
  const regionsPath = process.env.WHISPR_DIFF_REGIONS;
  if (!expectedPath || !actualPath || !regionsPath) {
    throw new Error("WHISPR_DIFF_EXPECTED, WHISPR_DIFF_ACTUAL, and WHISPR_DIFF_REGIONS are required.");
  }
  const regions = JSON.parse(await readFile(regionsPath, "utf8")) as Pick<VisualDiffInput, "masks" | "textRegions" | "shadowRegions">;
  const result = await diffTwoLayerVisuals({
    expectedPath,
    actualPath,
    ...regions,
    outputDirectory: process.env.WHISPR_DIFF_OUTPUT,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  void main();
}
