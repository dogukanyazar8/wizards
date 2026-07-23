import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const diffPath = path.join(mobileRoot, "scripts", "mobile-redesign-diff.ts");

test("two-layer visual diff gate exists with pinned image dependencies", () => {
  assert.equal(existsSync(diffPath), true, "two-layer visual diff gate must exist");
  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.["visual:diff"], "node --import tsx scripts/mobile-redesign-diff.ts");
  assert.equal(packageJson.devDependencies?.pixelmatch, "7.1.0");
  assert.equal(packageJson.devDependencies?.sharp, "0.35.3");
  assert.equal(packageJson.devDependencies?.["ssim.js"], "3.5.0");
});

const width = 1170;
const height = 2532;

function paintRectangle(
  pixels: Buffer,
  x: number,
  y: number,
  rectangleWidth: number,
  rectangleHeight: number,
  color: readonly [number, number, number, number],
) {
  for (let row = y; row < y + rectangleHeight; row += 1) {
    for (let column = x; column < x + rectangleWidth; column += 1) {
      const index = (row * width + column) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
    }
  }
}

async function writeFixture(filePath: string, mutate?: (pixels: Buffer) => void) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  mutate?.(pixels);
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath);
}

test("two-layer gate separates flat, text, and declared shadow failures", async () => {
  const { diffTwoLayerVisuals } = await import("./mobile-redesign-diff");
  const directory = mkdtempSync(path.join(os.tmpdir(), "whispr-visual-diff-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const outputDirectory = path.join(directory, "output");
  await writeFixture(expectedPath);
  await writeFixture(actualPath, (pixels) => {
    paintRectangle(pixels, 20, 20, 120, 40, [0, 0, 0, 255]);
    paintRectangle(pixels, 800, 800, 150, 150, [0, 0, 0, 255]);
  });

  const result = await diffTwoLayerVisuals({
    expectedPath,
    actualPath,
    outputDirectory,
    textRegions: [{ id: "tab-label", x: 20, y: 20, width: 120, height: 40 }],
    shadowRegions: [
      {
        id: "tab-bar-shadow",
        x: 20,
        y: 100,
        width: 200,
        height: 80,
        expectedParameters: "0 8px 24px rgba(30,34,53,.08)",
        actualParameters: "0 8px 24px rgba(30,34,53,.10)",
      },
    ],
  });

  assert.equal(result.passed, false);
  assert.ok(result.flat.mismatchRatio > 0.005);
  assert.equal(result.flat.components.some((component) => component.width > 6), true);
  assert.equal(result.text.failures[0]?.id, "tab-label");
  assert.equal(result.shadows.failures[0]?.reason, "declared-parameters");
  assert.equal(existsSync(result.overlayPath), true);
  assert.equal(existsSync(result.reportPath), true);
});

test("two-layer gate rejects a non-DPR-3 image without resizing it", async () => {
  const { diffTwoLayerVisuals } = await import("./mobile-redesign-diff");
  const directory = mkdtempSync(path.join(os.tmpdir(), "whispr-visual-diff-invalid-"));
  const invalidPath = path.join(directory, "invalid.png");
  const validPath = path.join(directory, "valid.png");
  await sharp({ create: { width: 390, height: 844, channels: 4, background: "white" } })
    .png()
    .toFile(invalidPath);
  await writeFixture(validPath);

  await assert.rejects(
    () => diffTwoLayerVisuals({ expectedPath: validPath, actualPath: invalidPath }),
    /1170×2532/,
  );
});
