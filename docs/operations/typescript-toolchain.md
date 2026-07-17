# TypeScript Toolchain

## Ownership Model

- `typescript` is the API-compatible TypeScript 6 package and reports version 6.0.3.
- `@typescript/native` is TypeScript 7.0.2 and is invoked only by root quality scripts.
- Package scripts use `tsc6`; bare `tsc` outside the root quality runners is a contract violation.
- ESLint, `ts-node`, Next.js tooling, editors, and tests importing the compiler API stay on the
  TypeScript 6 package.
- The default pnpm catalog in `pnpm-workspace.yaml` owns both exact compiler identities. Workspace
  manifests consume `catalog:` and must not declare independent TypeScript ranges.

## Commands

| Command                       | Purpose                                                     | Blocking           |
| ----------------------------- | ----------------------------------------------------------- | ------------------ |
| `pnpm typecheck`              | Stable TS6 repository typecheck                             | Yes                |
| `pnpm typecheck:native`       | Local TS7 shadow with two checker workers                   | Yes before handoff |
| `pnpm typecheck:native:ci`    | CI-safe TS7 shadow with one checker worker                  | Yes in CI          |
| `pnpm typecheck:declarations` | Exact TS6/TS7 declaration parity for DB/types/UI            | Yes                |
| `pnpm test:toolchain`         | Version, catalog, script, CSS, and workflow drift contracts | Yes                |

Run these commands through pnpm. The native and declaration runners intentionally require
`npm_execpath` and never construct a shell command from user-controlled input.

## Side-Effect Imports

`noUncheckedSideEffectImports` is explicit. Every relative CSS side-effect import must have both
the real stylesheet and an exact `<basename>.d.css.ts` companion. Wildcard CSS module declarations
are not permitted because they hide misspelled paths. Web arbitrary-extension support is enabled
only so TypeScript can resolve that exact companion convention.

## Compiler API Consumers

These contracts intentionally import the TypeScript 6 `typescript` API:

- `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`
- `apps/web/src/app/api/v1/route-contract.test.ts`
- `apps/web/src/components/providers/voice-provider-bundle.test.ts`

TypeScript 7.0 has no supported programmatic API and must not be substituted for these tests.

## Reports and CI Evidence

Native and declaration reports are written under `artifacts/typescript/`, ignored by git, and
retained by CI for 14 days. The independent `TypeScript 7 Native` job has no dependency on `Verify`,
so compiler evidence remains available when an unrelated repository gate fails.

- Report-only pilot: [CI run 29574035700](https://github.com/dogukanyazar8/wizards/actions/runs/29574035700),
  successful on commit `4ac70306`.
- Required gate: [CI run 29574349114](https://github.com/dogukanyazar8/wizards/actions/runs/29574349114),
  successful on commit `42190c2a`.
- The required Ubuntu report used TypeScript 7.0.2 with one checker. All five projects exited `0`;
  DB, types, and UI had no missing, extra, or changed declarations.

## Performance Baseline

Measurements were captured on 2026-07-17. Windows used Node 24.14.0, pnpm 10.33.2, Windows 11 Pro,
and an AMD Ryzen 7 9800X3D (8 cores, 16 logical processors). Stable runs used
`pnpm typecheck --force`; native runs used `pnpm typecheck:native:ci`. Every sample exited `0`.

| Environment | Gate                       | Samples (ms)                | p50 / aggregate |
| ----------- | -------------------------- | --------------------------- | --------------- |
| Windows     | Stable TS6                 | 15,453; 7,521; 7,393        | 7,521 ms p50    |
| Windows     | Native TS7, one checker    | 9,777; 6,420; 6,298         | 6,420 ms p50    |
| Ubuntu CI   | Native TS7 project timings | 644; 928; 502; 5,234; 2,975 | 10,283 ms total |

The Windows commands have different orchestration overhead: stable TS6 runs through Turbo while
the native runner performs a bounded project sequence. Treat these values as regression baselines,
not as a compiler-only speed contest. Correctness and declaration parity remain mandatory even if a
future compiler is faster.

## Dependency Declaration Audit

`skipLibCheck` remains enabled for production checks. The migration audit found third-party
declaration failures when disabling it in the web and mobile projects; treat that command as
informational until the owning Auth.js, Expo, React Navigation, and LiveKit packages publish
compatible declarations. DB, types, and UI pass with dependency checking enabled.

## Troubleshooting

- If `tsc6` or native `tsc` is missing, run `pnpm install --frozen-lockfile` and confirm both catalog
  entries with `pnpm test:toolchain`. Do not add a package-local compiler version.
- If the native runner rejects the invocation, launch it through `pnpm typecheck:native` or
  `pnpm typecheck:native:ci`; calling its Node file directly does not provide the trusted pnpm path.
- If native typecheck fails, use `artifacts/typescript/native-typecheck.json` to identify the owning
  tsconfig, reproduce that project with native `tsc`, and fix the source or shared config.
- If declaration parity fails, compare the named `.d.ts` outputs and add a stable public source
  annotation when inference exposes compiler-specific internals. Never add a permanent allowlist.
- If a CSS side-effect contract fails, verify the imported asset exists and add the exact
  `<basename>.d.css.ts` companion. Do not introduce `declare module "*.css"`.

## Rollback

1. Revert `42190c2a` first to return the native job to report-only mode while preserving evidence.
2. If native tooling itself must be removed, revert the pilot, parity, and runner commits in reverse
   dependency order before reverting the stable alignment.
3. Revert `fc60610a` to roll back TS6 alignment; its manifests, catalog, configs, and
   `pnpm-lock.yaml` must move together.

Never change only `pnpm-lock.yaml`, point the `typescript` dependency name at TS7, or bypass the TS6
API consumers with peer overrides.

## Full TS7 Promotion Gate

A future plan may make TS7 the default only after TypeScript 7.1 exposes a stable API,
typescript-eslint officially supports TypeScript 7, Next.js editor-plugin behavior is verified,
`ts-node` consumers are migrated, and all current compiler-API tests have an approved replacement.
