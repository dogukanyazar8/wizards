import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobilePerformanceAutomationExecutor,
  createMobilePerformanceReportFrames,
} from "../src/performance/mobile-performance-automation";

describe("mobile performance automation", () => {
  it("rejects every command outside UAT without invoking dependencies", async () => {
    const calls: string[] = [];
    const execute = createMobilePerformanceAutomationExecutor({
      emit: (line) => calls.push(line),
      environment: "production",
      exportReport: async () => "report",
      prefetch: async () => {
        calls.push("prefetch");
      },
      purge: async () => {
        calls.push("purge");
      },
      reset: async () => {
        calls.push("reset");
      },
    });

    await execute({ command: "reset", runId: "run-06", type: "performance-automation" });

    assert.deepEqual(calls, ["WHISPR_PERF|ERROR|run-06|reset|uat-only"]);
  });

  it("routes target commands and emits one acknowledgement after settlement", async () => {
    const calls: string[] = [];
    const execute = createMobilePerformanceAutomationExecutor({
      emit: (line) => calls.push(line),
      environment: "uat",
      exportReport: async () => "report",
      prefetch: async (scope, targetId) => {
        calls.push(`prefetch:${scope}:${targetId}`);
      },
      purge: async (scope, targetId) => {
        calls.push(`purge:${scope}:${targetId}`);
      },
      reset: async () => {
        calls.push("reset");
      },
    });

    await execute({
      command: "prefetch",
      runId: "run-11",
      scope: "dm",
      targetId: "target-1",
      type: "performance-automation",
    });

    assert.deepEqual(calls, ["prefetch:dm:target-1", "WHISPR_PERF|ACK|run-11|prefetch"]);
  });

  it("frames an exported UTF-8 report with ordered chunks and SHA-256", () => {
    const frames = createMobilePerformanceReportFrames("run-14", "ölçüm\nreport", 8);
    assert.match(frames[0] ?? "", /^WHISPR_PERF\|BEGIN\|run-14\|\d+\|[a-f0-9]{64}$/u);
    assert.equal(frames.at(-1), "WHISPR_PERF|END|run-14");

    const encoded = frames
      .slice(1, -1)
      .map((line, index) => {
        const parts = line.split("|");
        assert.equal(parts[0], "WHISPR_PERF");
        assert.equal(parts[1], "CHUNK");
        assert.equal(parts[2], "run-14");
        assert.equal(Number(parts[3]), index);
        return parts[5];
      })
      .join("");
    assert.equal(decodeURIComponent(encoded), "ölçüm\nreport");
  });

  it("exports only after report generation and reports fixed failures", async () => {
    const calls: string[] = [];
    const execute = createMobilePerformanceAutomationExecutor({
      emit: (line) => calls.push(line),
      environment: "uat",
      exportReport: async () => {
        throw new Error("private runtime detail");
      },
      prefetch: async () => undefined,
      purge: async () => undefined,
      reset: async () => undefined,
    });

    await execute({ command: "export", runId: "run-14", type: "performance-automation" });

    assert.deepEqual(calls, ["WHISPR_PERF|ERROR|run-14|export|command-failed"]);
  });
});
