# Railway Cost Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production outbox worker and malware scanning without returning to an always-on `$40+` project, while preserving delivery, realtime, and attachment-security guarantees.

**Architecture:** Keep the modular monolith, but give each process one runtime role. Web serves HTTP and Socket.IO only; one lean worker process drains two isolated lanes and owns periodic maintenance; ClamAV is private and either proves scale-to-zero behavior or is replaced by a usage-priced scanner. UAT compute remains off except during explicit test windows.

**Tech Stack:** Next.js custom Node server, TypeScript, PostgreSQL, Prisma 7 PostgreSQL adapter, Redis/ioredis, Railway, ClamAV, Sentry, Node test runner, esbuild.

**Spec:** `docs/superpowers/plans/2026-08-19-railway-cost-optimization.md` — the Decision Record and acceptance thresholds below are the governing specification.

## Global Constraints

- Railway production and UAT stay stopped during Tasks 1-6.
- No attachment may become downloadable while its scan status is `PENDING` or `ERROR`.
- The web process must never run the outbox or disappearing-message schedulers.
- The worker remains a separate Railway service in production and UAT.
- PostgreSQL and Redis traffic must use Railway private networking.
- UAT compute must return to zero after every canary window.
- Existing unrelated worktree changes must not be staged or edited.
- No production start until every Task 7 go/no-go threshold passes.

## Decision Record

Observed billing period: 2026-07-19 to 2026-08-19.

- Total: `$24.48`; RAM: `$22.40` (`91.5%`). CPU was only `$0.21`.
- `whispr-web`: `$10.54`; combined prod/UAT billing average about `0.99 GB`.
- UAT ClamAV: `$6.64`; steady memory rose from about `1.01 GB` to `1.18 GB` after signatures loaded.
- UAT outbox worker: `$4.16`; idle median about `0.30 GB`.
- Deployment churn produced up to about `$3.70` of excess RAM cost. This is a metric-derived estimate, not an invoice line item.
- UAT worker generated 144 deploy attempts; the active deployment had no path filters.
- Current worker logs repeatedly emitted `missing 'error' handler on this Redis client`.
- Current web bootstrap statically imports both background workers. Disabling a worker with an environment variable does not remove its module graph from web memory.
- The outbox polls even when empty and performs queue metrics queries on each drain.
- Attachment scanning shares the serial queue with notifications; a 120-second fetch can block latency-sensitive jobs.

Cost consequence after adding production worker and ClamAV:

- Production with always-on ClamAV: expected floor about `$20-$25/month`.
- Production with sleeping or usage-priced scanning plus on-demand UAT: target `$12-$18/month`, dependent on scan volume.
- Production and UAT both always-on with both ClamAV instances: expected about `$40-$46/month`; rejected.

The plan therefore cannot promise a large saving while keeping ClamAV and UAT continuously running. ClamAV uptime policy is the primary cost decision.

---

### Task 1: Enforce process-role boundaries

**Files:**

- Create: `apps/web/src/lib/runtime/process-role.ts`
- Create: `apps/web/src/lib/runtime/process-role.test.ts`
- Modify: `apps/web/server.ts`
- Modify: `apps/web/scripts/run-outbox-worker.ts`
- Modify: `apps/web/src/lib/outbox/worker-infra-contract.test.ts`
- Modify: `railway.toml`
- Modify: `railway.outbox-worker.toml`

**Interfaces:**

- Produces: `readProcessRole(environment): "web" | "worker"`.
- Produces: web bootstrap with no outbox or disappearing-worker imports.
- Produces: worker bootstrap that owns outbox and disappearing-message schedulers.

- [ ] **Step 1: Write failing role and bundle-contract tests**

Add tests that require `WHISPR_PROCESS_ROLE` to be exactly `web` or `worker`, assert the web esbuild metafile excludes `src/lib/outbox/worker.ts` and `src/lib/dm/disappearing-worker.ts`, and assert the worker bundle includes both modules.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/runtime/process-role.test.ts src/lib/outbox/worker-infra-contract.test.ts
```

Expected: FAIL because `process-role.ts` does not exist and `server.ts` imports both workers.

- [ ] **Step 3: Implement explicit roles**

Implement strict role parsing:

```ts
export type WhisprProcessRole = "web" | "worker";

export function readProcessRole(environment: NodeJS.Dict<string> = process.env): WhisprProcessRole {
  const role = environment.WHISPR_PROCESS_ROLE?.trim();
  if (role === "web" || role === "worker") return role;
  throw new Error("WHISPR_PROCESS_ROLE must be web or worker.");
}
```

Remove `startOutboxWorker` and `startDisappearingMessageWorker` imports and calls from `apps/web/server.ts`. Start both schedulers from `apps/web/scripts/run-outbox-worker.ts`; stop both during `SIGINT` and `SIGTERM` shutdown.

Set exact start commands:

```toml
# railway.toml
startCommand = "WHISPR_PROCESS_ROLE=web WHISPR_OUTBOX_WORKER=false WHISPR_DISAPPEARING_WORKER=false pnpm --filter @wizards/web start"
```

```toml
# railway.outbox-worker.toml
startCommand = "WHISPR_PROCESS_ROLE=worker WHISPR_OUTBOX_WORKER=true WHISPR_DISAPPEARING_WORKER=true pnpm --filter @wizards/web start:outbox-worker"
```

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS; server bundle excludes both scheduler modules.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add apps/web/src/lib/runtime/process-role.ts apps/web/src/lib/runtime/process-role.test.ts apps/web/server.ts apps/web/scripts/run-outbox-worker.ts apps/web/src/lib/outbox/worker-infra-contract.test.ts railway.toml railway.outbox-worker.toml
git commit -m "refactor: isolate Railway process roles"
```

### Task 2: Remove idle Redis and observability noise

**Files:**

- Create: `apps/web/src/lib/redis.test.ts`
- Modify: `apps/web/src/lib/redis.ts`
- Modify: `apps/web/instrument.ts`
- Modify: `apps/web/src/next-config-sentry.test.ts`
- Modify: `packages/db/src/pool-options.ts`
- Modify: `packages/db/src/prisma.test.ts`

**Interfaces:**

- Produces: every Redis client receives one `error` listener before connection.
- Produces: worker Sentry transaction sampling defaults to `0`; errors and hourly check-ins remain enabled.
- Produces: role-aware database pool defaults: worker `max=2`, `idleTimeoutMillis=30_000`; web keeps measured-safe defaults unless explicitly overridden.

- [ ] **Step 1: Write failing Redis, Sentry, and pool tests**

Assert Redis client creation attaches exactly one error listener, repeated identical Redis failures are rate-limited, worker Sentry sampling defaults to `0`, and `readPrismaPoolOptions({ WHISPR_PROCESS_ROLE: "worker", ... })` returns pool max `2` and idle timeout `30_000`.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/redis.test.ts src/next-config-sentry.test.ts
pnpm.cmd --filter @wizards/db exec tsx --test src/prisma.test.ts
```

Expected: FAIL on missing Redis listener and absent role-aware defaults.

- [ ] **Step 3: Implement bounded Redis reporting**

Attach one `error` listener in `createRedisClient`. Log the first error immediately, then at most one identical role/error message per five minutes. Never include `REDIS_URL`, usernames, passwords, or socket credentials in logs.

- [ ] **Step 4: Implement role-aware Sentry and pool defaults**

Use `WHISPR_PROCESS_ROLE === "worker" ? 0 : 0.1` as the fallback for `SENTRY_TRACES_SAMPLE_RATE`. Keep `captureException`, `captureCheckIn`, Prisma error capture, and redaction unchanged. In `readPrismaPoolOptions`, use worker-only fallbacks without overriding explicit `DATABASE_POOL_MAX` or `DATABASE_IDLE_TIMEOUT_MS`.

- [ ] **Step 5: Run focused tests**

Run Step 2 commands. Expected: PASS.

- [ ] **Step 6: Commit only Task 2 files**

```powershell
git add apps/web/src/lib/redis.ts apps/web/src/lib/redis.test.ts apps/web/instrument.ts apps/web/src/next-config-sentry.test.ts packages/db/src/pool-options.ts packages/db/src/prisma.test.ts
git commit -m "perf: reduce idle worker overhead"
```

### Task 3: Wake the outbox after commit; retain a safe fallback

**Files:**

- Create: `apps/web/src/lib/outbox/wake-listener.ts`
- Create: `apps/web/src/lib/outbox/wake-listener.test.ts`
- Modify: `apps/web/src/lib/outbox/service.ts`
- Modify: `apps/web/src/lib/outbox/service.test.ts`
- Modify: `apps/web/src/lib/outbox/worker.ts`
- Modify: `apps/web/src/lib/outbox/worker.test.ts`

**Interfaces:**

- Produces: PostgreSQL channel name `whispr_outbox_ready`.
- Produces: `notifyOutboxReady(client)` executed inside the same transaction as job insertion; PostgreSQL delivers notification only after commit.
- Produces: `listenForOutboxWake({ onWake, connectionString })` with explicit shutdown.
- Produces: 60-second polling fallback and five-minute metrics cadence.

- [ ] **Step 1: Write failing notification and cadence tests**

Cover commit-safe notification, wake coalescing while a drain is active, reconnect after listener loss, 60-second fallback drain, shutdown cleanup, and queue metrics no more than once per five minutes while idle.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/outbox/service.test.ts src/lib/outbox/worker.test.ts src/lib/outbox/wake-listener.test.ts
```

Expected: FAIL because wake listener and cadence controls do not exist.

- [ ] **Step 3: Add transactional PostgreSQL notification**

Extend the enqueue client contract with the raw-query capability already exposed by Prisma transaction clients. After successful outbox upsert, execute:

```sql
SELECT pg_notify('whispr_outbox_ready', '')
```

Because this call runs in the caller's transaction, rollback suppresses the notification and commit releases it.

- [ ] **Step 4: Add one dedicated listener connection**

Use existing `pg` dependency. Create one `Client`, issue `LISTEN whispr_outbox_ready`, call `onWake`, reconnect with capped backoff after disconnect, attach `error` handlers, and close on worker shutdown. Do not create one listener per job lane.

- [ ] **Step 5: Reduce idle drains and metrics queries**

Change fallback interval from deployment value `30_000` to `60_000`. Wake immediately on notification. Keep only one drain in flight. Run `logOutboxDrainMetrics` when work was processed or five minutes elapsed, not on every empty drain.

- [ ] **Step 6: Run focused tests**

Run Step 2 command. Expected: PASS; notification wakes immediately; fallback survives lost notifications.

- [ ] **Step 7: Commit only Task 3 files**

```powershell
git add apps/web/src/lib/outbox/wake-listener.ts apps/web/src/lib/outbox/wake-listener.test.ts apps/web/src/lib/outbox/service.ts apps/web/src/lib/outbox/service.test.ts apps/web/src/lib/outbox/worker.ts apps/web/src/lib/outbox/worker.test.ts
git commit -m "perf: wake outbox after transaction commit"
```

### Task 4: Isolate malware scans from notification latency

**Files:**

- Modify: `apps/web/src/lib/outbox/service.ts`
- Modify: `apps/web/src/lib/outbox/service.test.ts`
- Modify: `apps/web/src/lib/outbox/worker.ts`
- Modify: `apps/web/src/lib/outbox/worker.test.ts`
- Modify: `apps/web/src/lib/attachments/scanner.ts`
- Modify: `apps/web/src/lib/attachments/scanner.test.ts`

**Interfaces:**

- Produces: `OutboxLane = "latency" | "slow"`.
- Produces: latency lane for notifications, analytics, and permission-cache revision.
- Produces: slow lane for attachment scan, campaign delivery, and storage cleanup.
- Produces: one process, two independent in-flight guards; slow-lane concurrency remains `1`.

- [ ] **Step 1: Write failing lane-order tests**

Create a blocked attachment scan and enqueue a notification behind it. Assert the notification finishes without waiting for scan completion. Assert two slow jobs never overlap. Assert a lease is renewed independently in each lane.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/outbox/service.test.ts src/lib/outbox/worker.test.ts src/lib/attachments/scanner.test.ts
```

Expected: FAIL because the current drain claims mixed jobs and processes them serially.

- [ ] **Step 3: Add lane-filtered claims**

Pass an allow-list of exact job types into `claimOutboxJobs`. Keep `FOR UPDATE SKIP LOCKED`, ordering, attempt count, lease fencing, and stale-job recovery unchanged. Never claim a job outside the requested lane.

- [ ] **Step 4: Run two guarded drains in one worker process**

Wake both lanes from the shared listener. Give each lane its own current-drain promise. Use batch size `25` for latency work and `1` for slow work. Preserve serial ordering inside each lane.

- [ ] **Step 5: Reduce scan timeout ceiling**

Set attachment fetch timeout default to `30_000 ms`; retain the explicit environment override and the `32 MiB` byte ceiling. A timed-out scan remains retryable and the attachment remains unavailable.

- [ ] **Step 6: Run focused tests**

Run Step 2 command. Expected: PASS; notification latency remains bounded while scan is blocked.

- [ ] **Step 7: Commit only Task 4 files**

```powershell
git add apps/web/src/lib/outbox/service.ts apps/web/src/lib/outbox/service.test.ts apps/web/src/lib/outbox/worker.ts apps/web/src/lib/outbox/worker.test.ts apps/web/src/lib/attachments/scanner.ts apps/web/src/lib/attachments/scanner.test.ts
git commit -m "perf: isolate slow outbox jobs"
```

### Task 5: Make scanner absence explicit and fail closed

**Files:**

- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/src/lib/env.test.ts`
- Modify: `apps/web/src/lib/health.ts`
- Modify: `apps/web/src/lib/health.test.ts`
- Modify: `apps/web/src/lib/attachments/upload-persistence.ts`
- Modify: `apps/web/src/lib/attachments/upload-persistence.test.ts`
- Modify: `apps/web/src/lib/messages/attachment-visibility.ts`
- Modify: `apps/web/src/lib/messages/attachment-visibility.test.ts`

**Interfaces:**

- Produces: `ATTACHMENT_SCANNING_ENABLED=true|false`.
- Produces: production worker startup requires `CLAMAV_HOST` when scanning is enabled.
- Produces: uploads rejected with service-unavailable behavior when scanning is disabled.
- Preserves: only `CLEAN` attachments are downloadable or rendered.

- [ ] **Step 1: Write failing scanner-readiness tests**

Cover invalid boolean values, missing `CLAMAV_HOST`, upload rejection while disabled, `PENDING` and `ERROR` visibility denial, and `CLEAN` visibility success.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/env.test.ts src/lib/health.test.ts src/lib/attachments/upload-persistence.test.ts src/lib/messages/attachment-visibility.test.ts
```

Expected: FAIL because scanner availability is implicit.

- [ ] **Step 3: Implement fail-closed configuration**

In production, worker startup fails when scanning is enabled but `CLAMAV_HOST` is absent. Web upload entry points return a safe `503`-class result when scanning is disabled. Existing pending records remain hidden; do not mark them clean during outage.

- [ ] **Step 4: Expose readiness without leaking network details**

Report only `attachmentScanning: "enabled" | "disabled"` in internal operational state. Do not expose `CLAMAV_HOST`, port, credentials, or stack traces.

- [ ] **Step 5: Run focused tests**

Run Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit only Task 5 files**

```powershell
git add apps/web/src/lib/env.ts apps/web/src/lib/env.test.ts apps/web/src/lib/health.ts apps/web/src/lib/health.test.ts apps/web/src/lib/attachments/upload-persistence.ts apps/web/src/lib/attachments/upload-persistence.test.ts apps/web/src/lib/messages/attachment-visibility.ts apps/web/src/lib/messages/attachment-visibility.test.ts
git commit -m "fix: fail closed when scanner unavailable"
```

### Task 6: Lock deployment scope and local verification

**Files:**

- Modify: `apps/web/src/lib/outbox/worker-infra-contract.test.ts`
- Modify: `apps/web/src/lib/deployment/railway-contract.test.ts`
- Modify: `railway.outbox-worker.toml`
- Create: `docs/operations/railway-cost-runbook.md`

**Interfaces:**

- Produces: worker path filters covering only web and shared packages required by its bundle.
- Produces: runbook with exact UAT start, test, stop, and cost-projection sequence.

- [ ] **Step 1: Add failing deployment-contract tests**

Assert worker config contains current `watchPatterns`, web disables both workers, worker sets role and both worker flags, neither service uses a public DB/Redis URL, and `NEXT_TELEMETRY_DISABLED=1` is documented as required Railway configuration.

- [ ] **Step 2: Run deployment-contract tests and confirm failure**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/outbox/worker-infra-contract.test.ts src/lib/deployment/railway-contract.test.ts
```

Expected: FAIL until every process-role and operations contract is represented.

- [ ] **Step 3: Complete config and runbook**

Document required worker values:

```text
WHISPR_PROCESS_ROLE=worker
WHISPR_OUTBOX_WORKER=true
WHISPR_DISAPPEARING_WORKER=true
WHISPR_OUTBOX_INTERVAL_MS=60000
DATABASE_POOL_MAX=2
DATABASE_IDLE_TIMEOUT_MS=30000
SENTRY_TRACES_SAMPLE_RATE=0
NEXT_TELEMETRY_DISABLED=1
ATTACHMENT_SCANNING_ENABLED=true
```

Document UAT as off-by-default. Include a final stop verification requiring zero active UAT deployments.

- [ ] **Step 4: Run focused and broad local gates**

```powershell
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/db test
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/web build
git diff --check
```

Expected: all commands PASS. If LiveKit environment validation blocks a local gate, supply `LIVEKIT_URL=ws://127.0.0.1:7880` and `NEXT_PUBLIC_LIVEKIT_URL=ws://127.0.0.1:7880` only for that process; do not edit env files.

- [ ] **Step 5: Commit only Task 6 files**

```powershell
git add apps/web/src/lib/outbox/worker-infra-contract.test.ts apps/web/src/lib/deployment/railway-contract.test.ts railway.outbox-worker.toml docs/operations/railway-cost-runbook.md
git commit -m "docs: define Railway cost gates"
```

### Task 7: Run a private UAT cost canary

**Files:**

- Record evidence in: `docs/operations/railway-cost-runbook.md`

**Interfaces:**

- Consumes: Tasks 1-6 verified build.
- Produces: measured go/no-go evidence; no public user access.

- [ ] **Step 1: Keep user traffic blocked**

Enable maintenance access control before starting compute. Do not attach a public domain to worker, Redis, PostgreSQL, or ClamAV. ClamAV uses private TCP only.

- [ ] **Step 2: Start dependencies for 20 minutes**

Start UAT PostgreSQL and Redis. Record memory, CPU, open connections, and outbound egress baseline.

- [ ] **Step 3: Start worker for 30 minutes**

Run an empty queue, then synthetic notification and disappearing-message jobs. Record worker RSS, queue age, DB query cadence, Redis log errors, notification latency, and egress.

- [ ] **Step 4: Start ClamAV for 60 minutes**

Run EICAR-safe test fixture handling and a clean test file. Record signature-load peak, steady RSS, scan latency, retry behavior, and OOM events.

- [ ] **Step 5: Test ClamAV sleep hypothesis**

Stop background signature-update traffic, leave ClamAV idle beyond Railway's sleep threshold, verify billed memory reaches zero, then submit a scan job and verify retry-driven wake-up succeeds. If either sleep or wake fails, classify sleeping ClamAV as FAIL; choose usage-priced scanning or accept always-on cost.

- [ ] **Step 6: Start maintenance-gated web for 60 minutes**

Run no-load HTTP, one authenticated message flow, one Socket.IO session, and one attachment flow. Record web RSS and p95 response latency. Push no new code during the measurement window.

- [ ] **Step 7: Apply go/no-go thresholds**

All must pass:

```text
UAT web idle RSS: p50 <= 650 MB; p95 <= 800 MB, deployment overlap excluded
Worker idle RSS: p50 <= 250 MB; p95 <= 350 MB
ClamAV steady RSS: <= 1.3 GB; no OOM during database load/reload
Worker idle egress projection: <= 20 MB/day
Redis missing-error-handler logs: 0
Empty-queue DB cadence: <= 2 queries/minute after listener established
Synthetic notification queue age p95: < 5 seconds
Blocked 30-second scan impact on notification latency: < 5 seconds
Unrelated mobile/docs-only commit: worker deployment SKIPPED
ClamAV sleep strategy: billed memory reaches zero after idle; retry wake succeeds
UAT outside window: 0 active compute deployments
```

- [ ] **Step 8: Stop all UAT compute**

Stop web, worker, ClamAV, Redis, and PostgreSQL. Verify active UAT deployments are zero. Preserve volumes.

- [ ] **Step 9: Calculate 24-hour projection**

Use measured GB-minutes, CPU-minutes, and egress. Reject release when projected project cost exceeds selected budget:

```text
Preferred scanner strategy: <= $18/month projected
Always-on production ClamAV strategy: <= $25/month projected
```

### Task 8: Add production worker and scanner safely

**Files:**

- Record deployment evidence in: `docs/operations/railway-cost-runbook.md`

**Interfaces:**

- Consumes: every Task 7 threshold marked PASS.
- Produces: production web plus separate worker; attachment security remains fail closed.

- [ ] **Step 1: Create production worker from `railway.outbox-worker.toml`**

Use production private `DATABASE_URL`, `REDIS_URL`, and `CLAMAV_HOST`. Do not copy UAT secrets. Set pool, Sentry, telemetry, process-role, and scanning values from Task 6.

- [ ] **Step 2: Create the selected production scanner**

If Task 7 proved Railway sleep and wake, deploy private ClamAV with controlled signature updates. If it failed, use a usage-priced scanner. Deploy always-on ClamAV only after explicitly accepting the roughly `$12/month` memory floor.

- [ ] **Step 3: Start dependencies before current web release**

Start scanner and worker first. Confirm worker readiness, scanner reachability, empty failed-job count, and no Redis handler warnings. This ordering is mandatory because current `railway.toml` disables in-process outbox work and current uploads enqueue mandatory scans.

- [ ] **Step 4: Deploy web under maintenance access control**

Verify `/ready`, login, message delivery, notification, disappearing-message sweep, clean attachment, infected test fixture quarantine, and retry after scanner interruption.

- [ ] **Step 5: Observe one full day before opening normal traffic**

Require zero failed outbox jobs, zero unscanned downloadable attachments, no OOM/restart loop, notification queue age p95 below five seconds, and cost projection within the selected threshold.

- [ ] **Step 6: Open normal traffic**

Remove maintenance access control only after Step 5 passes. Keep UAT compute stopped.

## Final Self-Review

- Spec coverage: process memory, deployment churn, Redis errors, idle polling, scan head-of-line blocking, ClamAV cost, UAT uptime, production ordering, and measurable cost thresholds each have an implementation and verification task.
- Placeholder scan: no deferred implementation markers or unspecified test steps remain.
- Type consistency: process roles, outbox lanes, listener lifecycle, pool settings, and scanner availability have one definition and explicit consumers.
