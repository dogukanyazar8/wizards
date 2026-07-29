import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertMobilePerformanceUiHierarchyRemoved,
  assertMobilePerformancePackageBackgrounded,
  getMobilePerformanceFixtureSessionResetArgs,
  getMobilePerformanceFreshInstallApkPath,
  getMobilePerformanceMaestroFlowEnvironment,
  getMobilePerformanceMaestroSpawnOptions,
  getMobilePerformanceCacheFlow,
  getMobilePerformanceUiHierarchyPath,
  getMobilePerformanceUatFetchArgs,
  getMobilePerformanceBenchmarkConfigPath,
  getMobilePerformanceBackgroundSettleMs,
  readMobilePerformanceExpectedBuildId,
} from "./run-mobile-performance-benchmark";

describe("run-mobile-performance-benchmark", () => {
  it("requires Android foreground ownership to leave the benchmark package before resume", () => {
    assert.doesNotThrow(() =>
      assertMobilePerformancePackageBackgrounded(
        "mCurrentFocus=Window{123 u0 com.android.launcher3/com.android.launcher3.uioverrides.QuickstepLauncher}",
      ),
    );
    assert.throws(
      () =>
        assertMobilePerformancePackageBackgrounded(
          "mCurrentFocus=Window{123 u0 team.whispr.mobile/team.whispr.mobile.MainActivity}",
        ),
      /did not enter background/i,
    );
  });

  it("clears prior app state before fixture login", () => {
    assert.deepEqual(getMobilePerformanceFixtureSessionResetArgs(), [
      "shell",
      "pm",
      "clear",
      "team.whispr.mobile",
    ]);
  });

  it("requires an explicit release artifact before a fresh-install reset", () => {
    assert.equal(
      getMobilePerformanceFreshInstallApkPath(" C:\\artifacts\\release.apk "),
      "C:\\artifacts\\release.apk",
    );
    assert.throws(
      () => getMobilePerformanceFreshInstallApkPath(""),
      /fresh-install release APK path/u,
    );
  });

  it("launches Maestro through a Windows command shell for the batch launcher", () => {
    assert.deepEqual(getMobilePerformanceMaestroSpawnOptions("win32"), { shell: true });
    assert.deepEqual(getMobilePerformanceMaestroSpawnOptions("linux"), {});
  });

  it("passes dynamic flow values through Maestro's shell environment prefix", () => {
    assert.deepEqual(
      getMobilePerformanceMaestroFlowEnvironment({
        PERF_EMAIL: "fixture@example.test",
        PERF_PASSWORD: "not-a-real-password",
      }),
      {
        MAESTRO_PERF_EMAIL: "fixture@example.test",
        MAESTRO_PERF_PASSWORD: "not-a-real-password",
      },
    );
    assert.throws(
      () => getMobilePerformanceMaestroFlowEnvironment({ PERF_EMAIL: "" }),
      /must not be empty/u,
    );
  });

  it("closes every one of the fifteen cache-hit opens", () => {
    assert.deepEqual(
      Array.from({ length: 15 }, (_, index) => getMobilePerformanceCacheFlow(index + 1)),
      Array.from({ length: 15 }, () => "cache-open-close"),
    );
  });

  it("keeps raw UIAutomator hierarchy outside shared storage", () => {
    assert.equal(
      getMobilePerformanceUiHierarchyPath(1234),
      "/data/local/tmp/whispr-performance-1234.xml",
    );
  });

  it("fails if raw UIAutomator hierarchy cannot be removed", () => {
    assert.throws(
      () =>
        assertMobilePerformanceUiHierarchyRemoved(() => {
          throw new Error("adb cleanup failed");
        }),
      /Raw UIAutomator hierarchy cleanup failed\./u,
    );
  });

  it("pins the benchmark to a clean full Git SHA", () => {
    const fullSha = "3a070425f2bcbad21fe1799a17f53afeb3c5681b";
    const run = (args: readonly string[]) => {
      const command = args.join(" ");
      if (command === "status --porcelain") return "";
      if (command === "branch --show-current") return "uat";
      return fullSha;
    };

    assert.equal(readMobilePerformanceExpectedBuildId(run), fullSha);
    assert.throws(
      () =>
        readMobilePerformanceExpectedBuildId((args) =>
          args.join(" ") === "status --porcelain" ? " M apps/mobile/src/app.tsx" : fullSha,
        ),
      /Git worktree must be clean/u,
    );
    assert.throws(() => {
      const invalidHead = (args: readonly string[]) => {
        const command = args.join(" ");
        if (command === "status --porcelain") return "";
        if (command === "branch --show-current") return "uat";
        return fullSha.slice(0, 12);
      };
      return readMobilePerformanceExpectedBuildId(invalidHead);
    }, /Git HEAD is not a full commit SHA/u);
  });

  it("requires current UAT branch parity before benchmark evidence", () => {
    const fullSha = "3a070425f2bcbad21fe1799a17f53afeb3c5681b";
    const featureBranch = (args: readonly string[]) => {
      const command = args.join(" ");
      if (command === "status --porcelain") return "";
      if (command === "branch --show-current") return "feature/perf";
      return fullSha;
    };
    assert.throws(() => readMobilePerformanceExpectedBuildId(featureBranch), /must be uat/u);

    const divergent = (args: readonly string[]) => {
      const command = args.join(" ");
      if (command === "status --porcelain") return "";
      if (command === "branch --show-current") return "uat";
      if (command === "rev-parse refs/remotes/origin/uat") {
        return "456789abcdef0123456789abcdef0123456789ab";
      }
      return fullSha;
    };
    assert.throws(() => readMobilePerformanceExpectedBuildId(divergent), /origin\/uat/u);
  });

  it("fetches only the canonical UAT tracking ref", () => {
    assert.deepEqual(getMobilePerformanceUatFetchArgs(), [
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      "refs/heads/uat:refs/remotes/origin/uat",
    ]);
  });

  it("accepts only the fixture-written benchmark config path", () => {
    assert.match(
      getMobilePerformanceBenchmarkConfigPath(""),
      /[\\/]\.secrets[\\/]mobile-performance-benchmark\.config\.json$/u,
    );
    assert.throws(
      () => getMobilePerformanceBenchmarkConfigPath("C:\\temp\\wrong-config.json"),
      /fixture-written path/u,
    );
  });

  it("gives React Native more than the minimum background residency before resume", () => {
    assert.ok(getMobilePerformanceBackgroundSettleMs() > 250);
  });
});
