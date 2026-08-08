import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../..");

test("automatic desktop CI runs portable locked Rust quality gates", async () => {
  const workflow = await readFile(
    path.join(workspaceRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const desktopOpsStart = workflow.indexOf("\n  desktop-ops:");
  const desktopBuildStart = workflow.indexOf("\n  desktop-build:");

  assert.notEqual(desktopOpsStart, -1);

  const desktopOps = workflow.slice(
    desktopOpsStart,
    desktopBuildStart === -1 ? workflow.length : desktopBuildStart,
  );
  const desktopOpsConfiguration = desktopOps.slice(0, desktopOps.indexOf("    steps:"));

  assert.match(desktopOps, /^    needs: verify$/m);
  assert.match(desktopOpsConfiguration, /^    runs-on: \[self-hosted, linux, x64, ci-fast\]$/mu);
  assert.doesNotMatch(desktopOpsConfiguration, /matrix|windows-latest|macos-latest/u);
  assert.match(desktopOpsConfiguration, /^    if: github\.event_name != 'pull_request'$/m);
  assert.match(
    desktopOps,
    /uses: dtolnay\/rust-toolchain@29eef336d9b2848a0b548edc03f92a220660cdb8 # stable/,
  );
  assert.match(desktopOps, /working-directory: apps\/desktop\/src-tauri/);
  assert.match(desktopOps, /^          components: rustfmt, clippy$/m);
  assert.match(desktopOps, /CARGO_AUDIT_VERSION: 0\.22\.1/);
  assert.match(
    desktopOps,
    /cargo install cargo-audit --version "\$CARGO_AUDIT_VERSION" --locked --force/,
  );
  assert.match(desktopOps, /^        shell: bash$/m);
  assert.match(
    desktopOps,
    /^          cargo metadata --locked --format-version 1 --no-deps > \/dev\/null$/m,
  );
  assert.match(desktopOps, /^          cargo audit --file Cargo\.lock$/m);
  assert.match(desktopOps, /^        run: cargo fmt -- --check$/m);
  assert.match(desktopOps, /^        run: cargo clippy --locked --all-targets -- -D warnings$/m);
  assert.match(desktopOps, /^        run: cargo test --locked$/m);
  assert.match(
    desktopOps,
    /^        run: pnpm --filter @wizards\/desktop build:desktop -- --no-bundle$/m,
  );
  assert.doesNotMatch(desktopOps, /continue-on-error:/);
});
