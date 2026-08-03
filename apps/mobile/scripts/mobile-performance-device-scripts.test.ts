import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "performance-device",
);
const dmConversationId = "a2190c2f-bc49-4cf0-862f-bbd0f8724e26";
const serverId = "6883598c-b338-4859-bbb7-10c22ea6074e";
const channelId = "521474f4-111a-4654-bffb-41e41450dd29";
const modulePath = path.join(scriptsDirectory, "WhisprPerformanceDevice.psm1");
const performanceFlowsDirectory = path.resolve(
  scriptsDirectory,
  "../../../..",
  ".maestro",
  "performance",
);

function runDry(scriptName: string, repetitions = 2): string {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(scriptsDirectory, scriptName),
      "-DryRun",
      "-Repetitions",
      String(repetitions),
      "-DmConversationId",
      dmConversationId,
      "-ServerId",
      serverId,
      "-ChannelId",
      channelId,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  assert.equal(result.status, 0, `${scriptName}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function parseFrames(lines: readonly string[]) {
  const escapedModule = modulePath.replaceAll("'", "''");
  const array = lines.map((line) => `'${line.replaceAll("'", "''")}'`).join(",");
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Import-Module '${escapedModule}' -Force; ConvertFrom-WhisprPerformanceFrames -RunId 'run-frames' -Lines @(${array})`,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
}

function runModuleExternal(command: string) {
  const escapedModule = modulePath.replaceAll("'", "''");
  const escapedCommand = command.replaceAll("'", "''");
  const source = [
    `Import-Module '${escapedModule}' -Force`,
    `& (Get-Module WhisprPerformanceDevice) { Invoke-WhisprExternal -FilePath 'powershell.exe' -Arguments @('-NoProfile', '-Command', '${escapedCommand}') }`,
  ].join("; ");
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", source], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function runModuleExternalWithEnvironment(command: string) {
  const escapedModule = modulePath.replaceAll("'", "''");
  const escapedCommand = command.replaceAll("'", "''");
  const source = [
    "$env:WHISPR_PERF_TEST = 'outer'",
    `Import-Module '${escapedModule}' -Force`,
    `& (Get-Module WhisprPerformanceDevice) { Invoke-WhisprExternal -FilePath 'powershell.exe' -Arguments @('-NoProfile', '-Command', '${escapedCommand}') -Environment @{ WHISPR_PERF_TEST = 'inner' } }`,
    "if ($env:WHISPR_PERF_TEST -ne 'outer') { exit 8 }",
  ].join("; ");
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", source], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function runModuleScript(source: string) {
  const escapedModule = modulePath.replaceAll("'", "''");
  const command = [
    `Import-Module '${escapedModule}' -Force`,
    `& (Get-Module WhisprPerformanceDevice) { ${source} }`,
  ].join("; ");
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe("mobile performance device scripts", () => {
  it("accepts native stderr diagnostics when the process exits successfully", () => {
    const result = runModuleExternal("[Console]::Error.WriteLine(42); exit 0");

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /42/u);
  });

  it("scopes native environment overrides to one external command", () => {
    const result = runModuleExternalWithEnvironment(
      "if ($env:WHISPR_PERF_TEST -ne 'inner') { exit 7 }; exit 0",
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });

  it("quotes ampersand-bearing performance links for the ADB remote shell", () => {
    const result = runModuleScript(
      [
        "$script:capturedArguments = @()",
        "function Invoke-WhisprAdb { param([string]$DeviceSerial, [string[]]$Arguments); $script:capturedArguments = $Arguments; return @() }",
        "function Wait-WhisprPerfMarker { param([string]$DeviceSerial, [string]$RunId, [string]$Marker, [string]$Command) }",
        `Send-WhisprPerfCommand -DeviceSerial 'device-1' -Command 'purge' -RunId 'run-10' -Scope 'dm' -TargetId '${dmConversationId}'`,
        "$script:capturedArguments[7]",
      ].join("; "),
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(
      result.stdout.trim(),
      `'whispr://performance/purge?runId=run-10&scope=dm&targetId=${dmConversationId}'`,
    );
  });

  it("announces every cold-start repetition", () => {
    const output = runDry("06-cold-start.ps1", 3);

    assert.equal((output.match(/PERF\|cold-start\|iteration=\d+\/3/gu) ?? []).length, 3);
    assert.match(output, /PERF\|cold-start\|iteration=1\/3/u);
    assert.match(output, /PERF\|cold-start\|iteration=3\/3/u);
  });

  it("waits for the app shell before every performance deep link", () => {
    for (const name of [
      "open-channel.yml",
      "open-dm.yml",
      "scroll-channel.yml",
      "scroll-dm.yml",
      "send-dm.yml",
    ]) {
      const source = readFileSync(path.join(performanceFlowsDirectory, name), "utf8");
      const shellWait = source.indexOf('id: "mobile-app-shell"');
      const deepLink = source.indexOf("- openLink:");

      assert.ok(shellWait >= 0, `${name} must wait for mobile-app-shell`);
      assert.ok(shellWait < deepLink, `${name} must wait before its deep link`);
    }
  });

  it("brings the app forward without restarting it in every performance flow", () => {
    for (const name of [
      "open-channel.yml",
      "open-dm.yml",
      "scroll-channel.yml",
      "scroll-dm.yml",
      "send-dm.yml",
    ]) {
      const source = readFileSync(path.join(performanceFlowsDirectory, name), "utf8");

      assert.match(
        source,
        /- launchApp:\r?\n\s+clearState: false\r?\n\s+stopApp: false/u,
        `${name} must preserve the running process`,
      );
    }
  });

  it("keeps scenarios 06-14 independently runnable with one reset and export", () => {
    const names = [
      "06-cold-start.ps1",
      "07-warm-resume.ps1",
      "08-cached-dm.ps1",
      "09-cached-channel.ps1",
      "10-sqlcipher.ps1",
      "11-prefetch-network.ps1",
      "12-send.ps1",
      "13-content-scroll.ps1",
      "14-event-loop.ps1",
    ];

    for (const name of names) {
      const output = runDry(name, 1);
      assert.equal((output.match(/DRYRUN\|RESET\|/gu) ?? []).length, 1, name);
      assert.equal((output.match(/DRYRUN\|EXPORT\|/gu) ?? []).length, 1, name);
    }
  });

  it("keeps cached chat repetitions inside one foreground session", () => {
    const dmOutput = runDry("08-cached-dm.ps1", 3);
    assert.equal((dmOutput.match(/DRYRUN\|MAESTRO\|open-dm\.yml/gu) ?? []).length, 1);
    assert.equal((dmOutput.match(/DRYRUN\|MAESTRO\|open-dm-in-session\.yml/gu) ?? []).length, 3);
    assert.equal((dmOutput.match(/DRYRUN\|MAESTRO\|return-to-dm-inbox\.yml/gu) ?? []).length, 3);
    assert.doesNotMatch(dmOutput, /DRYRUN\|ADB\|shell input keyevent 4/u);

    const channelOutput = runDry("09-cached-channel.ps1", 3);
    assert.equal((channelOutput.match(/DRYRUN\|MAESTRO\|open-channel\.yml/gu) ?? []).length, 1);
    assert.equal(
      (channelOutput.match(/DRYRUN\|MAESTRO\|open-channel-in-session\.yml/gu) ?? []).length,
      3,
    );
    assert.equal(
      (channelOutput.match(/DRYRUN\|MAESTRO\|return-from-channel\.yml/gu) ?? []).length,
      3,
    );
    assert.doesNotMatch(channelOutput, /DRYRUN\|ADB\|shell input keyevent 4/u);
  });

  it("cold-starts SQLCipher repetitions directly on the DM route", () => {
    const output = runDry("10-sqlcipher.ps1", 3);

    assert.equal((output.match(/DRYRUN\|MAESTRO\|open-dm\.yml/gu) ?? []).length, 1);
    assert.equal((output.match(/DRYRUN\|MAESTRO\|wait-for-dm\.yml/gu) ?? []).length, 3);
    assert.equal(
      (
        output.match(
          /DRYRUN\|ADB\|shell am start -W -a android\.intent\.action\.VIEW -d 'whispr:\/\/channels\/@me\/[0-9a-f-]+' -p team\.whispr\.mobile/gu,
        ) ?? []
      ).length,
      3,
    );
  });

  it("waits for the DM inbox before the network purge", () => {
    const output = runDry("11-prefetch-network.ps1", 1);
    const workload = output
      .split(/\r?\n/u)
      .filter((line) => /DRYRUN\|(ADB|COMMAND|MAESTRO)\|/u.test(line));

    assert.deepEqual(workload, [
      `DRYRUN|COMMAND|purge|dm|${dmConversationId}`,
      `DRYRUN|COMMAND|prefetch|dm|${dmConversationId}`,
      `DRYRUN|MAESTRO|open-dm.yml|PERF_DM_CONVERSATION_ID=${dmConversationId}`,
      "DRYRUN|MAESTRO|return-to-dm-inbox.yml|",
      `DRYRUN|COMMAND|purge|dm|${dmConversationId}`,
      `DRYRUN|MAESTRO|open-dm.yml|PERF_DM_CONVERSATION_ID=${dmConversationId}`,
      "DRYRUN|MAESTRO|return-to-dm-inbox.yml|",
    ]);

    const flow = readFileSync(
      path.join(performanceFlowsDirectory, "return-to-dm-inbox.yml"),
      "utf8",
    );
    const backButton = flow.indexOf('id: "mobile-dm-back-button"');
    const inboxWait = flow.indexOf('id: "mobile-dm-inbox-screen"');

    assert.ok(backButton >= 0, "flow must tap the DM back button");
    assert.ok(inboxWait > backButton, "flow must wait for the DM inbox after going back");
  });

  it("correlates every repeated bridge command independently", () => {
    const result = runModuleScript(
      [
        "$script:capturedRunIds = [Collections.Generic.List[string]]::new()",
        "function Send-WhisprPerfCommand { param([string]$DeviceSerial, [string]$Command, [string]$RunId, [string]$Scope, [string]$TargetId); [void]$script:capturedRunIds.Add($RunId) }",
        "function Invoke-WhisprMaestroFlow { param([string]$DeviceSerial, [string]$FlowName, [hashtable]$Environment = @{}, [switch]$DryRun) }",
        `Invoke-WhisprScenarioWorkload -Scenario 'prefetch-network' -DeviceSerial 'device-1' -Repetitions 2 -RunId 'run-11' -DmConversationId '${dmConversationId}' -ServerId '${serverId}' -ChannelId '${channelId}'`,
        "$script:capturedRunIds -join ','",
      ].join("; "),
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(
      result.stdout.trim().split(/\r?\n/u).at(-1),
      "run-11-c1,run-11-c2,run-11-c3,run-11-c4,run-11-c5,run-11-c6",
    );
  });

  it("makes send mutations explicit and uniquely numbered", () => {
    const output = runDry("12-send.ps1", 3);
    assert.match(output, /PERF_MESSAGE=perf-auto-[A-Za-z0-9._-]+-1/u);
    assert.match(output, /PERF_MESSAGE=perf-auto-[A-Za-z0-9._-]+-3/u);
    assert.equal((output.match(/DRYRUN\|MAESTRO\|send-dm\.yml/gu) ?? []).length, 3);
  });

  it("reconstructs only complete checksum-valid report frames", () => {
    const report = "performance report";
    const hash = createHash("sha256").update(report, "utf8").digest("hex");
    const valid = [
      `WHISPR_PERF|BEGIN|run-frames|1|${hash}`,
      `WHISPR_PERF|CHUNK|run-frames|0|1|${encodeURIComponent(report)}`,
      "WHISPR_PERF|END|run-frames",
    ];

    const success = parseFrames(valid);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stdout.trim(), report);

    const corrupt = parseFrames([valid[0]!, "WHISPR_PERF|CHUNK|run-frames|0|1|corrupt", valid[2]!]);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /SHA-256 mismatch/u);
  });
});
