# Whispr TypeScript 6 Alignment and TypeScript 7 Native Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every Whispr TypeScript consumer on the TypeScript 6.0.3 API-compatible toolchain while adding TypeScript 7.0.2 as an isolated, measurable native CLI shadow gate without exposing ESLint, `ts-node`, Next.js tooling, or AST contract tests to the API-less TypeScript 7 package.

**Architecture:** pnpm's default catalog is the single source of truth: the dependency name `typescript` resolves to `@typescript/typescript6@6.0.2` (whose compiler reports 6.0.3 and exposes the TS6 API), while root-only `@typescript/native` resolves to `typescript@7.0.2` and provides the native `tsc` binary. All production, build, lint, watch, editor, and compiler-API paths invoke `tsc6` or import `typescript`; a root-owned, shell-injection-safe Node runner is the only path allowed to invoke native `tsc`, first as a report-only Linux CI job and then as a required shadow gate after parity evidence is recorded.

**Tech Stack:** pnpm 10.33.2 catalogs and lockfile, TypeScript 6.0.3 compatibility compiler, TypeScript 7.0.2 native compiler, Node.js 22 `node:test`, Turbo 2.9.14, Next.js 15.5.18, Expo 56 / React Native 0.85.3, GitHub Actions.

## Global Constraints

- The implementation branch is `codex/typescript-modernization` in `C:\Users\doguk\Desktop\Wizards\.worktrees\typescript-modernization` and its immutable base is `origin/uat@e523ebe4a4ca94fcbcff725745197dce4fd6c507`.
- This plan changes TypeScript only. Node 22, pnpm 10.33.2, Next.js 15.5.18, Prisma 5.22.0, Expo 56, React Native 0.85.3, ESLint, and runtime dependencies remain on their current versions.
- Stable compiler and compiler API: `typescript: npm:@typescript/typescript6@6.0.2`, verified at runtime as TypeScript 6.0.3.
- Native shadow compiler: `@typescript/native: npm:typescript@7.0.2`; it must never replace the `typescript` dependency name in this plan.
- Every package build, lint, typecheck, and watch script that requires the stable compiler must call `tsc6` explicitly. Bare `tsc` is reserved for the root-owned native runner.
- `@typescript-eslint/parser`, `ts-node`, Next.js's editor plugin, and the three repository tests importing `typescript` remain on the TypeScript 6 API.
- `noUncheckedSideEffectImports` ends explicitly enabled. CSS support uses exact `*.d.css.ts` declarations plus an existence contract; a global `declare module "*.css"` escape hatch is forbidden.
- Native local checks use two checker workers; CI uses one checker worker to avoid oversubscribing the two compilers and other concurrent jobs.
- `skipLibCheck: true` remains the production setting. The dependency-type audit is informational because the verified UAT snapshot currently exposes 53 web and 138 mobile diagnostics when it is disabled, overwhelmingly inside third-party declarations.
- TypeScript 7 remains a shadow compiler even after its CI job becomes required. Making it the editor/API/default package is explicitly outside this plan and requires TypeScript 7.1 API support plus official ecosystem support.
- Do not modify runtime behavior, product copy, public APIs, security controls, E2E credentials, deployment configuration, or release versions.
- Preserve all unrelated work in the main `Wizards` checkout; perform every edit, test, commit, and graph update only in the isolated worktree.
- Each task must finish with focused tests, reviewer-readable scope, and its own commit. Do not combine baseline repair, dependency migration, native-runner work, or CI promotion in one commit.

---

## Confirmed Starting State

- Root, web, DB, types, and UI declare `^5.8.3` and resolve TypeScript 5.9.3; mobile declares and resolves TypeScript 6.0.3.
- `pnpm typecheck` and the live UAT CI `Verify` job are red on five `string | undefined` diagnostics in `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts:174-182`.
- The focused runtime contract already passes all five tests; the baseline defect is strict indexed-access handling in the test implementation, not a failed APK-script contract.
- TypeScript 6 and TypeScript 7 both reject `apps/web/src/app/layout.tsx:12` under their new side-effect-import default until the CSS declaration boundary is made explicit.
- Compiler API consumers are:
  - `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`
  - `apps/web/src/app/api/v1/route-contract.test.ts`
  - `apps/web/src/components/providers/voice-provider-bundle.test.ts`
- `apps/web/tsconfig.tsbuildinfo` is already ignored by `*.tsbuildinfo` but remains tracked; the migration removes it from version control.
- The GitHub `CI` workflow is active. Its latest `uat` run for `e523ebe4` failed at mobile lint before reaching typecheck, so the native pilot must be an independent job rather than a later step in `Verify`.

## Authoritative References

- [pnpm 10 catalogs](https://pnpm.io/10.x/catalogs) — default catalog definition and `catalog:` consumption from workspace manifests.
- [pnpm 10 aliases](https://pnpm.io/10.x/aliases) — installing a package under a different dependency name with `npm:`.
- [TypeScript 7 side-by-side transition](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0) — TS6 compatibility package, native alias, and compiler-API boundary.
- [TypeScript arbitrary extension declarations](https://www.typescriptlang.org/tsconfig/allowArbitraryExtensions.html) — exact `{basename}.d.{extension}.ts` declaration convention.
- [TypeScript side-effect import checking](https://www.typescriptlang.org/tsconfig/noUncheckedSideEffectImports.html) — failure behavior for unresolved side-effect-only imports.
- [typescript-eslint supported TypeScript range](https://typescript-eslint.io/users/dependency-versions/#typescript) — ecosystem gate that keeps lint tooling on TS6 in this plan.

## File Map

**Create:**

- `apps/web/src/app/globals.d.css.ts` — exact TypeScript declaration companion for `globals.css`.
- `scripts/quality/typescript-toolchain-contract.test.mjs` — drift guard for catalogs, package scripts, compiler versions, API ownership, CSS declarations, and CI promotion state.
- `scripts/quality/typescript-native-runner.mjs` — root-only, bounded native CLI runner and timing report writer.
- `scripts/quality/typescript-native-runner.test.mjs` — unit tests for argument validation, project inventory, and command construction.
- `scripts/quality/typescript-declaration-parity.mjs` — TS6/TS7 declaration emitter and exact parity comparator for publishable shared packages.
- `scripts/quality/typescript-declaration-parity.test.mjs` — unit tests for normalized declaration-tree comparison.
- `docs/operations/typescript-toolchain.md` — operating model, commands, rollout signals, troubleshooting, and rollback runbook.

**Modify:**

- `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts` — restore strict baseline with an assertion-narrowed package-script accessor.
- `pnpm-workspace.yaml` — add the two exact TypeScript catalog aliases.
- `package.json` — consume both catalog entries and expose stable/native/parity quality commands.
- `apps/web/package.json` — consume catalog TS6 and invoke `tsc6` for stable typecheck.
- `apps/mobile/package.json` — consume catalog TS6 and invoke `tsc6` for lint/typecheck.
- `packages/db/package.json` — consume catalog TS6 and invoke `tsc6` for build/lint/typecheck.
- `packages/types/package.json` — consume catalog TS6 and invoke `tsc6` for build/watch/lint/typecheck.
- `packages/ui/package.json` — consume catalog TS6 and invoke `tsc6` for build/watch/lint/typecheck.
- `tsconfig.base.json` — make `noUncheckedSideEffectImports` explicit for base-config consumers.
- `apps/mobile/tsconfig.json` — make the Expo-side side-effect-import policy explicit.
- `apps/web/tsconfig.json` — enable exact arbitrary-extension declarations.
- `pnpm-lock.yaml` — record the catalog aliases and single TS6 API resolution plus root native TS7 resolution.
- `.github/workflows/ci.yml` — add the independent report-only native job, artifact upload, and later promotion to required status.

**Delete:**

- `apps/web/tsconfig.tsbuildinfo` — tracked generated cache; `*.tsbuildinfo` is already ignored.

**Generated at closure:**

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/manifest.json`
- `graphify-out/.graphify_root`

---

### Task 1: Restore the UAT typecheck baseline before changing compilers

**Files:**

- Modify: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts:7-11,174-185`
- Test: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`

**Interfaces:**

- Consumes: `packageJson.scripts: Record<string, string>` parsed at module load.
- Produces: `requiredPackageScript(name: string): string`, which both proves script existence at runtime and narrows indexed access for `noUncheckedIndexedAccess`.

- [ ] **Step 1: Reproduce the exact strictness failure and preserve the runtime-green evidence**

Run:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts
```

Expected: typecheck fails with exactly five `TS2345` diagnostics at lines 174, 175, 179, 180, and 182; the focused runtime suite reports `5` passed and `0` failed.

- [ ] **Step 2: Add the narrowing accessor and use it for every direct indexed script lookup**

Insert below the parsed `packageJson` value:

```ts
function requiredPackageScript(name: string): string {
  const script = packageJson.scripts[name];
  assert.ok(script, `Missing required package script: ${name}`);
  return script;
}
```

Replace the affected section with:

```ts
assert.match(requiredPackageScript("android:uat:local"), /build-android-uat\.ps1/);
assert.match(requiredPackageScript("android:uat:local:clean"), /-CleanAndroidCaches\b/);

for (const [name, expected] of Object.entries(expectedApkCommands)) {
  const script = requiredPackageScript(name);
  assert.match(script, new RegExp(`-AndroidArchitectures ${expected.architectures}`));
  assert.equal(/-BuildType release\b/.test(script), expected.release, `${name} release mode`);
  assert.equal(
    /-DisableGradleBuildCache\b/.test(script),
    expected.disableGradleBuildCache,
    `${name} Gradle build-cache mode`,
  );
}
```

- [ ] **Step 3: Verify the focused contract, mobile gate, and repository baseline**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm lint
corepack pnpm typecheck
```

Expected: focused suite `5/5` passes; mobile typecheck, repository lint, and repository typecheck all exit `0` on the original compiler topology.

- [ ] **Step 4: Commit only the baseline repair**

```powershell
git add apps/mobile/scripts/mobile-phase-zero-native-config.test.ts
git commit -m "test(mobile): restore strict native config contract"
```

Expected: one-file commit; compiler manifests and lockfile remain unchanged.

---

### Task 2: Establish one TS6 API source and an exact native TS7 package boundary

**Files:**

- Create: `scripts/quality/typescript-toolchain-contract.test.mjs`
- Create: `apps/web/src/app/globals.d.css.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/mobile/package.json`
- Modify: `packages/db/package.json`
- Modify: `packages/types/package.json`
- Modify: `packages/ui/package.json`
- Modify: `tsconfig.base.json`
- Modify: `apps/mobile/tsconfig.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `pnpm-lock.yaml`
- Delete: `apps/web/tsconfig.tsbuildinfo`
- Test: `scripts/quality/typescript-toolchain-contract.test.mjs`

**Interfaces:**

- Consumes: pnpm default catalog, six TypeScript-bearing manifests, TS6 compiler API imports, root TS7 native binary, and relative CSS side-effect imports.
- Produces: stable `tsc6` version `6.0.3`, native `tsc` version `7.0.2`, `typescript` API version `6.0.3`, exact CSS declaration pairing, and `pnpm test:toolchain`.

- [ ] **Step 1: Write the failing toolchain contract**

Create `scripts/quality/typescript-toolchain-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageContracts = [
  { path: "package.json", scripts: [] },
  { path: "apps/web/package.json", scripts: ["typecheck"] },
  { path: "apps/mobile/package.json", scripts: ["lint", "typecheck"] },
  { path: "packages/db/package.json", scripts: ["build", "lint", "typecheck"] },
  { path: "packages/types/package.json", scripts: ["build", "dev", "lint", "typecheck"] },
  { path: "packages/ui/package.json", scripts: ["build", "dev", "lint", "typecheck"] },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function runPnpm(args) {
  assert.ok(process.env.npm_execpath, "Run this contract through pnpm test:toolchain");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

test("the pnpm catalog owns both compiler identities", () => {
  const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  assert.match(workspace, /^catalog:\r?$/m);
  assert.match(workspace, /^  ['"]?typescript['"]?: npm:@typescript\/typescript6@6\.0\.2\r?$/m);
  assert.match(workspace, /^  ['"]?@typescript\/native['"]?: npm:typescript@7\.0\.2\r?$/m);
});

test("every TypeScript workspace consumes the catalog and calls stable tsc6 explicitly", () => {
  for (const contract of packageContracts) {
    const manifest = readJson(contract.path);
    assert.equal(manifest.devDependencies.typescript, "catalog:", contract.path);
    for (const scriptName of contract.scripts) {
      const script = manifest.scripts[scriptName];
      assert.equal(typeof script, "string", `${contract.path}#${scriptName}`);
      assert.match(script, /\btsc6\b/, `${contract.path}#${scriptName}`);
      assert.doesNotMatch(script, /(^|\s)tsc(\s|$)/, `${contract.path}#${scriptName}`);
    }
  }
  assert.equal(readJson("package.json").devDependencies["@typescript/native"], "catalog:");
});

test("compiler API stays on TS6 while the root native CLI is TS7", () => {
  assert.equal(ts.version, "6.0.3");
  assert.equal(runPnpm(["exec", "tsc6", "--version"]), "Version 6.0.3");
  assert.equal(runPnpm(["exec", "tsc", "--version"]), "Version 7.0.2");
});

test("relative CSS side-effect imports have real assets and exact declarations", () => {
  const sourceRoot = join(root, "apps", "web", "src");
  const sourceFiles = walkFiles(sourceRoot).filter((path) =>
    [".ts", ".tsx"].includes(extname(path)),
  );
  const sideEffectImport = /^\s*import\s+["'](\.[^"']+\.css)["'];/gm;
  const imports = [];

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    for (const match of source.matchAll(sideEffectImport)) {
      const asset = resolve(dirname(sourceFile), match[1]);
      const declaration = asset.replace(/\.([^.]+)$/, ".d.$1.ts");
      imports.push(relative(root, asset).replaceAll("\\", "/"));
      assert.ok(existsSync(asset), `Missing stylesheet: ${relative(root, asset)}`);
      assert.ok(
        existsSync(declaration),
        `Missing exact declaration: ${relative(root, declaration)}`,
      );
    }
    assert.doesNotMatch(source, /declare\s+module\s+["']\*\.css["']/);
  }

  assert.deepEqual(imports, ["apps/web/src/app/globals.css"]);
});
```

Add the initial root command:

```json
{
  "scripts": {
    "test:toolchain": "node --test scripts/quality/*.test.mjs"
  }
}
```

Run:

```powershell
corepack pnpm test:toolchain
```

Expected: failures prove the catalog aliases, `tsc6`, native TS7, and exact CSS declaration do not exist yet.

- [ ] **Step 2: Add the exact pnpm catalog and consume it everywhere**

Add immediately below `packages` in `pnpm-workspace.yaml`:

```yaml
catalog:
  "@typescript/native": npm:typescript@7.0.2
  typescript: npm:@typescript/typescript6@6.0.2
```

Apply these exact dependency values:

```json
{
  "package.json": {
    "devDependencies": {
      "@typescript/native": "catalog:",
      "typescript": "catalog:"
    }
  },
  "apps/web/package.json": { "devDependencies": { "typescript": "catalog:" } },
  "apps/mobile/package.json": { "devDependencies": { "typescript": "catalog:" } },
  "packages/db/package.json": { "devDependencies": { "typescript": "catalog:" } },
  "packages/types/package.json": { "devDependencies": { "typescript": "catalog:" } },
  "packages/ui/package.json": { "devDependencies": { "typescript": "catalog:" } }
}
```

Replace stable compiler script invocations with these exact values:

```json
{
  "apps/web/package.json": {
    "typecheck": "tsc6 --noEmit"
  },
  "apps/mobile/package.json": {
    "lint": "tsc6 --noEmit",
    "typecheck": "tsc6 --noEmit"
  },
  "packages/db/package.json": {
    "build": "prisma generate && tsc6 -p tsconfig.json",
    "lint": "prisma generate && tsc6 --noEmit",
    "typecheck": "prisma generate && tsc6 --noEmit"
  },
  "packages/types/package.json": {
    "build": "tsc6 -p tsconfig.json",
    "dev": "tsc6 --watch --preserveWatchOutput",
    "lint": "tsc6 --noEmit",
    "typecheck": "tsc6 --noEmit"
  },
  "packages/ui/package.json": {
    "build": "tsc6 -p tsconfig.json",
    "dev": "tsc6 --watch --preserveWatchOutput",
    "lint": "tsc6 --noEmit",
    "typecheck": "tsc6 --noEmit"
  }
}
```

- [ ] **Step 3: Make side-effect imports strict without a wildcard declaration**

Add to `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "noUncheckedSideEffectImports": true
  }
}
```

Add to `apps/mobile/tsconfig.json` because it extends Expo's base instead of the repository base:

```json
{
  "compilerOptions": {
    "noUncheckedSideEffectImports": true
  }
}
```

Add to `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true
  }
}
```

Create `apps/web/src/app/globals.d.css.ts`:

```ts
declare const globalStyles: Readonly<Record<string, string>>;

export default globalStyles;
```

This exact filename is the TypeScript arbitrary-extension companion for `globals.css`; do not add a global CSS module wildcard.

- [ ] **Step 4: Remove tracked incremental cache and regenerate only the lockfile/install graph**

Run:

```powershell
git rm apps/web/tsconfig.tsbuildinfo
corepack pnpm install
corepack pnpm install --frozen-lockfile
```

Expected: the first install updates `pnpm-lock.yaml`; the second proves reproducibility. `git status --short` lists the intended manifests, configs, CSS declaration, contract test, lockfile, and tracked-cache deletion only.

- [ ] **Step 5: Make the toolchain contract green and verify API consumers**

Run:

```powershell
corepack pnpm test:toolchain
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-theme-contract.test.ts
corepack pnpm --filter @wizards/web exec node --test --import tsx src/app/api/v1/route-contract.test.ts src/components/providers/voice-provider-bundle.test.ts
corepack pnpm lint
corepack pnpm typecheck
```

Expected: toolchain tests report both compiler versions exactly; all three AST consumers pass while importing the TS6 API; lint and stable repository typecheck exit `0` with `noUncheckedSideEffectImports` enabled.

- [ ] **Step 6: Commit the stable toolchain boundary**

```powershell
git add pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json apps/web apps/mobile/package.json apps/mobile/tsconfig.json packages/db/package.json packages/types/package.json packages/ui/package.json scripts/quality/typescript-toolchain-contract.test.mjs
git commit -m "build(typescript): align workspaces on the TS6 API"
```

Expected: one reviewable toolchain commit; no native runner or workflow changes yet.

---

### Task 3: Add the bounded TypeScript 7 native typecheck runner

**Files:**

- Create: `scripts/quality/typescript-native-runner.mjs`
- Create: `scripts/quality/typescript-native-runner.test.mjs`
- Modify: `package.json`
- Test: `scripts/quality/typescript-native-runner.test.mjs`

**Interfaces:**

- Consumes: `process.env.npm_execpath`, hard-coded repository tsconfig inventory, optional `--checkers=<1..4>`.
- Produces: `parseCheckerCount(value): number`, `buildCompilerArgs(project, checkers): string[]`, `runNativeTypecheck(options): number`, console diagnostics, and `artifacts/typescript/native-typecheck.json`.

- [ ] **Step 1: Write failing unit tests for the runner boundary**

Create `scripts/quality/typescript-native-runner.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_PROJECTS,
  buildCompilerArgs,
  buildPnpmInvocation,
  parseCheckerCount,
} from "./typescript-native-runner.mjs";

test("native project inventory covers every repository TypeScript project exactly once", () => {
  assert.deepEqual(NATIVE_PROJECTS, [
    { name: "db", tsconfig: "packages/db/tsconfig.json" },
    { name: "types", tsconfig: "packages/types/tsconfig.json" },
    { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
    { name: "web", tsconfig: "apps/web/tsconfig.json" },
    { name: "mobile", tsconfig: "apps/mobile/tsconfig.json" },
  ]);
});

test("checker count accepts the bounded production range", () => {
  assert.equal(parseCheckerCount(undefined), 2);
  assert.equal(parseCheckerCount("1"), 1);
  assert.equal(parseCheckerCount("4"), 4);
  assert.throws(() => parseCheckerCount("0"), /between 1 and 4/);
  assert.throws(() => parseCheckerCount("2;rm"), /between 1 and 4/);
});

test("compiler arguments disable incremental output and pin worker count", () => {
  assert.deepEqual(buildCompilerArgs(NATIVE_PROJECTS[3], 1), [
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
});

test("pnpm invocation uses npm_execpath without a command shell", () => {
  assert.deepEqual(buildPnpmInvocation({ npm_execpath: "C:/pnpm/pnpm.cjs" }, ["exec", "tsc"]), {
    command: process.execPath,
    args: ["C:/pnpm/pnpm.cjs", "exec", "tsc"],
  });
  assert.throws(() => buildPnpmInvocation({}, []), /must be launched through pnpm/);
});
```

Run:

```powershell
corepack pnpm test:toolchain
```

Expected: the new test fails because the runner module does not exist.

- [ ] **Step 2: Implement the shell-free runner and deterministic JSON report**

Create `scripts/quality/typescript-native-runner.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NATIVE_PROJECTS = Object.freeze([
  { name: "db", tsconfig: "packages/db/tsconfig.json" },
  { name: "types", tsconfig: "packages/types/tsconfig.json" },
  { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
  { name: "web", tsconfig: "apps/web/tsconfig.json" },
  { name: "mobile", tsconfig: "apps/mobile/tsconfig.json" },
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const reportPath = join(root, "artifacts", "typescript", "native-typecheck.json");

export function parseCheckerCount(value) {
  if (value === undefined) return 2;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error("TypeScript native checker count must be an integer between 1 and 4");
  }
  return count;
}

export function buildCompilerArgs(project, checkers) {
  return [
    "exec",
    "tsc",
    "-p",
    project.tsconfig,
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
    "--checkers",
    String(checkers),
  ];
}

export function buildPnpmInvocation(environment, args) {
  const pnpmCli = environment.npm_execpath;
  if (!pnpmCli) throw new Error("TypeScript native runner must be launched through pnpm");
  return { command: process.execPath, args: [pnpmCli, ...args] };
}

function runPnpm(args, stdio = "inherit") {
  const invocation = buildPnpmInvocation(process.env, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    shell: false,
    stdio,
  });
}

function parseArgs(argv) {
  let checkerValue;
  for (const argument of argv) {
    if (!argument.startsWith("--checkers=")) throw new Error(`Unknown argument: ${argument}`);
    checkerValue = argument.slice("--checkers=".length);
  }
  return { checkers: parseCheckerCount(checkerValue) };
}

export function runNativeTypecheck({ checkers }) {
  const versionResult = runPnpm(["exec", "tsc", "--version"], "pipe");
  assert.equal(versionResult.status, 0, versionResult.stderr || versionResult.stdout);
  const compilerVersion = versionResult.stdout.trim();
  assert.equal(compilerVersion, "Version 7.0.2");

  const generateResult = runPnpm(["--filter", "@wizards/db", "db:generate"]);
  if (generateResult.status !== 0) return generateResult.status ?? 1;

  const projects = [];
  for (const project of NATIVE_PROJECTS) {
    const startedAt = performance.now();
    const result = runPnpm(buildCompilerArgs(project, checkers));
    projects.push({
      name: project.name,
      tsconfig: project.tsconfig,
      durationMs: Math.round(performance.now() - startedAt),
      exitCode: result.status ?? 1,
    });
  }

  const report = {
    schemaVersion: 1,
    compilerVersion,
    checkers,
    generatedAt: new Date().toISOString(),
    projects,
    success: projects.every((project) => project.exitCode === 0),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report.success ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = runNativeTypecheck(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

- [ ] **Step 3: Expose local and CI commands**

Add to root `package.json`:

```json
{
  "scripts": {
    "typecheck:native": "node scripts/quality/typescript-native-runner.mjs",
    "typecheck:native:ci": "node scripts/quality/typescript-native-runner.mjs --checkers=1"
  }
}
```

- [ ] **Step 4: Verify unit tests and a complete native run**

Run:

```powershell
corepack pnpm test:toolchain
corepack pnpm typecheck:native
Get-Content artifacts/typescript/native-typecheck.json
```

Expected: all toolchain tests pass; report identifies TypeScript 7.0.2, checker count `2`, five projects, exit code `0` for each, and `success: true`. No tracked file changes are created under `artifacts/`.

- [ ] **Step 5: Commit the native runner separately**

```powershell
git add package.json scripts/quality/typescript-native-runner.mjs scripts/quality/typescript-native-runner.test.mjs
git commit -m "build(typescript): add bounded native typecheck runner"
```

---

### Task 4: Gate shared package declaration parity between TS6 and TS7

**Files:**

- Create: `scripts/quality/typescript-declaration-parity.mjs`
- Create: `scripts/quality/typescript-declaration-parity.test.mjs`
- Modify: `package.json`
- Test: `scripts/quality/typescript-declaration-parity.test.mjs`

**Interfaces:**

- Consumes: `packages/db/tsconfig.json`, `packages/types/tsconfig.json`, `packages/ui/tsconfig.json`, `tsc6 --stableTypeOrdering`, native `tsc --checkers 1`, and generated Prisma types.
- Produces: `normalizeDeclaration(text): string`, `compareDeclarationMaps(stable, native): object`, and `artifacts/typescript/declaration-parity.json` with exact missing/extra/changed lists.

- [ ] **Step 1: Write the failing comparison tests**

Create `scripts/quality/typescript-declaration-parity.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { compareDeclarationMaps, normalizeDeclaration } from "./typescript-declaration-parity.mjs";

test("declaration normalization removes line-ending noise only", () => {
  assert.equal(normalizeDeclaration("export type A = 1;\r\n"), "export type A = 1;\n");
});

test("declaration comparison classifies missing, extra, and changed output", () => {
  const stable = new Map([
    ["same.d.ts", "same\n"],
    ["changed.d.ts", "stable\n"],
    ["missing.d.ts", "missing\n"],
  ]);
  const native = new Map([
    ["same.d.ts", "same\n"],
    ["changed.d.ts", "native\n"],
    ["extra.d.ts", "extra\n"],
  ]);
  assert.deepEqual(compareDeclarationMaps(stable, native), {
    changed: ["changed.d.ts"],
    extra: ["extra.d.ts"],
    missing: ["missing.d.ts"],
    success: false,
  });
});
```

Run `corepack pnpm test:toolchain` and expect module-not-found failure for the new implementation file.

- [ ] **Step 2: Implement exact stable/native declaration comparison**

Create `scripts/quality/typescript-declaration-parity.mjs` with these required behaviors:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packages = Object.freeze([
  { name: "db", tsconfig: "packages/db/tsconfig.json" },
  { name: "types", tsconfig: "packages/types/tsconfig.json" },
  { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
]);
const reportPath = join(root, "artifacts", "typescript", "declaration-parity.json");

export function normalizeDeclaration(text) {
  return text.replaceAll("\r\n", "\n");
}

export function compareDeclarationMaps(stable, native) {
  const stablePaths = [...stable.keys()].sort();
  const nativePaths = [...native.keys()].sort();
  const missing = stablePaths.filter((path) => !native.has(path));
  const extra = nativePaths.filter((path) => !stable.has(path));
  const changed = stablePaths.filter(
    (path) =>
      native.has(path) &&
      normalizeDeclaration(stable.get(path)) !== normalizeDeclaration(native.get(path)),
  );
  return { changed, extra, missing, success: missing.length + extra.length + changed.length === 0 };
}

function declarationMap(directory) {
  const result = new Map();
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".d.ts"))
        result.set(relative(directory, path).replaceAll("\\", "/"), readFileSync(path, "utf8"));
    }
  };
  visit(directory);
  return result;
}

function runPnpm(args) {
  assert.ok(process.env.npm_execpath, "Declaration parity must run through pnpm");
  return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    shell: false,
    stdio: "inherit",
  });
}

export function runDeclarationParity() {
  if (runPnpm(["--filter", "@wizards/db", "db:generate"]).status !== 0) return 1;
  const temporaryRoot = mkdtempSync(join(tmpdir(), "whispr-typescript-parity-"));
  const results = [];
  try {
    for (const project of packages) {
      const stableDirectory = join(temporaryRoot, project.name, "stable");
      const nativeDirectory = join(temporaryRoot, project.name, "native");
      mkdirSync(stableDirectory, { recursive: true });
      mkdirSync(nativeDirectory, { recursive: true });

      const common = [
        "-p",
        project.tsconfig,
        "--emitDeclarationOnly",
        "--declaration",
        "--declarationMap",
        "false",
      ];
      const stable = runPnpm([
        "exec",
        "tsc6",
        ...common,
        "--outDir",
        stableDirectory,
        "--stableTypeOrdering",
      ]);
      const native = runPnpm([
        "exec",
        "tsc",
        ...common,
        "--outDir",
        nativeDirectory,
        "--checkers",
        "1",
      ]);
      if (stable.status !== 0 || native.status !== 0) return 1;

      results.push({
        name: project.name,
        ...compareDeclarationMaps(declarationMap(stableDirectory), declarationMap(nativeDirectory)),
      });
    }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }

  const report = {
    schemaVersion: 1,
    projects: results,
    success: results.every((result) => result.success),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report.success ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = runDeclarationParity();
```

- [ ] **Step 3: Expose and execute the parity gate**

Add to root `package.json`:

```json
{
  "scripts": {
    "typecheck:declarations": "node scripts/quality/typescript-declaration-parity.mjs"
  }
}
```

Run:

```powershell
corepack pnpm test:toolchain
corepack pnpm typecheck:declarations
Get-Content artifacts/typescript/declaration-parity.json
```

Expected: `db`, `types`, and `ui` each report empty `missing`, `extra`, and `changed` arrays with `success: true`. Any difference is a migration blocker; fix source annotations or compiler configuration rather than adding a permanent allowlist.

- [ ] **Step 4: Commit declaration parity independently**

```powershell
git add package.json scripts/quality/typescript-declaration-parity.mjs scripts/quality/typescript-declaration-parity.test.mjs
git commit -m "test(typescript): enforce native declaration parity"
```

---

### Task 5: Add an independent report-only Linux CI shadow job

**Files:**

- Modify: `.github/workflows/ci.yml:35-110`
- Modify: `scripts/quality/typescript-toolchain-contract.test.mjs`
- Test: `scripts/quality/typescript-toolchain-contract.test.mjs`

**Interfaces:**

- Consumes: frozen pnpm install, generated Prisma Client, `pnpm test:toolchain`, `pnpm typecheck:native:ci`, and `pnpm typecheck:declarations`.
- Produces: independent `TypeScript 7 Native Shadow` job, Linux timing/parity reports, and uploaded `typescript-native-<run-id>` artifact even if the existing `Verify` job fails earlier.

- [ ] **Step 1: Extend the contract to require an independent report-only job**

Add this test to `typescript-toolchain-contract.test.mjs`:

```js
test("CI runs the native compiler independently in report-only mode", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /^  typescript-native-shadow:\r?$/m);
  assert.match(workflow, /^    name: TypeScript 7 Native Shadow\r?$/m);
  assert.match(workflow, /^    continue-on-error: true\r?$/m);
  assert.match(workflow, /^      - name: Run TypeScript toolchain contracts\r?$/m);
  assert.match(workflow, /^        run: pnpm test:toolchain\r?$/m);
  assert.match(workflow, /^        run: pnpm typecheck:native:ci\r?$/m);
  assert.match(workflow, /^        run: pnpm typecheck:declarations\r?$/m);
});
```

Run `corepack pnpm test:toolchain`; expect this new assertion to fail because the job does not exist.

- [ ] **Step 2: Add the parallel shadow job after `Verify` and before E2E jobs**

Add this exact job to `.github/workflows/ci.yml`:

```yaml
typescript-native-shadow:
  name: TypeScript 7 Native Shadow
  runs-on: ubuntu-latest
  timeout-minutes: 12
  continue-on-error: true

  steps:
    - name: Checkout
      uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

    - name: Setup pnpm
      uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      with:
        version: 10.33.2

    - name: Setup Node.js
      uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
      with:
        node-version: 22
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run TypeScript toolchain contracts
      run: pnpm test:toolchain

    - name: Run TypeScript 7 native typecheck
      run: pnpm typecheck:native:ci

    - name: Compare TS6 and TS7 declarations
      run: pnpm typecheck:declarations

    - name: Upload TypeScript native reports
      if: always()
      uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
      with:
        name: typescript-native-${{ github.run_id }}
        path: artifacts/typescript/*.json
        if-no-files-found: error
        retention-days: 14
```

Do not add `needs: verify`; the job must run even while unrelated UAT verification is red.

- [ ] **Step 3: Verify workflow syntax and contract locally**

Run:

```powershell
corepack pnpm test:toolchain
corepack pnpm exec prettier --check .github/workflows/ci.yml
git diff --check
```

Expected: contract and Prettier pass; workflow diff contains one independent report-only job.

- [ ] **Step 4: Commit and publish the report-only pilot for evidence collection**

```powershell
git add .github/workflows/ci.yml scripts/quality/typescript-toolchain-contract.test.mjs
git commit -m "ci(typescript): add native compiler shadow lane"
git push -u origin codex/typescript-modernization
```

Expected: branch push starts the active CI workflow. Do not promote the job in the same commit.

- [ ] **Step 5: Collect the Linux evidence before promotion**

Run:

```powershell
gh run list --workflow ci.yml --branch codex/typescript-modernization --limit 3
$runId = gh run list --workflow ci.yml --branch codex/typescript-modernization --limit 1 --json databaseId --jq '.[0].databaseId'
gh run view $runId --json status,conclusion,jobs,url
gh run download $runId -n "typescript-native-$runId" -D "artifacts/typescript/ci-$runId"
```

Expected promotion evidence:

- Shadow job conclusion is success on Ubuntu.
- `native-typecheck.json` reports TypeScript 7.0.2, checker count `1`, five projects, and zero non-zero exits.
- `declaration-parity.json` reports no missing, extra, or changed declarations.
- Windows local stable/native/parity gates remain green on the identical commit.
- Any native-only diagnostic, crash, or declaration difference stops promotion and is fixed in the owning earlier task.

---

### Task 6: Promote the proven TS7 shadow to a required parallel gate

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/quality/typescript-toolchain-contract.test.mjs`
- Modify: `package.json`
- Test: `scripts/quality/typescript-toolchain-contract.test.mjs`

**Interfaces:**

- Consumes: successful Windows and Ubuntu native/parity reports for the same commit.
- Produces: required `TypeScript 7 Native` job and aggregate root `pnpm ci` coverage of toolchain contract, stable typecheck, native typecheck, and declaration parity.

- [ ] **Step 1: Flip the contract from report-only to required**

Replace the CI assertion added in Task 5 with:

```js
test("CI requires the native shadow without making it the default compiler", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /^  typescript-native-shadow:\r?$/m);
  assert.match(workflow, /^    name: TypeScript 7 Native\r?$/m);
  assert.doesNotMatch(workflow, /^    continue-on-error: true\r?$/m);
  assert.equal(readJson("package.json").devDependencies.typescript, "catalog:");
  assert.equal(readJson("package.json").devDependencies["@typescript/native"], "catalog:");
});
```

Run `corepack pnpm test:toolchain`; expect failure until the workflow job is promoted.

- [ ] **Step 2: Promote the job and aggregate command**

In `.github/workflows/ci.yml`:

```yaml
typescript-native-shadow:
  name: TypeScript 7 Native
  runs-on: ubuntu-latest
  timeout-minutes: 12
```

Remove only `continue-on-error: true`; keep the job independent and parallel.

Set root `ci` to:

```json
{
  "scripts": {
    "ci": "pnpm audit --audit-level moderate && pnpm test:toolchain && pnpm lint && pnpm typecheck && pnpm typecheck:native:ci && pnpm typecheck:declarations && pnpm test:coverage && pnpm build"
  }
}
```

- [ ] **Step 3: Run the complete compiler gate locally**

```powershell
corepack pnpm test:toolchain
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm typecheck:native:ci
corepack pnpm typecheck:declarations
```

Expected: every command exits `0`; package scripts still use `tsc6`; only the native runner invokes bare `tsc`.

- [ ] **Step 4: Commit promotion separately and verify the required CI result**

```powershell
git add .github/workflows/ci.yml package.json scripts/quality/typescript-toolchain-contract.test.mjs
git commit -m "ci(typescript): require native compiler parity"
git push
```

Expected: `TypeScript 7 Native` is no longer neutralized by `continue-on-error`; the workflow fails if native typecheck or declaration parity regresses.

---

### Task 7: Document operation, run full closure, and refresh the repository graph

**Files:**

- Create: `docs/operations/typescript-toolchain.md`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`
- Modify: `graphify-out/.graphify_root`
- Test: all toolchain, repository, and build gates listed below

**Interfaces:**

- Consumes: completed TS6 alignment, required native shadow, parity reports, local/CI timings, and rollback commands.
- Produces: operator-facing runbook, verified full repository closure, and current graph artifacts.

- [ ] **Step 1: Write the operating runbook with the final measured values**

Create `docs/operations/typescript-toolchain.md` with these sections and exact policies:

```markdown
# TypeScript Toolchain

## Ownership Model

- `typescript` is the API-compatible TypeScript 6 package and reports version 6.0.3.
- `@typescript/native` is TypeScript 7.0.2 and is invoked only by root quality scripts.
- Package scripts use `tsc6`; bare `tsc` outside `scripts/quality/typescript-native-runner.mjs` is a contract violation.

## Commands

| Command                       | Purpose                                                     | Blocking           |
| ----------------------------- | ----------------------------------------------------------- | ------------------ |
| `pnpm typecheck`              | Stable TS6 repository typecheck                             | Yes                |
| `pnpm typecheck:native`       | Local TS7 shadow with two checker workers                   | Yes before handoff |
| `pnpm typecheck:native:ci`    | CI-safe TS7 shadow with one checker worker                  | Yes in CI          |
| `pnpm typecheck:declarations` | Exact TS6/TS7 declaration parity for DB/types/UI            | Yes                |
| `pnpm test:toolchain`         | Version, catalog, script, CSS, and workflow drift contracts | Yes                |

## Side-Effect Imports

`noUncheckedSideEffectImports` is explicit. Every relative CSS side-effect import must have both the real stylesheet and an exact `<basename>.d.css.ts` companion. Wildcard CSS module declarations are not permitted because they hide misspelled paths.

## Compiler API Consumers

The mobile theme contract, web route contract, and voice-provider bundle contract intentionally import the TS6 `typescript` API. TS7.0 has no programmatic API and must not be substituted for these tests.

## Reports

Native and declaration reports are written under `artifacts/typescript/`, ignored by git, and retained by CI for 14 days. Record the final Windows and Ubuntu timings from the implementation run here; use them as the regression baseline for future compiler changes.

## Dependency Declaration Audit

`skipLibCheck` remains enabled for production checks. The migration audit found third-party declaration failures when disabling it in the web and mobile projects; treat that command as informational until the owning Auth.js, Expo, React Navigation, and LiveKit packages publish compatible declarations. DB, types, and UI pass with dependency checking enabled.

## Rollback

Revert the CI-promotion commit first to make native parity report-only. If the stable migration itself must be reverted, revert the TS6 alignment commit and its lockfile together. Never change only `pnpm-lock.yaml`, never point `typescript` at TS7, and never bypass the TS6 API consumers with peer overrides.

## Full TS7 Promotion Gate

A future plan may make TS7 the default only after TypeScript 7.1 exposes a stable API, typescript-eslint officially supports TypeScript 7, Next.js editor-plugin behavior is verified, `ts-node` consumers are migrated, and all current compiler-API tests have an approved replacement.
```

Replace the timing sentence with the actual p50 timings from three repeated stable and native runs on the implementation machine and the successful Ubuntu CI report. Do not estimate or copy the earlier exploratory single-run numbers.

- [ ] **Step 2: Run focused API, style, stable, native, declaration, test, and build gates**

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test:toolchain
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts scripts/mobile-redesign-theme-contract.test.ts
corepack pnpm --filter @wizards/web exec node --test --import tsx src/app/api/v1/route-contract.test.ts src/components/providers/voice-provider-bundle.test.ts
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm typecheck:native:ci
corepack pnpm typecheck:declarations
corepack pnpm test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm build
```

Expected: all commands exit `0`. If an unrelated integration test requires external infrastructure, preserve the exact failure evidence and run the repository's documented service-backed command; do not weaken or skip compiler gates.

- [ ] **Step 3: Record repeatable performance evidence**

Run stable and native commands three times from a clean Turbo cache boundary, recording milliseconds without changing compiler flags:

```powershell
1..3 | ForEach-Object { Measure-Command { corepack pnpm typecheck --force } }
1..3 | ForEach-Object { Measure-Command { corepack pnpm typecheck:native:ci } }
```

Record median values in `docs/operations/typescript-toolchain.md` together with the Ubuntu artifact values. Performance is accepted only if correctness/parity stays green; there is no speed-based diagnostic waiver.

- [ ] **Step 4: Format, scan, and refresh Graphify after all code changes**

```powershell
corepack pnpm exec prettier --write pnpm-workspace.yaml package.json apps/web/package.json apps/mobile/package.json packages/db/package.json packages/types/package.json packages/ui/package.json tsconfig.base.json apps/web/tsconfig.json apps/mobile/tsconfig.json scripts/quality/*.mjs docs/operations/typescript-toolchain.md .github/workflows/ci.yml
graphify update .
git diff --check
git status --short
```

Expected: formatting succeeds, Graphify reports the current branch commit/content, diff check is clean, and status contains only intended implementation/runbook/graph changes.

- [ ] **Step 5: Commit documentation and graph closure**

```powershell
git add docs/operations/typescript-toolchain.md graphify-out
git commit -m "docs(typescript): add toolchain operations runbook"
```

- [ ] **Step 6: Perform final branch review without merging or changing UAT**

```powershell
git log --oneline origin/uat..HEAD
git diff --stat origin/uat...HEAD
git diff --check origin/uat...HEAD
git status --porcelain=v1
```

Expected commits remain independently reviewable in this order:

1. Strict UAT baseline repair.
2. TS6 API alignment and exact CSS contract.
3. Native typecheck runner.
4. Declaration parity gate.
5. Report-only CI pilot.
6. Required CI promotion.
7. Operations documentation and graph closure.

The worktree must be clean. Integration into `uat`, branch deletion, and worktree cleanup require a separate explicit publication instruction.

---

## Acceptance Criteria

- A frozen install resolves exactly one TypeScript 6 API lineage for all workspaces and one root-only TypeScript 7 native CLI lineage.
- `pnpm exec tsc6 --version` prints `Version 6.0.3`; `pnpm exec tsc --version` prints `Version 7.0.2`; importing `typescript` reports `6.0.3`.
- All stable package scripts call `tsc6`; bare `tsc` is isolated to the native runner and declaration parity script.
- Existing ESLint, `ts-node`, Next.js plugin, Expo, and compiler-API contract paths remain on TS6 and pass.
- Side-effect imports are explicitly checked and `globals.css` has an exact declaration without a wildcard escape hatch.
- Stable TS6 typecheck, native TS7 typecheck, and DB/types/UI declaration parity pass on Windows and Ubuntu.
- Native CI evidence is collected in report-only mode before the job is promoted to required.
- TypeScript 7 is not the default editor, API, build, or package compiler at the end of this plan.
- UAT's pre-existing strict-index failure is fixed independently and the final branch passes lint, typecheck, tests, mobile component tests, and build.
- Generated `tsconfig.tsbuildinfo` is no longer tracked; local reports remain ignored.
- Runbook, rollback order, evidence retention, and future full-TS7 gates are documented.
- Graphify outputs are refreshed after implementation, and the isolated worktree ends clean.

## Explicitly Out of Scope

- Node 24, pnpm 11, Next.js 16, Prisma 6/7, Expo 57, Zod 4, Tailwind 4, Tauri, Rust, or runtime dependency upgrades.
- Replacing `ts-node`, ESLint, or the three TypeScript compiler-API tests.
- Enabling `skipLibCheck: false` as a blocking repository setting while upstream declarations remain incompatible.
- Making TypeScript 7 the default compiler/API/editor package.
- Merging into `uat`, pushing `uat`, deleting the feature branch, or removing the worktree.
