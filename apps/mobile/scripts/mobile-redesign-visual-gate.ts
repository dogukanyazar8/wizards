import { existsSync, statSync } from "node:fs";
import path from "node:path";

import {
  DEVICE_CAPTURE_TARGETS,
  assertVisualCaptureEvidenceIsFresh,
  getChangedVisualCaptureSourcePaths,
  readCaptureEnvironment,
  readDeterministicDeviceCapture,
} from "./mobile-redesign-device-capture";
import { diffTwoLayerVisuals, type Mask } from "./mobile-redesign-diff";

const scriptDirectory = path.dirname(import.meta.dirname);
const baselineDirectory = path.join(
  scriptDirectory,
  "visual-baselines",
  "whispr-mobile-redesign",
  "v1",
);

// 1h is a handoff reference only; it is not an implemented mobile surface.
export const DEVICE_GATE_TARGETS = DEVICE_CAPTURE_TARGETS;

function nativeMasksFor(platform: "android" | "ios"): readonly Mask[] {
  const environment = readCaptureEnvironment();
  return environment.masks.platforms[platform].map(({ id, polygon }) => ({
    id,
    polygon: polygon.map(([x, y]) => ({ x, y })),
  }));
}

export function requireDeviceCaptureDirectory(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "WHISPR_DEVICE_CAPTURE_DIRECTORY is required; visual:gate only compares deterministic device evidence with normalized goldens.",
    );
  }
  const captureDirectory = path.resolve(value);
  if (!existsSync(captureDirectory) || !statSync(captureDirectory).isDirectory()) {
    throw new Error(`WHISPR_DEVICE_CAPTURE_DIRECTORY must be an existing capture directory: ${captureDirectory}`);
  }
  return captureDirectory;
}

export async function verifyDeviceCapturesAgainstNormalizedGoldens(input: {
  captureDirectory: string;
}): Promise<void> {
  const captureDirectory = requireDeviceCaptureDirectory(input.captureDirectory);
  const changedPathsByCommit = new Map<string, string[]>();

  for (const target of DEVICE_GATE_TARGETS) {
    const evidence = await readDeterministicDeviceCapture({
      anchor: target.anchor,
      captureDirectory,
      theme: target.theme,
    });
    const changedPaths = changedPathsByCommit.get(evidence.manifest.commit) ?? getChangedVisualCaptureSourcePaths(evidence.manifest.commit);
    changedPathsByCommit.set(evidence.manifest.commit, changedPaths);
    assertVisualCaptureEvidenceIsFresh({ commit: evidence.manifest.commit, changedPaths });
    const result = await diffTwoLayerVisuals({
      actualPath: evidence.capturePath,
      expectedPath: path.join(baselineDirectory, `${target.anchor}.png`),
      masks: nativeMasksFor(evidence.manifest.platform),
      outputDirectory: path.join(captureDirectory, "diff", `${target.anchor}-${target.theme}`),
    });
    if (!result.passed) {
      throw new Error(
        `Device visual regression for ${target.anchor}-${target.theme}; see ${result.overlayPath} and ${result.reportPath}.`,
      );
    }
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (invokedAsScript) {
  verifyDeviceCapturesAgainstNormalizedGoldens({
    captureDirectory: requireDeviceCaptureDirectory(process.env.WHISPR_DEVICE_CAPTURE_DIRECTORY),
  })
    .then(() => process.stdout.write("Mobile device visual gate passed.\n"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
