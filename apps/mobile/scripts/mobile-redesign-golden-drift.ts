import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { diffTwoLayerVisuals } from "./mobile-redesign-diff";
import {
  generateNormalizedGoldens,
  type NormalizedGoldenManifest,
} from "./mobile-redesign-golden-transform";

const scriptDirectory = path.dirname(import.meta.dirname);
const baselineDirectory = path.join(
  scriptDirectory,
  "visual-baselines",
  "whispr-mobile-redesign",
  "v1",
);

type GoldenManifestIdentity = Readonly<{
  anchors: readonly Readonly<{ anchor: string; theme: string }>[];
  sourceHash: string;
  transformHash: string;
  version: number;
}>;

export function assertNormalizedGoldenManifestMatches(
  baseline: GoldenManifestIdentity,
  generated: GoldenManifestIdentity,
): void {
  assert.equal(generated.version, baseline.version, "normalized golden manifest version drifted");
  assert.equal(generated.sourceHash, baseline.sourceHash, "normalized golden source hash drifted");
  assert.equal(generated.transformHash, baseline.transformHash, "normalized golden transform hash drifted");
  assert.deepEqual(generated.anchors, baseline.anchors, "normalized golden anchor mapping drifted");
}

async function readBaselineManifest(): Promise<NormalizedGoldenManifest> {
  const manifestPath = path.join(baselineDirectory, "normalized-golden-manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8")) as NormalizedGoldenManifest;
}

export async function verifyNormalizedGoldenBaselines(): Promise<void> {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "whispr-golden-drift-"));
  try {
    const [baseline, generated] = await Promise.all([
      readBaselineManifest(),
      generateNormalizedGoldens({ outputDirectory }),
    ]);
    assertNormalizedGoldenManifestMatches(baseline, generated);

    for (const anchor of baseline.anchors) {
      const result = await diffTwoLayerVisuals({
        expectedPath: path.join(baselineDirectory, `${anchor.anchor}.png`),
        actualPath: path.join(outputDirectory, `${anchor.anchor}.png`),
        outputDirectory: path.join(outputDirectory, "diff", anchor.anchor),
      });
      if (!result.passed) {
        throw new Error(
          `Normalized golden pixel regression for ${anchor.anchor}; see ${result.overlayPath} and ${result.reportPath}.`,
        );
      }
    }
  } finally {
    await rm(outputDirectory, { force: true, recursive: true });
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (invokedAsScript) {
  verifyNormalizedGoldenBaselines()
    .then(() => process.stdout.write("Normalized mobile golden drift check passed.\n"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
