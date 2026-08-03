import {
  drainMobilePerformanceSamples,
  peekMobilePerformanceSamples,
} from "./mobile-performance-metrics";
import {
  summarizeMobileChatContentClasses,
  summarizeMobileChatOpenCohorts,
  summarizeMobileChatOpenPhases,
  summarizeMobileChatOpenRoutes,
  summarizeMobileChatOpenSources,
  summarizeMobileChatOpenStages,
  summarizeMobileChatTransitions,
  summarizeMobilePerformanceSamples,
  type MobilePerformanceSummaryInput,
} from "./mobile-performance-summary";
import {
  getMobileListBlankAreaSnapshot,
  resetMobileListBlankAreaForTests,
} from "./mobile-list-blank-area";
import { buildMobilePerformanceReport } from "./mobile-performance-report";
import { discardPendingMobilePerformanceSamples } from "./mobile-performance-sample-persistence";
import { mergeMobilePerformanceSampleViews } from "./mobile-performance-sample-view";
import {
  getMobileNavigationSpanDiagnostics,
  resetMobileNavigationTimingForTests,
} from "./mobile-navigation-timing";
import {
  getMobileRequestLatencySnapshot,
  resetMobileRequestLatencyForTests,
} from "./mobile-request-metrics";
import { getMobileStartupPhaseTimeline } from "./mobile-startup-phases";
import { resolveMobileTelemetryDimensions } from "./mobile-telemetry-dimensions";
import type { MobileEventLoopLagSummary } from "./mobile-event-loop-lag";
import { getMobileRuntimeConfig } from "../config/environment";
import {
  getMobileRecentDMPrefetchStats,
  resetMobileRecentDMPrefetchStatsForTests,
} from "../query/mobile-message-prefetch";
import { resetMobileMessageStreamSourcesForTests } from "../query/mobile-message-stream-source";
import { mobileMessageStore } from "../storage/mobile-message-store-database";
import type { MobileMessageStoreDiagnostics } from "../storage/mobile-message-store";

export async function readMobilePerformanceDiagnostics(): Promise<{
  readonly samples: readonly MobilePerformanceSummaryInput[];
  readonly storage: MobileMessageStoreDiagnostics | null;
}> {
  const [persisted, storage] = await Promise.all([
    mobileMessageStore.readPerformanceSamples().catch(() => []),
    mobileMessageStore.describe().catch(() => null),
  ]);

  return {
    samples: mergeMobilePerformanceSampleViews(persisted, peekMobilePerformanceSamples()),
    storage,
  };
}

export async function resetMobilePerformanceDiagnostics(): Promise<number> {
  const drained = drainMobilePerformanceSamples().length;
  await discardPendingMobilePerformanceSamples();
  await mobileMessageStore.purgePerformanceSamples();
  resetMobileListBlankAreaForTests();
  resetMobileNavigationTimingForTests();
  resetMobileRequestLatencyForTests();
  resetMobileRecentDMPrefetchStatsForTests();
  resetMobileMessageStreamSourcesForTests();
  return drained;
}

export function buildMobilePerformanceDiagnosticsReport(input: {
  readonly backendBuildId: string;
  readonly eventLoop: MobileEventLoopLagSummary;
  readonly generatedAt?: string;
  readonly samples: readonly MobilePerformanceSummaryInput[];
  readonly storage: MobileMessageStoreDiagnostics | null;
}): string {
  const runtimeConfig = getMobileRuntimeConfig();
  let dimensions: Record<string, unknown> = {};
  try {
    dimensions = resolveMobileTelemetryDimensions() as unknown as Record<string, unknown>;
  } catch {
    dimensions = {};
  }

  return buildMobilePerformanceReport({
    blankArea: getMobileListBlankAreaSnapshot(),
    build: {
      appVersion: String(dimensions.appVersion ?? "?"),
      backendBuildId: input.backendBuildId,
      buildId: String(dimensions.buildId ?? "?"),
      deviceTier: String(dimensions.deviceTier ?? "?"),
      environment: runtimeConfig.environment,
      networkClass: String(dimensions.networkClass ?? "?"),
      osName: String(dimensions.osName ?? "?"),
      osVersion: String(dimensions.osVersion ?? ""),
    },
    chatContentClasses: summarizeMobileChatContentClasses(input.samples),
    chatOpenCohorts: summarizeMobileChatOpenCohorts(input.samples),
    chatOpenPhases: summarizeMobileChatOpenPhases(input.samples),
    chatOpenRoutes: summarizeMobileChatOpenRoutes(input.samples),
    chatOpenSources: summarizeMobileChatOpenSources(input.samples),
    chatOpenStages: summarizeMobileChatOpenStages(input.samples),
    eventLoop: input.eventLoop,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    metrics: summarizeMobilePerformanceSamples(input.samples),
    prefetch: getMobileRecentDMPrefetchStats(),
    requestLatency: getMobileRequestLatencySnapshot().filter(
      (stats) => stats.lastServer.totalMs !== null,
    ),
    sampleCount: input.samples.length,
    spans: getMobileNavigationSpanDiagnostics(),
    startupPhases: getMobileStartupPhaseTimeline(),
    storage: input.storage,
    transitions: summarizeMobileChatTransitions(input.samples),
  });
}
