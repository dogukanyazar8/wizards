import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  formatAppStartupMetric,
  getAppStartupDurationMs,
  isAppStartupMetricsEnabled,
  recordAppStartupReadyMetric,
} from "./performance";

const originalConsoleInfo = console.info;
const originalClientEnabled = process.env.NEXT_PUBLIC_APP_STARTUP_METRICS;
const originalServerEnabled = process.env.APP_STARTUP_METRICS;

afterEach(() => {
  console.info = originalConsoleInfo;
  restoreEnv("NEXT_PUBLIC_APP_STARTUP_METRICS", originalClientEnabled);
  restoreEnv("APP_STARTUP_METRICS", originalServerEnabled);
});

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "string") {
    process.env[name] = value;
    return;
  }

  delete process.env[name];
}

describe("app startup performance metrics", () => {
  it("formats a bounded PII-free startup metric payload", () => {
    const payload = JSON.parse(
      formatAppStartupMetric(
        {
          durationMs: 123.456,
          result: "success",
          runtime: "web",
        },
        new Date("2026-05-19T06:00:00.000Z"),
      ),
    ) as Record<string, unknown>;

    assert.deepEqual(Object.keys(payload).sort(), [
      "durationMs",
      "operation",
      "result",
      "runtime",
      "timestamp",
      "type",
    ]);
    assert.equal(payload.durationMs, 123.46);
    assert.equal(payload.operation, "app_startup_ready");
    assert.equal(payload.runtime, "web");
    assert.equal(payload.type, "app_startup");
    assert.equal(payload.timestamp, "2026-05-19T06:00:00.000Z");
    assert.equal(payload.email, undefined);
    assert.equal(payload.serverId, undefined);
    assert.equal(payload.userId, undefined);
  });

  it("does not emit unless startup metrics are explicitly enabled", () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    delete process.env.NEXT_PUBLIC_APP_STARTUP_METRICS;
    delete process.env.APP_STARTUP_METRICS;

    recordAppStartupReadyMetric({
      durationMs: 10,
      result: "success",
      runtime: "web",
    });

    assert.equal(logs.length, 0);
  });

  it("emits through the public client flag without leaking user context", () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    process.env.NEXT_PUBLIC_APP_STARTUP_METRICS = "true";

    recordAppStartupReadyMetric({
      durationMs: 10,
      result: "success",
      runtime: "desktop",
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.[0], "[app-startup]");
    const payload = JSON.parse(String(logs[0]?.[1])) as Record<string, unknown>;
    assert.equal(payload.runtime, "desktop");
    assert.equal(payload.userId, undefined);
  });

  it("reads client and server flags independently and clamps negative durations", () => {
    process.env.NEXT_PUBLIC_APP_STARTUP_METRICS = "false";
    process.env.APP_STARTUP_METRICS = "1";

    assert.equal(isAppStartupMetricsEnabled(), true);
    assert.equal(getAppStartupDurationMs(20, 10), 0);
    assert.equal(getAppStartupDurationMs(20, 21.234), 1.23);
  });
});
