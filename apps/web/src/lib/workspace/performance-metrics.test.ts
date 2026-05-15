import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flushWorkspacePerformanceMetricsForTest,
  recordMessageSendFanoutMetric,
  recordPermissionCacheInvalidation,
  recordPermissionCacheMetric,
  recordUnreadFanoutMetric,
  resetWorkspacePerformanceMetricsForTest,
} from "./performance-metrics";

function restoreEnv(
  name:
    | "WHISPR_INSTANCE_ID"
    | "WORKSPACE_PERFORMANCE_METRICS"
    | "WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS",
  value?: string,
) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("workspace performance metrics", () => {
  it("emits a structured CR-1 monitoring payload when enabled", () => {
    const originalEnabled = process.env.WORKSPACE_PERFORMANCE_METRICS;
    const originalInstanceId = process.env.WHISPR_INSTANCE_ID;
    const originalInterval = process.env.WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS;
    const originalConsoleInfo = console.info;
    const startedAt = Date.now();
    const logs: unknown[][] = [];
    process.env.WHISPR_INSTANCE_ID = "test-instance";
    process.env.WORKSPACE_PERFORMANCE_METRICS = "true";
    process.env.WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS = "30000";
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      resetWorkspacePerformanceMetricsForTest(startedAt);
      recordPermissionCacheMetric({
        area: "channelSnapshot",
        count: 2,
        event: "hit",
      });
      recordPermissionCacheMetric({
        area: "visibleChannelList",
        event: "miss",
      });
      recordPermissionCacheInvalidation("server");
      recordMessageSendFanoutMetric({
        activeChannelViewerCount: 3,
        activeServerMemberCount: 5,
        permittedChannelViewerCount: 3,
        permittedUnreadUserCount: 4,
        readUserCount: 4,
        unreadUpdateUserCount: 1,
      });
      recordUnreadFanoutMetric({
        durationMs: 12,
        mentionQueryCount: 1,
        targetUserCount: 4,
        unreadQueryCount: 1,
        visibilityGroupCount: 1,
        visibleUserCount: 4,
      });

      flushWorkspacePerformanceMetricsForTest(startedAt + 30_000);

      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.[0], "[workspace-performance]");

      const payload = JSON.parse(String(logs[0]?.[1])) as {
        instanceId: string;
        messageSendFanout: {
          calls: number;
          maxActiveServerMemberCount: number;
          maxUnreadUpdateUserCount: number;
        };
        permissionCache: {
          channelSnapshot: { hit: number };
          invalidations: { server: number };
          visibleChannelList: { miss: number };
        };
        scope: string;
        type: string;
        unreadFanout: {
          calls: number;
          maxDurationMs: number;
          maxVisibilityGroupCount: number;
        };
        windowMs: number;
      };

      assert.equal(payload.type, "workspace_performance");
      assert.equal(payload.scope, "process");
      assert.equal(payload.instanceId, "test-instance");
      assert.equal(payload.windowMs, 30_000);
      assert.equal(payload.permissionCache.channelSnapshot.hit, 2);
      assert.equal(payload.permissionCache.visibleChannelList.miss, 1);
      assert.equal(payload.permissionCache.invalidations.server, 1);
      assert.equal(payload.messageSendFanout.calls, 1);
      assert.equal(payload.messageSendFanout.maxActiveServerMemberCount, 5);
      assert.equal(payload.messageSendFanout.maxUnreadUpdateUserCount, 1);
      assert.equal(payload.unreadFanout.calls, 1);
      assert.equal(payload.unreadFanout.maxDurationMs, 12);
      assert.equal(payload.unreadFanout.maxVisibilityGroupCount, 1);
    } finally {
      resetWorkspacePerformanceMetricsForTest(0);
      restoreEnv("WHISPR_INSTANCE_ID", originalInstanceId);
      restoreEnv("WORKSPACE_PERFORMANCE_METRICS", originalEnabled);
      restoreEnv("WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS", originalInterval);
      console.info = originalConsoleInfo;
    }
  });
});
