import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRunStore } from "./store.mjs";

const temporaryRoots = [];

test.afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "whispr-quality-store-"));
  temporaryRoots.push(root);
  return root;
}

test("store writes redacted atomic result and recent summary", async () => {
  const root = await temporaryRoot();
  const store = await createRunStore({ root, maxLogBytes: 1024 });
  const meta = { id: "run-one", startedAt: "2026-08-07T00:00:00.000Z", status: "RUNNING" };

  await store.startRun(meta);
  await store.appendLog(meta.id, "API_TOKEN=secret-value");
  await store.appendEvent(meta.id, { type: "profile.completed", token: "event-secret" });
  await store.finishRun(meta.id, {
    ...meta,
    status: "PASS",
    completedAt: "2026-08-07T00:01:00.000Z",
    summary: { pass: 1, fail: 0, blocked: 0 },
    profiles: [
      {
        id: "Fast",
        status: "PASS",
        exitCode: 0,
        startedAt: "2026-08-07T00:00:00.000Z",
        completedAt: "2026-08-07T00:01:00.000Z",
      },
    ],
  });

  const runRoot = join(root, "artifacts", "local-quality-dashboard", meta.id);
  const resultText = await readFile(join(runRoot, "result.json"), "utf8");
  const logText = await readFile(join(runRoot, "run.log"), "utf8");
  const eventsText = await readFile(join(runRoot, "events.jsonl"), "utf8");
  const summaryText = await readFile(join(runRoot, "summary.md"), "utf8");
  const recent = await store.listRecent(30);

  assert.equal(resultText.includes("secret-value"), false);
  assert.equal(logText.includes("secret-value"), false);
  assert.equal(eventsText.includes("event-secret"), false);
  assert.equal(recent[0].id, meta.id);
  assert.equal(recent[0].status, "PASS");
  assert.match(summaryText, /\| Fast \| PASS \| 0 \| 60000 ms \|/u);
  await assert.rejects(() => lstat(`${join(runRoot, "result.json")}.tmp`));
});

test("store persists redacted diagnostics, reads full results, and keeps history compact", async () => {
  const root = await temporaryRoot();
  const store = await createRunStore({
    root,
    environment: { API_TOKEN: "diagnostic-secret" },
  });
  const result = {
    id: "run-diagnostics",
    kind: "profile",
    requestId: "CI",
    startedAt: "2026-08-07T00:00:00.000Z",
    completedAt: "2026-08-07T00:00:02.000Z",
    status: "FAIL",
    summary: { pass: 0, fail: 1, blocked: 0 },
    profiles: [
      {
        id: "CI",
        status: "FAIL",
        exitCode: 1,
        startedAt: "2026-08-07T00:00:00.000Z",
        completedAt: "2026-08-07T00:00:02.000Z",
        issues: [
          {
            id: "issue-1",
            status: "FAIL",
            stepId: "web-tests",
            reason: "API_TOKEN=diagnostic-secret failed",
            command: "pnpm test:web",
            exitCode: 1,
            nextAction: "Fix the failed assertion.",
            sources: [{ path: "apps/web/src/example.ts", line: 42, column: 7 }],
            excerpt: ["API_TOKEN=diagnostic-secret", "assertion failed"],
          },
        ],
      },
    ],
  };

  await store.startRun(result);
  await store.finishRun(result.id, result);
  const full = await store.readResult(result.id);
  const recent = await store.listRecent(30);
  const summary = await readFile(store.getRunFile(result.id, "summary.md"), "utf8");

  assert.equal(JSON.stringify(full).includes("diagnostic-secret"), false);
  assert.match(full.profiles[0].issues[0].reason, /\[REDACTED\]/u);
  assert.equal(recent[0].profiles[0].issues, undefined);
  assert.match(summary, /## Issues/u);
  assert.match(summary, /apps\/web\/src\/example\.ts:42:7/u);
  assert.equal(summary.includes("diagnostic-secret"), false);

  await assert.rejects(() => store.readResult("run-missing"), /ENOENT/u);
  await writeFile(store.getRunFile(result.id, "result.json"), "{broken", "utf8");
  await assert.rejects(() => store.readResult(result.id), /JSON|position|property/u);
});

test("store rejects traversal ids and symbolic ownership roots", async (t) => {
  const root = await temporaryRoot();
  const store = await createRunStore({ root });
  await assert.rejects(() => store.startRun({ id: "../escape", status: "RUNNING" }), /run id/u);

  const linkedRoot = await temporaryRoot();
  const target = await temporaryRoot();
  const artifacts = join(linkedRoot, "artifacts");
  try {
    await symlink(target, artifacts, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("symbolic link creation unavailable");
      return;
    }
    throw error;
  }
  await assert.rejects(() => createRunStore({ root: linkedRoot }), /symbolic|reparse/u);
});

test("store caps logs and recovers interrupted runs without deleting history", async () => {
  const root = await temporaryRoot();
  const store = await createRunStore({ root, maxLogBytes: 64 });
  await store.startRun({
    id: "run-interrupted",
    startedAt: "2026-08-07T00:00:00.000Z",
    status: "RUNNING",
    pid: 4242,
  });
  await store.appendLog("run-interrupted", "x".repeat(200));
  const recovered = await store.recoverInterrupted();
  const recent = await store.listRecent(30);
  const logText = await readFile(
    join(root, "artifacts", "local-quality-dashboard", "run-interrupted", "run.log"),
    "utf8",
  );

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, "CANCELLED");
  assert.equal(recovered[0].pid, 4242);
  assert.equal(recent[0].status, "CANCELLED");
  assert.match(logText, /TRUNCATED/u);
});

test("store records an active child PID and recovers interrupted runs older than UI history", async () => {
  const root = await temporaryRoot();
  const store = await createRunStore({ root });
  await store.startRun({
    id: "run-old-interrupted",
    startedAt: "2020-01-01T00:00:00.000Z",
    status: "RUNNING",
  });
  await store.recordPid("run-old-interrupted", 9876);

  for (let index = 0; index < 30; index += 1) {
    const id = `run-recent-${String(index).padStart(2, "0")}`;
    const startedAt = new Date(Date.UTC(2026, 7, 7, 0, index)).toISOString();
    await store.startRun({ id, startedAt, status: "RUNNING" });
    await store.finishRun(id, {
      id,
      startedAt,
      completedAt: startedAt,
      status: "PASS",
      summary: { pass: 1, fail: 0, blocked: 0 },
    });
  }

  assert.equal(
    (await store.listRecent(30)).some((run) => run.id === "run-old-interrupted"),
    false,
  );
  const recovered = await store.recoverInterrupted();
  const oldState = JSON.parse(
    await readFile(
      join(root, "artifacts", "local-quality-dashboard", "run-old-interrupted", "state.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    recovered.map((run) => run.id),
    ["run-old-interrupted"],
  );
  assert.equal(oldState.status, "CANCELLED");
  assert.equal(oldState.pid, 9876);
  assert.match(oldState.nextAction, /PID 9876/u);
});
