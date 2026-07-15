import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const androidPackageName = "team.whispr.mobile";

export const DEVICE_CAPTURE_LOGICAL_VIEWPORT = { height: 844, width: 390 } as const;
export const DEVICE_CAPTURE_PHYSICAL_VIEWPORT = { height: 2532, width: 1170 } as const;
export const DEVICE_CAPTURE_SAFE_AREA_INSETS = { bottom: 0, left: 0, right: 0, top: 42 } as const;

export type AndroidCaptureEnvironment = {
  abi: "x86_64";
  apiLevel: 37;
  avdName: "Pixel_10_Pro";
  buildFingerprint: "google/sdk_gphone16k_x86_64/emu64xa16k:17/CE2A.260420.019/15611780:user/dev-keys";
  emulatorVersion: "36.6.11.0";
  graphicsMode: "auto";
  gpuRenderer: "Google (NVIDIA Corporation), Android Emulator OpenGL ES Translator (NVIDIA GeForce RTX 5090/PCIe/SSE2), OpenGL ES 3.1 (4.5.0 NVIDIA 610.62)";
  hardwareProfile: "pixel_10_pro";
  ramMiB: 2048;
  systemImage: "system-images;android-37.0;google_apis_playstore_ps16k;x86_64";
  systemImagePackageSha256: "18cafc7d654896c636ae699d344aac527968a7391e4655998bfd86b6d758cc8e";
  systemImageRevision: 6;
};

export type Platform = "android" | "ios";
export type Theme = "dark" | "light";
export const DEVICE_CAPTURE_TARGETS = [
  { anchor: "1a", testId: "mobile-overview-screen", theme: "light" },
  { anchor: "1b", testId: "mobile-channel-chat-screen", theme: "light" },
  { anchor: "1c", testId: "mobile-dm-inbox-screen", theme: "light" },
  { anchor: "1d", testId: "mobile-notifications-screen", theme: "light" },
  { anchor: "1e", testId: "mobile-voice-room-screen", theme: "light" },
  { anchor: "1f", testId: "mobile-settings-screen", theme: "light" },
  { anchor: "1g", testId: "mobile-server-switcher-sheet-panel", theme: "light" },
  { anchor: "1i", testId: "mobile-overview-screen", theme: "dark" },
  { anchor: "1j", testId: "mobile-channel-chat-screen", theme: "dark" },
] as const;
export type DeviceCaptureAnchor = (typeof DEVICE_CAPTURE_TARGETS)[number]["anchor"];
type Mask = {
  id: (typeof allowedMaskIds)[number];
  polygon: readonly (readonly [number, number])[];
};

export type CaptureEnvironment = {
  android: AndroidCaptureEnvironment;
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
  android?: AndroidCaptureEnvironment;
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

function hasCanonicalViewport(
  value: { height: number; width: number },
  expected: { height: number; width: number },
): boolean {
  return value.width === expected.width && value.height === expected.height;
}

function hasCanonicalInsets(value: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): boolean {
  return (
    value.top === DEVICE_CAPTURE_SAFE_AREA_INSETS.top &&
    value.right === DEVICE_CAPTURE_SAFE_AREA_INSETS.right &&
    value.bottom === DEVICE_CAPTURE_SAFE_AREA_INSETS.bottom &&
    value.left === DEVICE_CAPTURE_SAFE_AREA_INSETS.left
  );
}

export function resolveRepositoryCaptureDirectory(value: string): string {
  return path.resolve(repositoryRoot, value);
}

export function assertPinnedAndroidCaptureDevice(device: AndroidCaptureEnvironment): void {
  if (device.apiLevel !== 37) {
    throw new Error("Android device capture API level must remain 37.");
  }
  if (device.avdName !== "Pixel_10_Pro" || device.hardwareProfile !== "pixel_10_pro") {
    throw new Error("Android device capture must use the pinned Pixel_10_Pro hardware profile.");
  }
  if (device.abi !== "x86_64" || device.ramMiB !== 2048 || device.graphicsMode !== "auto") {
    throw new Error(
      "Android device capture hardware or GPU configuration differs from the pinned contract.",
    );
  }
  if (
    device.systemImage !== "system-images;android-37.0;google_apis_playstore_ps16k;x86_64" ||
    device.systemImageRevision !== 6 ||
    device.systemImagePackageSha256 !==
      "18cafc7d654896c636ae699d344aac527968a7391e4655998bfd86b6d758cc8e"
  ) {
    throw new Error("Android device capture system image differs from the pinned contract.");
  }
  if (
    device.buildFingerprint !==
      "google/sdk_gphone16k_x86_64/emu64xa16k:17/CE2A.260420.019/15611780:user/dev-keys" ||
    device.emulatorVersion !== "36.6.11.0" ||
    device.gpuRenderer !==
      "Google (NVIDIA Corporation), Android Emulator OpenGL ES Translator (NVIDIA GeForce RTX 5090/PCIe/SSE2), OpenGL ES 3.1 (4.5.0 NVIDIA 610.62)"
  ) {
    throw new Error("Android device capture runtime differs from the pinned contract.");
  }
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
  assertPinnedAndroidCaptureDevice(environment.android);
  for (const platform of ["android", "ios"] as const) {
    const masks = environment.masks.platforms[platform];
    if (!masks || masks.length !== allowedMaskIds.length) {
      throw new Error(
        `Device capture masks must define exactly the allowed native glyph regions for ${platform}.`,
      );
    }
    const ids = masks.map(({ id }) => id).sort();
    if (!equalJson(ids, [...allowedMaskIds].sort())) {
      throw new Error(
        `Device capture masks may cover only time, signal, battery, and gesture glyphs for ${platform}.`,
      );
    }
    for (const mask of masks) {
      if (
        mask.polygon.length < 3 ||
        mask.polygon.some(([x, y]) => x < 0 || y < 0 || x > 1170 || y > 2532)
      ) {
        throw new Error(`Device capture mask ${mask.id} must be a valid DPR-3 viewport polygon.`);
      }
    }
  }
}

export function readCaptureEnvironment(): CaptureEnvironment {
  const rawEnvironment = JSON.parse(readFileSync(environmentPath, "utf8")) as Omit<
    CaptureEnvironment,
    "buildProfile" | "masks"
  > & {
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
    !hasCanonicalViewport(
      rawMasks.physicalViewport as { height: number; width: number },
      DEVICE_CAPTURE_PHYSICAL_VIEWPORT,
    )
  ) {
    throw new Error("Versioned device masks must use the canonical DPR-3 physical viewport.");
  }
  assertDeterministicDeviceCapture(environment);
  return environment;
}

function getCommit(): string {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
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

function captureTargetDirectory(
  captureDirectory: string,
  anchor: DeviceCaptureAnchor,
  theme: Theme,
): string {
  return path.join(path.resolve(captureDirectory), `${anchor}-${theme}`);
}

function isVisualCaptureSourcePath(filePath: string): boolean {
  return VISUAL_CAPTURE_SOURCE_PATHS.some(
    (sourcePath) => filePath === sourcePath || filePath.startsWith(sourcePath),
  );
}

export function assertVisualCaptureEvidenceIsFresh(input: {
  commit: string;
  changedPaths: readonly string[];
}): void {
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
    [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      `${commit}..HEAD`,
      "--",
      ...VISUAL_CAPTURE_SOURCE_PATHS,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
}

function assertCaptureTarget(anchor: string, theme: string): asserts anchor is DeviceCaptureAnchor {
  if (
    !DEVICE_CAPTURE_TARGETS.some((target) => target.anchor === anchor && target.theme === theme)
  ) {
    throw new Error(
      `Device capture target ${anchor}-${theme} is not a supported normalized golden target.`,
    );
  }
}

function resolveAndroidSdkRoot(): string | undefined {
  const configuredRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (configuredRoot) {
    return configuredRoot;
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const defaultWindowsSdkRoot = path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
    if (existsSync(defaultWindowsSdkRoot)) {
      return defaultWindowsSdkRoot;
    }
  }
  return undefined;
}

function resolveAdbPath(): string {
  const androidHome = resolveAndroidSdkRoot();
  return androidHome
    ? path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
}

function resolveEmulatorPath(): string {
  const androidHome = resolveAndroidSdkRoot();
  if (!androidHome) {
    throw new Error(
      "ANDROID_HOME or ANDROID_SDK_ROOT is required to verify the pinned emulator version.",
    );
  }
  return path.join(
    androidHome,
    "emulator",
    process.platform === "win32" ? "emulator.exe" : "emulator",
  );
}

function readAdbOutput(adbPath: string, serial: string, args: readonly string[]): string {
  return execFileSync(adbPath, ["-s", serial, ...args], { encoding: "utf8" }).trim();
}

function readEmulatorVersion(emulatorPath: string): string {
  const output = execFileSync(emulatorPath, ["-version"], { encoding: "utf8" });
  const match = /^Android emulator version ([^\s]+)/m.exec(output);
  if (!match?.[1]) {
    throw new Error("Android emulator did not report a version.");
  }
  return match[1];
}

function parseEffectiveDimension(
  output: string,
  dimension: "density" | "size",
): number | { height: number; width: number } {
  const matches = [
    ...output.matchAll(new RegExp(`(?:Override|Physical) ${dimension}:\\s*(.+)$`, "gim")),
  ];
  const value = matches.find((match) => match[0].startsWith("Override"))?.[1] ?? matches[0]?.[1];
  if (!value) {
    throw new Error(`Android emulator did not report its ${dimension}.`);
  }
  if (dimension === "density") {
    const density = Number.parseInt(value, 10);
    if (!Number.isInteger(density)) {
      throw new Error(`Android emulator reported an invalid density: ${value}.`);
    }
    return density;
  }
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Android emulator reported an invalid size: ${value}.`);
  }
  return {
    height: Number.parseInt(match[2] as string, 10),
    width: Number.parseInt(match[1] as string, 10),
  };
}

function assertAndroidRuntimeCaptureContract(input: {
  adbPath: string;
  environment: CaptureEnvironment;
  serial: string;
  theme: Theme;
}): void {
  if (!/^emulator-\d+$/.test(input.serial)) {
    throw new Error("Android device capture requires an emulator serial such as emulator-5554.");
  }
  const shell = (args: readonly string[]) =>
    readAdbOutput(input.adbPath, input.serial, ["shell", ...args]);
  const size = parseEffectiveDimension(shell(["wm", "size"]), "size");
  const density = parseEffectiveDimension(shell(["wm", "density"]), "density");
  const apiLevel = Number.parseInt(shell(["getprop", "ro.build.version.sdk"]), 10);
  const avdName = shell(["getprop", "ro.boot.qemu.avd_name"]);
  const abi = shell(["getprop", "ro.product.cpu.abi"]);
  const buildFingerprint = shell(["getprop", "ro.build.fingerprint"]);
  const gpuRenderer = /^GLES:\s*(.+)$/m.exec(shell(["dumpsys", "SurfaceFlinger"]))?.[1];
  const emulatorVersion = readEmulatorVersion(resolveEmulatorPath());
  const locale = shell(["getprop", "persist.sys.locale"]);
  const timezone = shell(["getprop", "persist.sys.timezone"]);
  const fontScale = Number.parseFloat(shell(["settings", "get", "system", "font_scale"]));
  const animationScales = [
    shell(["settings", "get", "global", "window_animation_scale"]),
    shell(["settings", "get", "global", "transition_animation_scale"]),
    shell(["settings", "get", "global", "animator_duration_scale"]),
  ];
  const nightMode = shell(["cmd", "uimode", "night"]);

  if (
    typeof size === "number" ||
    !hasCanonicalViewport(size, input.environment.physicalViewport) ||
    density !== 480
  ) {
    throw new Error("Android emulator must use the pinned 1170x2532 at 480dpi display override.");
  }
  if (
    apiLevel !== input.environment.android.apiLevel ||
    avdName !== input.environment.android.avdName ||
    abi !== input.environment.android.abi ||
    buildFingerprint !== input.environment.android.buildFingerprint ||
    emulatorVersion !== input.environment.android.emulatorVersion ||
    gpuRenderer !== input.environment.android.gpuRenderer
  ) {
    throw new Error(
      "Android emulator runtime differs from the pinned API, AVD, ABI, system image, emulator, or GPU contract.",
    );
  }
  if (
    locale !== input.environment.locale ||
    timezone !== input.environment.timezone ||
    fontScale !== input.environment.fontScale
  ) {
    throw new Error(
      "Android emulator locale, timezone, or font scale differs from the pinned capture environment.",
    );
  }
  if (animationScales.some((scale) => scale !== "0")) {
    throw new Error("Android emulator animations must be disabled for deterministic capture.");
  }
  const expectedNightMode = input.theme === "dark" ? "yes" : "no";
  if (!nightMode.endsWith(expectedNightMode)) {
    throw new Error(
      `Android emulator night mode must be ${expectedNightMode} for the ${input.theme} target.`,
    );
  }
}

export function captureAndroidDeviceScreenshot(input: {
  anchor: DeviceCaptureAnchor;
  serial?: string;
  theme: Theme;
}): { android: AndroidCaptureEnvironment; image: Buffer } {
  const environment = readCaptureEnvironment();
  const serial = input.serial ?? process.env.ANDROID_SERIAL ?? "";
  const adbPath = resolveAdbPath();
  assertAndroidRuntimeCaptureContract({ adbPath, environment, serial, theme: input.theme });
  const target = DEVICE_CAPTURE_TARGETS.find(
    (candidate) => candidate.anchor === input.anchor && candidate.theme === input.theme,
  );
  if (!target) {
    throw new Error(`Device capture target ${input.anchor}-${input.theme} is not supported.`);
  }
  const activity = readAdbOutput(adbPath, serial, ["shell", "dumpsys", "activity", "activities"]);
  if (!activity.includes(androidPackageName)) {
    throw new Error(`Android device capture must foreground ${androidPackageName}.`);
  }
  const dumpPath = `/sdcard/whispr-redesign-${process.pid}.xml`;
  try {
    readAdbOutput(adbPath, serial, ["shell", "uiautomator", "dump", dumpPath]);
    const hierarchy = readAdbOutput(adbPath, serial, ["exec-out", "cat", dumpPath]);
    if (!hierarchy.includes(`resource-id=\"${target.testId}\"`)) {
      throw new Error(
        `Android device capture target ${input.anchor}-${input.theme} is not currently visible.`,
      );
    }
    const image = execFileSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const dimensions = parsePngDimensions(image);
    if (!equalJson(dimensions, DEVICE_CAPTURE_PHYSICAL_VIEWPORT)) {
      throw new Error(
        `Android device screenshot must be 1170x2532; received ${dimensions.width}x${dimensions.height}.`,
      );
    }
    return { android: environment.android, image };
  } finally {
    try {
      execFileSync(adbPath, ["-s", serial, "shell", "rm", "-f", dumpPath], { stdio: "ignore" });
    } catch {
      // The temporary UI dump is non-sensitive and best-effort cleanup must not hide capture failures.
    }
  }
}

function assertManifestMatchesEnvironment(
  manifest: DeviceCaptureManifest,
  environment: CaptureEnvironment,
): void {
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
    manifest.platform === "android" &&
    (!manifest.android || !equalJson(manifest.android, environment.android))
  ) {
    throw new Error(
      "Android device capture manifest differs from the pinned native device contract.",
    );
  }
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
    !equalJson(
      manifest.mask.ids,
      environment.masks.platforms[manifest.platform]?.map(({ id }) => id),
    )
  ) {
    throw new Error(
      "Device capture manifest hashes or native masks do not match the pinned environment.",
    );
  }
}

export async function writeDeterministicDeviceCapture(input: {
  anchor: DeviceCaptureAnchor;
  android?: AndroidCaptureEnvironment;
  build: string;
  buildProfile: "uat" | "production" | "store";
  commit: string;
  image?: Buffer;
  inputPath?: string;
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
  if (input.platform === "android") {
    if (!input.android) {
      throw new Error("Android device capture requires pinned native device provenance.");
    }
    assertPinnedAndroidCaptureDevice(input.android);
    if (!equalJson(input.android, environment.android)) {
      throw new Error("Android device provenance differs from the pinned capture environment.");
    }
  }
  if (input.testAccount !== allowedTestAccount) {
    throw new Error("Device capture may use only the allowlisted redacted UAT test account alias.");
  }
  if ((!input.image && !input.inputPath) || (input.image && input.inputPath)) {
    throw new Error("Device capture requires exactly one PNG input source.");
  }
  const image = input.image ?? (await readFile(input.inputPath as string));
  const dimensions = parsePngDimensions(image);
  if (!equalJson(dimensions, DEVICE_CAPTURE_PHYSICAL_VIEWPORT)) {
    throw new Error(
      `Device capture input must be 1170x2532; received ${dimensions.width}x${dimensions.height}.`,
    );
  }

  const maskPath = path.join(baselineDirectory, environment.masks.file);
  const maskBytes = readFileSync(maskPath);
  const environmentBytes = readFileSync(environmentPath);
  const outputDirectory = captureTargetDirectory(input.outputRoot, input.anchor, input.theme);
  await mkdir(outputDirectory, { recursive: true });
  const capturePath = path.join(outputDirectory, `${input.anchor}-${input.theme}.png`);
  const manifestPath = path.join(outputDirectory, `${input.anchor}-${input.theme}-manifest.json`);
  await writeFile(capturePath, image);
  const android = input.platform === "android" ? input.android : undefined;

  const manifest: DeviceCaptureManifest = {
    ...(android ? { android } : {}),
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
    throw new Error(
      `Missing device capture evidence for ${input.anchor}-${input.theme} in ${captureDirectory}.`,
    );
  }
  const [image, rawManifest] = await Promise.all([
    readFile(capturePath),
    readFile(manifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(rawManifest) as DeviceCaptureManifest;
  const environment = readCaptureEnvironment();
  assertDeterministicDeviceCapture(environment);
  assertManifestMatchesEnvironment(manifest, environment);
  if (manifest.anchor !== input.anchor || manifest.theme !== input.theme) {
    throw new Error(
      `Device capture manifest target does not match ${input.anchor}-${input.theme}.`,
    );
  }
  const dimensions = parsePngDimensions(image);
  if (
    !equalJson(dimensions, DEVICE_CAPTURE_PHYSICAL_VIEWPORT) ||
    manifest.inputHash !== sha256(image)
  ) {
    throw new Error(
      `Device capture evidence for ${input.anchor}-${input.theme} has an invalid image hash or viewport.`,
    );
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

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const platform = readCliValue("--platform") as Platform;
  if (platform !== "android" && platform !== "ios") {
    throw new Error("Device capture platform must be android or ios.");
  }
  const anchor = readCliValue("--anchor") as DeviceCaptureAnchor;
  const theme = process.env.WHISPR_CAPTURE_THEME === "dark" ? "dark" : "light";
  const androidCapture =
    platform === "android" ? captureAndroidDeviceScreenshot({ anchor, theme }) : undefined;
  const iosInputPath = platform === "ios" ? process.env.WHISPR_CAPTURE_INPUT : undefined;
  if (platform === "ios" && (!iosInputPath || !existsSync(iosInputPath))) {
    throw new Error("Set WHISPR_CAPTURE_INPUT to the native iOS DPR-3 screenshot PNG.");
  }
  writeDeterministicDeviceCapture({
    anchor,
    ...(androidCapture ? { android: androidCapture.android } : {}),
    build: process.env.WHISPR_CAPTURE_BUILD ?? "",
    buildProfile: process.env.WHISPR_MOBILE_ENV === "uat" ? "uat" : "production",
    commit: process.env.WHISPR_CAPTURE_COMMIT ?? getCommit(),
    ...(androidCapture ? { image: androidCapture.image } : { inputPath: iosInputPath as string }),
    outputRoot: resolveRepositoryCaptureDirectory("artifacts/redesign"),
    platform,
    testAccount: process.env.WHISPR_CAPTURE_TEST_ACCOUNT ?? "",
    theme,
  })
    .then(({ manifestPath }) => console.log(JSON.stringify({ manifestPath, platform })))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
