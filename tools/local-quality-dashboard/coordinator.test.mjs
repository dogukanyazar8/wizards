import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  CoordinatorConflictError,
  createCoordinator,
  createPowerShellProfileRunner,
} from "./coordinator.mjs";
import { createSourceReferenceExtractor } from "./diagnostics.mjs";

const catalog = Object.freeze({
  profiles: Object.freeze(
    Object.fromEntries(
      ["Fast", "Standard", "CI", "Mobile", "Security", "Desktop", "E2EFull", "MobileRelease"].map(
        (id) => [id, Object.freeze({ id })],
      ),
    ),
  ),
  suites: Object.freeze({
    safeAll: Object.freeze(["Standard", "CI", "Mobile", "Security", "Desktop"]),
    fullAcceptance: Object.freeze(["E2EFull", "MobileRelease"]),
  }),
});

function memoryStore() {
  const events = [];
  const logs = [];
  const pids = [];
  const results = [];
  return {
    events,
    logs,
    pids,
    results,
    baseRoot: join(tmpdir(), "quality-dashboard-memory"),
    async startRun() {},
    async appendEvent(_runId, event) {
      events.push(event);
      return event;
    },
    async appendLog(_runId, line) {
      logs.push(line);
    },
    async recordPid(runId, pid) {
      pids.push({ runId, pid });
    },
    async finishRun(_runId, result) {
      results.push(structuredClone(result));
      return result;
    },
  };
}

test("safe suite continues in fixed order and preserves failed aggregate", async () => {
  const calls = [];
  const store = memoryStore();
  const coordinator = createCoordinator({
    catalog,
    store,
    createId: () => "run-safe",
    runProfile: async ({ profileId, onEvent, onLog }) => {
      calls.push(profileId);
      await onLog(`${profileId} log`);
      await onEvent({ type: "step.completed", stepId: `${profileId}-step`, status: "PASS" });
      return { status: profileId === "CI" ? "FAIL" : "PASS", exitCode: profileId === "CI" ? 1 : 0 };
    },
  });

  const handle = await coordinator.startRun({ kind: "suite", id: "safeAll" });
  const result = await handle.done;

  assert.deepEqual(calls, ["Standard", "CI", "Mobile", "Security", "Desktop"]);
  assert.equal(result.status, "FAIL");
  assert.equal(result.summary.pass, 4);
  assert.equal(result.summary.fail, 1);
  assert.equal(store.logs.length, 5);
  assert.equal(store.results[0].status, "FAIL");
});

test("failed steps retain reason, command, source, and bounded evidence", async () => {
  const store = memoryStore();
  const coordinator = createCoordinator({
    catalog,
    store,
    createId: () => "run-diagnostic-fail",
    sourceReferenceExtractor: createSourceReferenceExtractor(process.cwd()),
    runProfile: async ({ onEvent, onLog }) => {
      await onLog(
        "tools/local-quality-dashboard/coordinator.mjs:214:5 Error: expected PASS, received FAIL",
      );
      await onEvent({
        type: "step.completed",
        stepId: "quality-tests",
        status: "FAIL",
        command: "pnpm test:quality-dashboard",
        exitCode: 1,
        nextAction: "Fix the failing dashboard test.",
      });
      return { status: "FAIL", exitCode: 1 };
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "CI" });
  const result = await handle.done;
  const issue = result.profiles[0].issues[0];

  assert.equal(issue.status, "FAIL");
  assert.equal(issue.stepId, "quality-tests");
  assert.equal(issue.command, "pnpm test:quality-dashboard");
  assert.match(issue.reason, /expected PASS, received FAIL/u);
  assert.deepEqual(issue.sources, [
    { path: "tools/local-quality-dashboard/coordinator.mjs", line: 214, column: 5 },
  ]);
  assert.equal(store.results[0].profiles[0].issues.length, 1);
});

test("blocked preconditions remain separate diagnostic issues", async () => {
  const coordinator = createCoordinator({
    catalog,
    store: memoryStore(),
    createId: () => "run-diagnostic-blocked",
    runProfile: async ({ onEvent }) => {
      await onEvent({
        type: "precondition.completed",
        status: "BLOCKED",
        detail: "E2E_DATABASE_URL is missing.",
        nextAction: "Set a dedicated local E2E database.",
      });
      await onEvent({
        type: "step.completed",
        stepId: "e2e",
        status: "BLOCKED",
        command: "pnpm e2e",
        exitCode: null,
        nextAction: "Set a dedicated local E2E database.",
      });
      return { status: "BLOCKED", exitCode: 2 };
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "Security" });
  const result = await handle.done;

  assert.equal(result.profiles[0].issues[0].status, "BLOCKED");
  assert.equal(result.profiles[0].issues[0].reason, "E2E_DATABASE_URL is missing.");
  assert.equal(result.profiles[0].issues[0].exitCode, 2);
});

test("runner exceptions create diagnostics without changing failure semantics", async () => {
  const coordinator = createCoordinator({
    catalog,
    store: memoryStore(),
    createId: () => "run-diagnostic-exception",
    runProfile: async () => {
      throw new Error("runner exploded safely");
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "Security" });
  const result = await handle.done;

  assert.equal(result.status, "FAIL");
  assert.equal(result.profiles[0].issues.length, 1);
  assert.equal(result.profiles[0].issues[0].reason, "runner exploded safely");
});

test("coordinator enforces one active run and cancels owned work", async () => {
  const store = memoryStore();
  let observedAbort = false;
  const coordinator = createCoordinator({
    catalog,
    store,
    createId: () => "run-cancel",
    runProfile: async ({ signal, onSpawn }) => {
      await onSpawn(777);
      if (signal.aborted) {
        observedAbort = true;
        return { status: "CANCELLED", exitCode: 130 };
      }
      return new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            resolve({ status: "CANCELLED", exitCode: 130 });
          },
          { once: true },
        );
      });
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "Desktop" });
  await assert.rejects(
    () => coordinator.startRun({ kind: "profile", id: "Fast" }),
    CoordinatorConflictError,
  );
  assert.equal(await coordinator.cancelRun(handle.id), true);
  const result = await handle.done;

  assert.equal(observedAbort, true);
  assert.deepEqual(store.pids, [{ runId: "run-cancel", pid: 777 }]);
  assert.equal(result.status, "CANCELLED");
  assert.equal(coordinator.getActiveRun(), null);
});

test("failed-only rerun selects failed and blocked source profiles", async () => {
  const calls = [];
  let idIndex = 0;
  const coordinator = createCoordinator({
    catalog,
    store: memoryStore(),
    createId: () => ["run-source", "run-retry"][idIndex++],
    runProfile: async ({ profileId }) => {
      calls.push(profileId);
      if (calls.length <= 5) {
        return {
          status: profileId === "CI" ? "FAIL" : profileId === "Security" ? "BLOCKED" : "PASS",
          exitCode: profileId === "CI" ? 1 : profileId === "Security" ? 2 : 0,
        };
      }
      return { status: "PASS", exitCode: 0 };
    },
  });

  const source = await coordinator.startRun({ kind: "suite", id: "safeAll" });
  await source.done;
  const retry = await coordinator.startRun({ kind: "failedOnly", sourceRunId: source.id });
  await retry.done;

  assert.deepEqual(calls.slice(5), ["CI", "Security"]);
});

test("subscriptions replay only events after requested sequence", async () => {
  const coordinator = createCoordinator({
    catalog,
    store: memoryStore(),
    createId: () => "run-events",
    runProfile: async ({ onEvent }) => {
      await onEvent({ type: "step.started", stepId: "one", status: "RUNNING" });
      await onEvent({ type: "step.completed", stepId: "one", status: "PASS" });
      return { status: "PASS", exitCode: 0 };
    },
  });
  const handle = await coordinator.startRun({ kind: "profile", id: "Fast" });
  await handle.done;
  const replay = [];

  const unsubscribe = coordinator.subscribe(handle.id, (event) => replay.push(event), {
    afterSequence: 2,
  });
  unsubscribe();

  assert.ok(replay.length > 0);
  assert.ok(replay.every((event) => event.sequence > 2));
  assert.deepEqual(
    replay.map((event) => event.sequence),
    [...replay.map((event) => event.sequence)].sort((a, b) => a - b),
  );
});

test("concurrent log and lifecycle publications persist in monotonic sequence order", async () => {
  const persistedSequences = [];
  const store = memoryStore();
  store.appendEvent = async (_runId, event) => {
    if (event.type === "step.started") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    persistedSequences.push(event.sequence);
  };
  const coordinator = createCoordinator({
    catalog,
    store,
    createId: () => "run-concurrent-events",
    runProfile: async ({ onEvent }) => {
      await Promise.all([
        onEvent({ type: "step.started", stepId: "parallel", status: "RUNNING" }),
        onEvent({ type: "step.completed", stepId: "parallel", status: "PASS" }),
      ]);
      return { status: "PASS", exitCode: 0 };
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "Fast" });
  await handle.done;

  assert.deepEqual(
    persistedSequences,
    [...persistedSequences].sort((left, right) => left - right),
  );
});

test("evidence persistence failures never rewrite the test verdict or hold the run lock", async () => {
  const unavailableStore = {
    baseRoot: join(tmpdir(), "quality-dashboard-unavailable"),
    async startRun() {},
    async appendEvent() {
      throw new Error("disk unavailable");
    },
    async appendLog() {
      throw new Error("disk unavailable");
    },
    async recordPid() {
      throw new Error("disk unavailable");
    },
    async finishRun() {
      throw new Error("disk unavailable");
    },
  };
  const coordinator = createCoordinator({
    catalog,
    store: unavailableStore,
    createId: () => "run-evidence-failure",
    runProfile: async ({ onLog, onSpawn }) => {
      await onSpawn(456);
      await onLog("test output remains a pass");
      return { status: "PASS", exitCode: 0 };
    },
  });

  const handle = await coordinator.startRun({ kind: "profile", id: "Fast" });
  const result = await handle.done;

  assert.equal(result.status, "PASS");
  assert.equal(coordinator.getActiveRun(), null);
  assert.ok(result.evidenceWarnings.length >= 1);
  assert.ok(result.evidenceWarnings.every((warning) => !warning.includes("disk unavailable")));
});

test("PowerShell runner uses fixed arguments, no shell, and owned event path", async () => {
  const root = await mkdtemp(join(tmpdir(), "whispr-quality-runner-"));
  const baseRoot = join(root, "artifacts", "local-quality-dashboard");
  await mkdir(join(root, "scripts", "quality"), { recursive: true });
  await mkdir(baseRoot, { recursive: true });
  const calls = [];
  const spawnedPids = [];
  const fakeChild = new EventEmitter();
  fakeChild.stdout = new PassThrough();
  fakeChild.stderr = new PassThrough();
  fakeChild.pid = 321;
  const runner = createPowerShellProfileRunner({
    root,
    runtimeRoot: join(baseRoot, "runtime"),
    powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    spawnChild(executable, args, options) {
      calls.push({ executable, args, options });
      const eventPath = args[args.indexOf("-EventStreamPath") + 1];
      void writeFile(
        eventPath,
        `${JSON.stringify({
          schemaVersion: 1,
          sequence: 1,
          runId: "run-process",
          profile: "Desktop",
          type: "profile.completed",
          status: "PASS",
        })}\n`,
        "utf8",
      ).then(() => fakeChild.emit("close", 0, null));
      return fakeChild;
    },
  });

  try {
    const result = await runner({
      runId: "run-process",
      profileId: "Desktop",
      signal: new AbortController().signal,
      onEvent: async () => {},
      onLog: async () => {},
      onSpawn: async (pid) => spawnedPids.push(pid),
    });

    assert.equal(result.status, "PASS");
    assert.equal(calls[0].executable.endsWith("powershell.exe"), true);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.windowsHide, true);
    assert.equal(calls[0].options.cwd, root);
    assert.ok(calls[0].args.includes("-EventStreamPath"));
    assert.ok(calls[0].args.includes("Desktop"));
    assert.deepEqual(spawnedPids, [321]);
    assert.equal(
      calls[0].args.some((argument) => /cmd|Invoke-Expression/iu.test(argument)),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PowerShell runner serializes event reads and fails a profile on corrupt JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "whispr-quality-runner-corrupt-"));
  const baseRoot = join(root, "artifacts", "local-quality-dashboard");
  await mkdir(join(root, "scripts", "quality"), { recursive: true });
  await mkdir(baseRoot, { recursive: true });
  const fakeChild = new EventEmitter();
  fakeChild.stdout = new PassThrough();
  fakeChild.stderr = new PassThrough();
  fakeChild.pid = 654;
  const terminated = [];
  const runner = createPowerShellProfileRunner({
    root,
    runtimeRoot: join(baseRoot, "runtime"),
    powershellPath: "powershell.exe",
    spawnChild(_executable, args) {
      const eventPath = args[args.indexOf("-EventStreamPath") + 1];
      setTimeout(() => void writeFile(eventPath, "{not-json}\n", "utf8"), 10);
      setTimeout(() => fakeChild.emit("close", 0, null), 160);
      return fakeChild;
    },
    async terminateProcessTree(pid) {
      terminated.push(pid);
    },
  });

  try {
    await assert.rejects(
      () =>
        runner({
          runId: "run-corrupt",
          profileId: "Desktop",
          signal: new AbortController().signal,
          onEvent: async () => {},
          onLog: async () => {},
        }),
      /lifecycle event stream is corrupt/u,
    );
    assert.deepEqual(terminated, [654]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PowerShell runner rejects a lifecycle verdict that disagrees with the child exit code", async () => {
  const root = await mkdtemp(join(tmpdir(), "whispr-quality-runner-mismatch-"));
  const baseRoot = join(root, "artifacts", "local-quality-dashboard");
  await mkdir(join(root, "scripts", "quality"), { recursive: true });
  await mkdir(baseRoot, { recursive: true });
  const fakeChild = new EventEmitter();
  fakeChild.stdout = new PassThrough();
  fakeChild.stderr = new PassThrough();
  fakeChild.pid = 765;
  const runner = createPowerShellProfileRunner({
    root,
    runtimeRoot: join(baseRoot, "runtime"),
    powershellPath: "powershell.exe",
    spawnChild(_executable, args) {
      const eventPath = args[args.indexOf("-EventStreamPath") + 1];
      void writeFile(
        eventPath,
        `${JSON.stringify({
          schemaVersion: 1,
          sequence: 1,
          runId: "run-mismatch",
          profile: "Desktop",
          type: "profile.completed",
          status: "PASS",
        })}\n`,
        "utf8",
      ).then(() => fakeChild.emit("close", 1, null));
      return fakeChild;
    },
  });

  try {
    await assert.rejects(
      () =>
        runner({
          runId: "run-mismatch",
          profileId: "Desktop",
          signal: new AbortController().signal,
          onEvent: async () => {},
          onLog: async () => {},
        }),
      /does not match child exit code/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
