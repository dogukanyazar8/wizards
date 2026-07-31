import type { MobileListBlankAreaStats } from "./mobile-list-blank-area";
import type { MobileEventLoopLagSummary } from "./mobile-event-loop-lag";
import type { MobileRequestLatencyStats } from "./mobile-request-metrics";
import { toMobileMetricRoute } from "./mobile-request-metrics";
import type {
  MobileChatContentClassRow,
  MobileChatOpenCohortRow,
  MobileChatOpenPhaseRow,
  MobileChatOpenRouteRow,
  MobileChatOpenSourceRow,
  MobileChatOpenStageRow,
  MobileChatTransitionRow,
  MobilePerformanceSummaryRow,
} from "./mobile-performance-summary";
import type { MobileStartupPhase } from "./mobile-startup-phases";
import type { MobileMessageStoreDiagnostics } from "../storage/mobile-message-store";

export type MobilePerformanceReportBuild = {
  readonly appVersion: string;
  readonly backendBuildId: string;
  readonly buildId: string;
  readonly deviceTier: string;
  readonly environment: string;
  readonly networkClass: string;
  readonly osName: string;
  readonly osVersion: string;
};

export type MobilePerformanceReportInput = {
  readonly blankArea: readonly MobileListBlankAreaStats[];
  readonly build: MobilePerformanceReportBuild;
  readonly chatContentClasses: readonly MobileChatContentClassRow[];
  readonly chatOpenCohorts: readonly MobileChatOpenCohortRow[];
  readonly chatOpenPhases: readonly MobileChatOpenPhaseRow[];
  readonly chatOpenRoutes: readonly MobileChatOpenRouteRow[];
  readonly chatOpenSources: readonly MobileChatOpenSourceRow[];
  readonly chatOpenStages: readonly MobileChatOpenStageRow[];
  readonly eventLoop: MobileEventLoopLagSummary;
  /** ISO 8601, so two runs of the same build can be told apart. */
  readonly generatedAt: string;
  readonly metrics: readonly MobilePerformanceSummaryRow[];
  readonly prefetch: {
    readonly attempted: number;
    readonly hitRate: number;
    readonly openedAfterSettled: number;
    readonly settled: number;
  };
  readonly requestLatency: readonly MobileRequestLatencyStats[];
  readonly sampleCount: number;
  readonly spans: { readonly abandoned: number; readonly open: number };
  readonly startupPhases: Readonly<Partial<Record<MobileStartupPhase, number>>>;
  readonly storage: MobileMessageStoreDiagnostics | null;
  readonly transitions: readonly MobileChatTransitionRow[];
};

export const MOBILE_PERFORMANCE_REPORT_MAX_CHARS = 32_000;

function value(input: number | null | undefined): string {
  return input === null || input === undefined ? "-" : String(input);
}

function label(name: string, count: number): string {
  return `${name.padEnd(24, " ")} n=${count}`;
}

function section(title: string, lines: readonly string[]): string[] {
  return ["", `## ${title}`, ...(lines.length === 0 ? ["(no measurements)"] : lines)];
}

/** Builds a bounded, paste-safe diagnostics artifact from fixed-cardinality summaries. */
export function buildMobilePerformanceReport(input: MobilePerformanceReportInput): string {
  const { build } = input;
  const lines: string[] = [
    "Whispr mobile performance report",
    `generated ${input.generatedAt}`,
    `build ${build.environment} | ${build.appVersion} | ${build.osName} ${build.osVersion} | ` +
      `client ${build.buildId} | backend ${build.backendBuildId} | tier ${build.deviceTier} | ` +
      `network ${build.networkClass}`,
    `samples ${input.sampleCount}`,
  ];

  lines.push(
    ...section(
      "budget metrics (p50/p95/p99 ms)",
      input.metrics.map(
        (row) =>
          `${label(row.metric, row.count)}  ${value(row.p50Ms)} / ${value(row.p95Ms)} / ${value(
            row.p99Ms,
          )}`,
      ),
    ),
    ...section(
      "chat open stages, from the tap (p50/p95 ms)",
      input.chatOpenStages.map(
        (row) => `${label(row.stage, row.count)}  ${value(row.p50Ms)} / ${value(row.p95Ms)}`,
      ),
    ),
    ...section(
      "chat open phases (p50/p95 ms)",
      input.chatOpenPhases.map(
        (row) => `${label(row.phase, row.count)}  ${value(row.p50Ms)} / ${value(row.p95Ms)}`,
      ),
    ),
    ...section(
      "route source transition cohorts (p50/p95 | first5/last5 | slope ms/sample)",
      input.chatOpenCohorts
        .filter((row) => row.count > 0)
        .slice(0, 48)
        .map(
          (row) =>
            `${label(`${row.route}/${row.source}/${row.transition}`, row.count)}  ${value(
              row.p50Ms,
            )} / ${value(row.p95Ms)} | ${value(row.first5P50Ms)} / ${value(
              row.last5P50Ms,
            )} | ${value(row.slopeMsPerSample)}`,
        ),
    ),
    ...section(
      "row and content classes (p50/p95 ms)",
      input.chatContentClasses
        .slice(0, 25)
        .map(
          (row) =>
            `${label(`${row.dimension}/${row.value}`, row.count)}  ${value(row.p50Ms)} / ${value(
              row.p95Ms,
            )}`,
        ),
    ),
    "",
    "## JS event-loop lag (p50/p95/max ms)",
    `${label("lag", input.eventLoop.count)}  ${value(input.eventLoop.p50Ms)} / ${value(
      input.eventLoop.p95Ms,
    )} / ${value(input.eventLoop.maxMs)}`,
    ...section(
      "chat open by surface (p50/p95 ms)",
      input.chatOpenRoutes.map(
        (row) =>
          `${label(`${row.route}-${row.cacheHit ? "cached" : "network"}`, row.count)}  ${value(
            row.p50Ms,
          )} / ${value(row.p95Ms)}`,
      ),
    ),
    ...section(
      "chat open source (p50/p95 ms | cache age ms)",
      input.chatOpenSources.map(
        (row) =>
          `${label(row.source, row.count)}  ${value(row.p50Ms)} / ${value(row.p95Ms)} | ${value(
            row.cacheAgeP50Ms,
          )}`,
      ),
    ),
    ...section(
      "transition A/B (p50/p95 ms)",
      input.transitions.map(
        (row) => `${label(row.variant, row.count)}  ${value(row.p50Ms)} / ${value(row.p95Ms)}`,
      ),
    ),
    ...section(
      "blank area (p50/p95/max px)",
      input.blankArea.map(
        (row) =>
          `${label(row.surface, row.count)}  ${value(row.p50Px)} / ${value(row.p95Px)} / ${value(
            row.maxPx,
          )}`,
      ),
    ),
    ...section(
      "startup phases (ms)",
      Object.entries(input.startupPhases).map(
        ([phase, elapsedMs]) => `${phase.padEnd(24, " ")} ${Math.round(elapsedMs)}`,
      ),
    ),
    "",
    "## encrypted message store",
    `cipher_version ${input.storage?.cipherVersion ?? "-"} | status ${
      input.storage?.status ?? "-"
    } | rows ${value(input.storage?.rowCount)}`,
    "",
    "## prefetch (attempted / settled / opened after settled)",
    `${input.prefetch.attempted} / ${input.prefetch.settled} / ${
      input.prefetch.openedAfterSettled
    } | ${Math.round(input.prefetch.hitRate * 100)}%`,
    "",
    "## spans (open / abandoned)",
    `${input.spans.open} / ${input.spans.abandoned}`,
  );

  lines.push(
    ...section(
      "request timing (p50/p95 ms)",
      input.requestLatency
        .slice(0, 40)
        .flatMap((stats) => [
          label(`${stats.method} ${toMobileMetricRoute(stats.route)}`, stats.count),
          `  hdr ${value(stats.headersP50Ms)}/${value(stats.headersP95Ms)} | settled ${value(
            stats.settledP50Ms,
          )}/${value(stats.settledP95Ms)}`,
          `  srv ${value(stats.serverP50Ms)}/${value(stats.serverP95Ms)} (last auth ${value(
            stats.lastServer.authMs,
          )} / last db ${value(stats.lastServer.dbMs)}) | net ${value(
            stats.transportP95Ms,
          )} | req ${stats.lastRequestId ?? "-"}`,
        ]),
    ),
  );

  const report = `${lines.join("\n")}\n`;
  if (report.length <= MOBILE_PERFORMANCE_REPORT_MAX_CHARS) return report;

  const marker = "\n[report truncated at bounded export limit]\n";
  return `${report.slice(0, MOBILE_PERFORMANCE_REPORT_MAX_CHARS - marker.length)}${marker}`;
}
