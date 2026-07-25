# Index-Accurate ESLint Design

## Goal

Prevent staged web lint regressions from reaching UAT CI while making intentional unused-value conventions explicit.

## Decisions

- Configure `@typescript-eslint/no-unused-vars` with the existing `args: "after-used"` behavior, underscore ignore patterns, and `ignoreRestSiblings: true`.
- Keep notification database fields separate from push-only text. The push lookup remains keyed by `userId`, because `skipDuplicates` means persisted notifications are not positionally equivalent to source payloads.
- Add a `staged-eslint.mjs` gate for staged `apps/web` lintable files. It materializes index files and the web flat-config inputs into a temporary child of the repository so ESLint resolves workspace dependencies while reading index content instead of working-tree content.
- Add the staged ESLint command to `Fast`; existing opt-in pre-commit and pre-push hooks already run that profile.

## Non-goals

- No new quality profile, Git configuration mutation, dependency change, or change to non-web package lint behavior.
- No claim that local checks prove remote CI, deployment, or runtime acceptance.

## Verification

- Unit tests cover ESLint rule options, index-versus-working-tree divergence, staged config behavior, unsupported files, empty staged sets, and command contract wiring.
- Run focused web lint, toolchain tests, Fast, Standard, and root lint after implementation.
