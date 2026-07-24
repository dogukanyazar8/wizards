# Local Quality Gates

`scripts/quality/Invoke-LocalGate.ps1` is the Windows-first local gate entrypoint. It reads the declarative profile registry in `scripts/quality/local-gate-profiles.json`, validates every requested step against its built-in command registry, and invokes external programs only as an executable plus an argument array. It does not evaluate shell command strings.

Run a no-execution plan first when you want to inspect scope and prerequisites:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile Fast -Plan
```

For automation, use one machine-readable JSON object without command logs on stdout:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Invoke-LocalGate.ps1 -Profile Fast -Plan -OutputFormat Json
```

The runner resolves `pnpm.cmd` first on Windows. If it is unavailable, it resolves `corepack.cmd` and supplies `pnpm` as its first argument. It preserves a failed child command's exit code, stops at that failed step, and exits explicitly with that code. Missing prerequisites produce `BLOCKED` without running the profile command and exit with code `2`.

## Profiles

| Profile         | Commands                                                                                                                  | Purpose and prerequisites                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Fast`          | `git diff --cached --check`; `pnpm test:toolchain`; `node scripts/quality/prettier-changed.mjs --staged`                  | Commit-safe staged validation. The formatter reads Git index blobs, not working-tree files.                                                                                     |
| `Standard`      | `pnpm lint`; `pnpm typecheck`; `pnpm format`; `pnpm test`                                                                 | Normal local quality pass from existing root scripts. `typecheck` may generate Prisma client artifacts; it does not migrate or reset a database.                                |
| `CI`            | `pnpm ci`                                                                                                                 | Existing root aggregate only. It is not a replica of GitHub Actions.                                                                                                            |
| `Mobile`        | Existing mobile `validate:env`, `test`, `test:components`, `release:check`, and `quality:check` scripts                   | Mobile source checks only; no Expo prebuild, Gradle, Metro, or APK generation.                                                                                                  |
| `MobileRelease` | Canonical `apps/mobile/scripts/build-android-uat.ps1` with `-BuildType release -SkipInstall -SkipUninstall -NoStartMetro` | Explicit `-AllowMobileRelease` build-only release APK flow. The canonical script owns Java, Android SDK, ADB, device, Google Sign-In, managed-root, and pnpm-layout validation. |
| `Security`      | `node scripts/quality/e2e-password-guard.mjs`                                                                             | Portable source guard for E2E password fallback patterns.                                                                                                                       |
| `E2ESmoke`      | `pnpm e2e:smoke`                                                                                                          | Requires `E2E_TEST_PASSWORD`, local loopback PostgreSQL from `E2E_DATABASE_URL` or `DATABASE_URL`, and local loopback Redis from `REDIS_URL`.                                   |
| `E2EApi`        | `pnpm e2e:api`                                                                                                            | Same read-only prerequisites as `E2ESmoke`.                                                                                                                                     |
| `E2ERealtime`   | `pnpm e2e:realtime`                                                                                                       | Same read-only prerequisites as `E2ESmoke`.                                                                                                                                     |

E2E prerequisite checks only inspect environment presence and open a short TCP connection to loopback services. They do not start Docker, seed data, migrate, reset, or delete anything. The runner never prints environment values, tokens, or private keys.

`MobileRelease` is deliberately not a default hook action and is blocked until `-AllowMobileRelease` is supplied. The canonical script may recover its managed dependency/build state, including its own package-manager work, so use that opt-in only when the managed UAT-root mutation is intended. The canonical script safely disables Sentry source-map upload when `SENTRY_AUTH_TOKEN` is absent; this wrapper does not override that behavior. An APK release remains a local build result, not a device acceptance result.

## Results and timing

Every profile step reports `PASS`, `FAIL`, `SKIP`, or `BLOCKED`, together with its command, duration, exit code, and next action.

- `PASS`: command ran and returned zero.
- `FAIL`: command ran and returned a non-zero exit code; later profile steps are `SKIP`.
- `BLOCKED`: a required file, executable, secret-presence check, or local service check failed before the affected command started.
- `SKIP`: no command ran because this was a plan or an earlier step failed.

Measured in this worktree on 2026-07-24, without clearing caches:

| Profile                   | Evidence                                                                                                      | Duration class            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Fast`                    | `git diff --cached --check` 27 ms; `test:toolchain` 2144 ms; staged Prettier 315 ms; 2486 ms summed gate time | Measured fast.            |
| `Standard` cold           | `lint` stopped with exit 2 after 3033 ms                                                                      | Full measurement blocked. |
| `Standard` immediate warm | `lint` stopped with exit 2 after 3064 ms                                                                      | Full measurement blocked. |

The Standard failure is current web lint infrastructure, not a local-gate wrapper failure: ESLint 10.7.0 loading `eslint-plugin-react@7.37.5` fails `react/display-name` because `contextOrFilename.getFilename` is absent. Until that dependency/config compatibility issue is resolved and Standard is measured end-to-end, `pre-push` intentionally uses `Fast`; this is not a claim that Standard would be slow.

## Hooks

Hooks are version-controlled in `.githooks/`, but installation is opt-in. Clone, dependency installation, and normal gate runs do not change Git configuration.

```powershell
# Install only for the active worktree.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Install-LocalGateHooks.ps1 -Action Install

# Remove only this worktree's .githooks setting.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Install-LocalGateHooks.ps1 -Action Uninstall
```

The installer only uses `git config --worktree core.hooksPath .githooks`. It refuses to change a non-`.githooks` active or worktree-specific hook path, and never falls back to `--local`. It also refuses to enable `extensions.worktreeConfig`: enabling that shared repository setting requires separate, explicit repository-owner approval.

`pre-commit` runs `Fast`. `pre-push` currently also runs `Fast` because the required Standard cold/warm measurement is blocked by the existing web lint failure. Both hooks locate the repository root with Git, invoke Windows PowerShell using quoted paths, and return the gate exit code, so a gate failure blocks the commit or push. They never build an APK, run full E2E, reset a database, deploy, or operate an emulator.

## Recommended use

- Daily edits: `Fast`.
- Commit: opt in to hooks; `pre-commit` runs `Fast` on staged content.
- Push: opt in to hooks; `pre-push` runs `Fast`. Run `Standard` explicitly after the current lint compatibility failure is resolved.
- Pull request: run local `Fast`/`Standard` as available, then rely on remote GitHub Actions for CI-only lanes.
- Mobile source work: run `Mobile` before requesting mobile UAT.
- Android release APK: explicitly run `MobileRelease` with `-AllowMobileRelease`; then install/test on a real device separately.
- Local E2E: start and validate required local services yourself, set `E2E_TEST_PASSWORD` without logging it, then select the narrow E2E profile.

## Local and remote boundaries

Local gate success does not prove GitHub Actions, gitleaks, Railway deployment, production health, database migration safety, or real-device UAT.

The current workflow also has controls outside the local `CI` profile, including:

- GitHub's `gitleaks` action and runner-specific setup/install behavior.
- Shared types/UI package checks, mobile visual Chromium installation, and the full mobile CI job sequence.
- TypeScript main/compatibility/declaration lanes and their uploaded compiler artifacts.
- Node 22 native compatibility, desktop operations/build/signing, and Rust audit/build lanes.
- E2E service containers, generated E2E passwords, database schema sync, browser installation, cross-browser, accessibility, visual, and scheduled/full E2E lanes.

`pnpm ci` remains useful local aggregate evidence, but it neither provisions those hosted/self-hosted services nor represents deployment or device/runtime acceptance.
