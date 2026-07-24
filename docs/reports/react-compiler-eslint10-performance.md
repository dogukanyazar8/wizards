# React Compiler + ESLint 10 performance report

Date: 2026-07-24
Scope: `apps/web` in the isolated UAT remediation worktree.

## Method

Each sample ran `pnpm build` from `apps/web`. The measured wall time includes Prisma client generation, Next production build, TypeScript validation, static generation, and the server bundle. Client output is every `*.js` file under `.next/static/chunks` after each successful build.

The baseline used the same checkout with `reactCompiler: false`. The final samples use the shipped `reactCompiler: true` configuration. These local timings are comparative only; they are not a device interaction benchmark.

## Results

| Sample | Compiler disabled | Compiler enabled |
| ------ | ----------------: | ---------------: |
| 1      |          24.304 s |         27.724 s |
| 2      |          25.466 s |         26.768 s |
| 3      |          26.101 s |         27.656 s |
| Median |          25.466 s |         27.656 s |

| Client JavaScript | Compiler disabled | Compiler enabled |             Delta |
| ----------------- | ----------------: | ---------------: | ----------------: |
| Files             |                73 |               77 |                +4 |
| Bytes             |        10,376,613 |       10,731,915 | +355,302 (+3.42%) |

The final build median is 2.190 s slower (+8.60%) in this local workspace. The React Compiler migration is accepted for correctness and compiler coverage, not as a demonstrated build-time or bundle-size improvement. Runtime interaction, CPU, memory, and battery effects require a representative authenticated device/E2E workload and are intentionally not claimed here.

## Verification status

- React Compiler diagnostics: 0.
- ESLint errors: 0.
- ESLint warnings: 0.
- Benchmark production builds: 3/3 successful; post-review Next production build and server bundle also passed.
- The Next workspace-root, deprecated middleware convention, and Prisma CommonJS wildcard build warnings were removed in the final configuration.

## ESLint ecosystem boundary

The latest `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-import` releases declare peer support through ESLint 9 only. They were not force-installed into the ESLint 10 migration, so the project does not carry an unsupported peer-dependency warning. The retained lint set is the ESLint 10-compatible Next, TypeScript, and React Hooks/Compiler rules.
