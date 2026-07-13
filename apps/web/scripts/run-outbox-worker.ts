import { createRequire } from "node:module";
import { assertOutboxWorkerEnvironment } from "@/lib/env";
import { registerSentryErrorReporter } from "@/lib/observability/register-sentry";
import { startOutboxWorker, stopOutboxWorker } from "@/lib/outbox/worker";
import {
  closeHeadlessSocketServer,
  initHeadlessSocketServer,
} from "@/lib/socket/worker-runtime";

// @sentry/nextjs bir CJS pakettir; bu dosya esbuild ile bundle'lanır (Next'in
// build-time Sentry aliaslamasından geçmez). createRequire, ESM named-export
// statik analizinin çözemediği captureCheckIn/isInitialized gibi
// fonksiyonların garanti gelmesini sağlar (bkz. register-sentry.ts).
const require = createRequire(import.meta.url);
const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");

try {
  process.loadEnvFile();
} catch {
  // Shell-provided env vars are valid in production and worker deployments.
}

const runtime = process.env.NODE_ENV === "production" ? "production" : "development";
assertOutboxWorkerEnvironment(process.env, runtime);
registerSentryErrorReporter();

if (process.env.WHISPR_OUTBOX_WORKER === "false") {
  console.info("Whispr outbox worker is disabled.");
  process.exit(0);
}

const io = initHeadlessSocketServer();

const started = startOutboxWorker({ keepAlive: true });

if (started) {
  console.info("Whispr outbox worker started.");
}

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

function sendWorkerHeartbeat() {
  if (!Sentry.isInitialized()) {
    return;
  }

  Sentry.captureCheckIn({
    monitorSlug: "outbox-worker-heartbeat",
    status: "ok",
  });
}

sendWorkerHeartbeat();
const heartbeatTimer = setInterval(sendWorkerHeartbeat, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await stopOutboxWorker();
  await closeHeadlessSocketServer(io);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
