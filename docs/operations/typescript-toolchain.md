# TypeScript Toolchain

## Ownership Model

- TypeScript 7.0.2 is the authoritative CLI compiler for workspace build, typecheck,
  lint-as-typecheck, and watch scripts.
- The root-only `@typescript/native` package provides the TypeScript 7 `tsc` binary.
- The dependency name `typescript` remains the API-compatible TypeScript 6 package and reports
  version 6.0.3.
- ESLint, `ts-node`, Next.js tooling, editors, and tests importing the compiler API remain on
  TypeScript 6 until the TypeScript 7 API and ecosystem migration is complete.
- Workspace scripts invoke `scripts/quality/typescript-project-runner.mjs`; direct package-level
  `tsc`, `tsc6`, and compiler version declarations are contract violations.
- The default pnpm catalog in `pnpm-workspace.yaml` owns both exact compiler identities.

## Commands

| Command                       | Purpose                                                       | Blocking           |
| ----------------------------- | ------------------------------------------------------------- | ------------------ |
| `pnpm typecheck`              | Authoritative TS7 workspace typecheck through Turbo           | Yes                |
| `pnpm typecheck:main`         | Aggregate TS7 evidence with two checker workers               | Yes before handoff |
| `pnpm typecheck:main:ci`      | CI-safe aggregate TS7 evidence with one checker worker        | Yes in CI          |
| `pnpm typecheck:compat`       | Aggregate TS6 compatibility and rollback evidence             | Yes                |
| `pnpm typecheck:declarations` | Exact TS6/TS7 declaration parity for DB, types, and UI        | Yes                |
| `pnpm test:toolchain`         | Version, ownership, runner, CSS, and workflow drift contracts | Yes                |
| `pnpm run ci`                 | Full security, quality, compiler, coverage, and build chain   | Yes before handoff |

Run these commands through pnpm. Compiler runners require `npm_execpath`, use `process.execPath`,
and never construct a shell command from user-controlled input.

## Compiler Runners

`scripts/quality/typescript-project-runner.mjs` accepts allowlisted project and mode identifiers.
It maps DB, types, UI, web, and mobile to exact tsconfig paths and invokes only TypeScript 7.0.2.
Build, check, and watch modes reject arbitrary paths, modes, checker counts, and compiler flags.

`scripts/quality/typescript-typecheck-runner.mjs` covers the same five-project inventory in two
modes:

- `main`: TypeScript 7.0.2, bounded checker workers, `main-typecheck.json`.
- `compat`: TypeScript 6.0.3, `compatibility-typecheck.json`.

Both aggregate modes generate Prisma first, disable incremental output, record every project exit
code, and return failure when any project fails.

## Side-Effect Imports

`noUncheckedSideEffectImports` is explicit. Every relative CSS side-effect import must have both
the real stylesheet and an exact `<basename>.d.css.ts` companion. Wildcard CSS module declarations
are forbidden because they hide misspelled paths. Web arbitrary-extension support exists only for
the exact companion convention.

## Compiler API Consumers

These contracts intentionally import the TypeScript 6 `typescript` API:

- `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`
- `apps/web/src/app/api/v1/route-contract.test.ts`
- `apps/web/src/components/providers/voice-provider-bundle.test.ts`

TypeScript 7.0 has no supported programmatic API and must not replace TypeScript 6 for these tests.
DB seed and contributor sync also remain on `ts-node` with the TypeScript 6 API package. Mobile
`typescript-eslint` and the Next.js editor plugin remain compatibility consumers.

## Reports and CI Evidence

Main, compatibility, and declaration reports are written under `artifacts/typescript/`, ignored by
git, and retained by CI for 14 days. The independent `TypeScript Compiler Compatibility` job has no
dependency on `Verify`, so compiler evidence remains available when an unrelated repository gate
fails. The job is required and uploads reports with `if: always()`.

Historical shadow evidence:

- Report-only pilot: [CI run 29574035700](https://github.com/dogukanyazar8/wizards/actions/runs/29574035700),
  successful on commit `4ac70306`.
- Required TS7 shadow: [CI run 29574349114](https://github.com/dogukanyazar8/wizards/actions/runs/29574349114),
  successful on commit `42190c2a`.

## Performance Baseline

Measurements were captured on 2026-07-17 before CLI promotion. Windows used Node 24.14.0,
pnpm 10.33.2, Windows 11 Pro, and an AMD Ryzen 7 9800X3D. Stable runs used
`pnpm typecheck --force`; native runs used the former `pnpm typecheck:native:ci` command. Every
sample exited `0`.

| Environment | Gate                | Samples (ms)                | p50 / aggregate |
| ----------- | ------------------- | --------------------------- | --------------- |
| Windows     | TS6 compatibility   | 15,453; 7,521; 7,393        | 7,521 ms p50    |
| Windows     | TS7, one checker    | 9,777; 6,420; 6,298         | 6,420 ms p50    |
| Ubuntu CI   | TS7 project timings | 644; 928; 502; 5,234; 2,975 | 10,283 ms total |

Treat these values as regression baselines, not a compiler-only speed contest. Correctness and
declaration parity remain mandatory.

## Dependency Declaration Audit

`skipLibCheck` remains enabled for production checks. Disabling it previously exposed third-party
declaration failures in web and mobile, primarily from Auth.js, Expo, React Navigation, and
LiveKit. The command remains informational until upstream packages publish compatible
declarations. DB, types, and UI pass with dependency checking enabled.

## Troubleshooting

- If `tsc6` or TS7 `tsc` is missing, select Node 24.21.0, run
  `pnpm install --frozen-lockfile`, then run `pnpm test:toolchain`. Do not add a package-local
  compiler.
- Invoke the aggregate gate as `pnpm run ci`. Bare `pnpm ci` is pnpm's reserved, unimplemented
  command.
- Launch compiler runners only through package or root pnpm scripts. Direct Node invocation lacks
  the trusted pnpm path and must fail.
- If a project runner rejects arguments, use the exact manifest script. Do not pass a filesystem
  path or arbitrary compiler option.
- If main or compatibility typecheck fails, inspect its JSON report, reproduce the named project,
  and fix the source or shared config.
- If declaration parity fails, compare the named `.d.ts` outputs and add a stable public source
  annotation. Never add a permanent allowlist.
- If a CSS contract fails, restore the real asset and exact `<basename>.d.css.ts` companion. Never
  introduce `declare module "*.css"`.

## Rollback

1. Return workspace build, check, and watch scripts to `tsc6` while preserving compiler reports.
2. Restore the former required TS7 shadow command names if CI must temporarily stop treating TS7
   as authoritative.
3. Keep catalog entries, manifests, runner scripts, and `pnpm-lock.yaml` in one rollback change.

Never change only `pnpm-lock.yaml`, point the `typescript` dependency name at TS7, or bypass TS6 API
consumers with peer overrides.

## Full TS7 Removal Gate

Remove the TypeScript 6 package only after TypeScript exposes a stable programmatic API,
`typescript-eslint` officially supports that API, Next.js editor-plugin behavior is verified,
`ts-node` consumers are migrated, and all compiler-API tests have approved replacements. This is a
separate migration from the TypeScript 7 CLI promotion.
