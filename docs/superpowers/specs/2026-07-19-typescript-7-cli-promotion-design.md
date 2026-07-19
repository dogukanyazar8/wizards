# Whispr TypeScript 7 CLI Promotion Design

## Goal

Make TypeScript 7.0.2 the authoritative CLI compiler for repository typecheck, package build,
lint-as-typecheck, and package watch commands while retaining TypeScript 6.0.3 only for compiler
API consumers, `typescript-eslint`, `ts-node`, Next.js tooling, and rollback evidence.

This is a hybrid promotion. It does not remove the TypeScript 6 compatibility package and does not
claim full TypeScript 7 ecosystem migration.

## Current State

- The pnpm catalog maps `typescript` to `@typescript/typescript6@6.0.2`, whose compiler and API
  report TypeScript 6.0.3.
- Root-only `@typescript/native` maps to TypeScript 7.0.2.
- Workspace `build`, `lint`, `typecheck`, and `dev` scripts invoke `tsc6` directly.
- TypeScript 7 already checks DB, types, UI, web, and mobile through a required CI shadow job.
- DB, types, and UI declaration output is compared exactly between TypeScript 6 and TypeScript 7.
- Three contract tests import the TypeScript compiler API, DB seed/sync use `ts-node`, mobile uses
  `typescript-eslint`, and web uses the Next.js TypeScript editor plugin. Those consumers remain on
  TypeScript 6.

## Scope Boundaries

### In scope

- Promote TypeScript 7 to the default CLI used by workspace build, lint-as-typecheck, typecheck,
  and watch scripts.
- Keep compiler selection root-owned and shell-injection-safe.
- Convert the former TS7 shadow into the main compiler gate.
- Add an independent required TypeScript 6 compatibility gate.
- Preserve exact TS6/TS7 declaration parity for DB, types, and UI.
- Update toolchain drift tests, CI evidence, reports, commands, and operations documentation.
- Preserve existing source behavior, public package APIs, and all user WIP.

### Out of scope

- Repointing the dependency name `typescript` to TypeScript 7.
- Removing `@typescript/typescript6` or `tsc6`.
- Migrating compiler API tests to an API that TypeScript 7.0 does not provide.
- Replacing `typescript-eslint`, `ts-node`, or the Next.js editor plugin.
- Dependency major upgrades unrelated to compiler promotion.
- Committing, pushing, or publishing changes.

## Considered Approaches

### A. Repoint `typescript` directly to TypeScript 7

Rejected. `typescript-eslint`, `ts-node`, Next.js tooling, and three repository tests import the
TypeScript programmatic API. TypeScript 7.0 has no supported API, so this would break known
consumers and remove the rollback boundary.

### B. Add `@typescript/native` to every workspace and call bare `tsc`

Rejected. It duplicates compiler ownership across manifests, makes version drift easier, and allows
package-local resolution to diverge. It also weakens the existing root-only security boundary.

### C. Root-owned compiler runners with a TS6 compatibility shadow

Selected. Workspace scripts call a root runner with allowlisted project and mode values. The runner
invokes the root TypeScript 7 binary through the trusted pnpm executable without a command shell.
An aggregate runner executes either TypeScript 7 main checks or TypeScript 6 compatibility checks
and writes distinct evidence reports.

## Architecture

### Project compiler runner

Create `scripts/quality/typescript-project-runner.mjs` as the only workspace-facing TypeScript 7
entry point.

It accepts only these allowlisted arguments:

- `--project=db|types|ui|web|mobile`
- `--mode=build|check|watch`
- `--checkers=1..4` where supported

Project names map internally to exact tsconfig paths. Callers cannot supply arbitrary paths or
compiler arguments.

Modes behave as follows:

- `check`: TypeScript 7 with `--noEmit --incremental false --pretty false`.
- `build`: TypeScript 7 project build with `--incremental false --pretty false` and normal emit.
- `watch`: TypeScript 7 watch with `--preserveWatchOutput` and inherited stdio.

The runner requires `npm_execpath`, launches pnpm via `process.execPath`, uses `shell: false`, asserts
compiler version `7.0.2`, and returns the compiler exit code unchanged.

### Aggregate typecheck runner

Replace the native-shadow-specific aggregate runner with
`scripts/quality/typescript-typecheck-runner.mjs`.

It supports:

- `--compiler=main`: TypeScript 7.0.2, supports bounded checker workers, writes
  `artifacts/typescript/main-typecheck.json`.
- `--compiler=compat`: TypeScript 6.0.3 through `tsc6`, writes
  `artifacts/typescript/compatibility-typecheck.json`.

Both modes generate Prisma first, cover exactly five projects, disable incremental output, record
per-project timings and exit codes, and fail if any project fails. Compatibility mode exists for
evidence and rollback; it is not the default workspace compiler.

### Workspace scripts

The package manifests use the root project runner:

- Web: `typecheck` uses TS7 `check`.
- Mobile: `lint` and `typecheck` use TS7 `check`; ESLint remains a separate `lint:hooks` command and
  continues resolving the TS6 API package.
- DB: `build` uses TS7 `build`; `lint` and `typecheck` use TS7 `check`; Prisma generation remains
  before compilation.
- Types and UI: `build`, `dev`, `lint`, and `typecheck` use TS7 modes.
- Compiler API tests and DB `ts-node` scripts continue importing/resolving `typescript` as TS6.

### Root commands

- `pnpm typecheck`: Prisma generation plus Turbo workspace typecheck, now authoritative TS7.
- `pnpm typecheck:main`: aggregate TS7 evidence with two checkers locally.
- `pnpm typecheck:main:ci`: aggregate TS7 evidence with one checker in CI.
- `pnpm typecheck:compat`: aggregate TS6 rollback evidence.
- `pnpm typecheck:declarations`: unchanged exact declaration parity comparison.
- `pnpm run ci`: toolchain, formatting, lint, authoritative TS7 typecheck, TS6 compatibility,
  declaration parity, coverage, and build.

Legacy `typecheck:native` aliases are removed after every repository and workflow reference is
migrated. This avoids two names for the same authoritative compiler.

## CI Design

The existing independent TypeScript job becomes `TypeScript Compiler Compatibility` and runs:

1. Frozen install under Node 24.18.0 and pnpm 11.15.0.
2. Prisma generation.
3. Toolchain contract tests.
4. Aggregate TypeScript 7 main typecheck.
5. Aggregate TypeScript 6 compatibility typecheck.
6. TS6/TS7 declaration parity.
7. Artifact upload with `if: always()` and 14-day retention.

The job remains required: no `continue-on-error`. Main repository `Verify` also runs the
authoritative TS7 workspace typecheck and package builds. A native-only diagnostic, crash, emit
difference, or missing report fails CI.

## Drift and Safety Contracts

Toolchain tests enforce:

- Exact catalog identities: TypeScript 6 compatibility and root TypeScript 7 main.
- Every TypeScript workspace consumes the shared TS6 API catalog.
- Workspace compile scripts use only the root TS7 project runner.
- Bare `tsc` appears only inside trusted root quality runners.
- Compiler API imports continue resolving TypeScript 6.0.3.
- Project inventory covers DB, types, UI, web, and mobile exactly once.
- Project names, modes, checker counts, and compiler identities reject unknown values.
- pnpm invocation requires `npm_execpath` and never uses a command shell.
- Relative CSS side-effect imports retain exact declaration companions.
- CI requires both the TS7 main and TS6 compatibility evidence paths.

## Error Handling

- Invalid runner arguments fail before spawning a compiler.
- Missing trusted pnpm context fails with an actionable message.
- Compiler version drift fails before project checks.
- Prisma generation failure stops DB-dependent checks.
- Aggregate checks continue across project compiler failures only long enough to produce a complete
  report, then return failure.
- Declaration differences remain hard failures; no permanent allowlist is introduced.
- Report upload remains `if: always()` so failed compiler evidence is retained.

## Verification

### Red-green contract cycle

1. Update toolchain tests to require TS7 workspace runners and a TS6 compatibility gate.
2. Run focused tests and observe failure against current `tsc6` scripts.
3. Add runner tests for allowlists, modes, compiler selection, and safe pnpm invocation; observe
   missing-module failures.
4. Implement minimal runners and manifest/workflow changes.
5. Run focused tests until green.

### Required local gates

Run under Node 24.18.0 with a frozen pnpm 11.15.0 install:

```powershell
corepack pnpm test:toolchain
corepack pnpm typecheck --force
corepack pnpm typecheck:main:ci
corepack pnpm typecheck:compat
corepack pnpm typecheck:declarations
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
corepack pnpm run ci
```

Compiler API contract tests, DB seed/sync smoke checks, web E2E, device acceptance, and desktop
native builds are reported separately when their external services or platform prerequisites are
not available.

## Acceptance Criteria

- TS7 is the compiler used by every workspace build, lint-as-typecheck, typecheck, and watch script.
- The `typescript` dependency name still resolves to the TS6 API compatibility package.
- All five projects pass authoritative TS7 and TS6 compatibility checks.
- DB, types, and UI have no missing, extra, or changed declarations.
- Compiler API tests, `typescript-eslint`, `ts-node`, and Next.js tooling remain functional on TS6.
- CI independently retains both compiler reports and fails on either compiler regression.
- Toolchain contract tests prevent package-local compiler drift and unsafe invocation.
- Full local CI passes or each environment-blocked check is reported with exact evidence.
- Existing user WIP remains unchanged outside compiler/toolchain files.
- Graphify is updated after code changes.

## Rollback

Rollback changes workspace scripts and root `typecheck` back to `tsc6` while retaining the new
runner reports for diagnosis. Catalog identities and lockfile move together. Never repoint only the
`typescript` dependency, edit only `pnpm-lock.yaml`, or bypass API consumers with peer overrides.

## Future Full TS7 Migration

Remove TS6 only after TypeScript exposes a stable programmatic API and the repository has migrated
compiler API tests, `typescript-eslint`, `ts-node`, Next.js editor behavior, and any dependency type
incompatibilities. That work requires a separate design and cannot be folded into this promotion.
