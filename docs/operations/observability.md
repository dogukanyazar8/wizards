# Observability Runbook

Whispr reports errors, traces, and uptime through Sentry (EU/DE data region) across all four
surfaces: the web server + outbox worker, the browser client, the mobile app, and the desktop
shell. Every surface is DSN-gated — an unset DSN makes the SDK a complete no-op, so nothing here
is required for tests, builds, or E2E to pass.

## Components

| Sentry project   | Platform          | Surface                                                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `whispr-server`  | Node.js           | `apps/web/instrument.ts` (web server process + outbox worker, same codebase, distinguished by `process` tag) |
| `whispr-web`     | Next.js / Browser | `apps/web/src/instrumentation-client.ts` (browser), `apps/web/src/instrumentation.ts` (RSC/edge fallback)    |
| `whispr-mobile`  | React Native      | `apps/mobile/src/observability/mobile-sentry.ts`                                                             |
| `whispr-desktop` | Rust              | `apps/desktop/src-tauri/src/lib.rs` (`run()`, build-time DSN)                                                |

- Organization slug: **`whispr-p0`** (not the generic `whispr` — verify this before writing any
  script or CI variable that references the org).
- Data region: **EU / Germany** (`*.ingest.de.sentry.io`, region API `https://de.sentry.io`).
  Runtime event ingestion resolves the region from the DSN automatically. Build-time source map
  upload does not — `next.config.ts` passes `sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io"`
  explicitly to `withSentryConfig`.
- Uptime monitors: `/ready` on production (`https://whispr.team/ready`) and UAT
  (`https://wizardsweb-uat.up.railway.app/ready`), 1-minute interval.
- Cron monitor: `outbox-worker-heartbeat` — the worker calls `Sentry.captureCheckIn` once on
  startup and hourly after (`apps/web/scripts/run-outbox-worker.ts`). Configure the monitor with a
  1-hour schedule, 15-minute grace period, failure threshold 1.

## Environment Variables and Kill Switch

| Variable                        | Surface                                            | Empty behavior                                                                                             |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                    | web server + outbox worker                         | Sentry fully disabled (no-op); `instrument.ts` logs `[observability] SENTRY_DSN not set; Sentry disabled.` |
| `NEXT_PUBLIC_SENTRY_DSN`        | browser                                            | Sentry disabled in the client bundle                                                                       |
| `SENTRY_TRACES_SAMPLE_RATE`     | server                                             | Defaults to `0.1`                                                                                          |
| `SENTRY_ORG`                    | build (source maps)                                | `whispr-p0`                                                                                                |
| `SENTRY_PROJECT`                | build (source maps)                                | Set per app: `whispr-web` for the Next.js build                                                            |
| `SENTRY_AUTH_TOKEN`             | build only — Railway deploy build, never GitHub CI | Source map upload silently skipped; build still succeeds                                                   |
| `SENTRY_URL`                    | build (source maps)                                | Defaults to `https://de.sentry.io` in `next.config.ts`                                                     |
| `EXPO_PUBLIC_WHISPR_SENTRY_DSN` | mobile                                             | Sentry disabled; `initMobileSentry` returns `false`                                                        |
| `WHISPR_DESKTOP_SENTRY_DSN`     | desktop, **build time only** (`option_env!`)       | `sentry::init` never called; guard is `None`                                                               |

`SENTRY_AUTH_TOKEN` is an organization auth token (`org:ci` scope). It is never committed and
never passed to the GitHub Actions `verify` job's build step — only to the Railway deployment
build (`turbo.json`'s `build` task env list includes it so Railway's Turbo build can see it) and
to EAS as a `Sensitive` environment variable scoped to `Preview` + `Production`.

## Browser Envelope Tunnel

`POST /monitoring` is a Node route handler, not a Sentry-generated external rewrite.
Keep `tunnel: "/monitoring"` in the browser SDK, but do not restore `tunnelRoute` in
`next.config.ts`: Next 16.3's external rewrite/httpxy path exceeds the response listener
budget when combined with Sentry HTTP instrumentation. Session middleware excludes this path.

The handler accepts only the HTTPS ingest host, public key and project in
`NEXT_PUBLIC_SENTRY_DSN`. `SENTRY_DSN` remains the separate server/worker project. Legacy
query parameters cannot choose the destination. The uncompressed envelope is forwarded
byte-for-byte; request cookies and authorization headers are not forwarded. Redirects are
not followed, and upstream bodies/cookies are not returned to the client.

Limits per process: 1 MiB per envelope, 16 KiB envelope header, 8 simultaneous uploads,
8 seconds for the entire upload/forward/response operation, and 64 KiB upstream response.
A dedicated IPv4 HTTPS keep-alive pool reuses connections without changing global DNS or
TLS verification. Existing browser error/trace telemetry needs no configuration change.
Compressed requests and envelopes exceeding these bounds are rejected (415/413).

Upstream rate-limit headers reach the SDK. Network failures return 502, upstream deadlines
504, stalled uploads 408, and concurrency exhaustion 503. Temporary failures include SDK
backoff headers. POSTs are not retried automatically because an envelope might already have
been accepted. Inspect `/monitoring` HTTP status codes when diagnosing delivery; a healthy
`/ready` endpoint does not prove Sentry ingestion. Missing/invalid client DSN fails closed
with 503. Do not silence process-wide listener warnings as a workaround.

Focused checks, from `apps/web`:

```sh
node --import tsx --test src/lib/observability/sentry-tunnel*.test.ts
```

## PII Policy — Layered Redaction

Sentry's `sendDefaultPii: false` is set on every SDK, and IP storage is disabled at the Sentry
project level (Settings → Security & Privacy). Beyond that, redaction happens in three
independent layers so no single missed spot leaks a secret:

1. **Primary — report-time redaction.** `apps/web/src/lib/logger.ts` exports `redactErrorForReport`,
   `redactText`, and `redactValue` (the same functions `formatErrorLog`/`formatWarningLog` already
   used for console output). `apps/web/src/lib/observability/register-sentry.ts` calls
   `redactErrorForReport(error)` before handing anything to `Sentry.captureException`. This is the
   bridge behind every `logError(...)` call in the codebase — no call site needs to know Sentry
   exists.
2. **Secondary — `beforeSend`.** Each SDK's `beforeSend` scrubs `event.message` and
   `event.exception.values[].value` for JWTs and long API-key-shaped secrets before the event
   leaves the process. `instrument.ts` and `apps/mobile/src/observability/mobile-sentry.ts` cannot
   import `logger.ts` (esbuild entry isolation / no shared web runtime), so they carry an inline
   copy of the same two regexes with a comment pointing back to the source of truth. If you change
   the patterns in `logger.ts`, update both copies.
3. **Last resort — Sentry UI Data Scrubbing.** Configured per project (Server-side Data Scrubbing,
   Default Scrubbers, Prevent Storing of IP Addresses). This is the safety net if 1 and 2 both miss
   something; it is not a substitute for either.

Desktop has no `beforeSend` — `sentry::init`'s `send_default_pii: false` plus UI scrubbing are the
only layers, since Rust panic messages rarely carry PII and the crate does not expose a
convenient event-mutation hook in the current wiring.

User context is limited to `userId` everywhere. Email, IP, and user-agent are never attached.

## Sampling

| Environment | Server trace rate | Client trace rate | Error rate     |
| ----------- | ----------------- | ----------------- | -------------- |
| Production  | `0.1`             | `0.05`            | `1.0` (always) |
| UAT         | `1.0`             | `1.0`             | `1.0` (always) |

`E2E_TEST_MODE=true` / `NEXT_PUBLIC_E2E_TEST_MODE=true` drop every event via `beforeSend`
regardless of sample rate.

## Alert Rules

Configured in Sentry (Settings → Alerts) once Görev 7 clickops is done:

- Issue alert, all 4 projects: new issue created, `environment=production` → notify chat channel.
- Metric alert, `whispr-server`: `failure_rate() > 1%` over 5 minutes → critical;
  `p95(transaction.duration) > 2s` over 10 minutes (`http.server` transactions) → warning.
- Crash-free alert, `whispr-mobile`: crash-free session rate `< 99.5%` over 1 hour → critical.
- Dashboard "Whispr SLO v0": error rate (server), p95 API latency, throughput, crash-free
  sessions (mobile), uptime, outbox cron status.

## Rollout Sequence

Production is **not yet enabled**. The gate is intentional:

1. UAT Railway variables set (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
   `SENTRY_TRACES_SAMPLE_RATE=1.0`, `SENTRY_ORG=whispr-p0`, `SENTRY_PROJECT=whispr-web`,
   `SENTRY_AUTH_TOKEN` sealed).
2. Deploy to UAT, observe error volume and quota for 48 hours (Sentry Stats projection).
3. Add the same variables to production with `SENTRY_TRACES_SAMPLE_RATE=0.1`, deploy.
4. Confirm the first production error reaches the alert channel.

**Rollback:** remove `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from the Railway environment and
redeploy. Every SDK returns to no-op; no code revert is needed.

## Known Quirks (read before touching this code)

- **`@sentry/nextjs`'s plain ESM `import` resolves a partial API surface.** Node's
  `cjs-module-lexer` static export detection only picks up ~29 of the ~198 exports on the CJS
  build when the package is `import`ed without going through Next's own webpack/turbopack
  Sentry plugin. `isInitialized`, `captureException`, and `captureCheckIn` are among the missing
  ones — they silently become `undefined` rather than throwing at import time, so the failure
  only surfaces as a runtime `TypeError` on first call. This affects `captureMessage` and `flush`
  too — `instrument.ts`, `register-sentry.ts`, `run-outbox-worker.ts`, and
  `scripts/send-sentry-test-event.ts` all use `createRequire(import.meta.url)` to
  force full CJS resolution instead. **Do not "simplify" these to a plain `import * as Sentry`** —
  files processed by Next's own build (`src/instrumentation.ts`, `src/instrumentation-client.ts`)
  are fine with plain imports; anything run standalone via `tsx` or bundled by the esbuild pipeline
  (`instrument.ts`, anything imported into `server.ts`/`run-outbox-worker.ts`) are not.
- **Cargo's incremental fingerprint does not track `option_env!` inputs.** Rebuilding
  `apps/desktop/src-tauri` locally with a changed `WHISPR_DESKTOP_SENTRY_DSN` but no source file
  change will report `Fresh whispr-desktop` and silently keep the old DSN (or lack of one) baked
  in. Run `cargo clean -p whispr-desktop` before rebuilding if you need to verify a DSN change
  locally. CI is unaffected — every CI build starts from a clean checkout.
- **Check the `.exe`, not the `.dll`, for desktop verification.** The crate's `crate-type` is
  `["staticlib", "cdylib", "rlib"]`. The `cdylib` output (`whispr_desktop_lib.dll`) is an unused
  side artifact on desktop; the real executable (`whispr-desktop.exe`) statically links the
  `rlib`. A byte-search for the DSN in the `.dll` will show nothing embedded even in a correct
  build — that is not a bug, check the `.exe` instead.
- **`@prisma/instrumentation`'s entire 5.x line pins `@opentelemetry/sdk-trace-base@^1.22`,
  and `@opentelemetry/core`'s 1.x line was never patched for GHSA-8988-4f7v-96qf** (a moderate
  W3C Baggage propagation DoS advisory; fixed only in `>=2.8.0`). `pnpm-workspace.yaml`
  `overrides` forces `@opentelemetry/core`, `@opentelemetry/resources`, and
  `@opentelemetry/sdk-trace-base` to the `^2.8.0` line so both Prisma's and Sentry's copies
  dedupe onto the patched version Sentry already ships. This was verified at runtime — a real
  `prisma.$queryRaw` through the active `PrismaInstrumentation` succeeds with the override in
  place. If `@prisma/instrumentation` is ever upgraded past 5.x and it adopts OTel 2.x natively,
  remove this override (it becomes redundant, not harmful, but keep the tree clean).

## Common Tasks

- **DSN rotation:** Sentry project settings → Client Keys → revoke + generate new key → update
  the environment variable in Railway/EAS/GitHub → redeploy. DSNs are not secrets (they are
  embeddable client keys) but rotate them if one is accidentally exposed somewhere unintended.
- **Quota exceeded:** lower `SENTRY_TRACES_SAMPLE_RATE` first; set a project-level issue
  rate-limit as a second lever.
- **Source maps missing:** check the Railway build logs for `sentry-cli` output; confirm
  `SENTRY_AUTH_TOKEN` has the `org:ci` scope and hasn't expired; confirm `SENTRY_URL` resolves to
  `https://de.sentry.io` (a token generated for the wrong region will fail silently against the
  US endpoint).
- **Testing locally with a real DSN:** `apps/web/.env` is git-ignored; set
  `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` there, then `pnpm --filter @wizards/web build && pnpm
--filter @wizards/web start` (the dev server via `next dev`/`tsx watch` never initializes
  Sentry — that is intentional, `instrument.ts` only runs through the `--import` production entry).
