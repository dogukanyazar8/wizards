import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProfileDiagnosticState,
  createSourceReferenceExtractor,
  finalizeProfileIssues,
  recordDiagnosticEvent,
  recordDiagnosticLog,
} from "./diagnostics.mjs";

test("source extraction returns only existing repository-relative references", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "whispr-diagnostics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = ["apps/web/src/example.ts", "scripts/check.ps1", "rust/src/lib.rs"];
  for (const file of files) {
    const target = join(root, ...file.split("/"));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "test\n", "utf8");
  }

  const extract = createSourceReferenceExtractor(root);
  const references = extract([
    "apps\\web\\src\\example.ts:12:7 - assertion failed",
    "scripts/check.ps1(9,2): command failed",
    "  --> rust/src/lib.rs:4:1",
    "C:\\outside\\secret.ts:1:1",
    "apps/web/src/missing.ts:3:2",
    "apps/web/src/example.ts:12:7 duplicate",
  ]);

  assert.deepEqual(references, [
    { path: "apps/web/src/example.ts", line: 12, column: 7 },
    { path: "scripts/check.ps1", line: 9, column: 2 },
    { path: "rust/src/lib.rs", line: 4, column: 1 },
  ]);
});

test("source extraction caps unique references at eight", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "whispr-diagnostics-cap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = [];
  for (let index = 0; index < 10; index += 1) {
    const relativePath = `src/file-${index}.ts`;
    const target = join(root, "src", `file-${index}.ts`);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(target, "test\n", "utf8");
    lines.push(`${relativePath}:${index + 1}:1`);
  }

  assert.equal(createSourceReferenceExtractor(root)(lines).length, 8);
});

test("failed diagnostic prefers error log and keeps bounded evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "whispr-diagnostics-fail-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, "tools", "local-quality-dashboard", "server.mjs");
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, "test\n", "utf8");
  const extract = createSourceReferenceExtractor(root);
  const state = createProfileDiagnosticState({ maxLogLines: 4, maxExcerptLines: 3 });

  for (const line of [
    "setup complete",
    "starting check",
    "tools/local-quality-dashboard/server.mjs:42:7 TypeError: expected token",
    "command failed",
    "cleanup complete",
  ]) {
    recordDiagnosticLog(state, line, extract);
  }
  recordDiagnosticEvent(state, {
    type: "step.completed",
    stepId: "web-tests",
    status: "FAIL",
    command: "pnpm test:web",
    exitCode: 1,
    nextAction: "Fix the failing assertion.",
  });

  const issues = finalizeProfileIssues(state, { status: "FAIL", exitCode: 1 });
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0], {
    id: "issue-1",
    status: "FAIL",
    stepId: "web-tests",
    reason: "tools/local-quality-dashboard/server.mjs:42:7 TypeError: expected token",
    command: "pnpm test:web",
    exitCode: 1,
    nextAction: "Fix the failing assertion.",
    sources: [{ path: "tools/local-quality-dashboard/server.mjs", line: 42, column: 7 }],
    excerpt: [
      "tools/local-quality-dashboard/server.mjs:42:7 TypeError: expected token",
      "command failed",
      "cleanup complete",
    ],
  });
});

test("blocked diagnostic uses precondition detail and terminal fallback is deterministic", () => {
  const blocked = createProfileDiagnosticState();
  recordDiagnosticEvent(blocked, {
    type: "precondition.completed",
    status: "BLOCKED",
    detail: "E2E_DATABASE_URL is missing.",
    nextAction: "Set a dedicated loopback E2E database URL.",
  });
  recordDiagnosticEvent(blocked, {
    type: "step.completed",
    stepId: "e2e",
    status: "BLOCKED",
    command: "pnpm e2e",
    exitCode: null,
    nextAction: "Set a dedicated loopback E2E database URL.",
  });
  assert.equal(
    finalizeProfileIssues(blocked, { status: "BLOCKED", exitCode: 2 })[0].reason,
    "E2E_DATABASE_URL is missing.",
  );

  const failed = createProfileDiagnosticState();
  assert.equal(
    finalizeProfileIssues(failed, { status: "FAIL", exitCode: 9 })[0].reason,
    "Process exited with code 9.",
  );
});
