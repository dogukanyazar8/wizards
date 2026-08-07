import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./catalog.mjs";
import {
  CoordinatorConflictError,
  createCoordinator,
  createPowerShellProfileRunner,
} from "./coordinator.mjs";
import { createSourceReferenceExtractor } from "./diagnostics.mjs";
import {
  HttpError,
  applySecurityHeaders,
  assertExactKeys,
  assertLoopbackHost,
  assertMutationRequest,
  readJsonBody,
} from "./http-security.mjs";
import { createRunStore } from "./store.mjs";

const moduleRoot = dirname(fileURLToPath(import.meta.url));
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CAPABILITY_LIFETIME_MS = 60_000;

function sendJson(response, status, value) {
  applySecurityHeaders(response, { "Content-Type": "application/json; charset=utf-8" });
  response.statusCode = status;
  response.end(`${JSON.stringify(value)}\n`);
}

function sendError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof CoordinatorConflictError) {
    sendJson(response, 409, { error: { code: "run_conflict", message: error.message } });
    return;
  }
  sendJson(response, 500, {
    error: { code: "internal_error", message: "Local dashboard request failed safely." },
  });
}

function parseAcceptanceTarget(environment) {
  const raw = environment.E2E_DATABASE_URL;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new HttpError(409, "e2e_target_missing", "E2E_DATABASE_URL is required.");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(409, "e2e_target_invalid", "E2E_DATABASE_URL is invalid.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new HttpError(409, "e2e_target_invalid", "E2E database must use PostgreSQL.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new HttpError(409, "e2e_target_remote", "E2E database must use a loopback host.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!/^[a-z0-9][a-z0-9_-]*_e2e$/u.test(databaseName)) {
    throw new HttpError(409, "e2e_target_name", "E2E database name must end in _e2e.");
  }
  const target = {
    protocol: url.protocol.slice(0, -1),
    host: url.hostname,
    port: Number(url.port || 5432),
    databaseName,
  };
  return Object.freeze({
    ...target,
    display: `${target.host}:${target.port}/${target.databaseName}`,
    fingerprint: `${target.protocol}|${target.host}|${target.port}|${target.databaseName}`,
  });
}

function contentType(pathname) {
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".png")) return "image/png";
  return "text/html; charset=utf-8";
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Dashboard port must be an integer from 0 through 65535.");
  }
  return port;
}

export function createDashboardServer({
  root,
  publicRoot = join(moduleRoot, "public"),
  whisprCssPath = join(root, ".design-sync", "whispr.css"),
  logoPath = join(root, "apps", "web", "public", "app-icons", "whispr.png"),
  catalog,
  coordinator,
  store,
  environment = process.env,
  token = randomBytes(32).toString("base64url"),
  now = () => Date.now(),
} = {}) {
  if (!catalog || !coordinator || !store || typeof root !== "string") {
    throw new Error("Dashboard server dependencies are incomplete.");
  }

  const capabilities = new Map();
  let listenerPort = null;
  let listenerUrl = null;
  let closing = false;

  function issueCapability(kind, targetFingerprint = null) {
    const capability = randomBytes(32).toString("base64url");
    capabilities.set(capability, {
      kind,
      targetFingerprint,
      expiresAt: now() + CAPABILITY_LIFETIME_MS,
    });
    return capability;
  }

  function consumeCapability(value, kind) {
    if (typeof value !== "string" || value === "") {
      throw new HttpError(409, "capability_required", "Fresh confirmation capability required.");
    }
    const record = capabilities.get(value);
    capabilities.delete(value);
    if (!record || record.kind !== kind || record.expiresAt <= now()) {
      throw new HttpError(
        409,
        "capability_invalid",
        "Confirmation capability expired or was used.",
      );
    }
    if (kind === "fullAcceptance") {
      const currentTarget = parseAcceptanceTarget(environment);
      if (record.targetFingerprint !== currentTarget.fingerprint) {
        throw new HttpError(
          409,
          "capability_target_changed",
          "E2E database target changed after confirmation.",
        );
      }
    }
    return record;
  }

  async function bootstrap() {
    let acceptanceTarget;
    try {
      const target = parseAcceptanceTarget(environment);
      acceptanceTarget = {
        ready: true,
        host: target.host,
        port: target.port,
        databaseName: target.databaseName,
        display: target.display,
      };
    } catch (error) {
      acceptanceTarget = {
        ready: false,
        nextAction: error instanceof HttpError ? error.message : "Configure local E2E target.",
      };
    }
    return {
      schemaVersion: 1,
      localOnly: true,
      token,
      catalog,
      activeRun: coordinator.getActiveRun(),
      recentRuns: await store.listRecent(30),
      acceptanceTarget,
    };
  }

  async function serveStatic(pathname, response) {
    const staticFiles = new Map([
      ["/", join(publicRoot, "index.html")],
      ["/index.html", join(publicRoot, "index.html")],
      ["/app.js", join(publicRoot, "app.js")],
      ["/dashboard.css", join(publicRoot, "dashboard.css")],
      ["/assets/whispr-logo.png", logoPath],
    ]);
    let body;
    if (pathname === "/whispr.css") {
      body = (await readFile(whisprCssPath, "utf8")).replace(
        /^@import\s+url\(["']?https?:\/\/[^\n]+\r?\n/gimu,
        "",
      );
    } else if (staticFiles.has(pathname)) {
      body = await readFile(staticFiles.get(pathname));
    } else {
      return false;
    }
    applySecurityHeaders(response, { "Content-Type": contentType(pathname) });
    response.statusCode = 200;
    response.end(body);
    return true;
  }

  async function streamEvents(request, response, runId) {
    const run = coordinator.getRun(runId);
    if (!run) {
      throw new HttpError(404, "run_not_found", "Local quality run not found.");
    }
    const requestedSequence = Number(request.headers["last-event-id"] ?? 0);
    const afterSequence =
      Number.isSafeInteger(requestedSequence) && requestedSequence >= 0 ? requestedSequence : 0;
    applySecurityHeaders(response, {
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    response.statusCode = 200;
    response.flushHeaders?.();
    let closed = false;
    let unsubscribe = null;
    const closeStream = () => {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      if (!response.writableEnded) {
        response.end();
      }
    };
    const listener = (event) => {
      if (closed) return;
      const accepted = response.write(
        `id: ${event.sequence}\nevent: quality\ndata: ${JSON.stringify(event)}\n\n`,
      );
      if (!accepted || event.type === "run.completed") {
        closeStream();
      }
    };
    unsubscribe = coordinator.subscribe(runId, listener, { afterSequence });
    if (closed) {
      unsubscribe();
    } else if (run.status !== "RUNNING") {
      closeStream();
    }
    request.once("close", closeStream);
    response.once("error", closeStream);
  }

  const httpServer = createServer(async (request, response) => {
    try {
      assertLoopbackHost(request.headers.host, { port: listenerPort });
      const requestUrl = new URL(request.url ?? "/", listenerUrl);
      const pathname = requestUrl.pathname;

      if (request.method === "GET" && pathname === "/api/bootstrap") {
        sendJson(response, 200, await bootstrap());
        return;
      }
      if (request.method === "GET" && pathname === "/api/runs/active") {
        sendJson(response, 200, { run: coordinator.getActiveRun() });
        return;
      }

      const eventsMatch = pathname.match(/^\/api\/runs\/(run-[a-z0-9-]+)\/events$/u);
      if (request.method === "GET" && eventsMatch) {
        await streamEvents(request, response, eventsMatch[1]);
        return;
      }
      const runMatch = pathname.match(/^\/api\/runs\/(run-[a-z0-9-]+)$/u);
      if (request.method === "GET" && runMatch) {
        const inMemoryRun = coordinator.getRun(runMatch[1]);
        let run = inMemoryRun;
        if (!run) {
          try {
            run = await store.readResult(runMatch[1]);
          } catch (error) {
            if (error?.code === "ENOENT") {
              throw new HttpError(404, "run_not_found", "Local quality run not found.");
            }
            throw error;
          }
        }
        sendJson(response, 200, { run, replayable: Boolean(inMemoryRun) });
        return;
      }
      const jsonExportMatch = pathname.match(/^\/api\/runs\/(run-[a-z0-9-]+)\/export\.json$/u);
      if (request.method === "GET" && jsonExportMatch) {
        const body = await readFile(store.getRunFile(jsonExportMatch[1], "result.json"));
        applySecurityHeaders(response, {
          "Content-Disposition": `attachment; filename="${jsonExportMatch[1]}.json"`,
          "Content-Type": "application/json; charset=utf-8",
        });
        response.statusCode = 200;
        response.end(body);
        return;
      }
      const markdownExportMatch = pathname.match(/^\/api\/runs\/(run-[a-z0-9-]+)\/export\.md$/u);
      if (request.method === "GET" && markdownExportMatch) {
        const body = await readFile(store.getRunFile(markdownExportMatch[1], "summary.md"));
        applySecurityHeaders(response, {
          "Content-Disposition": `attachment; filename="${markdownExportMatch[1]}.md"`,
          "Content-Type": "text/markdown; charset=utf-8",
        });
        response.statusCode = 200;
        response.end(body);
        return;
      }

      if (request.method === "POST") {
        assertMutationRequest(request, { expectedOrigin: listenerUrl, token });
      }
      if (request.method === "POST" && pathname === "/api/acceptance/confirm") {
        const body = await readJsonBody(request);
        assertExactKeys(body, ["kind", "databaseName", "confirmation"]);
        if (body.kind === "fullAcceptance") {
          const target = parseAcceptanceTarget(environment);
          if (body.databaseName !== target.databaseName) {
            throw new HttpError(
              409,
              "confirmation_mismatch",
              "Type the exact local E2E database name.",
            );
          }
          sendJson(response, 200, {
            capability: issueCapability("fullAcceptance", target.fingerprint),
            expiresInMs: CAPABILITY_LIFETIME_MS,
            target: { display: target.display, databaseName: target.databaseName },
          });
          return;
        }
        if (body.kind === "mobileRelease" && body.confirmation === "MOBILE RELEASE") {
          sendJson(response, 200, {
            capability: issueCapability("mobileRelease"),
            expiresInMs: CAPABILITY_LIFETIME_MS,
          });
          return;
        }
        throw new HttpError(400, "confirmation_invalid", "Acceptance confirmation is invalid.");
      }

      if (request.method === "POST" && pathname === "/api/runs") {
        const body = await readJsonBody(request);
        assertExactKeys(body, ["kind", "id", "sourceRunId", "capability"]);
        let authorization;
        if (
          (body.kind === "suite" && body.id === "fullAcceptance") ||
          (body.kind === "profile" && body.id === "E2EFull")
        ) {
          consumeCapability(body.capability, "fullAcceptance");
          authorization = { fullAcceptance: true };
        } else if (body.kind === "profile" && body.id === "MobileRelease") {
          consumeCapability(body.capability, "mobileRelease");
          authorization = { mobileRelease: true };
        } else if (body.capability !== undefined) {
          throw new HttpError(
            400,
            "unexpected_capability",
            "Capability is not valid for this run.",
          );
        }
        const handle = await coordinator.startRun(
          { kind: body.kind, id: body.id, sourceRunId: body.sourceRunId },
          { authorization },
        );
        sendJson(response, 202, { runId: handle.id });
        return;
      }

      const cancelMatch = pathname.match(/^\/api\/runs\/(run-[a-z0-9-]+)\/cancel$/u);
      if (request.method === "POST" && cancelMatch) {
        const body = await readJsonBody(request);
        assertExactKeys(body, []);
        const accepted = await coordinator.cancelRun(cancelMatch[1]);
        if (!accepted) {
          throw new HttpError(
            409,
            "cancel_unavailable",
            "Run is not active or already cancelling.",
          );
        }
        sendJson(response, 202, { runId: cancelMatch[1], cancellationRequested: true });
        return;
      }

      if (request.method === "GET" && (await serveStatic(pathname, response))) {
        return;
      }
      if (!["GET", "POST"].includes(request.method ?? "")) {
        throw new HttpError(405, "method_not_allowed", "HTTP method is not allowed.");
      }
      throw new HttpError(404, "not_found", "Dashboard route not found.");
    } catch (error) {
      sendError(response, error);
    }
  });

  async function listen({ port = 47_832 } = {}) {
    const requestedPort = parsePort(port);
    await new Promise((resolvePromise, rejectPromise) => {
      httpServer.once("error", rejectPromise);
      httpServer.listen(requestedPort, "127.0.0.1", () => {
        httpServer.removeListener("error", rejectPromise);
        resolvePromise();
      });
    });
    const address = httpServer.address();
    listenerPort = typeof address === "object" && address ? address.port : requestedPort;
    listenerUrl = `http://127.0.0.1:${listenerPort}`;
    return listenerUrl;
  }

  async function close() {
    if (closing) return;
    closing = true;
    const active = coordinator.getActiveRun();
    if (active) {
      await coordinator.cancelRun(active.id);
      for (let attempt = 0; attempt < 500 && coordinator.getActiveRun(); attempt += 1) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }
      if (coordinator.getActiveRun()) {
        throw new Error("Active local quality run did not stop during dashboard shutdown.");
      }
    }
    await new Promise((resolvePromise, rejectPromise) => {
      httpServer.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      httpServer.closeAllConnections?.();
    });
  }

  return Object.freeze({ close, listen });
}

function openBrowser(url) {
  const [executable, args] =
    process.platform === "win32"
      ? ["explorer.exe", [url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(executable, args, {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function parseCliArguments(argv) {
  let port = 47_832;
  let shouldOpen = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--no-open") {
      shouldOpen = false;
      continue;
    }
    if (argument === "--port" && index + 1 < argv.length) {
      port = parsePort(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown dashboard argument: ${argument}`);
  }
  return { port, shouldOpen };
}

function waitForTestRunner(delayMs, signal) {
  return new Promise((resolvePromise) => {
    if (signal.aborted) {
      resolvePromise(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolvePromise(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolvePromise(true);
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function selectProfileRunner({ environment = process.env, productionRunner }) {
  const nodeTestMode = environment.NODE_ENV === "test";
  const dashboardTestMode = environment.WHISPR_QUALITY_DASHBOARD_TEST_MODE === "1";
  if (nodeTestMode !== dashboardTestMode) {
    throw new Error(
      "The deterministic dashboard runner requires both NODE_ENV=test and WHISPR_QUALITY_DASHBOARD_TEST_MODE=1.",
    );
  }
  if (!nodeTestMode) {
    return productionRunner;
  }

  let ciInvocations = 0;
  return async function runDeterministicBrowserProfile({ profileId, signal, onEvent, onLog }) {
    await onLog(
      profileId === "CI"
        ? "tools/local-quality-dashboard/server.mjs:499:7 Error: deterministic CI contract failed"
        : `${profileId} deterministic browser output`,
    );
    const completed = await waitForTestRunner(profileId === "Desktop" ? 750 : 60, signal);
    if (!completed) {
      return { status: "CANCELLED", exitCode: 130 };
    }
    const shouldFail = profileId === "CI" && ciInvocations++ === 0;
    const status = shouldFail ? "FAIL" : "PASS";
    await onEvent({
      type: "step.completed",
      stepId: `${profileId}-browser-step`,
      status,
      command: `test-only:${profileId}`,
      detail: shouldFail ? "Deterministic CI contract failed." : "",
      nextAction: shouldFail ? "Rerun the failed profile." : "Continue.",
    });
    return { status, exitCode: shouldFail ? 1 : 0 };
  };
}

export async function main(argv = process.argv.slice(2)) {
  const root = resolve(moduleRoot, "..", "..");
  const { port, shouldOpen } = parseCliArguments(argv);
  const catalog = await loadCatalog({ root });
  const testMode =
    process.env.NODE_ENV === "test" && process.env.WHISPR_QUALITY_DASHBOARD_TEST_MODE === "1";
  const temporaryStoreRoot = testMode
    ? join(root, "test-results", "quality-dashboard-runtime")
    : null;
  if (temporaryStoreRoot) {
    await rm(temporaryStoreRoot, { recursive: true, force: true });
  }
  const store = await createRunStore({ root: temporaryStoreRoot ?? root });
  await store.recoverInterrupted();
  const productionRunner = testMode
    ? null
    : createPowerShellProfileRunner({
        root,
        runtimeRoot: join(store.baseRoot, "runtime"),
      });
  const runProfile = selectProfileRunner({ productionRunner });
  const coordinator = createCoordinator({
    catalog,
    store,
    runProfile,
    sourceReferenceExtractor: createSourceReferenceExtractor(root),
  });
  const server = createDashboardServer({ root, catalog, coordinator, store });
  const dashboard = temporaryStoreRoot
    ? Object.freeze({
        listen: (options) => server.listen(options),
        close: async () => {
          try {
            await server.close();
          } finally {
            await rm(temporaryStoreRoot, { recursive: true, force: true });
          }
        },
      })
    : server;
  const url = await dashboard.listen({ port });
  process.stdout.write(`Whispr Local Quality Dashboard: ${url}\n`);
  if (shouldOpen) {
    openBrowser(url);
  }
  const shutdown = async () => {
    await dashboard.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return dashboard;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
