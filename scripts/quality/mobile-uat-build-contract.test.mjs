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
