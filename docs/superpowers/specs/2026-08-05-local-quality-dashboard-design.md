# Local Quality Dashboard Design

**Date:** 2026-08-05

**Status:** User-approved design, pending written-spec review

**Target branch:** `uat`

## Problem

Whispr has a safe, declarative local gate runner, but running the complete pre-push evidence set still requires several terminal commands and manual result tracking. The developer needs one local browser dashboard that can run approved suites sequentially or run one profile at a time, stream progress, and produce an honest summary without changing Git state or reaching deployment systems.

## Goals

- Start from one root command: `corepack pnpm quality:dashboard`.
- Run the approved safe suite sequentially: `Standard`, `CI`, `Mobile`, `Security`, `Desktop`.
- Run an explicitly confirmed full-acceptance suite: destructive local E2E reset/seed, full Chromium Playwright, then Android release APK build.
- Run any registered profile independently and rerun failed or blocked profiles.
- Show live logs, step/profile status, duration, exit code, exact redacted command, and next action.
- Preserve `scripts/quality/Invoke-LocalGate.ps1` and `scripts/quality/local-gate-profiles.json` as the command source of truth.
- Match Whispr web tokens, typography, shapes, semantic status colors, focus behavior, and responsive standards.
- Remain local-only, dependency-light, testable, and safe on Windows PowerShell.

## Non-goals

- No commit, push, branch, staging, hook installation, deployment, Railway, EAS, release publication, or remote CI trigger.
- No production, UAT, staging, or non-loopback database reset.
- No automatic Docker lifecycle management. Missing local services produce `BLOCKED` with setup guidance.
- No APK installation, emulator/device control, Metro startup, signing-key management, or real-device acceptance claim.
- No claim that local success proves GitHub Actions, deployment health, migrations, or device/visual acceptance.
- No arbitrary terminal, command editor, plugin system, scheduled execution, distributed worker, or multi-user mode.

## Chosen approach

Build a standalone Node 24 localhost application under `tools/local-quality-dashboard/`. Use Node built-ins for HTTP, process execution, filesystem access, event streaming, and tests. Use static HTML/CSS/JavaScript for the client. Do not add a frontend framework or runtime dependency.

This keeps the dashboard independent from Next.js environment, database, authentication, port, and build requirements. It also avoids Tauri packaging and a second desktop release surface.

## Source of truth and profile changes

The dashboard never stores executable strings. It requests a profile ID; the PowerShell runner resolves that ID through the existing registry and its executable/argument allowlist.

The existing runner gains backward-compatible capabilities:

- `Desktop` profile.
- `E2EFull` profile.
- Allowlisted logical `cargo` executable resolved without a shell.
- Explicit `-AllowDestructiveE2E` opt-in for `E2EFull`.
- Optional `-EventStreamPath` for append-only JSON Lines lifecycle events.
- Existing `Text`, `Json`, `-Plan`, `-DryRun`, and `-AllowMobileRelease` behavior remains unchanged.

`Desktop` performs source/native validation without building or signing an installer:

1. `pnpm --filter @wizards/desktop test`
2. `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check`
3. Existing `pnpm --filter @wizards/desktop lint:rust`
4. `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`

`E2EFull` is destructive and therefore separate:

1. `pnpm e2e:seed`
2. `pnpm e2e`

Before `E2EFull`, the runner requires:

- `E2E_TEST_PASSWORD` presence without exposing its value.
- Explicit `E2E_DATABASE_URL`; destructive execution never falls back to `DATABASE_URL`.
- PostgreSQL URL using loopback host only.
- Database name visibly dedicated to E2E, accepted only when it ends in `_e2e` or equals `whispr_e2e`/`wizards_e2e`.
- Loopback Redis from `REDIS_URL`.
- `-AllowDestructiveE2E`.

The server revalidates these conditions immediately before spawn. Existing application-level E2E guards remain a second safety boundary.

## Suite composition

### Safe all

Order is fixed and sequential:

1. `Standard`
2. `CI`
3. `Mobile`
4. `Security`
5. `Desktop`

A failed or blocked profile does not hide later independent profiles. The coordinator continues at profile boundaries. Within one profile, the canonical runner keeps its current fail-fast behavior and marks later steps `SKIP`.

`Fast`, narrow E2E profiles, and every safe-all member remain individually selectable. `Fast` is not duplicated inside Safe all because it validates staged index state rather than the broader worktree.

### Full acceptance

Order is fixed:

1. `E2EFull`
2. `MobileRelease`

The confirmation dialog shows sanitized `host:port/database`, states that data will be reset, describes managed Android build-root mutation, and requires typing the exact local database name. The server issues a short-lived, single-use confirmation capability bound to the selected target and suite. It revalidates the target after confirmation and before execution.

The capability expires after 60 seconds and is consumed by the first run-creation attempt, successful or not. A changed database target invalidates it.

If E2E fails, APK build remains independently useful and may continue only when the original confirmation covered both stages. Final reporting preserves the E2E failure. APK success never converts the overall run to pass.

## Architecture

### Server

The server binds only to `127.0.0.1`. Default port is `47832`; `--port <number>` overrides it and `--port 0` requests an operating-system-assigned port. Startup fails with an actionable message if a fixed requested port is occupied. It prints and opens the exact URL unless `--no-open` is supplied.

Responsibilities:

- Serve fixed static assets with explicit MIME types.
- Load and validate the profile registry.
- Expose a read-only catalog with descriptions, impact, prerequisites, and current readiness.
- Enforce one active run across the process.
- For test execution, spawn only the canonical PowerShell runner with `shell: false`; the optional browser opener uses a fixed platform command with no browser-supplied arguments.
- Stream logs and structured events to the browser.
- Cancel only the known child process tree.
- Persist bounded, redacted run evidence.

### Run coordinator

The coordinator is a state machine:

`NOT_RUN -> QUEUED -> RUNNING -> PASS | FAIL | BLOCKED | SKIP | CANCELLED`

Only valid transitions are accepted. Each run and profile receives an immutable generated ID. Server state is authoritative; the browser cannot set status, command, path, exit code, or result.

### Runner event bridge

PowerShell child output remains normal text so command logs stream naturally. `-EventStreamPath` writes metadata events before and after preconditions, steps, and profile completion. The path must resolve inside the dashboard-owned runtime directory; traversal, symlink escape, alternate data streams, and arbitrary absolute paths are rejected.

Event types are versioned and bounded:

- `profile.started`
- `precondition.completed`
- `step.started`
- `step.completed`
- `profile.completed`

Every JSONL record includes schema version, run/profile/step identity, monotonic sequence, timestamp, status, duration, exit code, redacted command, and next action where applicable. Raw child output never enters JSONL. The Node process sends both structured events and redacted log lines to the client through Server-Sent Events.

### HTTP contract

- `GET /api/bootstrap`: catalog, readiness, active run, recent summaries, anti-CSRF token.
- `POST /api/runs`: start one profile or an approved suite.
- `GET /api/runs/:id/events`: Server-Sent Events stream with replay from `Last-Event-ID`.
- `POST /api/runs/:id/cancel`: cancel active run.
- `POST /api/acceptance/confirm`: create short-lived full-acceptance capability after target-name confirmation.
- `GET /api/runs/:id/export.json`: redacted machine report.
- `GET /api/runs/:id/export.md`: redacted human report.

Unknown routes, methods, fields, suite IDs, profile IDs, and stale capabilities fail closed.

## Local security

- Loopback bind only; reject non-loopback Host headers.
- No CORS. Mutating requests require same-origin `Origin`, JSON content type, and a random per-process token in a custom header.
- Strict Content Security Policy; no inline script, inline style, remote asset, or dynamic code evaluation.
- `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, frame denial, and restrictive referrer policy.
- Child processes use executable plus argument array with `shell: false`.
- Browser input never reaches executable, arguments, working directory, environment names, or filesystem paths.
- Environment is inherited from the starting shell; dashboard does not read or display `.env` files.
- Logs redact secret-like keys, credential-bearing URLs, authorization headers, tokens, private-key blocks, and exact values of sensitive inherited environment variables.
- Log lines, event fields, request bodies, and stored files have size limits.
- Cancellation targets only the active child tree: Windows uses the known PID tree; POSIX uses the owned process group.
- Dashboard never kills unrelated Node, PowerShell, Java, Gradle, Cargo, browser, Docker, or application processes.

## Persistence

Evidence is written only under ignored `artifacts/local-quality-dashboard/<run-id>/`:

- `result.json`
- `summary.md`
- `events.jsonl`
- `run.log`

Writes use temporary files plus atomic rename for final reports. Individual log files are capped; truncation is recorded visibly. The UI lists the latest 30 summaries but performs no automatic deletion. Interrupted runs are recovered as `CANCELLED` with an explanatory next action on the next startup.

## Dashboard experience

### Layout

- Header: Whispr identity, local-only badge, theme control, dependency readiness.
- Summary strip: total, passed, failed, blocked, remaining, elapsed time.
- Primary actions: `Güvenli Tümünü Çalıştır`, `Tam Kabul Testleri`, `Başarısızları Yeniden Çalıştır`, `Durdur`.
- Profile grid: impact, prerequisites, steps, current status, duration, last result, individual run button.
- Live log panel: profile/step filters, follow-tail toggle, copy redacted output, bounded rendering.
- Completion panel: honest aggregate verdict, remaining/blocked work, next actions, JSON/Markdown export.

### Design system

- Reuse tracked `.design-sync/whispr.css` for canonical tokens and utilities. Serve a runtime copy with its external Google Fonts `@import` removed so the dashboard makes no asset request outside loopback.
- Dashboard CSS contains only dashboard layout/component rules and uses Whispr token names through `hsl(var(--token))`.
- Plus Jakarta Sans body, Space Grotesk headings, system fallbacks when offline.
- `rounded-2xl` cards/controls, rounded status pills, `gap-3`/`gap-4`, `p-4` card rhythm.
- `--success`, `--warning`, `--danger`, `--primary`, `--surface-*`, `--border`, and `--ring` semantic tokens.
- System/light/dark selection using supported Whispr HTML theme classes; saved locally in browser storage.
- Responsive one-column mobile, two-column tablet, dense desktop layout.
- Keyboard-complete controls, visible focus ring, focus-trapped confirmation dialog, semantic headings, labelled progress, and `aria-live` status announcements.
- Motion respects `prefers-reduced-motion`; status remains understandable without color or animation.

## Error handling

- Startup configuration or registry errors stop the server before listening.
- Missing tools, files, environment variables, or local services produce `BLOCKED`, never generic failure.
- Command non-zero exit produces `FAIL` with original exit code and a safe next action.
- Event corruption stops the affected profile and produces an internal contract failure; human output is retained for diagnosis.
- Browser disconnect does not cancel work. SSE reconnect replays buffered events.
- Graceful server shutdown cancels the owned child tree. After an ungraceful crash, startup marks the run `CANCELLED` and reports its recorded PID for manual inspection; it never kills that PID automatically because PID reuse could target an unrelated process.
- Report persistence failure does not rewrite test outcome; UI shows evidence-persistence warning separately.

## Verification strategy

### PowerShell and registry contracts

- Existing profiles and output modes remain byte/shape compatible where already covered.
- `Desktop` plan contains only approved commands.
- `E2EFull` is blocked without opt-in, explicit E2E URL, dedicated database name, or loopback services.
- Event path escape attempts are rejected.
- JSONL sequence and lifecycle are deterministic for pass, fail, blocked, and plan modes.

### Node unit/integration tests

- Catalog validation and unknown-profile rejection.
- State transition rules and single-run lock.
- Sequential continuation across profile failures.
- Process argument safety and no-shell contract.
- Token, Origin, Host, content-type, request-size, path traversal, and capability-expiry guards.
- Secret/URL/private-key redaction.
- SSE replay, slow-client bounds, cancellation, interrupted-run recovery, and atomic report persistence.
- Export status and aggregate verdict correctness.

### Browser tests

Use existing Playwright tooling against an injected fake runner so dashboard tests never execute real repository gates or reset data.

- Safe-all start and sequential progress.
- Individual profile and failed-only rerun.
- Full-acceptance confirmation and stale-capability rejection.
- Live logs, filters, cancellation, completion, and exports.
- Keyboard navigation, dialog focus restoration, accessible names, live regions, reduced motion, mobile/desktop layouts, and light/dark theme smoke coverage.

### Final local verification

Run focused dashboard/toolchain tests first, then relevant lint/typecheck/format checks, then `graphify update .`. Do not execute destructive `E2EFull` or `MobileRelease` as part of automated dashboard verification; validate those with plan/precondition/fake-runner tests unless the user separately authorizes real execution.

## Delivery boundaries

Implementation changes remain unstaged and uncommitted unless the user explicitly requests Git actions. Completion report separates dashboard tests, broader local gates, destructive acceptance runs, remote CI, deployment, and device acceptance.
