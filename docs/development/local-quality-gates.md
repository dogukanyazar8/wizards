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

## Local quality dashboard

Start the browser dashboard from the repository root:

```powershell
corepack pnpm quality:dashboard
```

The server listens only on `http://127.0.0.1:47832` and opens that address in the default browser. Use `Ctrl+C` in the original terminal to stop it. It accepts only fixed profile identifiers from the same declarative registry as the PowerShell runner; browser input never becomes a command, argument, executable, path, or environment value.

The main actions are:

- `Güvenli Tümünü Çalıştır`: runs `Standard`, `CI`, `Mobile`, `Security`, and `Desktop`, sequentially. A failed profile does not hide later profile results.
- Individual profile buttons: run one selected profile.
- `Başarısızları Yeniden Çalıştır`: reruns only `FAIL` and `BLOCKED` profiles from the current completed run.
- `Durdur`: cancels the active owned process tree and marks remaining work honestly.
- `Tam Kabul Testleri`: requires a dedicated loopback PostgreSQL database whose name ends in `_e2e`, the exact database name typed into the confirmation dialog, and a short-lived single-use capability. It then runs destructive `E2EFull` and build-only `MobileRelease` sequentially.

`E2EFull` can reset and seed only the explicitly confirmed local E2E database. `MobileRelease` can mutate the canonical managed Android build root but does not install an APK, launch Metro, or publish a release. These profiles never run through the safe-all button.

Live output and stored evidence are redacted before display and persistence. Run state, JSONL events, bounded logs, and JSON/Markdown exports are written under ignored `artifacts/local-quality-dashboard/`. Interrupted active runs are recovered as `CANCELLED` on the next start. The dashboard retains the latest 30 runs without deleting older evidence automatically.

Verify the dashboard implementation itself with:

```powershell
corepack pnpm test:quality-dashboard
corepack pnpm test:quality-dashboard:browser
```

The browser suite uses a deterministic test-only runner protected by both `NODE_ENV=test` and `WHISPR_QUALITY_DASHBOARD_TEST_MODE=1`; normal dashboard startup always delegates to the real PowerShell gate.

## Profiles

| Profile         | Commands                                                                                                                         | Purpose and prerequisites                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Fast`          | `git diff --cached --check`; `pnpm actionlint`; `pnpm test:toolchain`; staged Prettier; `node scripts/quality/staged-eslint.mjs` | Commit-safe staged validation. `pnpm actionlint` downloads checksum-verified actionlint `1.7.12` to ignored local cache, checks all workflow files, and disables runner-dependent Shellcheck/Pyflakes. Prettier and web ESLint read Git index content, not working-tree files. |
| `Standard`      | `pnpm lint`; `pnpm typecheck`; `pnpm format`; `pnpm test`                                                                        | Normal local quality pass from existing root scripts. `typecheck` may generate Prisma client artifacts; it does not migrate or reset a database.                                                                                                                               |
| `CI`            | `pnpm ci`                                                                                                                        | Existing root aggregate only. It is not a replica of GitHub Actions.                                                                                                                                                                                                           |
| `Mobile`        | Existing mobile `validate:env`, `test`, `test:components`, `release:check`, and `quality:check` scripts                          | Mobile source checks only; no Expo prebuild, Gradle, Metro, or APK generation.                                                                                                                                                                                                 |
| `Desktop`       | Desktop script tests; `cargo fmt`; Rust lint; locked Rust tests                                                                  | Desktop source and Rust checks; no installer build, signing, publish, or application launch.                                                                                                                                                                                   |
| `MobileRelease` | Canonical `apps/mobile/scripts/build-android-uat.ps1` with `-BuildType release -SkipInstall -SkipUninstall -NoStartMetro`        | Explicit `-AllowMobileRelease` build-only release APK flow. The canonical script owns Java, Android SDK, ADB, device, Google Sign-In, managed-root, and pnpm-layout validation.                                                                                                |
| `Security`      | `node scripts/quality/e2e-password-guard.mjs`                                                                                    | Portable source guard for E2E password fallback patterns.                                                                                                                                                                                                                      |
| `E2ESmoke`      | `pnpm e2e:smoke`                                                                                                                 | Requires `E2E_TEST_PASSWORD`, local loopback PostgreSQL from `E2E_DATABASE_URL` or `DATABASE_URL`, and local loopback Redis from `REDIS_URL`.                                                                                                                                  |
| `E2EApi`        | `pnpm e2e:api`                                                                                                                   | Same read-only prerequisites as `E2ESmoke`.                                                                                                                                                                                                                                    |
| `E2ERealtime`   | `pnpm e2e:realtime`                                                                                                              | Same read-only prerequisites as `E2ESmoke`.                                                                                                                                                                                                                                    |
| `E2EFull`       | `pnpm e2e:seed`; `pnpm e2e`                                                                                                      | Destructive only after `-AllowDestructiveE2E`; requires a reachable loopback `E2E_DATABASE_URL` whose database name ends in `_e2e`, explicit approval, and local Redis.                                                                                                        |

E2E prerequisite checks only inspect environment presence and open a short TCP connection to loopback services. They do not start Docker, seed data, migrate, reset, or delete anything. The runner never prints environment values, tokens, or private keys.

`MobileRelease` is deliberately not a default hook action and is blocked until `-AllowMobileRelease` is supplied. The canonical script may recover its managed dependency/build state, including its own package-manager work, so use that opt-in only when the managed UAT-root mutation is intended. The canonical script safely disables Sentry source-map upload when `SENTRY_AUTH_TOKEN` is absent; this wrapper does not override that behavior. An APK release remains a local build result, not a device acceptance result.

## Results and timing

Every profile step reports `PASS`, `FAIL`, `SKIP`, or `BLOCKED`, together with its command, duration, exit code, and next action.

- `PASS`: command ran and returned zero.
- `FAIL`: command ran and returned a non-zero exit code; later profile steps are `SKIP`.
- `BLOCKED`: a required file, executable, secret-presence check, or local service check failed before the affected command started.
- `SKIP`: no command ran because this was a plan or an earlier step failed.

Measured in this worktree on 2026-07-26, without clearing caches:

| Profile    | Evidence                                                                                                                            | Duration class |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `Fast`     | `git diff --cached --check` 26 ms; `test:toolchain` 5062 ms; staged Prettier 768 ms; staged ESLint 203 ms; 6059 ms summed gate time | Measured fast. |
| `Standard` | `lint` 11688 ms; `typecheck` 4915 ms; `format` 2934 ms; `test` 18905 ms; 38442 ms summed gate time                                  | Measured pass. |

`Fast` is a staged index guard, not a smaller substitute for `Standard`: it lint-checks staged web files with the staged flat config, but it does not typecheck or run the complete test suite.

## Hooks

Hooks are version-controlled in `.githooks/`, but installation is opt-in. Clone, dependency installation, and normal gate runs do not change Git configuration.

```powershell
# Install only for the active worktree.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Install-LocalGateHooks.ps1 -Action Install

# Remove only this worktree's .githooks setting.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality\Install-LocalGateHooks.ps1 -Action Uninstall
```

The installer only uses `git config --worktree core.hooksPath .githooks`. It refuses to change a non-`.githooks` active or worktree-specific hook path, and never falls back to `--local`. It also refuses to enable `extensions.worktreeConfig`: enabling that shared repository setting requires separate, explicit repository-owner approval.

`pre-commit` and `pre-push` run `Fast`. Both hooks locate the repository root with Git, invoke Windows PowerShell using quoted paths, and return the gate exit code, so a gate failure blocks the commit or push. They never build an APK, run full E2E, reset a database, deploy, or operate an emulator.

## Recommended use

- Daily edits: `Fast`.
- GitHub Actions changes: `pnpm actionlint`; this is the authoritative local actionlint command and matches CI actionlint `1.7.12` with Shellcheck and Pyflakes disabled.
- Commit: opt in to hooks; `pre-commit` runs `Fast` on staged content.
- Push: opt in to hooks; `pre-push` runs `Fast`. Run `Standard` when broader lint, typecheck, format, and test evidence is required.
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
