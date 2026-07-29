import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateMobilePerformanceBenchmarkReport,
  parseMobilePerformanceBenchmarkConfig,
  parseUiAutomatorBenchmarkReport,
  type MobilePerformanceBenchmarkConfig,
} from "./mobile-performance-benchmark-support";
import { MOBILE_WARM_RESUME_MIN_BACKGROUND_MS } from "../src/performance/mobile-resume-lifecycle";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");
const maestroDirectory = path.join(repositoryRoot, ".maestro");
const artifactRoot = path.join(repositoryRoot, "artifacts", "mobile", "performance");
const androidPackageName = "team.whispr.mobile";
const maestroTimeoutMs = 90_000;
const mobilePerformanceBenchmarkConfigPath = path.join(
  repositoryRoot,
  ".secrets",
  "mobile-performance-benchmark.config.json",
);

type BenchmarkCheckStatus = "OVERRIDDEN" | "PASS";
type BenchmarkRunStatus = "ENV BLOCKED" | "FAIL" | "PASS";

type BenchmarkPreflightCheck = {
  readonly check: string;
  readonly status: BenchmarkCheckStatus;
};

type BenchmarkScenario = {
  readonly completed: number;
  readonly durationMs: number;
  readonly expected: number;
};

class EnvironmentBlockedError extends Error {}
class BenchmarkFailedError extends Error {}

function nowRunId(): string {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace("Z", "Z");
}

function resolveAdbPath(): string {
  const sdkRoot =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : undefined);
  const candidate = sdkRoot
    ? path.join(sdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  return candidate;
}

function runCommand(
  command: string,
  args: readonly string[],
  input: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly encoding?: "buffer" | "utf8";
  } = {},
): Buffer | string {
  const result = spawnSync(command, args, {
    cwd: input.cwd,
    encoding: input.encoding === "buffer" ? null : "utf8",
    env: input.env,
    maxBuffer: 12 * 1024 * 1024,
    timeout: maestroTimeoutMs,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    throw new BenchmarkFailedError(`Command ${path.basename(command)} did not complete.`);
  }

  return input.encoding === "buffer"
    ? (result.stdout as Buffer)
    : String(result.stdout ?? "").trim();
}

type GitOutputReader = (args: readonly string[]) => string;

export function getMobilePerformanceUatFetchArgs(): readonly string[] {
  return ["fetch", "--quiet", "--no-tags", "origin", "refs/heads/uat:refs/remotes/origin/uat"];
}

export function getMobilePerformanceBackgroundSettleMs(): number {
  return MOBILE_WARM_RESUME_MIN_BACKGROUND_MS + 100;
}

function waitForMobilePerformanceBackgroundSettle(): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, getMobilePerformanceBackgroundSettleMs());
}

function refreshMobilePerformanceUatTrackingRef(): void {
  try {
    runCommand("git", getMobilePerformanceUatFetchArgs(), { cwd: repositoryRoot });
  } catch {
    throw new EnvironmentBlockedError("Current origin/uat tracking ref is unavailable.");
  }
}

export function readMobilePerformanceExpectedBuildId(
  readGit: GitOutputReader = (args) => runCommand("git", args, { cwd: repositoryRoot }) as string,
): string {
  let worktreeStatus: string;
  try {
    worktreeStatus = readGit(["status", "--porcelain"]);
  } catch {
    throw new EnvironmentBlockedError("Current Git build identity is unavailable.");
  }
  if (worktreeStatus.trim().length > 0) {
    throw new EnvironmentBlockedError("Git worktree must be clean to run this benchmark.");
  }

  let branch: string;
  try {
    branch = readGit(["branch", "--show-current"]);
  } catch {
    throw new EnvironmentBlockedError("Current Git branch is unavailable.");
  }
  if (branch.trim() !== "uat") {
    throw new EnvironmentBlockedError("Git branch must be uat to run this benchmark.");
  }

  let head: string;
  try {
    head = readGit(["rev-parse", "HEAD"]);
  } catch {
    throw new EnvironmentBlockedError("Current Git build identity is unavailable.");
  }
  const expectedBuildId = head.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(expectedBuildId)) {
    throw new EnvironmentBlockedError("Git HEAD is not a full commit SHA.");
  }
  let originUat: string;
  try {
    originUat = readGit(["rev-parse", "refs/remotes/origin/uat"]);
  } catch {
    throw new EnvironmentBlockedError("Current origin/uat tracking ref is unavailable.");
  }
  const originUatBuildId = originUat.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(originUatBuildId)) {
    throw new EnvironmentBlockedError("origin/uat is not a full commit SHA.");
  }
  if (originUatBuildId !== expectedBuildId) {
    throw new EnvironmentBlockedError("Git HEAD must equal origin/uat to run this benchmark.");
  }
  return expectedBuildId;
}

export function getMobilePerformanceCacheFlow(_iteration: number): "cache-open-close" {
  return "cache-open-close";
}

export function getMobilePerformanceUiHierarchyPath(processId: number): string {
  return `/data/local/tmp/whispr-performance-${processId}.xml`;
}

export function assertMobilePerformanceUiHierarchyRemoved(remove: () => void): void {
  try {
    remove();
  } catch {
    throw new BenchmarkFailedError("Raw UIAutomator hierarchy cleanup failed.");
  }
}

function listReadyDevices(adbPath: string): readonly string[] {
  let output: string;
  try {
    output = runCommand(adbPath, ["devices"]) as string;
  } catch {
    throw new EnvironmentBlockedError("ADB is unavailable.");
  }

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([serial, state]) => Boolean(serial) && state === "device")
    .map(([serial]) => serial as string);
}

function resolveSerial(adbPath: string): string {
  const requested = process.env.ANDROID_SERIAL?.trim();
  const devices = listReadyDevices(adbPath);
  if (requested) {
    if (!devices.includes(requested)) {
      throw new EnvironmentBlockedError("ANDROID_SERIAL is not an authorized ready device.");
    }
    return requested;
  }
  if (devices.length !== 1) {
    throw new EnvironmentBlockedError(
      "Connect exactly one authorized Android device or set ANDROID_SERIAL.",
    );
  }
  return devices[0] as string;
}

function readAdb(adbPath: string, serial: string, args: readonly string[]): string {
  try {
    return runCommand(adbPath, ["-s", serial, ...args]) as string;
  } catch {
    throw new EnvironmentBlockedError("The connected Android device stopped responding.");
  }
}

function checkDevicePreflight(input: { readonly adbPath: string; readonly serial: string }): {
  readonly checks: readonly BenchmarkPreflightCheck[];
  readonly device: {
    readonly model: string;
    readonly osVersion: string;
    readonly packageVersion: string;
  };
} {
  const { adbPath, serial } = input;
  const wifiEnabled = readAdb(adbPath, serial, ["shell", "settings", "get", "global", "wifi_on"]);
  const wifiStatus = readAdb(adbPath, serial, ["shell", "cmd", "wifi", "status"]);
  if (
    wifiEnabled !== "1" ||
    !/wifi is enabled/iu.test(wifiStatus) ||
    !/isUsable:\s*true/iu.test(wifiStatus)
  ) {
    throw new BenchmarkFailedError("Wi-Fi must be enabled and usable for this benchmark.");
  }

  if (readAdb(adbPath, serial, ["shell", "settings", "get", "global", "low_power"]) !== "0") {
    throw new BenchmarkFailedError("Low power mode must be disabled for this benchmark.");
  }

  const battery = readAdb(adbPath, serial, ["shell", "dumpsys", "battery"]);
  const usbPowered = /^USB powered:\s*true$/imu.test(battery);
  if (usbPowered && process.env.MOBILE_PERFORMANCE_ALLOW_USB_POWER !== "1") {
    throw new BenchmarkFailedError(
      "USB power is present. Set MOBILE_PERFORMANCE_ALLOW_USB_POWER=1 only with an explicit test override.",
    );
  }

  const packagePath = readAdb(adbPath, serial, ["shell", "pm", "path", androidPackageName]);
  if (!packagePath.startsWith("package:")) {
    throw new EnvironmentBlockedError("The UAT mobile application is not installed on the device.");
  }
  const packageDump = readAdb(adbPath, serial, ["shell", "dumpsys", "package", androidPackageName]);
  if (/\bDEBUGGABLE\b/u.test(packageDump)) {
    throw new BenchmarkFailedError(
      "The installed mobile application is debuggable, not a release build.",
    );
  }

  const packageVersion = /\bversionName=([^\s]+)/u.exec(packageDump)?.[1] ?? "unknown";
  const model = readAdb(adbPath, serial, ["shell", "getprop", "ro.product.model"]);
  const osVersion = readAdb(adbPath, serial, ["shell", "getprop", "ro.build.version.release"]);
  return {
    checks: [
      { check: "Wi-Fi enabled and usable", status: "PASS" },
      { check: "Low power mode disabled", status: "PASS" },
      { check: "Release APK installed", status: "PASS" },
      {
        check: "USB power",
        status: usbPowered ? "OVERRIDDEN" : "PASS",
      },
    ],
    device: { model, osVersion, packageVersion },
  };
}

function flowPath(name: string): string {
  const resolved = path.join(maestroDirectory, `mobile-performance-${name}.yml`);
  if (!existsSync(resolved)) {
    throw new BenchmarkFailedError(`Required Maestro flow ${name} is missing.`);
  }
  return resolved;
}

function runMaestro(input: {
  readonly flow: string;
  readonly serial: string;
  readonly variables?: Readonly<Record<string, string>>;
}): number {
  const startedAt = performance.now();
  const result = spawnSync(
    "maestro",
    ["--no-ansi", "test", "--device", input.serial, flowPath(input.flow)],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, ...input.variables },
      maxBuffer: 12 * 1024 * 1024,
      timeout: maestroTimeoutMs,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    // Do not print Maestro output: it can include the test account or a sent
    // message, neither of which belongs in a benchmark artifact or terminal log.
    throw new BenchmarkFailedError(`Maestro flow ${input.flow} did not complete.`);
  }
  return Math.round(performance.now() - startedAt);
}

function runScenario(input: {
  readonly expected: number;
  readonly name: string;
  readonly runOne: (index: number) => void;
}): BenchmarkScenario {
  const startedAt = performance.now();
  for (let index = 1; index <= input.expected; index += 1) {
    input.runOne(index);
  }
  return {
    completed: input.expected,
    durationMs: Math.round(performance.now() - startedAt),
    expected: input.expected,
  };
}

export function getMobilePerformanceFixtureSessionResetArgs(): readonly string[] {
  return ["shell", "pm", "clear", androidPackageName];
}

export function getMobilePerformanceFreshInstallApkPath(
  requestedPath: string | undefined = process.env.MOBILE_PERFORMANCE_FRESH_INSTALL_APK,
): string {
  const apkPath = requestedPath?.trim();
  if (!apkPath) {
    throw new EnvironmentBlockedError(
      "Set MOBILE_PERFORMANCE_FRESH_INSTALL_APK to the fresh-install release APK path.",
    );
  }
  return apkPath;
}

/** Android has accepted HOME only once another window owns foreground focus. */
export function assertMobilePerformancePackageBackgrounded(activityDump: string): void {
  const currentFocus = activityDump.split(/\r?\n/u).find((line) => line.includes("mCurrentFocus="));
  if (!currentFocus || currentFocus.includes(`${androidPackageName}/`)) {
    throw new BenchmarkFailedError(
      "Android did not enter background before the warm-resume measurement.",
    );
  }
}

function establishFixtureSession(input: {
  readonly adbPath: string;
  readonly config: MobilePerformanceBenchmarkConfig;
  readonly serial: string;
}): void {
  try {
    runCommand(input.adbPath, [
      "-s",
      input.serial,
      ...getMobilePerformanceFixtureSessionResetArgs(),
    ]);
  } catch {
    const apkPath = getMobilePerformanceFreshInstallApkPath();
    if (!existsSync(apkPath)) {
      throw new EnvironmentBlockedError("The fresh-install release APK path does not exist.");
    }
    try {
      runCommand(input.adbPath, ["-s", input.serial, "uninstall", androidPackageName]);
      runCommand(input.adbPath, ["-s", input.serial, "install", apkPath]);
      checkDevicePreflight({ adbPath: input.adbPath, serial: input.serial });
    } catch {
      throw new EnvironmentBlockedError("Android fresh-install reset failed.");
    }
  }
  runMaestro({
    flow: "login",
    serial: input.serial,
    variables: {
      PERF_EMAIL: input.config.credentials.email,
      PERF_PASSWORD: input.config.credentials.password,
    },
  });
  runMaestro({ flow: "session", serial: input.serial });
}

function capturePanelReport(input: {
  readonly adbPath: string;
  readonly artifactDirectory: string;
  readonly serial: string;
}): ReturnType<typeof parseUiAutomatorBenchmarkReport> {
  runMaestro({ flow: "diagnostics", serial: input.serial });
  const remotePath = getMobilePerformanceUiHierarchyPath(process.pid);
  try {
    readAdb(input.adbPath, input.serial, ["shell", "uiautomator", "dump", remotePath]);
    const xml = readAdb(input.adbPath, input.serial, ["exec-out", "cat", remotePath]);
    const report = parseUiAutomatorBenchmarkReport(xml);
    const screenshot = runCommand(
      input.adbPath,
      ["-s", input.serial, "exec-out", "screencap", "-p"],
      { encoding: "buffer" },
    );
    writeFileSync(
      path.join(input.artifactDirectory, "performance-panel.png"),
      screenshot as Buffer,
    );
    return report;
  } finally {
    assertMobilePerformanceUiHierarchyRemoved(() => {
      runCommand(input.adbPath, ["-s", input.serial, "shell", "rm", "-f", remotePath]);
    });
  }
}

function formatMilliseconds(value: number | null): string {
  return value === null ? "-" : String(value);
}

function renderMarkdown(input: {
  readonly artifact: {
    readonly completedAt: string;
    readonly device: {
      readonly model: string;
      readonly osVersion: string;
      readonly packageVersion: string;
    };
    readonly evaluation: ReturnType<typeof evaluateMobilePerformanceBenchmarkReport>;
    readonly expectedBuildId: string;
    readonly preflight: readonly BenchmarkPreflightCheck[];
    readonly report: ReturnType<typeof parseUiAutomatorBenchmarkReport>;
    readonly runId: string;
    readonly scenarios: Readonly<Record<string, BenchmarkScenario>>;
    readonly status: "FAIL" | "PASS";
  };
}): string {
  const { artifact } = input;
  const lines = [
    "# Android UAT Device Performance",
    "",
    `- Run: ${artifact.runId}`,
    `- Status: ${artifact.status}`,
    `- Completed: ${artifact.completedAt}`,
    `- Source commit: ${artifact.expectedBuildId}`,
    `- Device: ${artifact.device.model} · Android ${artifact.device.osVersion} · app ${artifact.device.packageVersion}`,
    "",
    "## Preflight",
    "",
    "| Check | Status |",
    "| --- | --- |",
    ...artifact.preflight.map((check) => `| ${check.check} | ${check.status} |`),
    "",
    "## Metrics",
    "",
    "| Metric | n | p50 | p95 | p99 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...artifact.report.metrics.map(
      (metric) =>
        `| ${metric.metric} | ${metric.n} | ${formatMilliseconds(metric.p50Ms)} | ${formatMilliseconds(metric.p95Ms)} | ${formatMilliseconds(metric.p99Ms)} |`,
    ),
    "",
    `Prefetch: ${artifact.report.prefetch.hits}/${artifact.report.prefetch.warmed} · ${Math.round(artifact.report.prefetch.hitRate * 100)}%`,
    "",
    `Store: ${artifact.report.store.status ?? "-"} · rows ${artifact.report.store.rowCount ?? "-"} · cipher ${artifact.report.store.cipherVersion ?? "-"}`,
    "",
    "## Scenario execution",
    "",
    "| Scenario | Expected | Completed | Duration ms |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(artifact.scenarios).map(
      ([name, scenario]) =>
        `| ${name} | ${scenario.expected} | ${scenario.completed} | ${scenario.durationMs} |`,
    ),
  ];
  if (artifact.evaluation.violations.length > 0) {
    lines.push(
      "",
      "## Violations",
      "",
      ...artifact.evaluation.violations.map((value) => `- ${value}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function getMobilePerformanceBenchmarkConfigPath(
  requestedPath: string | undefined = process.env.MOBILE_PERFORMANCE_BENCHMARK_CONFIG,
): string {
  const requested = requestedPath?.trim();
  if (!requested) {
    return mobilePerformanceBenchmarkConfigPath;
  }

  const resolvedRequested = path.resolve(requested);
  const samePath =
    process.platform === "win32"
      ? resolvedRequested.toLowerCase() === mobilePerformanceBenchmarkConfigPath.toLowerCase()
      : resolvedRequested === mobilePerformanceBenchmarkConfigPath;
  if (!samePath) {
    throw new EnvironmentBlockedError(
      "Mobile performance benchmark config must use the fixture-written path.",
    );
  }

  return mobilePerformanceBenchmarkConfigPath;
}

function loadConfig(): MobilePerformanceBenchmarkConfig {
  const configPath = getMobilePerformanceBenchmarkConfigPath();
  try {
    return parseMobilePerformanceBenchmarkConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch (error) {
    if (error instanceof EnvironmentBlockedError) {
      throw error;
    }
    throw new EnvironmentBlockedError("Mobile performance benchmark config is missing or invalid.");
  }
}

function run(): { readonly artifactDirectory: string; readonly status: "FAIL" | "PASS" } {
  const config = loadConfig();
  refreshMobilePerformanceUatTrackingRef();
  const expectedBuildId = readMobilePerformanceExpectedBuildId();
  const runId = nowRunId();
  const artifactDirectory = path.join(artifactRoot, runId);
  mkdirSync(artifactDirectory, { recursive: true });

  const adbPath = resolveAdbPath();
  const serial = resolveSerial(adbPath);
  const preflight = checkDevicePreflight({ adbPath, serial });
  establishFixtureSession({ adbPath, config, serial });

  runMaestro({ flow: "reset", serial });
  const scenarios: Record<string, BenchmarkScenario> = {};
  scenarios.coldStart = runScenario({
    expected: 10,
    name: "coldStart",
    runOne: () => {
      readAdb(adbPath, serial, ["shell", "am", "force-stop", androidPackageName]);
      runMaestro({ flow: "cold-start", serial });
    },
  });
  scenarios.warmResume = runScenario({
    expected: 10,
    name: "warmResume",
    runOne: () => {
      readAdb(adbPath, serial, ["shell", "input", "keyevent", "HOME"]);
      assertMobilePerformancePackageBackgrounded(
        readAdb(adbPath, serial, ["shell", "dumpsys", "activity", "activities"]),
      );
      waitForMobilePerformanceBackgroundSettle();
      readAdb(adbPath, serial, ["shell", "monkey", "-p", androidPackageName, "1"]);
      runMaestro({ flow: "warm-resume", serial });
    },
  });

  // This must happen after the cold/warm sequence: a process restart clears the
  // in-memory query cache. The marker waits until the automatic DM fetch has
  // actually filled it, rather than treating a scheduled fetch as a cache hit.
  runMaestro({ flow: "cache-ready", serial });
  scenarios.cacheHit = runScenario({
    expected: 15,
    name: "cacheHit",
    runOne: (index) => {
      runMaestro({
        flow: getMobilePerformanceCacheFlow(index),
        serial,
        variables: { PERF_CACHE_DM_TITLE: config.cacheDmTitle },
      });
    },
  });
  scenarios.networkOpen = runScenario({
    expected: config.networkChannelNames.length,
    name: "networkOpen",
    runOne: (index) => {
      runMaestro({
        flow: "network-open-close",
        serial,
        variables: {
          PERF_NETWORK_CHANNEL_NAME: config.networkChannelNames[index - 1] as string,
          PERF_WORKSPACE_ANCHOR_CHANNEL_ID: config.workspace.anchorChannelId,
          PERF_WORKSPACE_SERVER_ID: config.workspace.serverId,
        },
      });
    },
  });

  // A deep-link return does not open a tap-to-content span, preserving the exact
  // fifteen cache-hit measurements before the required twenty sends.
  runMaestro({
    flow: "send-open",
    serial,
    variables: { PERF_CACHE_DM_CONVERSATION_ID: config.cacheDmConversationId },
  });
  scenarios.send = runScenario({
    expected: 20,
    name: "send",
    runOne: (index) => {
      runMaestro({
        flow: "send",
        serial,
        variables: { PERF_MESSAGE_TEXT: `perf-${runId}-${String(index).padStart(2, "0")}` },
      });
    },
  });

  const report = capturePanelReport({ adbPath, artifactDirectory, serial });
  const evaluation = evaluateMobilePerformanceBenchmarkReport(report, { expectedBuildId });
  const artifact = {
    completedAt: new Date().toISOString(),
    device: preflight.device,
    evaluation,
    expectedBuildId,
    preflight: preflight.checks,
    report,
    runId,
    scenarios,
    status: evaluation.status,
  } as const;
  writeFileSync(
    path.join(artifactDirectory, "report.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  writeFileSync(path.join(artifactDirectory, "report.md"), renderMarkdown({ artifact }));
  return { artifactDirectory, status: evaluation.status };
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    typeof entrypoint === "string" && path.resolve(entrypoint) === fileURLToPath(import.meta.url)
  );
}

if (isDirectExecution()) {
  try {
    const result = run();
    console.log(JSON.stringify(result));
    if (result.status === "FAIL") {
      process.exitCode = 1;
    }
  } catch (error) {
    const status: BenchmarkRunStatus =
      error instanceof EnvironmentBlockedError ? "ENV BLOCKED" : "FAIL";
    // Error messages are intentionally static: never echo config, UAT IDs,
    // credentials, URLs, message text, SSIDs, or device serials.
    console.error(`${status}: ${error instanceof Error ? error.message : "Benchmark stopped."}`);
    process.exitCode = status === "ENV BLOCKED" ? 2 : 1;
  }
}
