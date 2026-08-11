import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { assertWebEnvironment } from "./src/lib/env.js";
import { getOperationalProbeResponse, HEALTH_RESPONSE_HEADERS } from "./src/lib/health.js";
import { registerSentryErrorReporter } from "./src/lib/observability/register-sentry.js";
import { startDisappearingMessageWorker } from "./src/lib/dm/disappearing-worker.js";
import { startOutboxWorker } from "./src/lib/outbox/worker.js";
import { initSocketServer } from "./src/lib/socket/server.js";

try {
  process.loadEnvFile();
} catch {
  // Next will still pick up shell-provided env vars in development.
}

const dev = process.env.NODE_ENV !== "production";
assertWebEnvironment(process.env, dev ? "development" : "production");
registerSentryErrorReporter();

const app = next({ dev });
const handler = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || "3000");

function getRequestPathname(request: IncomingMessage) {
  try {
    return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

function writeJsonResponse(
  response: ServerResponse,
  {
    body,
    headers,
    method = "GET",
    status,
  }: {
    body: unknown;
    headers?: Record<string, string>;
    method?: string;
    status: number;
  },
) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  for (const [key, value] of Object.entries(HEALTH_RESPONSE_HEADERS)) {
    response.setHeader(key, value);
  }

  for (const [key, value] of Object.entries(headers ?? {})) {
    response.setHeader(key, value);
  }

  if (method.toUpperCase() === "HEAD") {
    response.end();
    return;
  }

  response.end(JSON.stringify(body));
}

async function handleOperationalProbe(request: IncomingMessage, response: ServerResponse) {
  const probeResponse = await getOperationalProbeResponse({
    method: request.method ?? "GET",
    pathname: getRequestPathname(request),
  });

  if (!probeResponse) {
    return false;
  }

  writeJsonResponse(response, {
    ...probeResponse,
    method: request.method ?? "GET",
  });

  return true;
}

app.prepare().then(() => {
  const httpServer = createServer(async (request, response) => {
    if (await handleOperationalProbe(request, response)) {
      return;
    }

    await handler(request, response);
  });
  initSocketServer(httpServer);
  startOutboxWorker();
  // Started after the socket server: the sweep announces its deletions over it,
  // and a run that fired first would delete quietly. Its own Redis lock keeps
  // multiple replicas from purging the same batch (Faz 2 §C3).
  startDisappearingMessageWorker();
  httpServer.listen(PORT, () => {
    console.info(`Server running on http://localhost:${PORT}`);
  });
});
