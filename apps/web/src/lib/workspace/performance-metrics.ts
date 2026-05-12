type PermissionCacheArea = "channelSnapshot" | "visibleChannelList";
type PermissionCacheEvent = "bypass" | "error" | "hit" | "miss" | "stale" | "write";

type PermissionCacheMetrics = Record<PermissionCacheArea, Record<PermissionCacheEvent, number>> & {
  invalidations: {
    member: number;
    server: number;
  };
};

type UnreadFanoutMetrics = {
  calls: number;
  maxDurationMs: number;
  maxTargetUserCount: number;
  maxVisibilityGroupCount: number;
  totalDurationMs: number;
  totalMentionQueryCount: number;
  totalTargetUserCount: number;
  totalUnreadQueryCount: number;
  totalVisibilityGroupCount: number;
  totalVisibleUserCount: number;
};

type MessageSendFanoutMetrics = {
  calls: number;
  maxActiveChannelViewerCount: number;
  maxActiveServerMemberCount: number;
  maxUnreadUpdateUserCount: number;
  totalActiveChannelViewerCount: number;
  totalActiveServerMemberCount: number;
  totalPermittedChannelViewerCount: number;
  totalPermittedUnreadUserCount: number;
  totalReadUserCount: number;
  totalUnreadUpdateUserCount: number;
};

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;
const MIN_FLUSH_INTERVAL_MS = 5_000;

function createPermissionCacheMetrics(): PermissionCacheMetrics {
  return {
    channelSnapshot: {
      bypass: 0,
      error: 0,
      hit: 0,
      miss: 0,
      stale: 0,
      write: 0,
    },
    invalidations: {
      member: 0,
      server: 0,
    },
    visibleChannelList: {
      bypass: 0,
      error: 0,
      hit: 0,
      miss: 0,
      stale: 0,
      write: 0,
    },
  };
}

function createUnreadFanoutMetrics(): UnreadFanoutMetrics {
  return {
    calls: 0,
    maxDurationMs: 0,
    maxTargetUserCount: 0,
    maxVisibilityGroupCount: 0,
    totalDurationMs: 0,
    totalMentionQueryCount: 0,
    totalTargetUserCount: 0,
    totalUnreadQueryCount: 0,
    totalVisibilityGroupCount: 0,
    totalVisibleUserCount: 0,
  };
}

function createMessageSendFanoutMetrics(): MessageSendFanoutMetrics {
  return {
    calls: 0,
    maxActiveChannelViewerCount: 0,
    maxActiveServerMemberCount: 0,
    maxUnreadUpdateUserCount: 0,
    totalActiveChannelViewerCount: 0,
    totalActiveServerMemberCount: 0,
    totalPermittedChannelViewerCount: 0,
    totalPermittedUnreadUserCount: 0,
    totalReadUserCount: 0,
    totalUnreadUpdateUserCount: 0,
  };
}

let permissionCacheMetrics = createPermissionCacheMetrics();
let unreadFanoutMetrics = createUnreadFanoutMetrics();
let messageSendFanoutMetrics = createMessageSendFanoutMetrics();
let windowStartedAt = Date.now();
let nextFlushAt = windowStartedAt + DEFAULT_FLUSH_INTERVAL_MS;

function isWorkspacePerformanceMetricsEnabled() {
  return (
    process.env.WORKSPACE_PERFORMANCE_METRICS === "true" ||
    process.env.PERMISSION_CACHE_METRICS === "true"
  );
}

function getFlushIntervalMs() {
  const configured = Number.parseInt(
    process.env.WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS ?? "",
    10,
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_FLUSH_INTERVAL_MS;
  }

  return Math.max(configured, MIN_FLUSH_INTERVAL_MS);
}

function hasMetricsToFlush() {
  return (
    permissionCacheMetrics.channelSnapshot.bypass > 0 ||
    permissionCacheMetrics.channelSnapshot.error > 0 ||
    permissionCacheMetrics.channelSnapshot.hit > 0 ||
    permissionCacheMetrics.channelSnapshot.miss > 0 ||
    permissionCacheMetrics.channelSnapshot.stale > 0 ||
    permissionCacheMetrics.channelSnapshot.write > 0 ||
    permissionCacheMetrics.visibleChannelList.bypass > 0 ||
    permissionCacheMetrics.visibleChannelList.error > 0 ||
    permissionCacheMetrics.visibleChannelList.hit > 0 ||
    permissionCacheMetrics.visibleChannelList.miss > 0 ||
    permissionCacheMetrics.visibleChannelList.stale > 0 ||
    permissionCacheMetrics.visibleChannelList.write > 0 ||
    permissionCacheMetrics.invalidations.member > 0 ||
    permissionCacheMetrics.invalidations.server > 0 ||
    messageSendFanoutMetrics.calls > 0 ||
    unreadFanoutMetrics.calls > 0
  );
}

function flushWorkspacePerformanceMetrics(now = Date.now()) {
  if (!hasMetricsToFlush()) {
    nextFlushAt = now + getFlushIntervalMs();
    windowStartedAt = now;
    return;
  }

  console.info(
    "[workspace-performance]",
    JSON.stringify({
      permissionCache: permissionCacheMetrics,
      messageSendFanout: messageSendFanoutMetrics,
      type: "workspace_performance",
      unreadFanout: unreadFanoutMetrics,
      windowMs: now - windowStartedAt,
    }),
  );

  permissionCacheMetrics = createPermissionCacheMetrics();
  unreadFanoutMetrics = createUnreadFanoutMetrics();
  messageSendFanoutMetrics = createMessageSendFanoutMetrics();
  windowStartedAt = now;
  nextFlushAt = now + getFlushIntervalMs();
}

function maybeFlushWorkspacePerformanceMetrics() {
  if (!isWorkspacePerformanceMetricsEnabled()) {
    return;
  }

  const now = Date.now();
  if (now >= nextFlushAt) {
    flushWorkspacePerformanceMetrics(now);
  }
}

export function recordPermissionCacheMetric(args: {
  area: PermissionCacheArea;
  count?: number;
  event: PermissionCacheEvent;
}) {
  if (!isWorkspacePerformanceMetricsEnabled()) {
    return;
  }

  permissionCacheMetrics[args.area][args.event] += args.count ?? 1;
  maybeFlushWorkspacePerformanceMetrics();
}

export function recordPermissionCacheInvalidation(scope: "member" | "server", count = 1) {
  if (!isWorkspacePerformanceMetricsEnabled()) {
    return;
  }

  permissionCacheMetrics.invalidations[scope] += count;
  maybeFlushWorkspacePerformanceMetrics();
}

export function recordUnreadFanoutMetric(args: {
  durationMs: number;
  mentionQueryCount: number;
  targetUserCount: number;
  unreadQueryCount: number;
  visibilityGroupCount: number;
  visibleUserCount: number;
}) {
  if (!isWorkspacePerformanceMetricsEnabled()) {
    return;
  }

  unreadFanoutMetrics.calls += 1;
  unreadFanoutMetrics.totalDurationMs += args.durationMs;
  unreadFanoutMetrics.totalMentionQueryCount += args.mentionQueryCount;
  unreadFanoutMetrics.totalTargetUserCount += args.targetUserCount;
  unreadFanoutMetrics.totalUnreadQueryCount += args.unreadQueryCount;
  unreadFanoutMetrics.totalVisibilityGroupCount += args.visibilityGroupCount;
  unreadFanoutMetrics.totalVisibleUserCount += args.visibleUserCount;
  unreadFanoutMetrics.maxDurationMs = Math.max(
    unreadFanoutMetrics.maxDurationMs,
    args.durationMs,
  );
  unreadFanoutMetrics.maxTargetUserCount = Math.max(
    unreadFanoutMetrics.maxTargetUserCount,
    args.targetUserCount,
  );
  unreadFanoutMetrics.maxVisibilityGroupCount = Math.max(
    unreadFanoutMetrics.maxVisibilityGroupCount,
    args.visibilityGroupCount,
  );

  maybeFlushWorkspacePerformanceMetrics();
}

export function recordMessageSendFanoutMetric(args: {
  activeChannelViewerCount: number;
  activeServerMemberCount: number;
  permittedChannelViewerCount: number;
  permittedUnreadUserCount: number;
  readUserCount: number;
  unreadUpdateUserCount: number;
}) {
  if (!isWorkspacePerformanceMetricsEnabled()) {
    return;
  }

  messageSendFanoutMetrics.calls += 1;
  messageSendFanoutMetrics.totalActiveChannelViewerCount += args.activeChannelViewerCount;
  messageSendFanoutMetrics.totalActiveServerMemberCount += args.activeServerMemberCount;
  messageSendFanoutMetrics.totalPermittedChannelViewerCount += args.permittedChannelViewerCount;
  messageSendFanoutMetrics.totalPermittedUnreadUserCount += args.permittedUnreadUserCount;
  messageSendFanoutMetrics.totalReadUserCount += args.readUserCount;
  messageSendFanoutMetrics.totalUnreadUpdateUserCount += args.unreadUpdateUserCount;
  messageSendFanoutMetrics.maxActiveChannelViewerCount = Math.max(
    messageSendFanoutMetrics.maxActiveChannelViewerCount,
    args.activeChannelViewerCount,
  );
  messageSendFanoutMetrics.maxActiveServerMemberCount = Math.max(
    messageSendFanoutMetrics.maxActiveServerMemberCount,
    args.activeServerMemberCount,
  );
  messageSendFanoutMetrics.maxUnreadUpdateUserCount = Math.max(
    messageSendFanoutMetrics.maxUnreadUpdateUserCount,
    args.unreadUpdateUserCount,
  );

  maybeFlushWorkspacePerformanceMetrics();
}
