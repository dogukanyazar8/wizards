import { logError } from "@/lib/logger";
import { cleanupAccountReauthChallenges } from "@/lib/auth/reauth-cleanup";
import { cleanupMobileMediaUploads as cleanupMobileMediaUploadsService } from "@/lib/mobile/mobile-media-upload-service";
import { cleanupOutboxJobs, drainOutboxJobs } from "@/lib/outbox/service";

const DEFAULT_OUTBOX_WORKER_BATCH_SIZE = 25;
const DEFAULT_OUTBOX_WORKER_INTERVAL_MS = 5_000;
const OUTBOX_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_OUTBOX_WORKER_SHUTDOWN_TIMEOUT_MS = 10_000;

let workerTimer: ReturnType<typeof setInterval> | null = null;
let currentDrainPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

type StartOutboxWorkerOptions = {
  cleanupJobs?: typeof cleanupOutboxJobs;
  cleanupMobileMediaUploads?: typeof cleanupMobileMediaUploadsService;
  cleanupReauthChallenges?: typeof cleanupAccountReauthChallenges;
  drainJobs?: typeof drainOutboxJobs;
  intervalMs?: number;
  keepAlive?: boolean;
  runImmediately?: boolean;
  workerId?: string;
};

type StopOutboxWorkerOptions = {
  timeoutMs?: number;
};

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function startOutboxWorker({
  cleanupJobs = cleanupOutboxJobs,
  cleanupMobileMediaUploads = cleanupMobileMediaUploadsService,
  cleanupReauthChallenges = cleanupAccountReauthChallenges,
  drainJobs = drainOutboxJobs,
  intervalMs,
  keepAlive = false,
  runImmediately = true,
  workerId: configuredWorkerId,
}: StartOutboxWorkerOptions = {}) {
  if (workerTimer || process.env.WHISPR_OUTBOX_WORKER === "false") {
    return false;
  }

  const batchSize = readPositiveIntegerEnv(
    "WHISPR_OUTBOX_BATCH_SIZE",
    DEFAULT_OUTBOX_WORKER_BATCH_SIZE,
  );
  const configuredIntervalMs =
    intervalMs ??
    readPositiveIntegerEnv("WHISPR_OUTBOX_INTERVAL_MS", DEFAULT_OUTBOX_WORKER_INTERVAL_MS);
  const workerId = configuredWorkerId ?? `web-${process.pid}`;
  const drain = () => {
    if (currentDrainPromise) {
      return;
    }

    currentDrainPromise = drainJobs({ limit: batchSize, workerId })
      .then(async () => {
        const now = Date.now();
        if (now - lastCleanupAt < OUTBOX_CLEANUP_INTERVAL_MS) {
          return;
        }

        lastCleanupAt = now;
        const cleanupNow = new Date(now);
        await cleanupJobs(cleanupNow);
        await cleanupReauthChallenges({ now: cleanupNow });
        await cleanupMobileMediaUploads({ now: cleanupNow });
      })
      .catch((error) => {
        logError("[outbox] Worker drain failed", error);
      })
      .finally(() => {
        currentDrainPromise = null;
      });
  };

  if (runImmediately) {
    drain();
  }

  workerTimer = setInterval(drain, configuredIntervalMs);
  if (!keepAlive) {
    workerTimer.unref?.();
  }

  return true;
}

function waitForDrainWithTimeout(promise: Promise<void>, timeoutMs: number) {
  if (timeoutMs <= 0) {
    return Promise.resolve();
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function stopOutboxWorker({
  timeoutMs = readPositiveIntegerEnv(
    "WHISPR_OUTBOX_SHUTDOWN_TIMEOUT_MS",
    DEFAULT_OUTBOX_WORKER_SHUTDOWN_TIMEOUT_MS,
  ),
}: StopOutboxWorkerOptions = {}) {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  const drainPromise = currentDrainPromise;
  if (drainPromise) {
    await waitForDrainWithTimeout(drainPromise, timeoutMs);
  }

  lastCleanupAt = 0;
}

export function stopOutboxWorkerForTests() {
  return stopOutboxWorker({ timeoutMs: 0 });
}
