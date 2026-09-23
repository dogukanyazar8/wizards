import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(root, "apps", "mobile", "scripts", "build-android-uat.ps1");

test("the workspace sync excludes nested build output by absolute path", () => {
  const script = readFileSync(scriptPath, "utf8");

  // robocopy resolves a relative /XD entry against the *current* directory, not
  // against the copy source, so `apps\mobile\android\app\build` never matched and
  // every build mirrored ~1.5 GB of stale native output into the build root.
  assert.ok(script.includes("$_ -match '[\\\\/]'"));
  assert.ok(script.includes("Join-Path $From $_"));
  assert.ok(script.includes('+ $resolvedExcludedDirectories + @("/XF")'));

  // Bare names must stay name-based so they keep matching at every depth.
  assert.ok(script.includes("} else { $_ }"));
  assert.doesNotMatch(script, /\+ \$excludedDirectories \+ @\("\/XF"\)/u);

  for (const excludedDirectory of [
    "apps\\\\mobile\\\\android\\\\.cxx",
    "apps\\\\mobile\\\\android\\\\.gradle",
    "apps\\\\mobile\\\\android\\\\build",
    "apps\\\\mobile\\\\android\\\\app\\\\build",
  ]) {
    assert.match(script, new RegExp(`^\\s+"${excludedDirectory}",?$`, "mu"));
  }
});

test("gradle failures stay diagnosable and the retry resets incremental packaging", () => {
  const script = readFileSync(scriptPath, "utf8");

  // Without --stacktrace `:app:packageDebug` reports only
  // "A failure occurred while executing ...$IncrementalSplitterRunnable" and the
  // cause is unrecoverable after the run.
  assert.match(script, /^\s+"--stacktrace",?$/mu);

  assert.match(script, /^function Reset-AndroidPackagingState \{$/mu);
  assert.ok(script.includes('Join-Path $AndroidRoot "app\\build\\outputs\\apk"'));
  assert.ok(script.includes('Join-Path $AndroidRoot "app\\build\\intermediates\\incremental"'));
  assert.ok(script.includes("Reset-AndroidPackagingState -AndroidRoot $AndroidRoot"));

  // A cache-restored packaging input is the one state the first attempt cannot
  // recover from, so the retry must run without the build cache.
  assert.ok(
    script.includes(
      '$GradleArguments | Where-Object { $_ -ne "--build-cache" -and $_ -ne "--no-build-cache" }',
    ),
  );
  assert.ok(script.includes('+ @("--no-build-cache")'));
});

function readPowerShellFunction(script, name) {
  const start = script.search(new RegExp(`^function ${name} \\{$`, "mu"));
  assert.notEqual(start, -1, `${name} is missing`);
  const end = script.slice(start + 1).search(/^function /mu);
  return end === -1 ? script.slice(start) : script.slice(start, start + 1 + end);
}

test("the managed pnpm install receives the virtual store max length through the environment", () => {
  const script = readFileSync(scriptPath, "utf8");
  const managedInstall = readPowerShellFunction(script, "Invoke-PnpmInstallWithRecovery");

  // pnpm 12 ignores `--config.virtual-store-dir-max-length` and records its default
  // (60) in .modules.yaml, so Test-WhisprUatPnpmLayout rejected every managed
  // install. The environment variable is the form pnpm 12 honors.
  assert.doesNotMatch(managedInstall, /"--config\.virtual-store-dir-max-length=/u);
  assert.ok(
    managedInstall.includes(
      "$env:pnpm_config_virtual_store_dir_max_length = [string]$PnpmVirtualStoreMaxLength",
    ),
  );

  // The value is scoped to these installs: set before the first pnpm call and
  // restored afterwards, exactly like CI.
  const setIndex = managedInstall.indexOf("$env:pnpm_config_virtual_store_dir_max_length = ");
  assert.ok(setIndex < managedInstall.indexOf('Invoke-CommandChecked -Command "corepack"'));
  assert.ok(
    managedInstall.includes(
      "$previousVirtualStoreMaxLength = $env:pnpm_config_virtual_store_dir_max_length",
    ),
  );
  const finallyBlock = managedInstall.slice(managedInstall.lastIndexOf("} finally {"));
  assert.ok(
    finallyBlock.includes(
      "Remove-Item Env:pnpm_config_virtual_store_dir_max_length -ErrorAction SilentlyContinue",
    ),
  );
  assert.ok(
    finallyBlock.includes(
      "$env:pnpm_config_virtual_store_dir_max_length = $previousVirtualStoreMaxLength",
    ),
  );

  // The honored flags stay on both the first and the forced install.
  assert.equal(managedInstall.split('"--config.store-dir=$PhysicalStoreDir"').length - 1, 2);
  assert.equal(
    managedInstall.split('"--config.virtual-store-dir=$PhysicalVirtualStoreDir"').length - 1,
    2,
  );

  // A failed layout check must name the value that actually differed.
  assert.ok(
    managedInstall.includes(
      "$actualVirtualStoreMaxLength = Get-WhisprUatPnpmVirtualStoreMaxLength",
    ),
  );
  assert.match(
    managedInstall,
    /expected max length: \$PnpmVirtualStoreMaxLength; actual max length: \$actualVirtualStoreMaxLength/u,
  );

  // The editable source tree keeps its own pnpm layout; forcing the managed
  // length there would rebuild the developer's node_modules.
  const sourceInstall = readPowerShellFunction(script, "Invoke-SourceMetroInstallWithRecovery");
  assert.doesNotMatch(
    sourceInstall,
    /virtual_store_dir_max_length|"--config\.virtual-store-dir-max-length=/u,
  );
});

test("stopping the build daemons also releases the managed Kotlin compile daemon", () => {
  const script = readFileSync(scriptPath, "utf8");
  const stopDaemons = readPowerShellFunction(script, "Stop-GradleDaemons");
  const stopJvms = readPowerShellFunction(script, "Stop-ManagedBuildJvms");

  // `gradlew --stop` never reaches the Kotlin compile daemon, which keeps compiled
  // class jars open; the next build then fails with "Unable to delete file ...
  // classes.jar" and the retry hit the same lock. Both the pre-build stop and the
  // retry go through Stop-GradleDaemons, so it must release those JVMs too, even
  // when the wrapper is not generated yet.
  assert.ok(stopDaemons.includes('"--stop"'));
  assert.ok(stopDaemons.includes("Stop-ManagedBuildJvms -GradleUserHome $env:GRADLE_USER_HOME"));
  assert.doesNotMatch(stopDaemons, /^\s+return$/mu);

  // Only JVMs launched from the managed Gradle user home are stopped; other Gradle,
  // Kotlin or Android Studio daemons on the machine are left alone.
  assert.ok(stopJvms.includes(`Get-CimInstance Win32_Process -Filter "Name='java.exe'"`));
  assert.ok(
    stopJvms.includes(
      "$_.CommandLine.IndexOf($managedHome, [System.StringComparison]::OrdinalIgnoreCase) -ge 0",
    ),
  );
  assert.ok(stopJvms.includes('$_.CommandLine -match "KotlinCompileDaemon|GradleDaemon"'));
  assert.ok(stopJvms.includes("[string]::IsNullOrWhiteSpace($GradleUserHome)"));

  // Handles are only released once the JVM is gone, so wait before deleting.
  assert.ok(stopJvms.includes("Wait-Process"));
});

test("every build packages the APK from a clean state", () => {
  const script = readFileSync(scriptPath, "utf8");
  const build = readPowerShellFunction(script, "Invoke-GradleBuildWithRetry");
  const firstAttempt = build.indexOf(
    "Invoke-CommandChecked -Command $GradleWrapperPath -Arguments $GradleArguments",
  );
  const reset = build.indexOf("Reset-AndroidPackagingState -AndroidRoot $AndroidRoot");

  // Incremental packaging is the only state in which `:app:packageDebug` ran the
  // Gradle daemon out of heap (OutOfMemoryError in ApkFlinger), and the retry only
  // recovered because it drops that state first. Doing it up front keeps every
  // build on the path that works.
  assert.ok(reset >= 0 && firstAttempt >= 0);
  assert.ok(reset < firstAttempt, "packaging state must be reset before the first attempt");

  // The retry still resets, because a failed attempt leaves its own partial state.
  assert.equal(build.split("Reset-AndroidPackagingState -AndroidRoot $AndroidRoot").length - 1, 2);
});
