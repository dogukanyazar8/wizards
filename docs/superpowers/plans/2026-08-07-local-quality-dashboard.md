# Local Quality Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure Whispr-styled localhost dashboard that runs canonical local quality profiles individually or as approved sequential suites and reports honest, redacted evidence.

**Architecture:** Extend the existing declarative PowerShell gate with Desktop, destructive E2E, and optional JSONL lifecycle events. Add a standalone Node 24 server using built-ins only; it owns catalog validation, orchestration, security, SSE, cancellation, and bounded evidence. Serve a framework-free browser client styled from tracked Whispr CSS tokens.

**Tech Stack:** Node.js 24 ESM and `node:test`, Windows PowerShell 5.1-compatible PowerShell, HTML/CSS/JavaScript, Server-Sent Events, existing Playwright package, existing Whispr design CSS.

## Global Constraints

- Bind only to `127.0.0.1`; default port `47832`.
- No new runtime dependency or frontend framework.
- Keep `Invoke-LocalGate.ps1` and `local-gate-profiles.json` authoritative.
- Never accept executable strings, arguments, working directories, environment names, or filesystem paths from browser input.
- Full acceptance requires explicit loopback E2E database target and 60-second single-use confirmation.
- No Git mutation, deployment, Docker lifecycle, APK install, device control, or remote acceptance claim.
- Preserve unrelated dirty worktree files; no stage, commit, or push.
- Follow RED, GREEN, REFACTOR for every production behavior.

## File Structure

- Modify `scripts/quality/local-gate-profiles.json`: canonical `Desktop` and `E2EFull` definitions.
- Modify `scripts/quality/Invoke-LocalGate.ps1`: cargo resolution, destructive guard, JSONL events.
- Modify `scripts/quality/local-gate-contract.test.mjs`: registry and runner regression contracts.
- Create `tools/local-quality-dashboard/catalog.mjs`: registry validation and public catalog projection.
- Create `tools/local-quality-dashboard/redaction.mjs`: bounded secret-safe log/event redaction.
- Create `tools/local-quality-dashboard/store.mjs`: owned artifact paths, atomic reports, recent history.
- Create `tools/local-quality-dashboard/coordinator.mjs`: suite state machine, runner process, SSE event buffer, cancellation.
- Create `tools/local-quality-dashboard/http-security.mjs`: Host, Origin, token, body, and response security helpers.
- Create `tools/local-quality-dashboard/server.mjs`: CLI, loopback HTTP API, static assets, exports.
- Create `tools/local-quality-dashboard/public/index.html`: accessible semantic dashboard shell.
- Create `tools/local-quality-dashboard/public/dashboard.css`: Whispr-token layout and responsive states.
- Create `tools/local-quality-dashboard/public/app.js`: browser state, actions, SSE rendering, confirmation dialog.
- Create `tools/local-quality-dashboard/*.test.mjs`: focused Node tests beside production units.
- Create `apps/web/e2e/local-quality-dashboard/quality-dashboard.spec.ts`: real-browser behavior/accessibility smoke.
- Create `apps/web/playwright.quality-dashboard.config.ts`: isolated fake-runner browser configuration.
- Modify `package.json`: dashboard start/test scripts.
- Modify `docs/development/local-quality-gates.md`: usage, safety, and evidence boundaries.

---

### Task 1: Canonical Desktop and E2EFull profiles

**Files:**

- Modify: `scripts/quality/local-gate-contract.test.mjs`
- Modify: `scripts/quality/local-gate-profiles.json`
- Modify: `scripts/quality/Invoke-LocalGate.ps1`

**Interfaces:**

- Consumes: existing profile registry schema and runner result shape.
- Produces: profile IDs `Desktop` and `E2EFull`; switches `-AllowDestructiveE2E`, `-EventStreamPath`; logical executable `cargo`.

- [ ] **Step 1: Write failing registry and guard tests**

Add assertions for exact Desktop/E2EFull steps, explicit E2E URL, dedicated `_e2e` name, cargo allowlist, new switches, and event-path containment:

```js
assert.deepEqual(
  profiles.profiles.Desktop.steps.map(({ executable, arguments }) => [executable, arguments]),
  [
    ["pnpm", ["--filter", "@wizards/desktop", "test"]],
    [
      "cargo",
      ["fmt", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", "--all", "--", "--check"],
    ],
    ["pnpm", ["--filter", "@wizards/desktop", "lint:rust"]],
    ["cargo", ["test", "--locked", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml"]],
  ],
);
assert.deepEqual(
  profiles.profiles.E2EFull.steps.map(({ executable, arguments }) => [executable, arguments]),
  [
    ["pnpm", ["e2e:seed"]],
    ["pnpm", ["e2e"]],
  ],
);
assert.match(runner, /\[switch\]\$AllowDestructiveE2E/u);
assert.match(runner, /\[string\]\$EventStreamPath/u);
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/quality/local-gate-contract.test.mjs`
Expected: FAIL because profiles and runner switches do not exist.

- [ ] **Step 3: Add exact declarative profiles**

Add `Desktop` preconditions for repository, node modules, desktop manifest, `pnpm`, and `cargo`. Add `E2EFull` preconditions for repository, node modules, `pnpm`, `E2E_TEST_PASSWORD`, destructive E2E database, and loopback Redis.

- [ ] **Step 4: Implement runner guard and event functions**

Add focused functions with these contracts:

```powershell
function Resolve-EventStreamPath([string]$Root, [string]$RequestedPath) { }
function Write-GateEvent([string]$Path, [hashtable]$Event) { }
function Test-DestructiveE2EDatabase([string]$Name) { }
```

`Test-DestructiveE2EDatabase` must parse only `E2E_DATABASE_URL`, require `postgres:`/`postgresql:`, loopback host, dedicated database name, and successful short TCP probe without including credentials in output. `E2EFull` must return `BLOCKED` unless `-AllowDestructiveE2E` is present.

- [ ] **Step 5: Emit deterministic lifecycle JSONL**

Emit `profile.started`, `precondition.completed`, `step.started`, `step.completed`, and `profile.completed`. Include `schemaVersion: 1`, increasing `sequence`, UTC timestamp, identities, status, duration, exit code, command, and next action. Preserve existing Text/Json stdout.

- [ ] **Step 6: Verify GREEN and compatibility**

Run: `node --test scripts/quality/local-gate-contract.test.mjs`
Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile Desktop -Plan -OutputFormat Json`
Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile E2EFull -Plan -OutputFormat Json`
Expected: tests PASS; Desktop plan PASS or environment BLOCKED with structured JSON; E2EFull BLOCKED without opt-in.

- [ ] **Step 7: Review focused diff**

Run: `git diff --check -- scripts/quality/local-gate-contract.test.mjs scripts/quality/local-gate-profiles.json scripts/quality/Invoke-LocalGate.ps1`

---

### Task 2: Catalog, redaction, and evidence store

**Files:**

- Create: `tools/local-quality-dashboard/catalog.test.mjs`
- Create: `tools/local-quality-dashboard/catalog.mjs`
- Create: `tools/local-quality-dashboard/redaction.test.mjs`
- Create: `tools/local-quality-dashboard/redaction.mjs`
- Create: `tools/local-quality-dashboard/store.test.mjs`
- Create: `tools/local-quality-dashboard/store.mjs`

**Interfaces:**

- Produces: `loadCatalog({ root })`, `redactText(value, sensitiveValues)`, `createRunStore({ root, maxLogBytes })`.

- [ ] **Step 1: Write failing catalog tests**

```js
test("catalog exposes only registered profile metadata", () => {
  const catalog = loadCatalog({ root });
  assert.deepEqual(catalog.suites.safeAll, ["Standard", "CI", "Mobile", "Security", "Desktop"]);
  assert.deepEqual(catalog.suites.fullAcceptance, ["E2EFull", "MobileRelease"]);
  assert.equal(catalog.profiles.Desktop.steps[0].id, "desktop-script-tests");
  assert.equal(catalog.profiles.Desktop.steps[0].arguments, undefined);
});
```

- [ ] **Step 2: Verify catalog RED, then implement minimal projection**

Run: `node --test tools/local-quality-dashboard/catalog.test.mjs`
Expected: FAIL with missing module. Implement schema/version/profile validation and remove executable arguments from browser projection. Rerun; expect PASS.

- [ ] **Step 3: Write failing redaction tests**

Cover authorization headers, token/key assignments, credential-bearing URLs, PEM private keys, exact inherited secret values, CR/LF normalization, and maximum line size.

- [ ] **Step 4: Verify redaction RED, implement, verify GREEN**

Run: `node --test tools/local-quality-dashboard/redaction.test.mjs`
Expected RED: missing module. Implement deterministic replacement with `[REDACTED]`; rerun; expect PASS.

- [ ] **Step 5: Write failing store tests**

```js
await store.startRun({ id: "run-1", startedAt: "2026-08-07T00:00:00.000Z" });
await store.appendLog("run-1", "token=secret");
await store.finishRun("run-1", result);
assert.deepEqual((await store.listRecent(30))[0].id, "run-1");
assert.equal(readFileSync(resultPath, "utf8").includes("secret"), false);
```

Also assert traversal IDs, symlinked ownership roots, partial files, log caps, and interrupted recovery fail safely.

- [ ] **Step 6: Verify store RED, implement atomic store, verify GREEN**

Run: `node --test tools/local-quality-dashboard/store.test.mjs`
Expected RED: missing module. Implement owned `artifacts/local-quality-dashboard` paths, temp-plus-rename final reports, max-log truncation marker, latest-30 read without deletion, and interrupted-state recovery. Rerun; expect PASS.

---

### Task 3: Run coordinator and process safety

**Files:**

- Create: `tools/local-quality-dashboard/coordinator.test.mjs`
- Create: `tools/local-quality-dashboard/coordinator.mjs`

**Interfaces:**

- Consumes: catalog, redactor, store, injected `spawnProcess`.
- Produces: `createCoordinator(options)` with `startRun`, `cancelRun`, `subscribe`, `getRun`, `getActiveRun`.

- [ ] **Step 1: Write failing state-machine tests**

Test fixed safe/full suite order, individual profile, single-run conflict, continuation after profile FAIL/BLOCKED, within-run aggregate verdict, failed-only rerun, event replay, browser disconnect independence, and cancellation.

```js
const run = await coordinator.startRun({ kind: "suite", id: "safeAll" });
await run.done;
assert.deepEqual(calls, ["Standard", "CI", "Mobile", "Security", "Desktop"]);
assert.equal(coordinator.getRun(run.id).status, "FAIL");
```

- [ ] **Step 2: Verify coordinator RED**

Run: `node --test tools/local-quality-dashboard/coordinator.test.mjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement minimal coordinator**

Use immutable run/profile records and explicit transition table. Spawn PowerShell with fixed executable resolution, runner path, profile ID from catalog, `-EventStreamPath`, and opt-in flags derived only from server-side suite definition. Set `{ shell: false, windowsHide: true }`.

- [ ] **Step 4: Implement event/log bridge and cancellation**

Tail owned JSONL metadata, stream redacted stdout/stderr lines, keep bounded in-memory replay. On Windows cancel known PID tree with fixed `taskkill` arguments; POSIX cancel owned detached process group. Never enumerate or kill by process name.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tools/local-quality-dashboard/coordinator.test.mjs`
Expected: PASS; asserted spawn options include `shell: false`; all suite-order and cancellation tests pass.

---

### Task 4: Secure localhost HTTP API

**Files:**

- Create: `tools/local-quality-dashboard/http-security.test.mjs`
- Create: `tools/local-quality-dashboard/http-security.mjs`
- Create: `tools/local-quality-dashboard/server.test.mjs`
- Create: `tools/local-quality-dashboard/server.mjs`

**Interfaces:**

- Consumes: coordinator, catalog, store.
- Produces: `createDashboardServer(options)`, CLI `main(argv)`, documented HTTP endpoints.

- [ ] **Step 1: Write failing security tests**

Cover non-loopback Host, cross-origin POST, missing/wrong token, wrong content type, oversized body, unknown fields/methods/routes, stale capability, changed database target, and path traversal. Assert safe headers and no CORS wildcard.

- [ ] **Step 2: Verify security RED, implement helpers, verify GREEN**

Run: `node --test tools/local-quality-dashboard/http-security.test.mjs`
Expected RED: missing module. Implement exact Host/Origin/token/body/header helpers. Rerun; expect PASS.

- [ ] **Step 3: Write failing API tests**

Start on port `0`; use built-in `fetch`. Test bootstrap, individual/suite start, `409` active-run conflict, SSE replay, cancel, acceptance target projection without credentials, 60-second single-use capability, JSON/Markdown export, and static MIME/CSP.

- [ ] **Step 4: Verify API RED, implement server, verify GREEN**

Run: `node --test tools/local-quality-dashboard/server.test.mjs`
Expected RED: missing server export. Implement fixed route table and strict field validation. Strip external font `@import` from served Whispr CSS in memory. Rerun; expect PASS.

- [ ] **Step 5: Implement CLI startup and graceful shutdown**

Support `--port <0..65535>` and `--no-open`; reject all other arguments. Bind explicit `127.0.0.1`. Print exact URL. Use fixed platform browser-open command. On SIGINT/SIGTERM cancel owned child, close server, preserve result state.

---

### Task 5: Whispr dashboard client

**Files:**

- Create: `tools/local-quality-dashboard/public/index.html`
- Create: `tools/local-quality-dashboard/public/dashboard.css`
- Create: `tools/local-quality-dashboard/public/app.js`
- Create: `tools/local-quality-dashboard/public-contract.test.mjs`

**Interfaces:**

- Consumes: bootstrap/API/SSE contracts.
- Produces: responsive accessible dashboard without build step.

- [ ] **Step 1: Write failing public contract tests**

Assert semantic landmarks, Turkish action labels, dialog attributes, live region, no inline script/style/handler, no external URL, CSS token usage, reduced-motion media query, and JavaScript route literals.

- [ ] **Step 2: Verify public RED**

Run: `node --test tools/local-quality-dashboard/public-contract.test.mjs`
Expected: FAIL because public files do not exist.

- [ ] **Step 3: Implement semantic HTML and Whispr CSS**

Build header, summary strip, action bar, profile grid template, live log panel, completion panel, and native dialog. Use concrete tokens such as `hsl(var(--surface-card))`, semantic status tokens, Plus Jakarta/Space Grotesk fallbacks, `rounded-2xl` rhythm, focus rings, one/two/dense responsive columns, and reduced motion.

- [ ] **Step 4: Implement browser controller**

Use `fetch` with custom anti-CSRF header for mutations, native `EventSource` for same-origin redacted events, textContent-only rendering, bounded log DOM, reconnect/replay, theme storage, focus restoration, exact database-name confirmation, individual/suite/failed-only/cancel actions, and export links.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tools/local-quality-dashboard/public-contract.test.mjs`
Expected: PASS with no external assets or inline executable content.

---

### Task 6: Browser behavior and accessibility

**Files:**

- Create: `apps/web/playwright.quality-dashboard.config.ts`
- Create: `apps/web/e2e/local-quality-dashboard/quality-dashboard.spec.ts`
- Modify: `tools/local-quality-dashboard/server.mjs`

**Interfaces:**

- Produces: deterministic fake-runner mode available only when `NODE_ENV=test` and `WHISPR_QUALITY_DASHBOARD_TEST_MODE=1`.

- [ ] **Step 1: Write failing Playwright smoke tests**

Cover safe-all progress, one-profile run, failed-only rerun, live log filtering, cancellation, completion exports, typed full-acceptance confirmation, stale capability, keyboard dialog/focus, accessible names, mobile viewport, light/dark, and reduced motion.

- [ ] **Step 2: Verify browser RED**

Run: `corepack pnpm --filter @wizards/web exec playwright test --config playwright.quality-dashboard.config.ts`
Expected: FAIL because isolated test server mode does not exist.

- [ ] **Step 3: Add injected deterministic test runner**

Test runner emits the same public event schema, never spawns PowerShell, never touches E2E DB, and is rejected unless both test environment guards are present.

- [ ] **Step 4: Verify browser GREEN**

Run: `corepack pnpm --filter @wizards/web exec playwright test --config playwright.quality-dashboard.config.ts`
Expected: PASS in Chromium; no repository gate, DB reset, APK build, or external request.

---

### Task 7: Root scripts and operator documentation

**Files:**

- Modify: `package.json`
- Modify: `docs/development/local-quality-gates.md`
- Modify: `tools/local-quality-dashboard/public-contract.test.mjs`

**Interfaces:**

- Produces: `quality:dashboard`, `test:quality-dashboard`, `test:quality-dashboard:browser`.

- [ ] **Step 1: Add failing script/doc assertions**

Assert exact root scripts and documentation sections for Safe all, Full acceptance warning, local-only boundary, evidence path, setup blockers, and remote/device non-proof.

- [ ] **Step 2: Verify RED**

Run: `node --test tools/local-quality-dashboard/public-contract.test.mjs`
Expected: FAIL because scripts/docs are absent.

- [ ] **Step 3: Add scripts and concise documentation**

```json
{
  "quality:dashboard": "node tools/local-quality-dashboard/server.mjs",
  "test:quality-dashboard": "node --test tools/local-quality-dashboard/*.test.mjs",
  "test:quality-dashboard:browser": "pnpm --filter @wizards/web exec playwright test --config playwright.quality-dashboard.config.ts"
}
```

Document `corepack pnpm quality:dashboard`, `-- --no-open`, `-- --port 0`, required E2E environment, destructive target confirmation, and status separation.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tools/local-quality-dashboard/public-contract.test.mjs`
Expected: PASS.

---

### Task 8: Verification, graph refresh, and handoff

**Files:**

- Modify: `graphify-out/*` only through `graphify update .`.

**Interfaces:**

- Produces: observed verification evidence; no publication.

- [ ] **Step 1: Run focused Node tests**

Run: `corepack pnpm test:quality-dashboard`
Expected: all dashboard unit/integration/contract tests PASS.

- [ ] **Step 2: Run PowerShell/toolchain contracts**

Run: `node --test scripts/quality/local-gate-contract.test.mjs`
Run: `corepack pnpm test:toolchain`
Expected: PASS. If unrelated dirty-WIP test fails, isolate and report exact ownership; do not alter unrelated code.

- [ ] **Step 3: Run browser tests**

Run: `corepack pnpm test:quality-dashboard:browser`
Expected: Chromium dashboard tests PASS with fake runner.

- [ ] **Step 4: Run formatting and targeted lint checks**

Run: `corepack pnpm exec prettier --check tools/local-quality-dashboard scripts/quality/local-gate-contract.test.mjs scripts/quality/local-gate-profiles.json package.json docs/development/local-quality-gates.md docs/superpowers/specs/2026-08-05-local-quality-dashboard-design.md docs/superpowers/plans/2026-08-07-local-quality-dashboard.md`
Run: `corepack pnpm --filter @wizards/web exec eslint e2e/local-quality-dashboard/quality-dashboard.spec.ts playwright.quality-dashboard.config.ts`
Expected: PASS.

- [ ] **Step 5: Run non-destructive plans**

Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile Desktop -Plan -OutputFormat Json`
Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile E2EFull -Plan -OutputFormat Json`
Expected: structured results; E2EFull remains BLOCKED without explicit destructive opt-in.

- [ ] **Step 6: Refresh graph and inspect owned diff**

Run: `graphify update .`
Run: `git diff --check -- tools/local-quality-dashboard scripts/quality/Invoke-LocalGate.ps1 scripts/quality/local-gate-profiles.json scripts/quality/local-gate-contract.test.mjs apps/web/e2e/local-quality-dashboard apps/web/playwright.quality-dashboard.config.ts package.json docs/development/local-quality-gates.md docs/superpowers/specs/2026-08-05-local-quality-dashboard-design.md docs/superpowers/plans/2026-08-07-local-quality-dashboard.md`
Expected: graph update succeeds; owned diff has no whitespace errors.

- [ ] **Step 7: Report boundaries**

Report separately: dashboard checks, broader local toolchain, destructive acceptance NOT RUN, MobileRelease NOT RUN, GitHub Actions NOT RUN, deployment NOT RUN, device acceptance NOT RUN. Leave all changes unstaged and uncommitted.
