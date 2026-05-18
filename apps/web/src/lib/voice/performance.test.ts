import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  formatVoicePerformanceMetric,
  getVoicePerformanceDurationMs,
  isVoicePerformanceMetricsEnabled,
  measureVoicePerformance,
  recordVoicePerformanceMetric,
} from "./performance";

const originalConsoleInfo = console.info;
const originalClientEnabled = process.env.NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS;
const originalServerEnabled = process.env.VOICE_PERFORMANCE_METRICS;

afterEach(() => {
  console.info = originalConsoleInfo;
  restoreEnv("NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS", originalClientEnabled);
  restoreEnv("VOICE_PERFORMANCE_METRICS", originalServerEnabled);
});

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "string") {
    process.env[name] = value;
    return;
  }

  delete process.env[name];
}

describe("voice performance metrics", () => {
  it("keeps timing output bounded and structured", () => {
    const payload = JSON.parse(
      formatVoicePerformanceMetric(
        {
          durationMs: 12.3456,
          operation: "voice_state_post",
          result: "success",
          runtime: "server",
        },
        new Date("2026-05-18T07:00:00.000Z"),
      ),
    ) as {
      durationMs: number;
      operation: string;
      result: string;
      runtime: string;
      timestamp: string;
      type: string;
    };

    assert.equal(payload.timestamp, "2026-05-18T07:00:00.000Z");
    assert.equal(payload.type, "voice_performance");
    assert.equal(payload.operation, "voice_state_post");
    assert.equal(payload.durationMs, 12.35);
    assert.equal(payload.runtime, "server");
    assert.equal(payload.result, "success");
  });

  it("does not emit metrics unless the matching runtime flag is enabled", () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    delete process.env.NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS;
    delete process.env.VOICE_PERFORMANCE_METRICS;

    recordVoicePerformanceMetric({
      durationMs: 10,
      operation: "livekit_token_fetch",
      result: "success",
      runtime: "client",
    });
    recordVoicePerformanceMetric({
      durationMs: 10,
      operation: "livekit_token",
      result: "success",
      runtime: "server",
    });

    assert.equal(logs.length, 0);
  });

  it("emits only safe metric fields when enabled", () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    process.env.VOICE_PERFORMANCE_METRICS = "true";

    recordVoicePerformanceMetric({
      durationMs: 23.4,
      errorCode: "ROOM_FULL",
      operation: "voice_state_post",
      result: "error",
      runtime: "server",
      status: 403,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.[0], "[voice-performance]");
    const payload = JSON.parse(String(logs[0]?.[1])) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), [
      "durationMs",
      "errorCode",
      "operation",
      "result",
      "runtime",
      "status",
      "timestamp",
      "type",
    ]);
  });

  it("records failed measured operations with status and code metadata", async () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    process.env.NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS = "true";

    await assert.rejects(() =>
      measureVoicePerformance(
        {
          operation: "voice_state_delete",
          runtime: "client",
        },
        async () => {
          throw Object.assign(new Error("failed"), {
            code: "RATE_LIMITED",
            status: 429,
          });
        },
      ),
    );

    assert.equal(logs.length, 1);
    const payload = JSON.parse(String(logs[0]?.[1])) as {
      errorCode: string;
      result: string;
      status: number;
    };
    assert.equal(payload.result, "error");
    assert.equal(payload.errorCode, "RATE_LIMITED");
    assert.equal(payload.status, 429);
  });

  it("rounds negative duration calculations up to zero", () => {
    assert.equal(getVoicePerformanceDurationMs(10, 5), 0);
    assert.equal(getVoicePerformanceDurationMs(10, 11.234), 1.23);
  });

  it("reads client and server flags independently", () => {
    process.env.NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS = "true";
    process.env.VOICE_PERFORMANCE_METRICS = "false";

    assert.equal(isVoicePerformanceMetricsEnabled("client"), true);
    assert.equal(isVoicePerformanceMetricsEnabled("server"), false);
  });
});
