import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");
const baselineDirectory = path.join(mobileRoot, "visual-baselines", "whispr-mobile-redesign", "v1");
const environmentPath = path.join(baselineDirectory, "capture-environment.json");
const allowedTestAccount = "visual-uat-capture";
const allowedMaskIds = [
  "system-time",
  "system-signal",
  "system-battery",
  "system-gesture-indicator",
] as const;

export const DEVICE_CAPTURE_LOGICAL_VIEWPORT = { height: 844, width: 390 } as const;
export const DEVICE_CAPTURE_PHYSICAL_VIEWPORT = { height: 2532, width: 1170 } as const;
export const DEVICE_CAPTURE_SAFE_AREA_INSETS = { bottom: 0, left: 0, right: 0, top: 42 } as const;

export type Platform = "android" | "ios";
export type Theme = "dark" | "light";
export const DEVICE_CAPTURE_TARGETS = [
  { anchor: "1a", theme: "light" },
  { anchor: "1b", theme: "light" },
  { anchor: "1c", theme: "light" },
  { anchor: "1d", theme: "light" },
  { anchor: "1e", theme: "light" },
  { anchor: "1f", theme: "light" },
  { anchor: "1g", theme: "light" },
  { anchor: "1i", theme: "dark" },
  { anchor: "1j", theme: "dark" },
] as const;
export type DeviceCaptureAnchor = (typeof DEVICE_CAPTURE_TARGETS)[number]["anchor"];
type Mask = { id: (typeof allowedMaskIds)[number]; polygon: readonly (readonly [number, number])[] };

export type CaptureEnvironment = {
  buildProfile: "uat" | "production" | "store";
  colorSpace: "sRGB";
  deviceScaleFactor: 3;
  fontScale: 1;
  locale: "tr-TR";
  logicalViewport: typeof DEVICE_CAPTURE_LOGICAL_VIEWPORT;
  masks: {
    file: string;
    platforms: Record<Platform, readonly Mask[]>;
    version: 1;
  };
  physicalViewport: typeof DEVICE_CAPTURE_PHYSICAL_VIEWPORT;
  reducedMotion: "always";
  safeAreaInsets: typeof DEVICE_CAPTURE_SAFE_AREA_INSETS;
  timezone: "Europe/Istanbul";
  version: 1;
};

export type DeviceCaptureManifest = {
  anchor: DeviceCaptureAnchor;
  build: string;
  buildProfile: "uat";
  captureEnvironmentHash: string;
  colorSpace: "sRGB";
  commit: string;
  deviceScaleFactor: 3;
  fontScale: 1;
  inputHash: string;
  locale: "tr-TR";
  logicalViewport: typeof DEVICE_CAPTURE_LOGICAL_VIEWPORT;
  mask: { hash: string; ids: readonly (typeof allowedMaskIds)[number][]; version: 1 };
  physicalViewport: typeof DEVICE_CAPTURE_PHYSICAL_VIEWPORT;
  platform: Platform;
  reducedMotion: "always";
  safeAreaInsets: typeof DEVICE_CAPTURE_SAFE_AREA_INSETS;
  sourceDateEpoch: "0";
  testAccount: typeof allowedTestAccount;
  theme: Theme;
  timezone: "Europe/Istanbul";
  version: 1;
};

// Any change in these inputs can change a native visual capture. Keep this
// deliberately conservative: accepting stale evidence is worse than requiring
// a recapture for a mobile source change.
export const VISUAL_CAPTURE_SOURCE_PATHS = [
  "apps/mobile/assets/",
  "apps/mobile/package.json",
  "apps/mobile/scripts/",
  "apps/mobile/src/",
  "apps/mobile/visual-baselines/whispr-mobile-redesign/",
  "pnpm-lock.yaml",
] as const;

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parsePngDimensions(image: Buffer): { height: number; width: number } {
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Device capture input must be a PNG.");
  }
  return { height: image.readUInt32BE(20), width: image.readUInt32BE(16) };
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasCanonicalViewport(value: { height: number; width: number }, expected: { height: number; width: number }): boolean {
  return value.width === expected.width && value.height === expected.height;
}

function hasCanonicalInsets(value: { bottom: number; left: number; right: number; top: number }): boolean {
  return value.top === DEVICE_CAPTURE_SAFE_AREA_INSETS.top &&
    value.right === DEVICE_CAPTURE_SAFE_AREA_INSETS.right &&
    value.bottom === DEVICE_CAPTURE_SAFE_AREA_INSETS.bottom &&
    value.left === DEVICE_CAPTURE_SAFE_AREA_INSETS.left;
}

export function assertDeterministicDeviceCapture(environment: CaptureEnvironment): void {
  if (environment.buildProfile !== "uat") {
    throw new Error("Deterministic device capture is UAT-only.");
  }
  if (!hasCanonicalViewport(environment.logicalViewport, DEVICE_CAPTURE_LOGICAL_VIEWPORT)) {
    throw new Error("Device capture logical viewport must remain exactly 390x844.");
  }
  if (!hasCanonicalViewport(environment.physicalViewport, DEVICE_CAPTURE_PHYSICAL_VIEWPORT)) {
    throw new Error("Device capture physical viewport must remain exactly 1170x2532 at DPR 3.");
  }
  if (!hasCanonicalInsets(environment.safeAreaInsets)) {
    throw new Error("Device capture must use the canonical logical safe-area insets.");
  }
  if (
    environment.deviceScaleFactor !== 3 ||
    environment.fontScale !== 1 ||
    environment.locale !== "tr-TR" ||
    environment.timezone !== "Europe/Istanbul" ||
    environment.reducedMotion !== "always" ||
    environment.colorSpace !== "sRGB"
  ) {
    throw new Error("Device capture environment differs from the pinned deterministic contract.");
  }
  for (const platform of ["android", "ios"] as const) {
    const masks = environment.masks.platforms[platform];
    if (!masks || masks.length !== allowedMaskIds.length) {
      throw new Error(`Device capture masks must define exactly the allowed native glyph regions for ${platform}.`);
    }
    const ids = masks.map(({ id }) => id).sort();
    if (!equalJson(ids, [...allowedMaskIds].sort())) {
      throw new Error(`Device capture masks may cover only time, signal, battery, and gesture glyphs for ${platform}.`);
    }
    for (const mask of masks) {
      if (mask.polygon.length < 3 || mask.polygon.some(([x, y]) => x < 0 || y < 0 || x > 1170 || y > 2532)) {
        throw new Error(`Device capture mask ${mask.id} must be a valid DPR-3 viewport polygon.`);
      }
    }
  }
}

export function readCaptureEnvironment(): CaptureEnvironment {
  const rawEnvironment = JSON.parse(readFileSync(environmentPath, "utf8")) as Omit<CaptureEnvironment, "buildProfile" | "masks"> & {
    masks: { file: string; version: 1 };
  };
  const maskPath = path.join(baselineDirectory, rawEnvironment.masks.file);
  const rawMasks = JSON.parse(readFileSync(maskPath, "utf8")) as {
    deviceScaleFactor: number;
    physicalViewport: unknown;
    platforms: Record<Platform, readonly Mask[]>;
    version: number;
  };
  const environment: CaptureEnvironment = {
    ...rawEnvironment,
    buildProfile: "uat",
    masks: {
      file: rawEnvironment.masks.file,
      platforms: rawMasks.platforms,
      version: rawMasks.version as 1,
    },
  } as CaptureEnvironment;
  if (
    rawMasks.deviceScaleFactor !== 3 ||
    !hasCanonicalViewport(rawMasks.physicalViewport as { height: number; width: number }, DEVICE_CAPTURE_PHYSICAL_VIEWPORT)
  ) {
    throw new Error("Versioned device masks must use the canonical DPR-3 physical viewport.");
  }
  assertDeterministicDeviceCapture(environment);
  return environment;
}

function getCommit(): string {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error("Device capture requires a full Git commit hash.");
  }
  return commit;
}

function assertCommit(commit: string): asserts commit is string {
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error("Device capture evidence requires a full 40-character Git commit hash.");
  }
}

function assertBuild(build: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(build)) {
    throw new Error("Device capture evidence requires a non-secret UAT build identifier.");
  }
}

function captureTargetDirectory(captureDirectory: string, anchor: DeviceCaptureAnchor, theme: Theme): string {
  return path.join(path.resolve(captureDirectory), `${anchor}-${theme}`);
}

function isVisualCaptureSourcePath(filePath: string): boolean {
  return VISUAL_CAPTURE_SOURCE_PATHS.some(
    (sourcePath) => filePath === sourcePath || filePath.startsWith(sourcePath),
  );
}

export function assertVisualCaptureEvidenceIsFresh(input: { commit: string; changedPaths: readonly string[] }): void {
  assertCommit(input.commit);
  const changedVisualSources = input.changedPaths.filter(isVisualCaptureSourcePath);
  if (changedVisualSources.length > 0) {
    throw new Error(
      `Device capture evidence is stale for ${input.commit}: ${changedVisualSources.join(", ")}. Recapture and commit the affected targets.`,
    );
  }
}

export function getChangedVisualCaptureSourcePaths(commit: string): string[] {
  assertCommit(commit);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`Device capture evidence commit ${commit} is not an ancestor of HEAD.`);
  }

  return execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${commit}..HEAD`, "--", ...VISUAL_CAPTURE_SOURCE_PATHS],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
}

function assertCaptureTarget(anchor: string, theme: string): asserts anchor is DeviceCaptureAnchor {
  if (!DEVICE_CAPTURE_TARGETS.some((target) => target.anchor === anchor && target.theme === theme)) {
    throw new Error(`Device capture target ${anchor}-${theme} is not a supported normalized golden target.`);
  }
}

function assertManifestMatchesEnvironment(manifest: DeviceCaptureManifest, environment: CaptureEnvironment): void {
  if (
    (manifest.platform !== "android" && manifest.platform !== "ios") ||
    !manifest.mask ||
    !Array.isArray(manifest.mask.ids) ||
    typeof manifest.mask.hash !== "string" ||
    typeof manifest.inputHash !== "string" ||
    !/^[0-9a-f]{64}$/i.test(manifest.inputHash)
  ) {
    throw new Error("Device capture manifest has an invalid platform, mask, or image hash.");
  }
  assertCaptureTarget(manifest.anchor, manifest.theme);
  assertCommit(manifest.commit);
  if (
    manifest.buildProfile !== "uat" ||
    typeof manifest.build !== "string" ||
    manifest.colorSpace !== environment.colorSpace ||
    manifest.deviceScaleFactor !== environment.deviceScaleFactor ||
    manifest.fontScale !== environment.fontScale ||
    manifest.locale !== environment.locale ||
    manifest.reducedMotion !== environment.reducedMotion ||
    manifest.sourceDateEpoch !== "0" ||
    manifest.testAccount !== allowedTestAccount ||
    manifest.timezone !== environment.timezone ||
    manifest.version !== 1 ||
    !equalJson(manifest.logicalViewport, environment.logicalViewport) ||
    !equalJson(manifest.physicalViewport, environment.physicalViewport) ||
    !equalJson(manifest.safeAreaInsets, environment.safeAreaInsets)
  ) {
    throw new Error("Device capture manifest differs from the pinned deterministic contract.");
  }
  assertBuild(manifest.build);
  const environmentBytes = readFileSync(environmentPath);
  const maskBytes = readFileSync(path.join(baselineDirectory, environment.masks.file));
  if (
    manifest.captureEnvironmentHash !== sha256(environmentBytes) ||
    manifest.mask.hash !== sha256(maskBytes) ||
    manifest.mask.version !== environment.masks.version ||
    !equalJson(manifest.mask.ids, environment.masks.platforms[manifest.platform]?.map(({ id }) => id))
  ) {
    throw new Error("Device capture manifest hashes or native masks do not match the pinned environment.");
  }
}

export async function writeDeterministicDeviceCapture(input: {
  anchor: DeviceCaptureAnchor;
  build: string;
  buildProfile: "uat" | "production" | "store";
  commit: string;
  inputPath: string;
  outputRoot: string;
  platform: Platform;
  testAccount: string;
  theme: Theme;
}): Promise<{ capturePath: string; manifest: DeviceCaptureManifest; manifestPath: string }> {
  const environment = readCaptureEnvironment();
  assertDeterministicDeviceCapture({ ...environment, buildProfile: input.buildProfile });
  assertCommit(input.commit);
  assertBuild(input.build);
  assertCaptureTarget(input.anchor, input.theme);
  if (input.testAccount !== allowedTestAccount) {
    throw new Error("Device capture may use only the allowlisted redacted UAT test account alias.");
  }
  const image = await readFile(input.inputPath);
  const dimensions = parsePngDimensions(image);
  if (!equalJson(dimensions, DEVICE_CAPTURE_PHYSICAL_VIEWPORT)) {
    throw new Error(`Device capture input must be 1170x2532; received ${dimensions.width}x${dimensions.height}.`);
  }

  const maskPath = path.join(baselineDirectory, environment.masks.file);
  const maskBytes = readFileSync(maskPath);
  const environmentBytes = readFileSync(environmentPath);
  const outputDirectory = captureTargetDirectory(input.outputRoot, input.anchor, input.theme);
  await mkdir(outputDirectory, { recursive: true });
  const capturePath = path.join(outputDirectory, `${input.anchor}-${input.theme}.png`);
  const manifestPath = path.join(outputDirectory, `${input.anchor}-${input.theme}-manifest.json`);
  await copyFile(input.inputPath, capturePath);

  const manifest: DeviceCaptureManifest = {
    anchor: input.anchor,
    build: input.build,
    buildProfile: "uat",
    captureEnvironmentHash: sha256(environmentBytes),
    colorSpace: environment.colorSpace,
    commit: input.commit,
    deviceScaleFactor: environment.deviceScaleFactor,
    fontScale: environment.fontScale,
    inputHash: sha256(image),
    locale: environment.locale,
    logicalViewport: environment.logicalViewport,
    mask: {
      hash: sha256(maskBytes),
      ids: environment.masks.platforms[input.platform].map(({ id }) => id),
      version: environment.masks.version,
    },
    physicalViewport: environment.physicalViewport,
    platform: input.platform,
    reducedMotion: environment.reducedMotion,
    safeAreaInsets: environment.safeAreaInsets,
    sourceDateEpoch: "0",
    testAccount: allowedTestAccount,
    theme: input.theme,
    timezone: environment.timezone,
    version: 1,
  };
  await readFile(capturePath);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { capturePath, manifest, manifestPath };
}

export async function readDeterministicDeviceCapture(input: {
  anchor: DeviceCaptureAnchor;
  captureDirectory: string;
  theme: Theme;
}): Promise<{ capturePath: string; manifest: DeviceCaptureManifest; manifestPath: string }> {
  assertCaptureTarget(input.anchor, input.theme);
  const captureDirectory = path.resolve(input.captureDirectory);
  const targetDirectory = captureTargetDirectory(captureDirectory, input.anchor, input.theme);
  const capturePath = path.join(targetDirectory, `${input.anchor}-${input.theme}.png`);
  const manifestPath = path.join(targetDirectory, `${input.anchor}-${input.theme}-manifest.json`);
  if (!existsSync(capturePath) || !existsSync(manifestPath)) {
    throw new Error(`Missing device capture evidence for ${input.anchor}-${input.theme} in ${captureDirectory}.`);
  }
  const [image, rawManifest] = await Promise.all([readFile(capturePath), readFile(manifestPath, "utf8")]);
  const manifest = JSON.parse(rawManifest) as DeviceCaptureManifest;
  const environment = readCaptureEnvironment();
  assertDeterministicDeviceCapture(environment);
  assertManifestMatchesEnvironment(manifest, environment);
  if (manifest.anchor !== input.anchor || manifest.theme !== input.theme) {
    throw new Error(`Device capture manifest target does not match ${input.anchor}-${input.theme}.`);
  }
  const dimensions = parsePngDimensions(image);
  if (!equalJson(dimensions, DEVICE_CAPTURE_PHYSICAL_VIEWPORT) || manifest.inputHash !== sha256(image)) {
    throw new Error(`Device capture evidence for ${input.anchor}-${input.theme} has an invalid image hash or viewport.`);
  }
  return { capturePath, manifest, manifestPath };
}

function readCliValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) {
    throw new Error(`Device capture requires ${name}.`);
  }
  return value;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const platform = readCliValue("--platform") as Platform;
  if (platform !== "android" && platform !== "ios") {
    throw new Error("Device capture platform must be android or ios.");
  }
  const inputPath = process.env.WHISPR_CAPTURE_INPUT;
  if (!inputPath || !existsSync(inputPath)) {
    throw new Error("Set WHISPR_CAPTURE_INPUT to the native DPR-3 screenshot PNG.");
  }
  writeDeterministicDeviceCapture({
    anchor: readCliValue("--anchor") as DeviceCaptureAnchor,
    build: process.env.WHISPR_CAPTURE_BUILD ?? "",
    buildProfile: process.env.WHISPR_MOBILE_ENV === "uat" ? "uat" : "production",
    commit: process.env.WHISPR_CAPTURE_COMMIT ?? getCommit(),
    inputPath,
    outputRoot: path.join(repositoryRoot, "artifacts", "redesign"),
    platform,
    testAccount: process.env.WHISPR_CAPTURE_TEST_ACCOUNT ?? "",
    theme: process.env.WHISPR_CAPTURE_THEME === "dark" ? "dark" : "light",
  })
    .then(({ manifestPath }) => console.log(JSON.stringify({ manifestPath, platform })))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
