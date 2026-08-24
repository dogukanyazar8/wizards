import assert from "node:assert/strict";
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

  it("gives only the c8 report child enough heap for the all-file merge", () => {
    assert.deepEqual(
      buildC8ReportEnv({
        NODE_OPTIONS: "--enable-source-maps",
        PATH: "bin",
      }),
      {
        NODE_OPTIONS: "--enable-source-maps --max-old-space-size=6144",
        PATH: "bin",
      },
    );
    assert.deepEqual(buildC8ReportEnv({ PATH: "bin" }), {
      NODE_OPTIONS: "--max-old-space-size=6144",
      PATH: "bin",
    });
    assert.deepEqual(
      buildC8ReportEnv({
        NODE_OPTIONS: "--max-old-space-size=2048 --enable-source-maps",
      }),
      {
        NODE_OPTIONS: "--enable-source-maps --max-old-space-size=6144",
      },
    );
  });
});
