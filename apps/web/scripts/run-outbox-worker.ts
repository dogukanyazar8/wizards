import { assertOutboxWorkerEnvironment } from "@/lib/env";
import { startOutboxWorker, stopOutboxWorker } from "@/lib/outbox/worker";
import {
  closeHeadlessSocketServer,
  initHeadlessSocketServer,
} from "@/lib/socket/worker-runtime";

try {
  process.loadEnvFile();
} catch {
  // Shell-provided env vars are valid in production and worker deployments.
}

const runtime = process.env.NODE_ENV === "production" ? "production" : "development";
assertOutboxWorkerEnvironment(process.env, runtime);

if (process.env.WHISPR_OUTBOX_WORKER === "false") {
  console.info("Whispr outbox worker is disabled.");
  process.exit(0);
}

const io = initHeadlessSocketServer();

const started = startOutboxWorker({ keepAlive: true });

if (started) {
  console.info("Whispr outbox worker started.");
}

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
