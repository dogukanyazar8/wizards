import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { collectSensitiveEnvironmentValues, redactObject, redactText } from "./redaction.mjs";

const RUN_ID_PATTERN = /^run-[a-z0-9](?:[a-z0-9-]{0,62})$/u;
const TRUNCATION_MARKER = "\n[LOG TRUNCATED: persistence limit reached]\n";

async function assertNoLink(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Dashboard storage path contains a symbolic link or reparse point: ${path}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function prepareOwnedRoot(root, baseRoot) {
  const artifactsRoot = join(root, "artifacts");
  await assertNoLink(root);
  await assertNoLink(artifactsRoot);
  await assertNoLink(baseRoot);
  await mkdir(baseRoot, { recursive: true });
  await assertNoLink(baseRoot);
}

function validateRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("Invalid dashboard run id.");
  }
  return runId;
}

function ownedRunRoot(baseRoot, runId) {
  const candidate = resolve(baseRoot, validateRunId(runId));
  const relativePath = relative(baseRoot, candidate);
  if (
    relativePath.startsWith("..") ||
    relativePath === "" ||
    resolve(baseRoot, relativePath) !== candidate
  ) {
    throw new Error("Invalid dashboard run id path.");
  }
  return candidate;
}

async function atomicJson(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function markdownSummary(result) {
  const summary = result.summary ?? {};
  const lines = [
    `# Local Quality Run ${result.id}`,
    "",
    `- Status: ${result.status}`,
    `- Started: ${result.startedAt ?? "unknown"}`,
    `- Completed: ${result.completedAt ?? "unknown"}`,
    `- Passed: ${summary.pass ?? 0}`,
    `- Failed: ${summary.fail ?? 0}`,
    `- Blocked: ${summary.blocked ?? 0}`,
    "",
  ];
  if (result.evidenceWarnings?.length) {
    lines.push(
      "## Evidence warnings",
      "",
      ...result.evidenceWarnings.map((warning) => `- ${warning}`),
      "",
    );
  }
  if (result.profiles?.length) {
    lines.push(
      "## Profiles",
      "",
      "| Profile | Status | Exit | Duration |",
      "| --- | --- | ---: | ---: |",
    );
    for (const profile of result.profiles) {
      const startedAt = Date.parse(profile.startedAt ?? "");
      const completedAt = Date.parse(profile.completedAt ?? "");
      const duration =
        Number.isFinite(startedAt) && Number.isFinite(completedAt)
          ? `${Math.max(0, completedAt - startedAt)} ms`
          : "—";
      lines.push(
        `| ${profile.id} | ${profile.status} | ${profile.exitCode ?? "—"} | ${duration} |`,
      );
    }
    lines.push("");

    const issues = result.profiles.flatMap((profile) =>
      (profile.issues ?? []).map((issue) => ({ profileId: profile.id, ...issue })),
    );
    if (issues.length > 0) {
      lines.push("## Issues", "");
      for (const issue of issues) {
        lines.push(
          `### ${issue.profileId} - ${issue.status}`,
          "",
          `- Step: ${issue.stepId ?? "unknown"}`,
          `- Exit: ${issue.exitCode ?? "unknown"}`,
          `- Reason: ${String(issue.reason ?? "unknown").replaceAll("\n", " ")}`,
        );
        if (issue.command)
          lines.push(`- Command: \`${String(issue.command).replaceAll("`", "'")}\``);
        if (issue.nextAction) {
          lines.push(`- Next action: ${String(issue.nextAction).replaceAll("\n", " ")}`);
        }
        for (const source of issue.sources ?? []) {
          const location = `${source.path}:${source.line}${source.column ? `:${source.column}` : ""}`;
          lines.push(`- Source: \`${location}\``);
        }
        if (issue.excerpt?.length) {
          lines.push("", "```text", ...issue.excerpt.map(String), "```", "");
        } else {
          lines.push("");
        }
      }
    }
  }
  return lines.join("\n");
}

function compactRun(result) {
  return {
    ...result,
    profiles: result.profiles?.map(({ issues: _issues, ...profile }) => profile),
  };
}

export async function createRunStore({
  root,
  maxLogBytes = 10 * 1024 * 1024,
  environment = process.env,
} = {}) {
  if (typeof root !== "string" || root.trim() === "") {
    throw new Error("Dashboard store root is required.");
  }
  if (!Number.isSafeInteger(maxLogBytes) || maxLogBytes < 64) {
    throw new Error("Dashboard maxLogBytes must be an integer of at least 64.");
  }

  const repositoryRoot = resolve(root);
  const baseRoot = join(repositoryRoot, "artifacts", "local-quality-dashboard");
  const sensitiveValues = collectSensitiveEnvironmentValues(environment);
  const truncatedRuns = new Set();
  await prepareOwnedRoot(repositoryRoot, baseRoot);

  async function startRun(meta) {
    const runRoot = ownedRunRoot(baseRoot, meta?.id);
    await mkdir(runRoot, { recursive: false });
    const safeMeta = redactObject({ ...meta, status: "RUNNING" }, sensitiveValues);
    await atomicJson(join(runRoot, "state.json"), safeMeta);
    await writeFile(join(runRoot, "events.jsonl"), "", "utf8");
    await writeFile(join(runRoot, "run.log"), "", "utf8");
    return safeMeta;
  }

  async function appendLog(runId, line) {
    const runRoot = ownedRunRoot(baseRoot, runId);
    const logPath = join(runRoot, "run.log");
    if (truncatedRuns.has(runId)) {
      return;
    }
    const currentSize = (await stat(logPath)).size;
    const safeLine = `${redactText(line, sensitiveValues)}\n`;
    const lineBytes = Buffer.byteLength(safeLine);
    const markerBytes = Buffer.byteLength(TRUNCATION_MARKER);
    if (currentSize + lineBytes > maxLogBytes) {
      const remaining = Math.max(0, maxLogBytes - currentSize - markerBytes);
      const prefix =
        remaining > 0 ? Buffer.from(safeLine).subarray(0, remaining).toString("utf8") : "";
      await appendFile(logPath, `${prefix}${TRUNCATION_MARKER}`, "utf8");
      truncatedRuns.add(runId);
      return;
    }
    await appendFile(logPath, safeLine, "utf8");
  }

  async function appendEvent(runId, event) {
    const runRoot = ownedRunRoot(baseRoot, runId);
    const safeEvent = redactObject(event, sensitiveValues);
    await appendFile(join(runRoot, "events.jsonl"), `${JSON.stringify(safeEvent)}\n`, "utf8");
    return safeEvent;
  }

  async function finishRun(runId, result) {
    const runRoot = ownedRunRoot(baseRoot, runId);
    const safeResult = redactObject(result, sensitiveValues);
    await atomicJson(join(runRoot, "result.json"), safeResult);
    await writeFile(join(runRoot, "summary.md"), markdownSummary(safeResult), "utf8");
    await atomicJson(join(runRoot, "state.json"), safeResult);
    return safeResult;
  }

  async function recordPid(runId, pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error("Dashboard child PID must be a positive safe integer.");
    }
    const runRoot = ownedRunRoot(baseRoot, runId);
    await assertNoLink(runRoot);
    const statePath = join(runRoot, "state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.status !== "RUNNING") {
      throw new Error("Dashboard child PID can be recorded only for an active run.");
    }
    const updated = redactObject({ ...state, pid }, sensitiveValues);
    await atomicJson(statePath, updated);
    return updated;
  }

  async function readAllStates() {
    const entries = await readdir(baseRoot, { withFileTypes: true });
    const states = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) {
        continue;
      }
      try {
        states.push(
          JSON.parse(
            await readFile(join(ownedRunRoot(baseRoot, entry.name), "state.json"), "utf8"),
          ),
        );
      } catch {
        // A partial or corrupt state cannot be recovered automatically without guessing.
      }
    }
    return states;
  }

  async function listRecent(limit = 30) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 30, 30));
    const entries = await readdir(baseRoot, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) {
        continue;
      }
      const runRoot = ownedRunRoot(baseRoot, entry.name);
      let value;
      try {
        value = JSON.parse(await readFile(join(runRoot, "result.json"), "utf8"));
      } catch (error) {
        if (error?.code !== "ENOENT") {
          continue;
        }
        try {
          value = JSON.parse(await readFile(join(runRoot, "state.json"), "utf8"));
        } catch {
          continue;
        }
      }
      results.push(value);
    }
    return results
      .sort((left, right) =>
        String(right.completedAt ?? right.startedAt ?? "").localeCompare(
          String(left.completedAt ?? left.startedAt ?? ""),
        ),
      )
      .slice(0, boundedLimit)
      .map(compactRun);
  }

  async function readResult(runId) {
    const runRoot = ownedRunRoot(baseRoot, runId);
    const resultPath = join(runRoot, "result.json");
    await assertNoLink(runRoot);
    await assertNoLink(resultPath);
    const value = JSON.parse(await readFile(resultPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== runId) {
      throw new Error("Dashboard result is invalid.");
    }
    return redactObject(value, sensitiveValues);
  }

  async function recoverInterrupted() {
    const states = await readAllStates();
    const recovered = [];
    for (const state of states) {
      if (state.status !== "RUNNING") {
        continue;
      }
      const result = {
        ...state,
        status: "CANCELLED",
        completedAt: new Date().toISOString(),
        nextAction: `Run interrupted. Inspect recorded PID ${state.pid ?? "unknown"} manually before rerunning.`,
      };
      recovered.push(await finishRun(state.id, result));
    }
    return recovered;
  }

  function getRunFile(runId, fileName) {
    if (
      !["result.json", "summary.md", "events.jsonl", "run.log", "state.json"].includes(fileName)
    ) {
      throw new Error("Unsupported dashboard run file.");
    }
    return join(ownedRunRoot(baseRoot, runId), fileName);
  }

  return Object.freeze({
    appendEvent,
    appendLog,
    baseRoot,
    finishRun,
    getRunFile,
    listRecent,
    readResult,
    recordPid,
    recoverInterrupted,
    startRun,
  });
}
