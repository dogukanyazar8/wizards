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
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const baselineDirectory = path.join(
  scriptDirectory,
  "visual-baselines",
  "whispr-mobile-redesign",
  "v1",
);

// 1h is a handoff reference only; it is not an implemented mobile surface.
export const DEVICE_GATE_TARGETS = DEVICE_CAPTURE_TARGETS;

export function resolveDeviceCaptureDirectory(value: string): string {
  return path.resolve(repositoryRoot, value);
}

export function resolveDeviceGateTargets(
  values: readonly string[] = [],
): readonly (typeof DEVICE_GATE_TARGETS)[number][] {
  if (values.length === 0) {
    return DEVICE_GATE_TARGETS;
  }

  const requested = new Set(values);
  const targets = DEVICE_GATE_TARGETS.filter((target) =>
    requested.has(`${target.anchor}-${target.theme}`),
  );
  if (targets.length !== requested.size) {
    const supported = new Set(targets.map((target) => `${target.anchor}-${target.theme}`));
    const unsupported = [...requested].filter((target) => !supported.has(target));
    throw new Error(`Unsupported device gate target: ${unsupported.join(", ")}.`);
  }
  return targets;
}

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
  const captureDirectory = resolveDeviceCaptureDirectory(value);
  if (!existsSync(captureDirectory) || !statSync(captureDirectory).isDirectory()) {
    throw new Error(
      `WHISPR_DEVICE_CAPTURE_DIRECTORY must be an existing capture directory: ${captureDirectory}`,
    );
  }
  return captureDirectory;
}

export async function verifyDeviceCapturesAgainstNormalizedGoldens(input: {
  captureDirectory: string;
  targets?: readonly string[];
}): Promise<void> {
  const captureDirectory = requireDeviceCaptureDirectory(input.captureDirectory);
  const changedPathsByCommit = new Map<string, string[]>();

  for (const target of resolveDeviceGateTargets(input.targets)) {
    const evidence = await readDeterministicDeviceCapture({
      anchor: target.anchor,
      captureDirectory,
      theme: target.theme,
    });
    const changedPaths =
      changedPathsByCommit.get(evidence.manifest.commit) ??
      getChangedVisualCaptureSourcePaths(evidence.manifest.commit);
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
  const targets = process.argv.flatMap((value, index, values) =>
    value === "--target" && values[index + 1] ? [values[index + 1] as string] : [],
  );
  verifyDeviceCapturesAgainstNormalizedGoldens({
    captureDirectory: requireDeviceCaptureDirectory(process.env.WHISPR_DEVICE_CAPTURE_DIRECTORY),
    targets,
  })
    .then(() => process.stdout.write("Mobile device visual gate passed.\n"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
