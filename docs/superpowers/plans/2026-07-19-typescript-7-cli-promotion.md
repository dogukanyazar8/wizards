# TypeScript 7 CLI Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote TypeScript 7.0.2 to Whispr's authoritative workspace CLI compiler while preserving TypeScript 6.0.3 as an explicit compatibility API and rollback gate.

**Architecture:** Package scripts call one root-owned TS7 project runner with allowlisted project and mode values. A separate aggregate runner produces TypeScript 7 main and TypeScript 6 compatibility reports; declaration parity, compiler API consumers, `typescript-eslint`, `ts-node`, and Next tooling keep the TS6 package alias.

**Tech Stack:** Node.js 24.18.0, pnpm 11.15.0, TypeScript 7.0.2 native CLI, TypeScript 6.0.3 compatibility API, Turbo 2.10.5, Node `node:test`, GitHub Actions.

## Global Constraints

- Preserve every unrelated staged, unstaged, deleted, and untracked user file.
- Do not create a worktree, commit, push, publish, or stage files.
- Keep `typescript: npm:@typescript/typescript6@6.0.2` and root `@typescript/native: npm:typescript@7.0.2` exact.
- Do not add package-local compiler versions or repoint the `typescript` dependency name.
- All compiler subprocesses must use trusted `npm_execpath`, `process.execPath`, and `shell: false`.
- TypeScript 7 project and mode arguments must be allowlisted; arbitrary paths and compiler arguments are forbidden.
- Compiler API tests, `typescript-eslint`, `ts-node`, and Next.js tooling remain on TypeScript 6.
- Run `graphify update .` after code changes.

---

### Task 1: Add the root-owned TS7 project runner

**Files:**

- Create: `scripts/quality/typescript-project-runner.test.mjs`
- Create: `scripts/quality/typescript-project-runner.mjs`

**Interfaces:**

- Consumes: `npm_execpath`, root `@typescript/native` binary, five fixed tsconfig paths.
- Produces: `PROJECTS`, `parseProjectRunnerArgs(argv)`, `buildCompilerArgs(options)`, `buildPnpmInvocation(environment, args)`, and CLI exit-code propagation.

- [ ] **Step 1: Write the failing runner contract test**

Create a Node test which checks file existence before dynamic import, then asserts exact project inventory, argument rejection, command construction, and shell-free pnpm invocation:

```js
test("project runner exposes a bounded TS7 compiler boundary", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript project runner is missing");
  const runner = await import(pathToFileURL(runnerPath));
  assert.deepEqual(Object.keys(runner.PROJECTS), ["db", "types", "ui", "web", "mobile"]);
  assert.deepEqual(
    runner.parseProjectRunnerArgs(["--project=web", "--mode=check", "--checkers=1"]),
    { project: "web", mode: "check", checkers: 1 },
  );
  assert.throws(() => runner.parseProjectRunnerArgs(["--project=../../secret", "--mode=check"]));
  assert.throws(() =>
    runner.parseProjectRunnerArgs(["--project=web", "--mode=emitDeclarationOnly"]),
  );
  assert.deepEqual(runner.buildCompilerArgs({ project: "web", mode: "check", checkers: 1 }), [
    "exec",
    "tsc",
    "-p",
    "apps/web/tsconfig.json",
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
    "--checkers",
    "1",
  ]);
  assert.deepEqual(
    runner.buildPnpmInvocation({ npm_execpath: "C:/pnpm/pnpm.cjs" }, ["exec", "tsc"]),
    { command: process.execPath, args: ["C:/pnpm/pnpm.cjs", "exec", "tsc"] },
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
corepack pnpm exec node --test scripts/quality/typescript-project-runner.test.mjs
```

Expected: FAIL with `TypeScript project runner is missing`.

- [ ] **Step 3: Implement the minimal project runner**

Implement exact project mapping, strict `--key=value` parsing, checker range `1..4`, mode-specific arguments, version assertion `Version 7.0.2`, Prisma-free compiler execution, and CLI error reporting. `check` disables emit/incremental output, `build` permits emit, and `watch` preserves output.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all runner tests pass with no failures.

---

### Task 2: Generalize aggregate main and compatibility evidence

**Files:**

- Create: `scripts/quality/typescript-typecheck-runner.test.mjs`
- Create: `scripts/quality/typescript-typecheck-runner.mjs`
- Delete: `scripts/quality/typescript-native-runner.test.mjs`
- Delete: `scripts/quality/typescript-native-runner.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: project inventory from `typescript-project-runner.mjs`, TS7 `tsc`, TS6 `tsc6`, Prisma generation.
- Produces: `parseTypecheckArgs(argv)`, `buildTypecheckCompilerArgs(options)`, `main-typecheck.json`, `compatibility-typecheck.json`, and root scripts `typecheck:main`, `typecheck:main:ci`, `typecheck:compat`.

- [ ] **Step 1: Write the failing aggregate runner test**

Assert the runner file exists, compiler values are limited to `main|compat`, main includes `--checkers`, compat uses `tsc6` without `--checkers`, and report names are distinct.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
corepack pnpm exec node --test scripts/quality/typescript-typecheck-runner.test.mjs
```

Expected: FAIL with `TypeScript typecheck runner is missing`.

- [ ] **Step 3: Implement aggregate runner and root scripts**

Use this root command contract:

```json
{
  "typecheck:main": "node scripts/quality/typescript-typecheck-runner.mjs --compiler=main",
  "typecheck:main:ci": "node scripts/quality/typescript-typecheck-runner.mjs --compiler=main --checkers=1",
  "typecheck:compat": "node scripts/quality/typescript-typecheck-runner.mjs --compiler=compat"
}
```

Update `ci` so TS7 workspace typecheck, aggregate TS7 evidence, TS6 compatibility, declaration parity, coverage, and build all remain blocking.

- [ ] **Step 4: Remove obsolete native runner files and aliases**

Delete the two obsolete files only after the new runner tests pass. Remove `typecheck:native` and `typecheck:native:ci` from the current root manifest; historical plan documents remain unchanged.

- [ ] **Step 5: Run focused aggregate tests and verify GREEN**

Run both new runner test files. Expected: all tests pass.

---

### Task 3: Promote workspace scripts and drift contracts

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/mobile/package.json`
- Modify: `packages/db/package.json`
- Modify: `packages/types/package.json`
- Modify: `packages/ui/package.json`
- Modify: `scripts/quality/typescript-toolchain-contract.test.mjs`

**Interfaces:**

- Consumes: root project runner CLI.
- Produces: TS7-backed package build/check/watch scripts and fail-closed drift assertions.

- [ ] **Step 1: Change the toolchain contract first**

Replace the stable-`tsc6` script assertion with exact expected mappings:

```js
const packageContracts = [
  { path: "apps/web/package.json", scripts: { typecheck: ["web", "check"] } },
  {
    path: "apps/mobile/package.json",
    scripts: { lint: ["mobile", "check"], typecheck: ["mobile", "check"] },
  },
  {
    path: "packages/db/package.json",
    scripts: { build: ["db", "build"], lint: ["db", "check"], typecheck: ["db", "check"] },
  },
  {
    path: "packages/types/package.json",
    scripts: {
      build: ["types", "build"],
      dev: ["types", "watch"],
      lint: ["types", "check"],
      typecheck: ["types", "check"],
    },
  },
  {
    path: "packages/ui/package.json",
    scripts: {
      build: ["ui", "build"],
      dev: ["ui", "watch"],
      lint: ["ui", "check"],
      typecheck: ["ui", "check"],
    },
  },
];
```

Each script must contain `typescript-project-runner.mjs`, its exact project/mode flags, and neither direct `tsc6` nor bare `tsc`.

- [ ] **Step 2: Run toolchain tests and verify RED**

Run:

```powershell
corepack pnpm test:toolchain
```

Expected: FAIL because current workspace scripts still invoke `tsc6`.

- [ ] **Step 3: Update workspace scripts**

Use `node ../../scripts/quality/typescript-project-runner.mjs --project=<name> --mode=<mode>` in every mapped script. Preserve Prisma generation and all non-TypeScript script behavior exactly.

- [ ] **Step 4: Strengthen compiler/CI contract assertions**

Keep `typescript` API version `6.0.3`, TS7 CLI version `7.0.2`, exact catalog ownership, CSS declaration checks, and root-only native dependency. Require root main/compat scripts and the renamed required CI job.

- [ ] **Step 5: Run toolchain tests and verify GREEN**

Run `corepack pnpm test:toolchain`. Expected: all toolchain tests pass.

---

### Task 4: Promote CI and current operations documentation

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `docs/operations/typescript-toolchain.md`
- Modify: `scripts/quality/typescript-toolchain-contract.test.mjs`

**Interfaces:**

- Consumes: root main, compatibility, and declaration commands.
- Produces: required `TypeScript Compiler Compatibility` CI evidence and current operator instructions.

- [ ] **Step 1: Add failing CI contract assertions**

Require the independent job to have exact name `TypeScript Compiler Compatibility`, run
`pnpm typecheck:main:ci`, `pnpm typecheck:compat`, and `pnpm typecheck:declarations`, omit
`continue-on-error: true`, and upload `artifacts/typescript/*.json` with `if: always()`.

- [ ] **Step 2: Run toolchain tests and verify RED**

Expected failure: workflow still uses `TypeScript 7 Native` and native command names.

- [ ] **Step 3: Update workflow and runbook**

Rename the job display name without changing its job identifier unless needed by external branch protection. Replace command steps, artifact name, ownership model, performance terminology, troubleshooting, rollback, and full-TS7 future gate. Preserve historical CI run links as historical evidence.

- [ ] **Step 4: Run focused contracts and formatting**

Run:

```powershell
corepack pnpm test:toolchain
corepack pnpm exec prettier --check package.json apps/web/package.json apps/mobile/package.json packages/db/package.json packages/types/package.json packages/ui/package.json scripts/quality/*.mjs .github/workflows/ci.yml docs/operations/typescript-toolchain.md docs/superpowers/specs/2026-07-19-typescript-7-cli-promotion-design.md docs/superpowers/plans/2026-07-19-typescript-7-cli-promotion.md
```

Expected: all checks pass.

---

### Task 5: Reconcile dependencies and verify compiler promotion

**Files:**

- Modify only if required by frozen resolution: `pnpm-lock.yaml`
- Generate ignored evidence: `artifacts/typescript/main-typecheck.json`
- Generate ignored evidence: `artifacts/typescript/compatibility-typecheck.json`
- Generate ignored evidence: `artifacts/typescript/declaration-parity.json`

**Interfaces:**

- Consumes: Node 24.18.0, pnpm 11.15.0, current manifests and lockfile.
- Produces: fresh main/compat/parity evidence for the current worktree.

- [ ] **Step 1: Select the declared Node runtime and frozen install**

Verify `node --version` is `v24.18.0`. Use an already-installed matching runtime if available. Do not weaken `engines`. Run `corepack pnpm install --frozen-lockfile`; if Node 24.18.0 is unavailable, report the environment blocker instead of modifying the runtime contract.

- [ ] **Step 2: Run compiler gates**

```powershell
corepack pnpm test:toolchain
corepack pnpm typecheck --force
corepack pnpm typecheck:main:ci
corepack pnpm typecheck:compat
corepack pnpm typecheck:declarations
```

Expected: all five projects exit `0`; declaration arrays are empty.

- [ ] **Step 3: Run focused API and package tests**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-theme-contract.test.ts
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
```

Expected: all suites pass. Preserve exact failures caused by current unrelated WIP; do not patch unrelated behavior.

- [ ] **Step 4: Run full local CI**

Run `corepack pnpm run ci`. Expected: exit `0`. Report audit, formatting, lint, TS7, TS6 compatibility, declaration parity, coverage, and build separately if any stage fails.

---

### Task 6: Refresh graph and review scope

**Files:**

- Modify generated graph artifacts under `graphify-out/` only through `graphify update .`.

**Interfaces:**

- Consumes: completed compiler/toolchain diff.
- Produces: current repository graph and final evidence-backed handoff.

- [ ] **Step 1: Update Graphify**

Run `graphify update .`. Expected: graph reports changed toolchain files without rebuilding HTML for the 13,000+ node graph.

- [ ] **Step 2: Inspect final scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat
git diff -- package.json pnpm-workspace.yaml pnpm-lock.yaml apps/web/package.json apps/mobile/package.json packages/db/package.json packages/types/package.json packages/ui/package.json scripts/quality .github/workflows/ci.yml docs/operations/typescript-toolchain.md docs/superpowers/specs/2026-07-19-typescript-7-cli-promotion-design.md docs/superpowers/plans/2026-07-19-typescript-7-cli-promotion.md
```

Expected: only authorized compiler/toolchain/docs/graph changes plus untouched pre-existing user WIP.

- [ ] **Step 3: Final verification summary**

Report passed, failed, not-run, and environment-blocked checks separately. Do not claim remote CI, device acceptance, commit, push, or publication.
