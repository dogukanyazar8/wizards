import type { MobileTelemetryDimensions } from "./mobile-telemetry-dimensions";
import {
  MOBILE_PERFORMANCE_SUMMARY_METRICS,
  type MobilePerformanceSummaryRow,
} from "./mobile-performance-summary";
import type { MobileMessageStoreDiagnostics } from "../storage/mobile-message-store";

type MobilePerformanceBenchmarkPrefetch = {
  readonly hitRate: number;
  readonly hits: number;
  readonly warmed: number;
};

export type MobilePerformanceBenchmarkReport = {
  readonly metrics: readonly {
    readonly metric: string;
    readonly n: number;
    readonly p50Ms: number | null;
    readonly p95Ms: number | null;
    readonly p99Ms: number | null;
  }[];
  readonly prefetch: MobilePerformanceBenchmarkPrefetch;
  readonly runtime: MobileTelemetryDimensions & {
    /** Public API origin proves that the UAT evidence came from the intended backend. */
    readonly apiOrigin: string;
  };
  readonly schemaVersion: 1;
  readonly store: {
    readonly cipherVersion: string | null;
    readonly rowCount: number | null;
    readonly status: MobileMessageStoreDiagnostics["status"] | null;
  };
};

/**
 * The automation can read the diagnostics panel through UIAutomator, but it must
 * never turn that route into an arbitrary device-data export. This structural
 * copy is intentionally an allow-list: runtime metadata, summary percentiles,
 * prefetch counters, and store health only. Raw measurement contexts can carry
 * navigation identifiers and must remain on the device.
 */
export function createMobilePerformanceBenchmarkReport(input: {
  readonly apiOrigin: string;
  readonly dimensions: MobileTelemetryDimensions;
  readonly prefetch: MobilePerformanceBenchmarkPrefetch;
  readonly rows: readonly MobilePerformanceSummaryRow[];
  readonly storage: MobileMessageStoreDiagnostics | null;
}): MobilePerformanceBenchmarkReport {
  const rowByMetric = new Map(input.rows.map((row) => [row.metric, row]));

  return {
    metrics: MOBILE_PERFORMANCE_SUMMARY_METRICS.map((metric) => {
      const row = rowByMetric.get(metric);
      return {
        metric,
        n: row?.count ?? 0,
        p50Ms: row?.p50Ms ?? null,
        p95Ms: row?.p95Ms ?? null,
        p99Ms: row?.p99Ms ?? null,
      };
    }),
    prefetch: {
      hitRate: input.prefetch.hitRate,
      hits: input.prefetch.hits,
      warmed: input.prefetch.warmed,
    },
    runtime: {
      apiOrigin: input.apiOrigin,
      appVersion: input.dimensions.appVersion,
      buildId: input.dimensions.buildId,
      deviceTier: input.dimensions.deviceTier,
      environment: input.dimensions.environment,
      networkClass: input.dimensions.networkClass,
      osName: input.dimensions.osName,
      osVersion: input.dimensions.osVersion,
    },
    schemaVersion: 1,
    store: {
      cipherVersion: input.storage?.cipherVersion ?? null,
      rowCount: input.storage?.rowCount ?? null,
      status: input.storage?.status ?? null,
    },
  };
}

export function serializeMobilePerformanceBenchmarkReport(
  report: MobilePerformanceBenchmarkReport,
): string {
  return JSON.stringify(report);
}
