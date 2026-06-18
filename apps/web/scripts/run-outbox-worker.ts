import { assertWebEnvironment } from "@/lib/env";
import { startOutboxWorker, stopOutboxWorkerForTests } from "@/lib/outbox/worker";

try {
  process.loadEnvFile();
} catch {
  // Shell-provided env vars are valid in production and worker deployments.
}

const runtime = process.env.NODE_ENV === "production" ? "production" : "development";
assertWebEnvironment(process.env, runtime);

const started = startOutboxWorker({ keepAlive: true });

if (started) {
  console.info("Whispr outbox worker started.");
} else {
  console.info("Whispr outbox worker is disabled.");
}

function shutdown() {
  stopOutboxWorkerForTests();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
