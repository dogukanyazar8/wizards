import { logError } from "@/lib/logger";
import { sweepBadges as sweepBadgesService } from "@/lib/badges/badge-sweep";
import { cleanupAccountReauthChallenges } from "@/lib/auth/reauth-cleanup";
import { cleanupMobileMediaUploads as cleanupMobileMediaUploadsService } from "@/lib/mobile/mobile-media-upload-service";
import { cleanupOutboxJobs, drainOutboxJobs } from "@/lib/outbox/service";
import { rollUpClientHealthEvents as rollUpClientHealthEventsService } from "@/lib/telemetry/client-health-rollup";
import { purgeExpiredEvidence as purgeExpiredEvidenceService } from "@/lib/moderation/evidence-service";
import { sweepModerationCaseAlerts as sweepModerationCaseAlertsService } from "@/lib/moderation/case-alert-service";
import { purgeExpiredBugReports as purgeExpiredBugReportsService } from "@/lib/support/bug-report-service";
import { prisma } from "@wizards/db";

const DEFAULT_OUTBOX_WORKER_BATCH_SIZE = 25;
const DEFAULT_OUTBOX_WORKER_INTERVAL_MS = 5_000;
const OUTBOX_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_OUTBOX_WORKER_SHUTDOWN_TIMEOUT_MS = 10_000;

type ExpiredSessionCleanupClient = {
  authSession: {
    deleteMany(input: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
  };
  session: {
    deleteMany(input: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
  };
};

export async function cleanupExpiredSessions(
  { now }: { now: Date },
  client: ExpiredSessionCleanupClient = prisma,
) {
  const [legacy, auth] = await Promise.all([
    client.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    client.authSession.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { count: legacy.count + auth.count };
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let currentDrainPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

type StartOutboxWorkerOptions = {
  cleanupJobs?: typeof cleanupOutboxJobs;
  cleanupExpiredSessions?: typeof cleanupExpiredSessions;
  cleanupMobileMediaUploads?: typeof cleanupMobileMediaUploadsService;
  cleanupReauthChallenges?: typeof cleanupAccountReauthChallenges;
  drainJobs?: typeof drainOutboxJobs;
  intervalMs?: number;
  purgeExpiredBugReports?: typeof purgeExpiredBugReportsService;
  purgeExpiredEvidence?: typeof purgeExpiredEvidenceService;
  rollUpClientHealthEvents?: typeof rollUpClientHealthEventsService;
  sweepBadges?: typeof sweepBadgesService;
  sweepModerationCaseAlerts?: typeof sweepModerationCaseAlertsService;
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
  cleanupExpiredSessions: cleanupExpiredSessionsForRun = cleanupExpiredSessions,
  cleanupMobileMediaUploads = cleanupMobileMediaUploadsService,
  cleanupReauthChallenges = cleanupAccountReauthChallenges,
  drainJobs = drainOutboxJobs,
  intervalMs,
  keepAlive = false,
  purgeExpiredBugReports = purgeExpiredBugReportsService,
  purgeExpiredEvidence = purgeExpiredEvidenceService,
  rollUpClientHealthEvents = rollUpClientHealthEventsService,
  runImmediately = true,
  sweepBadges = sweepBadgesService,
  sweepModerationCaseAlerts = sweepModerationCaseAlertsService,
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

        const cleanupNow = new Date(now);
        const maintenanceTasks: Array<[name: string, run: () => Promise<unknown>]> = [
          ["cleanupOutboxJobs", () => cleanupJobs(cleanupNow)],
          // Session rows are bearer credentials, not history. Expired rows must
          // leave durable storage even when no user explicitly signs out.
          ["cleanupExpiredSessions", () => cleanupExpiredSessionsForRun({ now: cleanupNow })],
          ["cleanupAccountReauthChallenges", () => cleanupReauthChallenges({ now: cleanupNow })],
          ["cleanupMobileMediaUploads", () => cleanupMobileMediaUploads({ now: cleanupNow })],
          ["rollUpClientHealthEvents", () => rollUpClientHealthEvents({ now: cleanupNow })],
          ["purgeExpiredBugReports", () => purgeExpiredBugReports()],
          ["purgeExpiredEvidence", () => purgeExpiredEvidence({ now: cleanupNow })],
          // This hourly block is the application's only scheduler for stale-case
          // alerts and periodic badge recomputation.
          ["sweepModerationCaseAlerts", () => sweepModerationCaseAlerts({ now: cleanupNow })],
          [
            "sweepBadges",
            () =>
              sweepBadges({
                ...(lastCleanupAt > 0 ? { lastSweepAt: new Date(lastCleanupAt) } : {}),
                now: cleanupNow,
              }),
          ],
        ];
        let maintenanceFailed = false;

        for (const [name, run] of maintenanceTasks) {
          try {
            await run();
          } catch (error) {
            maintenanceFailed = true;
            logError(`[outbox] Maintenance task failed: ${name}`, error);
          }
        }

        // A failed task must be retried on the next drain. Advancing before the
        // block made one transient failure suppress every maintenance job for an hour.
        if (!maintenanceFailed) {
          lastCleanupAt = now;
        }
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
