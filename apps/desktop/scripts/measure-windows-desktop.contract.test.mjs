import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_MEASUREMENT_METRIC_IDS,
  assertDesktopWindowsMeasurementArtifact,
  createDesktopWindowsMeasurementArtifact,
} from "./measure-windows-desktop.contract.mjs";

const execFileAsync = promisify(execFile);
const contractPath = fileURLToPath(
  new URL("./measure-windows-desktop.contract.mjs", import.meta.url),
);
const harnessPath = fileURLToPath(new URL("./measure-windows-desktop.ps1", import.meta.url));
const runnerPath = fileURLToPath(new URL("./run-windows-measurement.mjs", import.meta.url));
const desktopRoot = path.resolve(path.dirname(harnessPath), "..");

test("Windows desktop measurement artifact keeps unobservable release metrics honest", () => {
  const artifact = createDesktopWindowsMeasurementArtifact({
    idleSeconds: 60,
    iterations: 1,
    memoryMb: 180,
    memorySamplesMb: [180],
    processFamilyComplete: true,
  });

  const validated = assertDesktopWindowsMeasurementArtifact(artifact);
  const metricById = new Map(validated.metrics.map((metric) => [metric.id, metric]));

  assert.deepEqual(
    validated.metrics.map((metric) => metric.id),
    DESKTOP_MEASUREMENT_METRIC_IDS,
  );
  assert.equal(metricById.get("process-family-memory").status, "PASS");
  assert.equal(metricById.get("process-family-memory").value, 180);
  assert.deepEqual(metricById.get("process-family-memory").diagnostic, {
    sampleCount: 1,
    samplesMb: [180],
  });
  assert.equal(metricById.get("warm-start").status, "NOT_RUN");
  assert.equal(metricById.get("cold-start").status, "NOT_RUN");
  assert.equal(metricById.get("overlay-cpu").status, "NOT_RUN");
  assert.equal(metricById.get("shortcut-latency").status, "NOT_RUN");
  assert.equal(metricById.get("updater-check-install-relaunch").status, "NOT_RUN");
});

test("Windows desktop measurement artifact rejects false PASS and sensitive fields", () => {
  const artifact = createDesktopWindowsMeasurementArtifact({
    idleSeconds: 60,
    iterations: 1,
    memoryMb: 180,
    memorySamplesMb: [180],
    processFamilyComplete: true,
  });
  const warmStart = artifact.metrics.find((metric) => metric.id === "warm-start");

  warmStart.status = "PASS";
  assert.throws(
    () => assertDesktopWindowsMeasurementArtifact(artifact),
    /must not report PASS before an interactive readiness bridge exists/,
  );

  const sensitiveArtifact = createDesktopWindowsMeasurementArtifact({
    idleSeconds: 60,
    iterations: 1,
    memoryMb: 180,
    memorySamplesMb: [180],
    processFamilyComplete: true,
  });
  sensitiveArtifact.executablePath = "C:\\Users\\operator\\Desktop\\Whispr.exe";
  assert.throws(
    () => assertDesktopWindowsMeasurementArtifact(sensitiveArtifact),
    /forbidden field/,
  );
});

test("Windows desktop measurement artifact cannot score memory without complete idle samples", () => {
  const artifact = createDesktopWindowsMeasurementArtifact({
    idleSeconds: 60,
    iterations: 0,
    memoryMb: 180,
    memorySamplesMb: [],
    processFamilyComplete: true,
  });

  const memory = artifact.metrics.find((metric) => metric.id === "process-family-memory");

  assert.equal(memory.status, "ENV_BLOCKED");
  assert.equal(memory.value, null);
  assert.throws(
    () =>
      assertDesktopWindowsMeasurementArtifact({
        ...artifact,
        metrics: artifact.metrics.map((metric) =>
          metric.id === "process-family-memory"
            ? { ...metric, status: "PASS", value: 180 }
            : metric,
        ),
      }),
    /sample count must match iterations/,
  );
});

test("Windows desktop measurement contract CLI validates a serialized artifact", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "whispr-desktop-measurement-"));
  const artifactPath = path.join(directory, "measurement.json");
  const artifact = createDesktopWindowsMeasurementArtifact({
    idleSeconds: 60,
    iterations: 1,
    memoryMb: 180,
    memorySamplesMb: [180],
    processFamilyComplete: true,
  });

  await writeFile(artifactPath, `\uFEFF${JSON.stringify(artifact)}`, "utf8");
  const { stdout } = await execFileAsync(process.execPath, [contractPath, artifactPath]);

  assert.match(stdout, /Validated desktop Windows measurement artifact/);
  const parsed = JSON.parse((await readFile(artifactPath, "utf8")).replace(/^\uFEFF/u, ""));
  assertDesktopWindowsMeasurementArtifact(parsed);
});

test("measure:windows routes pnpm arguments through the Windows runner", async () => {
  const packageManifest = JSON.parse(
    await readFile(path.join(desktopRoot, "package.json"), "utf8"),
  );
  const runner = await readFile(runnerPath, "utf8");

  assert.equal(
    packageManifest.scripts["measure:windows"],
    "node ./scripts/run-windows-measurement.mjs",
  );
  assert.match(runner, /rawArgs\[0\] === "--"/);
  assert.match(runner, /powershell\.exe/);
});

test(
  "Windows measurement runner accepts the pnpm separator without writing under WhatIf",
  { skip: process.platform !== "win32" },
  async () => {
    const artifactName = `measurement-whatif-${process.pid}-${Date.now()}.json`;
    const artifactPath = path.join(
      desktopRoot,
      "..",
      "..",
      "artifacts",
      "desktop-performance",
      artifactName,
    );
    const executablePath = path.join(
      process.env.WINDIR ?? "C:\\Windows",
      "System32",
      "notepad.exe",
    );
    const outputPath = path.join("artifacts", "desktop-performance", artifactName);
    const { stdout } = await execFileAsync(
      process.execPath,
      [runnerPath, "--", "-ExecutablePath", executablePath, "-Out", outputPath, "-WhatIf"],
      { cwd: desktopRoot },
    );

    assert.match(stdout, /WhatIf: would write desktop performance evidence/);
    await assert.rejects(readFile(artifactPath));
  },
);

test(
  "PowerShell no-launch output validates through the contract CLI",
  { skip: process.platform !== "win32" },
  async () => {
    const workspaceRoot = path.resolve(desktopRoot, "../..");
    const artifactPath = path.join(
      workspaceRoot,
      "artifacts",
      "desktop-performance",
      `measurement-contract-${process.pid}-${Date.now()}.json`,
    );
    const relativeArtifactPath = path.relative(workspaceRoot, artifactPath);
    const executablePath = path.join(
      process.env.WINDIR ?? "C:\\Windows",
      "System32",
      "notepad.exe",
    );

    try {
      const { stdout: harnessStdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-File",
          harnessPath,
          "-ExecutablePath",
          executablePath,
          "-Out",
          relativeArtifactPath,
          "-NoLaunch",
        ],
        { cwd: workspaceRoot },
      );
      assert.match(harnessStdout, /Validated desktop Windows measurement artifact/);
      const { stdout } = await execFileAsync(process.execPath, [contractPath, artifactPath]);

      assert.match(stdout, /Validated desktop Windows measurement artifact/);
      await assert.rejects(
        execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-File",
            harnessPath,
            "-ExecutablePath",
            executablePath,
            "-Out",
            relativeArtifactPath,
            "-NoLaunch",
          ],
          { cwd: workspaceRoot },
        ),
        /already exists and will not be overwritten/,
      );
    } finally {
      await rm(artifactPath, { force: true });
    }
  },
);

test("PowerShell harness confines evidence and keeps WhatIf read-only", async () => {
  const harness = await readFile(harnessPath, "utf8");

  assert.match(harness, /artifacts[\\/]desktop-performance/);
  assert.match(harness, /FileMode\]::CreateNew/);
  assert.doesNotMatch(harness, /Set-Content\s+-LiteralPath/);
  assert.match(harness, /if \(\$WhatIfPreference\) \{/);
  assert.match(harness, /\[ValidateRange\(60, 600\)\][\s\S]*\[int\]\$IdleSeconds = 60/);
  assert.match(harness, /\$processFamily = \$null/);
  assert.match(harness, /Get-NamedProcessSnapshot/);
  assert.match(harness, /\$baselineWebViewProcessSnapshot\.Complete/);
  assert.match(harness, /\$currentWebViewProcessSnapshot\.Complete/);
  assert.match(harness, /ProcessIdentities/);
  assert.match(harness, /StartTimeUtc/);
  assert.match(harness, /CreationDate/);
  assert.match(harness, /function ConvertTo-CimProcessStartTime/);
  assert.match(harness, /\$CreationDate -is \[datetime\]/);
  assert.match(harness, /\$baselineWebViewProcessSnapshot\.ProcessIdentities\.Count -gt 0/);
  assert.match(harness, /existing WebView2 process cannot be attributed safely/);
  assert.match(harness, /\$stream\.Flush\(\$true\)/);
  assert.match(harness, /\[System\.IO\.File\]::Move\(\$temporaryPath, \$outPath\)/);
  assert.match(harness, /Assert-ArtifactContract/);
});
