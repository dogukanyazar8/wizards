import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  createProfileDiagnosticState,
  finalizeProfileIssues,
  recordDiagnosticEvent,
  recordDiagnosticLog,
} from "./diagnostics.mjs";
import { collectSensitiveEnvironmentValues, redactObject, redactText } from "./redaction.mjs";

const FINAL_STATUSES = new Set(["PASS", "FAIL", "BLOCKED", "CANCELLED"]);
const MAX_REPLAY_EVENTS = 2_000;

export class CoordinatorConflictError extends Error {
  constructor(message = "A local quality run is already active.") {
    super(message);
    this.name = "CoordinatorConflictError";
  }
}

function defaultRunId() {
  return `run-${randomUUID().replaceAll("-", "")}`;
}

function snapshot(value) {
  return structuredClone(value);
}

function profilesForRequest(catalog, runs, request, authorization) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid local quality run request.");
  }
  if (request.kind === "suite") {
    const profiles = catalog.suites[request.id];
    if (!profiles) {
      throw new Error("Unknown local quality suite.");
    }
    if (request.id === "fullAcceptance" && authorization?.fullAcceptance !== true) {
      throw new Error("Full acceptance requires an approved local target capability.");
    }
    return [...profiles];
  }
  if (request.kind === "profile") {
    if (!catalog.profiles[request.id]) {
      throw new Error("Unknown local quality profile.");
    }
    if (request.id === "E2EFull" && authorization?.fullAcceptance !== true) {
      throw new Error("E2EFull requires an approved local target capability.");
    }
    if (request.id === "MobileRelease" && authorization?.mobileRelease !== true) {
      throw new Error("MobileRelease requires explicit managed-build approval.");
    }
    return [request.id];
  }
  if (request.kind === "failedOnly") {
    const source = runs.get(request.sourceRunId);
    if (!source || source.status === "RUNNING") {
      throw new Error("Failed-only rerun source is unavailable.");
    }
    const profiles = source.profiles
      .filter((profile) => profile.status === "FAIL" || profile.status === "BLOCKED")
      .map((profile) => profile.id);
    if (profiles.length === 0) {
      throw new Error("Source run has no failed or blocked profiles.");
    }
    return profiles;
  }
  throw new Error("Unknown local quality run kind.");
}

function aggregateStatus(profiles, cancelled) {
  if (cancelled || profiles.some((profile) => profile.status === "CANCELLED")) {
    return "CANCELLED";
  }
  if (profiles.some((profile) => profile.status === "FAIL")) {
    return "FAIL";
  }
  if (profiles.some((profile) => profile.status === "BLOCKED")) {
    return "BLOCKED";
  }
  return "PASS";
}

function summarize(profiles) {
  const summary = { pass: 0, fail: 0, blocked: 0, cancelled: 0, remaining: 0 };
  for (const profile of profiles) {
    const key = profile.status.toLowerCase();
    if (Object.hasOwn(summary, key)) {
      summary[key] += 1;
    } else {
      summary.remaining += 1;
    }
  }
  return summary;
}

export function createCoordinator({
  catalog,
  store,
  runProfile,
  createId = defaultRunId,
  now = () => new Date().toISOString(),
  environment = process.env,
  sourceReferenceExtractor = () => [],
} = {}) {
  if (
    !catalog?.profiles ||
    !catalog?.suites ||
    typeof runProfile !== "function" ||
    !store ||
    typeof sourceReferenceExtractor !== "function"
  ) {
    throw new Error("Coordinator dependencies are incomplete.");
  }

  const sensitiveValues = collectSensitiveEnvironmentValues(environment);
  const runs = new Map();
  const subscribers = new Map();
  let activeRunId = null;

  function recordEvidenceWarning(run, operation) {
    const warning = `Evidence persistence failed during ${operation}.`;
    if (!run.evidenceWarnings.includes(warning) && run.evidenceWarnings.length < 5) {
      run.evidenceWarnings.push(warning);
    }
  }

  async function persistLog(run, line) {
    try {
      await store.appendLog(run.id, line);
    } catch {
      recordEvidenceWarning(run, "log write");
    }
  }

  async function publishNow(run, payload) {
    run.sequence += 1;
    const event = redactObject(
      {
        ...payload,
        schemaVersion: 1,
        runId: run.id,
        sequence: run.sequence,
        timestamp: now(),
      },
      sensitiveValues,
    );
    run.events.push(event);
    if (run.events.length > MAX_REPLAY_EVENTS) {
      run.events.splice(0, run.events.length - MAX_REPLAY_EVENTS);
    }
    try {
      await store.appendEvent(run.id, event);
    } catch {
      recordEvidenceWarning(run, "event write");
    }
    for (const listener of subscribers.get(run.id) ?? []) {
      try {
        listener(snapshot(event));
      } catch {
        // A broken browser listener must not change run execution.
      }
    }
    return event;
  }

  function publish(run, payload) {
    const pending = run.publishQueue.then(() => publishNow(run, payload));
    run.publishQueue = pending.catch(() => {});
    return pending;
  }

  async function execute(run, authorization) {
    let cancelled = false;
    try {
      await publish(run, { type: "run.started", status: "RUNNING" });
      for (const profile of run.profiles) {
        const diagnosticState = createProfileDiagnosticState();
        if (run.abortController.signal.aborted) {
          cancelled = true;
          profile.status = "CANCELLED";
          profile.completedAt = now();
          await publish(run, {
            type: "profile.completed",
            profileId: profile.id,
            status: "CANCELLED",
            exitCode: 130,
          });
          continue;
        }

        profile.status = "RUNNING";
        profile.startedAt = now();
        await publish(run, { type: "profile.started", profileId: profile.id, status: "RUNNING" });
        let outcome;
        try {
          outcome = await runProfile({
            runId: run.id,
            profileId: profile.id,
            signal: run.abortController.signal,
            allowDestructiveE2E: authorization?.fullAcceptance === true && profile.id === "E2EFull",
            allowMobileRelease:
              (authorization?.fullAcceptance === true || authorization?.mobileRelease === true) &&
              profile.id === "MobileRelease",
            onLog: async (line) => {
              const safeLine = redactText(line, sensitiveValues);
              try {
                recordDiagnosticLog(diagnosticState, safeLine, sourceReferenceExtractor);
              } catch {
                // Diagnostics are supporting evidence and must not change the verdict.
              }
              await persistLog(run, safeLine);
              await publish(run, { type: "log", profileId: profile.id, line: safeLine });
            },
            onEvent: async (event) => {
              const safeEvent = redactObject(event, sensitiveValues);
              try {
                recordDiagnosticEvent(diagnosticState, safeEvent);
              } catch {
                // Diagnostics are supporting evidence and must not change the verdict.
              }
              await publish(run, {
                ...safeEvent,
                source: "runner",
                profileId: profile.id,
              });
            },
            onSpawn: async (pid) => {
              try {
                await store.recordPid(run.id, pid);
              } catch {
                recordEvidenceWarning(run, "PID state write");
              }
            },
          });
        } catch (error) {
          const detail = redactText(
            error instanceof Error ? error.message : String(error),
            sensitiveValues,
          );
          try {
            recordDiagnosticLog(diagnosticState, detail, sourceReferenceExtractor);
            recordDiagnosticEvent(diagnosticState, {
              type: "step.completed",
              stepId: "runner",
              status: run.abortController.signal.aborted ? "CANCELLED" : "FAIL",
              detail,
              exitCode: 1,
              nextAction: "Inspect the runner error and retry the profile.",
            });
          } catch {
            // Diagnostics are supporting evidence and must not change the verdict.
          }
          await persistLog(run, detail);
          outcome = {
            status: run.abortController.signal.aborted ? "CANCELLED" : "FAIL",
            exitCode: 1,
          };
        }

        profile.status = FINAL_STATUSES.has(outcome?.status) ? outcome.status : "FAIL";
        profile.exitCode = Number.isInteger(outcome?.exitCode) ? outcome.exitCode : 1;
        profile.completedAt = now();
        try {
          profile.issues = finalizeProfileIssues(diagnosticState, {
            status: profile.status,
            exitCode: profile.exitCode,
          });
        } catch {
          profile.issues = [];
        }
        if (profile.status === "CANCELLED") {
          cancelled = true;
        }
        await publish(run, {
          type: "profile.completed",
          profileId: profile.id,
          status: profile.status,
          exitCode: profile.exitCode,
        });
      }
    } finally {
      run.status = aggregateStatus(run.profiles, cancelled || run.abortController.signal.aborted);
      run.completedAt = now();
      run.summary = summarize(run.profiles);
      try {
        await store.finishRun(run.id, publicRun(run));
      } catch {
        recordEvidenceWarning(run, "final report write");
      }
      try {
        await publish(run, {
          type: "run.completed",
          status: run.status,
          summary: run.summary,
          evidenceWarnings: run.evidenceWarnings,
        });
      } finally {
        if (activeRunId === run.id) {
          activeRunId = null;
        }
      }
    }
    return publicRun(run);
  }

  function publicRun(run) {
    return snapshot({
      id: run.id,
      kind: run.kind,
      requestId: run.requestId,
      sourceRunId: run.sourceRunId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      profiles: run.profiles,
      summary: run.summary,
      evidenceWarnings: run.evidenceWarnings,
    });
  }

  async function startRun(request, { authorization } = {}) {
    if (activeRunId !== null) {
      throw new CoordinatorConflictError();
    }
    const profileIds = profilesForRequest(catalog, runs, request, authorization);
    const id = createId();
    if (runs.has(id)) {
      throw new Error("Generated local quality run id already exists.");
    }
    const run = {
      id,
      kind: request.kind,
      requestId: request.id ?? null,
      sourceRunId: request.sourceRunId ?? null,
      status: "RUNNING",
      startedAt: now(),
      completedAt: null,
      profiles: profileIds.map((profileId) => ({
        id: profileId,
        status: "QUEUED",
        startedAt: null,
        completedAt: null,
        exitCode: null,
        issues: [],
      })),
      summary: { pass: 0, fail: 0, blocked: 0, cancelled: 0, remaining: profileIds.length },
      sequence: 0,
      events: [],
      evidenceWarnings: [],
      publishQueue: Promise.resolve(),
      abortController: new AbortController(),
    };
    await store.startRun(publicRun(run));
    runs.set(id, run);
    activeRunId = id;
    const done = execute(run, authorization);
    const handle = Object.freeze({ id, done });
    return handle;
  }

  async function cancelRun(runId) {
    const run = runs.get(runId);
    if (!run || run.status !== "RUNNING" || run.abortController.signal.aborted) {
      return false;
    }
    run.abortController.abort();
    await publish(run, { type: "run.cancel-requested", status: "RUNNING" });
    return true;
  }

  function getRun(runId) {
    const run = runs.get(runId);
    return run ? publicRun(run) : null;
  }

  function getActiveRun() {
    return activeRunId ? getRun(activeRunId) : null;
  }

  function subscribe(runId, listener, { afterSequence = 0 } = {}) {
    const run = runs.get(runId);
    if (!run || typeof listener !== "function") {
      throw new Error("Local quality run subscription is unavailable.");
    }
    for (const event of run.events) {
      if (event.sequence > afterSequence) {
        listener(snapshot(event));
      }
    }
    const listeners = subscribers.get(runId) ?? new Set();
    listeners.add(listener);
    subscribers.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        subscribers.delete(runId);
      }
    };
  }

  return Object.freeze({ cancelRun, getActiveRun, getRun, startRun, subscribe });
}

function resolvePowerShellPath() {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const candidate = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (!existsSync(candidate)) {
      throw new Error("Windows PowerShell 5.1 executable is unavailable.");
    }
    return candidate;
  }
  return "pwsh";
}

async function defaultTerminateProcessTree(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return;
  }
  if (process.platform === "win32") {
    await new Promise((resolvePromise) => {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("close", resolvePromise);
      killer.once("error", resolvePromise);
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

export function createPowerShellProfileRunner({
  root,
  runtimeRoot = join(root, "artifacts", "local-quality-dashboard", "runtime"),
  powershellPath = resolvePowerShellPath(),
  spawnChild = spawn,
  terminateProcessTree = defaultTerminateProcessTree,
} = {}) {
  const repositoryRoot = resolve(root);
  const expectedRuntimeRoot = resolve(
    repositoryRoot,
    "artifacts",
    "local-quality-dashboard",
    "runtime",
  );
  if (resolve(runtimeRoot) !== expectedRuntimeRoot) {
    throw new Error("PowerShell event runtime path is outside dashboard ownership.");
  }
  const runnerPath = join(repositoryRoot, "scripts", "quality", "Invoke-LocalGate.ps1");

  return async function runPowerShellProfile({
    runId,
    profileId,
    signal,
    allowDestructiveE2E = false,
    allowMobileRelease = false,
    onEvent,
    onLog,
    onSpawn = async () => {},
  }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(runId)) {
      throw new Error("Invalid runner run id.");
    }
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(profileId)) {
      throw new Error("Invalid runner profile id.");
    }
    if (signal.aborted) {
      return { status: "CANCELLED", exitCode: 130 };
    }

    await mkdir(expectedRuntimeRoot, { recursive: true });
    const eventPath = join(
      expectedRuntimeRoot,
      `${runId}-${profileId}-${randomUUID().replaceAll("-", "")}.jsonl`,
    );
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      runnerPath,
      "-Profile",
      profileId,
      "-OutputFormat",
      "Text",
      "-EventStreamPath",
      eventPath,
      "-RunId",
      runId,
    ];
    if (allowDestructiveE2E) {
      args.push("-AllowDestructiveE2E");
    }
    if (allowMobileRelease) {
      args.push("-AllowMobileRelease");
    }

    const child = spawnChild(powershellPath, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const childCompletion = new Promise((resolvePromise) => {
      child.once("close", (code) => resolvePromise({ code, processError: null }));
      child.once("error", (processError) => resolvePromise({ code: null, processError }));
    });
    let logQueue = Promise.resolve();
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let eventOffset = 0;
    let eventRemainder = "";
    let eventFailure = null;
    let eventQueue = Promise.resolve();
    let lastEventSequence = 0;
    let completedStatus = null;

    function queueLog(line) {
      if (line === "") {
        return;
      }
      logQueue = logQueue.then(() => onLog(line));
    }

    function consumeChunk(chunk, streamName) {
      const current = streamName === "stdout" ? stdoutBuffer : stderrBuffer;
      const parts = `${current}${chunk}`.split(/\r?\n/u);
      const remainder = parts.pop() ?? "";
      for (const line of parts) {
        queueLog(streamName === "stderr" ? `[stderr] ${line}` : line);
      }
      if (streamName === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }
    }

    child.stdout?.on("data", (chunk) => consumeChunk(chunk.toString("utf8"), "stdout"));
    child.stderr?.on("data", (chunk) => consumeChunk(chunk.toString("utf8"), "stderr"));

    async function drainEvents(final = false) {
      let text;
      try {
        text = await readFile(eventPath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") {
          return;
        }
        throw error;
      }
      const addition = text.slice(eventOffset);
      eventOffset = text.length;
      const lines = `${eventRemainder}${addition}`.split(/\r?\n/u);
      eventRemainder = final ? "" : (lines.pop() ?? "");
      if (final && lines.at(-1) === "") {
        lines.pop();
      }
      if (final && eventRemainder !== "") {
        lines.push(eventRemainder);
      }
      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        const event = JSON.parse(line);
        if (
          event?.schemaVersion !== 1 ||
          event?.runId !== runId ||
          event?.profile !== profileId ||
          !Number.isSafeInteger(event?.sequence) ||
          event.sequence !== lastEventSequence + 1
        ) {
          throw new Error("PowerShell runner emitted an invalid lifecycle event.");
        }
        lastEventSequence = event.sequence;
        if (event.type === "profile.completed") {
          completedStatus = event.status;
        }
        await onEvent(event);
      }
    }

    function queueEventDrain(final = false) {
      eventQueue = eventQueue.then(async () => {
        if (eventFailure) {
          return;
        }
        try {
          await drainEvents(final);
        } catch (error) {
          eventFailure = new Error("PowerShell runner lifecycle event stream is corrupt.", {
            cause: error,
          });
          queueLog(`Runner event error: ${error instanceof Error ? error.message : String(error)}`);
          await terminateProcessTree(child.pid);
        }
      });
      return eventQueue;
    }

    const poller = setInterval(() => {
      void queueEventDrain();
    }, 75);
    poller.unref?.();

    let terminationRequested = false;
    const abort = () => {
      if (!terminationRequested) {
        terminationRequested = true;
        void terminateProcessTree(child.pid);
      }
    };
    signal.addEventListener("abort", abort, { once: true });

    try {
      await onSpawn(child.pid);
      const { code, processError } = await childCompletion;
      clearInterval(poller);
      if (stdoutBuffer) {
        queueLog(stdoutBuffer);
      }
      if (stderrBuffer) {
        queueLog(`[stderr] ${stderrBuffer}`);
      }
      await queueEventDrain(true);
      await logQueue;
      if (eventFailure) {
        throw eventFailure;
      }
      if (processError) {
        throw processError;
      }
      if (signal.aborted || terminationRequested) {
        return { status: "CANCELLED", exitCode: 130 };
      }
      const exitCode = Number.isInteger(code) ? code : 1;
      if (!FINAL_STATUSES.has(completedStatus)) {
        throw new Error("PowerShell runner did not emit a terminal lifecycle verdict.");
      }
      const verdictMatchesExit =
        (completedStatus === "PASS" && exitCode === 0) ||
        (completedStatus === "BLOCKED" && exitCode === 2) ||
        (completedStatus === "FAIL" && exitCode !== 0);
      if (!verdictMatchesExit) {
        throw new Error("PowerShell runner lifecycle verdict does not match child exit code.");
      }
      return { status: completedStatus, exitCode };
    } finally {
      clearInterval(poller);
      signal.removeEventListener("abort", abort);
      await rm(eventPath, { force: true });
    }
  };
}
