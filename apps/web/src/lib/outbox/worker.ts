import { logError } from "@/lib/logger";
import { cleanupOutboxJobs, drainOutboxJobs } from "@/lib/outbox/service";

const DEFAULT_OUTBOX_WORKER_BATCH_SIZE = 25;
const DEFAULT_OUTBOX_WORKER_INTERVAL_MS = 1_000;
const OUTBOX_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let workerTimer: ReturnType<typeof setInterval> | null = null;
let drainInFlight = false;
let lastCleanupAt = 0;

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function startOutboxWorker() {
  if (workerTimer || process.env.WHISPR_OUTBOX_WORKER === "false") {
    return;
  }

  const batchSize = readPositiveIntegerEnv(
    "WHISPR_OUTBOX_BATCH_SIZE",
    DEFAULT_OUTBOX_WORKER_BATCH_SIZE,
  );
  const intervalMs = readPositiveIntegerEnv(
    "WHISPR_OUTBOX_INTERVAL_MS",
    DEFAULT_OUTBOX_WORKER_INTERVAL_MS,
  );
  const workerId = `web-${process.pid}`;
  const drain = () => {
    if (drainInFlight) {
      return;
    }

    drainInFlight = true;
    void drainOutboxJobs({ limit: batchSize, workerId })
      .then(async () => {
        const now = Date.now();
        if (now - lastCleanupAt < OUTBOX_CLEANUP_INTERVAL_MS) {
          return;
        }

        lastCleanupAt = now;
        await cleanupOutboxJobs(new Date(now));
      })
      .catch((error) => {
        logError("[outbox] Worker drain failed", error);
      })
      .finally(() => {
        drainInFlight = false;
      });
  };

  drain();
  workerTimer = setInterval(drain, intervalMs);
  workerTimer.unref?.();
}

export function stopOutboxWorkerForTests() {
  if (!workerTimer) {
    return;
  }

  clearInterval(workerTimer);
  workerTimer = null;
  drainInFlight = false;
  lastCleanupAt = 0;
}
