import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCoordinator } from "./coordinator.mjs";
import { createDashboardServer, selectProfileRunner } from "./server.mjs";
import { createRunStore } from "./store.mjs";

const roots = [];

test.afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture({ slow = false, now = () => Date.now() } = {}) {
  const root = await mkdtemp(join(tmpdir(), "whispr-quality-server-"));
  roots.push(root);
  const publicRoot = join(root, "public");
  await mkdir(publicRoot, { recursive: true });
  await writeFile(join(publicRoot, "index.html"), "<!doctype html><title>Whispr Quality</title>");
  await writeFile(join(publicRoot, "app.js"), "console.log('quality');");
  await writeFile(join(publicRoot, "dashboard.css"), ":root{color-scheme:dark}");
  const whisprCssPath = join(root, "whispr.css");
  await writeFile(
    whisprCssPath,
    '@import url("https://fonts.googleapis.com/css2?family=Inter");\n:root{--primary:235 86% 65%;}',
  );
  const logoBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const logoPath = join(root, "apps", "web", "public", "app-icons", "whispr.png");
  await mkdir(join(root, "apps", "web", "public", "app-icons"), { recursive: true });
  await writeFile(logoPath, logoBytes);
  const store = await createRunStore({ root, environment: {} });
  const catalog = {
    profiles: Object.fromEntries(
      ["Fast", "Standard", "CI", "Mobile", "Security", "Desktop", "E2EFull", "MobileRelease"].map(
        (id) => [
          id,
          { id, description: `${id} profile`, estimatedImpact: "Local only", steps: [] },
        ],
      ),
    ),
    suites: {
      safeAll: ["Standard", "CI", "Mobile", "Security", "Desktop"],
      fullAcceptance: ["E2EFull", "MobileRelease"],
    },
  };
  let id = 0;
  const coordinator = createCoordinator({
    catalog,
    store,
    createId: () => `run-server-${++id}`,
    runProfile: async ({ profileId, signal, onEvent, onLog }) => {
      await onLog(`${profileId} output`);
      await onEvent({ type: "step.completed", stepId: `${profileId}-step`, status: "PASS" });
      if (slow) {
        await new Promise((resolvePromise) => {
          if (signal.aborted) {
            resolvePromise();
            return;
          }
          const timer = setTimeout(resolvePromise, 2_000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolvePromise();
            },
            { once: true },
          );
        });
      }
      return signal.aborted
        ? { status: "CANCELLED", exitCode: 130 }
        : { status: "PASS", exitCode: 0 };
    },
  });
  const environment = {
    E2E_DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/wizards_e2e",
    REDIS_URL: "redis://127.0.0.1:6379",
  };
  const dashboard = createDashboardServer({
    root,
    publicRoot,
    whisprCssPath,
    catalog,
    coordinator,
    store,
    environment,
    token: "test-process-token",
    now,
  });
  const url = await dashboard.listen({ port: 0 });
  return { catalog, coordinator, dashboard, environment, logoBytes, store, url };
}

function mutationHeaders(url, token = "test-process-token") {
  return {
    origin: url,
    "content-type": "application/json",
    "x-whispr-quality-token": token,
  };
}

async function waitForCompletion(coordinator, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = coordinator.getRun(runId);
    if (run?.status !== "RUNNING") {
      return run;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error("Run did not complete.");
}

test("bootstrap, run, replay, and exports expose redacted local evidence", async () => {
  const { coordinator, dashboard, url } = await fixture();
  try {
    const bootstrapResponse = await fetch(`${url}/api/bootstrap`);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrapResponse.status, 200);
    assert.equal(bootstrap.token, "test-process-token");
    assert.equal(bootstrap.catalog.profiles.Fast.id, "Fast");
    assert.equal(JSON.stringify(bootstrap).includes("password"), false);

    const startResponse = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "profile", id: "Fast" }),
    });
    const started = await startResponse.json();
    assert.equal(startResponse.status, 202);
    const result = await waitForCompletion(coordinator, started.runId);
    assert.equal(result.status, "PASS");

    const eventsResponse = await fetch(`${url}/api/runs/${started.runId}/events`);
    const eventsText = await eventsResponse.text();
    assert.equal(eventsResponse.status, 200);
    assert.match(eventsText, /event: quality/u);
    assert.match(eventsText, /run\.completed/u);

    const jsonExport = await fetch(`${url}/api/runs/${started.runId}/export.json`);
    const markdownExport = await fetch(`${url}/api/runs/${started.runId}/export.md`);
    assert.equal(jsonExport.status, 200);
    assert.equal(markdownExport.status, 200);
    assert.equal((await jsonExport.text()).includes("password"), false);
    assert.match(await markdownExport.text(), /Status: PASS/u);

    const css = await (await fetch(`${url}/whispr.css`)).text();
    assert.doesNotMatch(css, /fonts\.googleapis/u);
    assert.match(css, /--primary/u);
  } finally {
    await dashboard.close();
  }
});

test("canonical logo and persisted run details use fixed safe routes", async () => {
  const { coordinator, dashboard, logoBytes, store, url } = await fixture();
  try {
    const persisted = {
      id: "run-historical",
      kind: "profile",
      requestId: "CI",
      startedAt: "2026-08-07T00:00:00.000Z",
      completedAt: "2026-08-07T00:00:01.000Z",
      status: "FAIL",
      summary: { pass: 0, fail: 1, blocked: 0 },
      profiles: [{ id: "CI", status: "FAIL", exitCode: 1, issues: [] }],
    };
    await store.startRun(persisted);
    await store.finishRun(persisted.id, persisted);

    const logoResponse = await fetch(`${url}/assets/whispr-logo.png`);
    assert.equal(logoResponse.status, 200);
    assert.equal(logoResponse.headers.get("content-type"), "image/png");
    assert.match(logoResponse.headers.get("content-security-policy"), /default-src 'self'/u);
    assert.deepEqual(Buffer.from(await logoResponse.arrayBuffer()), logoBytes);

    const historicalResponse = await fetch(`${url}/api/runs/${persisted.id}`);
    const historical = await historicalResponse.json();
    assert.equal(historicalResponse.status, 200);
    assert.equal(historical.run.id, persisted.id);
    assert.equal(historical.replayable, false);

    const active = await coordinator.startRun({ kind: "profile", id: "Fast" });
    await active.done;
    const inMemory = await (await fetch(`${url}/api/runs/${active.id}`)).json();
    assert.equal(inMemory.replayable, true);
  } finally {
    await dashboard.close();
  }
});

test("server rejects cross-origin, wrong-token, unknown-field, and active-run mutations", async () => {
  const { dashboard, url } = await fixture({ slow: true });
  try {
    for (const headers of [
      mutationHeaders("https://evil.test"),
      mutationHeaders(url, "wrong-token"),
    ]) {
      const response = await fetch(`${url}/api/runs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "profile", id: "Fast" }),
      });
      assert.equal(response.status, 403);
    }

    const unknownField = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "profile", id: "Fast", command: "whoami" }),
    });
    assert.equal(unknownField.status, 400);

    const first = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "profile", id: "Fast" }),
    });
    const firstRun = await first.json();
    const conflict = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "profile", id: "Desktop" }),
    });
    assert.equal(conflict.status, 409);

    const cancelled = await fetch(`${url}/api/runs/${firstRun.runId}/cancel`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);
  } finally {
    await dashboard.close();
  }
});

test("full acceptance capability is sanitized, target-bound, single-use, and expiring", async () => {
  let timestamp = Date.parse("2026-08-07T00:00:00.000Z");
  const { coordinator, dashboard, environment, url } = await fixture({ now: () => timestamp });
  try {
    const confirm = await fetch(`${url}/api/acceptance/confirm`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "fullAcceptance", databaseName: "wizards_e2e" }),
    });
    const approval = await confirm.json();
    assert.equal(confirm.status, 200);
    assert.equal(JSON.stringify(approval).includes("password"), false);

    environment.E2E_DATABASE_URL = "postgresql://user:changed@127.0.0.1:5432/another_e2e";
    const changedTarget = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({
        kind: "suite",
        id: "fullAcceptance",
        capability: approval.capability,
      }),
    });
    assert.equal(changedTarget.status, 409);

    environment.E2E_DATABASE_URL = "postgresql://user:password@127.0.0.1:5432/wizards_e2e";
    const newConfirm = await fetch(`${url}/api/acceptance/confirm`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "fullAcceptance", databaseName: "wizards_e2e" }),
    });
    const newApproval = await newConfirm.json();
    timestamp += 61_000;
    const expired = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({
        kind: "suite",
        id: "fullAcceptance",
        capability: newApproval.capability,
      }),
    });
    assert.equal(expired.status, 409);

    timestamp -= 61_000;
    const validConfirm = await fetch(`${url}/api/acceptance/confirm`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "fullAcceptance", databaseName: "wizards_e2e" }),
    });
    const validApproval = await validConfirm.json();
    const started = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({
        kind: "suite",
        id: "fullAcceptance",
        capability: validApproval.capability,
      }),
    });
    const startedBody = await started.json();
    assert.equal(started.status, 202);
    await waitForCompletion(coordinator, startedBody.runId);

    const reused = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({
        kind: "suite",
        id: "fullAcceptance",
        capability: validApproval.capability,
      }),
    });
    assert.equal(reused.status, 409);
  } finally {
    await dashboard.close();
  }
});

test("deterministic browser runner requires both test-mode guards", async () => {
  const productionRunner = async () => ({ status: "PASS", exitCode: 0 });
  assert.equal(selectProfileRunner({ environment: {}, productionRunner }), productionRunner);
  assert.throws(
    () =>
      selectProfileRunner({
        environment: { NODE_ENV: "test" },
        productionRunner,
      }),
    /both NODE_ENV=test and WHISPR_QUALITY_DASHBOARD_TEST_MODE=1/u,
  );
  assert.throws(
    () =>
      selectProfileRunner({
        environment: { WHISPR_QUALITY_DASHBOARD_TEST_MODE: "1" },
        productionRunner,
      }),
    /both NODE_ENV=test and WHISPR_QUALITY_DASHBOARD_TEST_MODE=1/u,
  );

  const runner = selectProfileRunner({
    environment: {
      NODE_ENV: "test",
      WHISPR_QUALITY_DASHBOARD_TEST_MODE: "1",
    },
    productionRunner,
  });
  const events = [];
  const logs = [];
  const invoke = (profileId, signal = new AbortController().signal) =>
    runner({
      profileId,
      signal,
      onEvent: async (event) => events.push(event),
      onLog: async (line) => logs.push(line),
    });
  assert.deepEqual(await invoke("CI"), { status: "FAIL", exitCode: 1 });
  assert.deepEqual(await invoke("CI"), { status: "PASS", exitCode: 0 });
  assert.deepEqual(await invoke("Fast"), { status: "PASS", exitCode: 0 });
  assert.match(logs.join("\n"), /server\.mjs:499:7 Error: deterministic CI contract failed/u);
  assert.equal(
    events.some(
      (event) =>
        event.type === "step.completed" && event.detail === "Deterministic CI contract failed.",
    ),
    true,
  );
});

test("active SSE stream closes after run completion and includes the terminal event", async () => {
  const { dashboard, url } = await fixture({ slow: true });
  try {
    const startResponse = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: JSON.stringify({ kind: "profile", id: "Fast" }),
    });
    const started = await startResponse.json();
    const eventsResponse = await fetch(`${url}/api/runs/${started.runId}/events`);
    const cancelled = await fetch(`${url}/api/runs/${started.runId}/cancel`, {
      method: "POST",
      headers: mutationHeaders(url),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);

    const eventsText = await Promise.race([
      eventsResponse.text(),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Active SSE response did not close.")),
          750,
        );
        timer.unref();
      }),
    ]);
    assert.match(eventsText, /run\.completed/u);
    assert.match(eventsText, /CANCELLED/u);
  } finally {
    await dashboard.close();
  }
});
