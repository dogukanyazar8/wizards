# Outbox Worker Monitoring

Use this runbook to deploy and observe the dedicated outbox worker service in UAT before production.

## Railway Services

Railway config-as-code applies to one deployment at a time. Keep two Railway services pointed at the same repository:

- `whispr-web`: config path `/railway.toml`; start command disables the in-process worker with `WHISPR_OUTBOX_WORKER=false`.
- `whispr-outbox-worker`: config path `/railway.outbox-worker.toml`; start command runs `pnpm --filter @wizards/web start:outbox-worker`.

Only the web service runs `preDeployCommand = "pnpm --filter @wizards/db db:migrate:deploy"`. The worker service must not run migrations.

## Worker Env

Set only the variables the worker needs:

```env
DATABASE_URL=...
REDIS_URL=...
WHISPR_OUTBOX_BATCH_SIZE=25
WHISPR_OUTBOX_INTERVAL_MS=5000
WHISPR_OUTBOX_SHUTDOWN_TIMEOUT_MS=10000
```

Do not copy web-only secrets into the worker service unless a new outbox job type demonstrably needs them. `AUTH_SECRET`, `NEXTAUTH_SECRET`, `SOCKET_ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`, `UPLOADTHING_SECRET`, and LiveKit secrets are not required for the current outbox jobs.

## Log Signal

Search worker logs for:

```text
[outbox]
```

The second log argument is JSON with `type: "outbox_drain"`:

- `processedJobs`: jobs completed or attempted in the drain cycle.
- `oldestPendingAgeMs`: queue delay for the oldest available pending job.
- `failedJobCount`: retained failed jobs requiring investigation or retry exhaustion review.

## Healthy UAT Shape

- `oldestPendingAgeMs` should briefly rise under load and then return toward the worker interval.
- `processedJobs` should scale with `WHISPR_OUTBOX_BATCH_SIZE` and worker replica count.
- `failedJobCount` should stay flat during ordinary message and notification traffic.
- Web logs should not show in-process outbox drain logs after redeploying with `WHISPR_OUTBOX_WORKER=false`.

## UAT Smoke

1. Deploy `whispr-web` with `/railway.toml`.
2. Deploy `whispr-outbox-worker` with `/railway.outbox-worker.toml`.
3. Confirm the worker starts with `Whispr outbox worker started.`.
4. Open two accounts in the same server and keep both connected.
5. Send a channel mention, a thread reply, and a DM.
6. Confirm the recipient sees live socket notifications without refresh.
7. Search worker logs for `[outbox]` and confirm `processedJobs` increases.
8. Scale the worker service to 2 replicas, repeat the messages, and confirm each notification appears once.
9. Send SIGTERM or redeploy the worker while load is active; confirm shutdown waits up to `WHISPR_OUTBOX_SHUTDOWN_TIMEOUT_MS` for the current drain and no jobs stay delayed for the stale-processing window.

## Rollback

If the dedicated worker must be disabled, scale `whispr-outbox-worker` to zero and temporarily remove or override `WHISPR_OUTBOX_WORKER=false` on the web service. Treat that as a short-term rollback only, because fan-out then scales with web replica count again.
