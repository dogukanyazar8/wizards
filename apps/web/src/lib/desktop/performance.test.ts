import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  formatDesktopPerformanceMetric,
  isDesktopMetricsEnabled,
  normalizeDesktopDurationMs,
  recordDesktopPerformanceMetric,
} from "./performance";

describe("desktop performance metrics", () => {
  const originalPublicFlag = process.env.NEXT_PUBLIC_DESKTOP_METRICS;
  const originalServerFlag = process.env.DESKTOP_METRICS;

  afterEach(() => {
    process.env.NEXT_PUBLIC_DESKTOP_METRICS = originalPublicFlag;
    process.env.DESKTOP_METRICS = originalServerFlag;
    mock.restoreAll();
  });

  it("keeps desktop metrics disabled by default", () => {
    delete process.env.NEXT_PUBLIC_DESKTOP_METRICS;
    delete process.env.DESKTOP_METRICS;

    assert.equal(isDesktopMetricsEnabled(), false);
  });

  it("accepts public and server opt-in flags", () => {
    process.env.NEXT_PUBLIC_DESKTOP_METRICS = "true";
    delete process.env.DESKTOP_METRICS;
    assert.equal(isDesktopMetricsEnabled(), true);

    process.env.NEXT_PUBLIC_DESKTOP_METRICS = "0";
    process.env.DESKTOP_METRICS = "1";
    assert.equal(isDesktopMetricsEnabled(), true);
  });

  it("normalizes metric durations without allowing negative values", () => {
    assert.equal(normalizeDesktopDurationMs(12.3456), 12.35);
    assert.equal(normalizeDesktopDurationMs(-5), 0);
    assert.equal(normalizeDesktopDurationMs(Number.NaN), undefined);
    assert.equal(normalizeDesktopDurationMs(undefined), undefined);
  });

  it("formats a PII-free metric payload", () => {
    const payload = JSON.parse(
      formatDesktopPerformanceMetric(
        {
          durationMs: 10.125,
          operation: "desktop_runtime_ready",
          result: "success",
        },
        new Date("2026-05-20T12:00:00.000Z"),
      ),
    );

    assert.deepEqual(payload, {
      durationMs: 10.13,
      operation: "desktop_runtime_ready",
      result: "success",
      runtime: "desktop",
      timestamp: "2026-05-20T12:00:00.000Z",
      type: "desktop",
    });
    assert.equal("userId" in payload, false);
    assert.equal("email" in payload, false);
    assert.equal("serverId" in payload, false);
    assert.equal("route" in payload, false);
  });

  it("records metrics only when explicitly enabled", () => {
    const info = mock.method(console, "info", () => undefined);
    delete process.env.NEXT_PUBLIC_DESKTOP_METRICS;
    delete process.env.DESKTOP_METRICS;

    recordDesktopPerformanceMetric({
      operation: "desktop_runtime_ready",
      result: "success",
    });
    assert.equal(info.mock.callCount(), 0);

    process.env.NEXT_PUBLIC_DESKTOP_METRICS = "1";
    recordDesktopPerformanceMetric({
      operation: "desktop_runtime_ready",
      result: "success",
    });

    assert.equal(info.mock.callCount(), 1);
  });
});
