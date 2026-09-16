import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildC8ReportArgs,
  buildC8ReportEnv,
  buildNodeCoverageEnv,
  COVERAGE_THRESHOLDS,
  getApiE2ECoverageMode,
} from "./coverage";
import type { E2EEnvironmentValidation } from "./environment";

function validation(ok: boolean): E2EEnvironmentValidation {
  return {
    errors: ok ? [] : [{ code: "database_url_required", message: "missing db" }],
    ok,
    summary: {
      baseUrl: "http://127.0.0.1:3000",
      skipWebServer: false,
    },
    warnings: [],
  };
}

describe("coverage runner contract", () => {
  it("incrementally merges complementary runs without losing uncovered files or threshold failures", () => {
    const root = mkdtempSync(join(tmpdir(), "whispr-coverage-merge-"));
    const raw = join(root, "raw");
    const c8 = createRequire(import.meta.url).resolve("c8/bin/c8.js");
    const reportEnv = { ...process.env, ...buildC8ReportEnv(process.env) };
    delete reportEnv.NODE_V8_COVERAGE;

    try {
      mkdirSync(join(root, "src"));
      mkdirSync(raw);
      writeFileSync(
        join(root, "src", "branch.ts"),
        "export function choose(value: boolean) {\n  if (value) return 1;\n  return 2;\n}\nchoose(process.argv[2] === 'true');\n",
      );
      writeFileSync(
        join(root, "src", "uncovered.ts"),
        "export function neverCalled() {\n  return 0;\n}\n",
      );

      for (const value of ["true", "false"]) {
        const result = spawnSync(process.execPath, ["src/branch.ts", value], {
          cwd: root,
          env: { ...process.env, NODE_V8_COVERAGE: raw },
          encoding: "utf8",
          timeout: 30_000,
        });
        assert.equal(result.status, 0, result.stderr);
      }

      const summaries = [];
      for (const incremental of [false, true]) {
        const reportsDir = join(root, incremental ? "incremental" : "baseline");
        const args = buildC8ReportArgs({ reportsDir, tempDirectory: raw }).filter(
          (arg) => arg !== "--check-coverage" && (incremental || arg !== "--merge-async"),
        );
        const result = spawnSync(process.execPath, [c8, ...args], {
          cwd: root,
          env: reportEnv,
          encoding: "utf8",
          timeout: 30_000,
        });
        assert.equal(result.status, 0, result.stderr);
        summaries.push(JSON.parse(readFileSync(join(reportsDir, "coverage-summary.json"), "utf8")));
      }

      assert.deepEqual(summaries[1], summaries[0]);
      assert.equal(summaries[1][join(root, "src", "branch.ts")].branches.pct, 100);
      assert.equal(summaries[1][join(root, "src", "uncovered.ts")].lines.pct, 0);

      const failedGate = spawnSync(
        process.execPath,
        [c8, ...buildC8ReportArgs({ reportsDir: join(root, "gate"), tempDirectory: raw })],
        { cwd: root, env: reportEnv, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(failedGate.status, 1, failedGate.stderr);
      assert.match(failedGate.stderr, /Coverage for functions .* does not meet global threshold/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses ratcheted thresholds for the merged c8 report", () => {
    assert.deepEqual(COVERAGE_THRESHOLDS, {
      branches: 67,
      functions: 51,
      lines: 23,
    });

    assert.deepEqual(
      buildC8ReportArgs({
        reportsDir: "coverage",
        tempDirectory: "coverage/.tmp/run-1",
      }),
      [
        "report",
        "--all",
        "--merge-async",
        "--reporter=text",
        "--reporter=json-summary",
        "--include=src/**/*.ts",
        "--include=src/**/*.tsx",
        "--exclude=src/**/*.test.ts",
        "--exclude=src/**/*.test.tsx",
        "--check-coverage",
        "--lines=23",
        "--branches=67",
        "--functions=51",
        "--temp-directory=coverage/.tmp/run-1",
        "--reports-dir=coverage",
      ],
    );
  });

  it("marks API E2E coverage runnable only when the safe E2E preflight passes", () => {
    assert.equal(getApiE2ECoverageMode(validation(true), {}).mode, "run");
    assert.equal(getApiE2ECoverageMode(validation(false), {}).mode, "skip");
    assert.equal(
      getApiE2ECoverageMode(validation(false), {
        WEB_COVERAGE_REQUIRE_API_E2E: "1",
      }).mode,
      "fail",
    );
    assert.equal(
      getApiE2ECoverageMode(validation(false), {
        CI: "true",
      }).mode,
      "fail",
    );
    assert.equal(
      getApiE2ECoverageMode(validation(true), {
        WEB_COVERAGE_API_E2E: "0",
      }).mode,
      "skip",
    );
  });

  it("passes NODE_V8_COVERAGE through to child processes", () => {
    const env = buildNodeCoverageEnv(
      {
        PATH: "bin",
      },
      "coverage/.tmp/run-1",
    );

    assert.deepEqual(env, {
      NODE_V8_COVERAGE: "coverage/.tmp/run-1",
      PATH: "bin",
    });
  });

  it("bounds the incremental c8 merge heap below the hosted runner memory", () => {
    assert.deepEqual(
      buildC8ReportEnv({
        NODE_OPTIONS: "--enable-source-maps",
        PATH: "bin",
      }),
      {
        NODE_OPTIONS: "--enable-source-maps --max-old-space-size=4096",
        PATH: "bin",
      },
    );
    assert.deepEqual(buildC8ReportEnv({ PATH: "bin" }), {
      NODE_OPTIONS: "--max-old-space-size=4096",
      PATH: "bin",
    });
    assert.deepEqual(
      buildC8ReportEnv({
        NODE_OPTIONS: "--max-old-space-size=2048 --enable-source-maps",
      }),
      {
        NODE_OPTIONS: "--enable-source-maps --max-old-space-size=4096",
      },
    );
  });
});
