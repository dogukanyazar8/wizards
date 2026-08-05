# Desktop macOS Transparent Window Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the unsigned macOS native build while preserving transparent desktop companion windows.

**Architecture:** Declare Tauri's macOS private API requirement in checked-in configuration, generated configuration, and Cargo features. Protect the supported config-generation path and direct Cargo gates with process-level regression tests.

**Tech Stack:** Node.js test runner, Tauri 2.11, Rust/Cargo, JSON configuration

## Global Constraints

- Preserve all unrelated mobile, web, and Graphify WIP.
- Do not change dependencies, `Cargo.lock`, workflows, signing, or updater behavior.
- Do not stage, commit, or push.
- Keep `voice-mini` and `game-overlay` transparent.
- Record that private macOS APIs are incompatible with Apple App Store distribution.

---

### Task 1: Declare and test the macOS transparency requirement

**Files:**

- Modify: `apps/desktop/scripts/run-tauri.test.mjs`
- Modify: `apps/desktop/scripts/cargo-security-baseline.test.mjs`
- Modify: `apps/desktop/scripts/run-tauri.mjs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

**Interfaces:**

- Consumes: `node scripts/run-tauri.mjs build --write-config-only`
- Produces: `app.macOSPrivateApi: true` in static and generated Tauri JSON, plus resolved Tauri feature `macos-private-api`

- [ ] **Step 1: Write the failing regression test**

Add a test that executes the real config generator, loads both JSON files, and asserts literal `true` values:

```js
it("enables macOS private APIs for transparent companion windows", async () => {
  await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
    cwd: desktopRoot,
    env: testDesktopEnv(),
  });

  const staticConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
  const [generatedConfig, staticConfig] = await Promise.all([
    readFile(generatedConfigPath, "utf8").then(JSON.parse),
    readFile(staticConfigPath, "utf8").then(JSON.parse),
  ]);

  assert.equal(generatedConfig.app.macOSPrivateApi, true);
  assert.equal(staticConfig.app.macOSPrivateApi, true);
});
```

- [ ] **Step 2: Verify the test fails for the missing contract**

Run:

```powershell
corepack pnpm --filter @wizards/desktop exec node --test scripts/run-tauri.test.mjs
```

Expected: FAIL because `generatedConfig.app.macOSPrivateApi` is `undefined`.

- [ ] **Step 3: Implement the minimal configuration change**

Add this property under `app` in both Tauri configuration sources:

```json
"macOSPrivateApi": true
```

Add `macos-private-api` to the existing Tauri dependency features so direct
Cargo gates match the checked-in configuration:

```toml
tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }
```

- [ ] **Step 4: Verify focused and affected gates**

Run:

```powershell
corepack pnpm --filter @wizards/desktop exec node --test scripts/run-tauri.test.mjs
corepack pnpm --filter @wizards/desktop test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets
corepack pnpm --filter @wizards/desktop build:desktop -- --no-bundle
```

Expected: all commands exit `0`. The Windows build validates the local supported path; final macOS proof remains the hosted workflow.

- [ ] **Step 5: Refresh graph and inspect the final diff**

Run:

```powershell
graphify update .
git diff --check
git diff -- apps/desktop/scripts/run-tauri.test.mjs apps/desktop/scripts/run-tauri.mjs apps/desktop/src-tauri/tauri.conf.json
```

Expected: Graphify update exits `0`; diff check is clean; application diff contains only the test and two config declarations.
