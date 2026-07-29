import {
  MOBILE_PERFORMANCE_SUMMARY_METRICS,
  type MobilePerformanceSummaryMetric,
} from "../src/performance/mobile-performance-summary";
import type { MobilePerformanceBenchmarkReport } from "../src/performance/mobile-performance-benchmark-report";
import { MOBILE_UAT_API_ORIGIN } from "../src/config/environment";

export const MOBILE_PERFORMANCE_BENCHMARK_ITERATIONS = {
  "chat-open-cached": 15,
  "chat-open-network": 8,
  resume: 10,
  "send-ack": 20,
  "send-echo": 20,
  startup: 10,
} as const satisfies Record<MobilePerformanceSummaryMetric, number>;

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

export type MobilePerformanceBenchmarkConfig = {
  /** Must be one of the inbox's automatic three recent-DM prefetch targets. */
  readonly cacheDmConversationId: string;
  readonly cacheDmTitle: string;
  readonly credentials: {
    readonly email: string;
    readonly password: string;
  };
  /** Exact visible names, tapped from the workspace list rather than deep-linked. */
  readonly networkChannelNames: readonly string[];
  readonly workspace: {
    /** A harmless text channel used only to select the UAT workspace after launch. */
    readonly anchorChannelId: string;
    readonly serverId: string;
  };
  readonly version: 1;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

export function parseMobilePerformanceBenchmarkConfig(
  value: unknown,
): MobilePerformanceBenchmarkConfig {
  if (!isRecord(value)) {
    throw new Error("Mobile performance benchmark config must be a JSON object.");
  }
  if (value.version !== 1) {
    throw new Error("Mobile performance benchmark config version must be 1.");
  }
  if (!Array.isArray(value.networkChannelNames)) {
    throw new Error("networkChannelNames must contain eight unique channel names.");
  }

  const networkChannelNames = value.networkChannelNames.map((name, index) =>
    requireString(name, `networkChannelNames[${index}]`),
  );
  if (
    networkChannelNames.length !== MOBILE_PERFORMANCE_BENCHMARK_ITERATIONS["chat-open-network"] ||
    new Set(networkChannelNames).size !== networkChannelNames.length
  ) {
    throw new Error(
      "networkChannelNames must contain exactly eight unique first-network channel names.",
    );
  }

  if (!isRecord(value.workspace)) {
    throw new Error("workspace must be an object.");
  }

  if (!isRecord(value.credentials)) {
    throw new Error("credentials must be an object.");
  }
  const credentials = {
    email: requireString(value.credentials.email, "credentials.email"),
    password: requireString(value.credentials.password, "credentials.password"),
  };

  return {
    cacheDmConversationId: requireString(value.cacheDmConversationId, "cacheDmConversationId"),
    cacheDmTitle: requireString(value.cacheDmTitle, "cacheDmTitle"),
    credentials,
    networkChannelNames,
    version: 1,
    workspace: {
      anchorChannelId: requireString(value.workspace.anchorChannelId, "workspace.anchorChannelId"),
      serverId: requireString(value.workspace.serverId, "workspace.serverId"),
    },
  };
}

function decodeXmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function isMetric(value: unknown): value is MobilePerformanceSummaryMetric {
  return (
    typeof value === "string" &&
    (MOBILE_PERFORMANCE_SUMMARY_METRICS as readonly string[]).includes(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidPercentiles(value: UnknownRecord): boolean {
  const n = value.n;
  const p50Ms = value.p50Ms;
  const p95Ms = value.p95Ms;
  const p99Ms = value.p99Ms;
  if (
    !isNonNegativeInteger(n) ||
    !isNullableNumber(p50Ms) ||
    !isNullableNumber(p95Ms) ||
    !isNullableNumber(p99Ms)
  ) {
    return false;
  }
  if (n === 0) {
    return p50Ms === null && p95Ms === null && p99Ms === null;
  }
  return (
    typeof p50Ms === "number" &&
    typeof p95Ms === "number" &&
    typeof p99Ms === "number" &&
    p50Ms >= 0 &&
    p50Ms <= p95Ms &&
    p95Ms <= p99Ms
  );
}

function assertBenchmarkReport(value: unknown): asserts value is MobilePerformanceBenchmarkReport {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.metrics)) {
    throw new Error("UIAutomator benchmark report has an invalid schema.");
  }
  if (!isRecord(value.prefetch) || !isRecord(value.runtime) || !isRecord(value.store)) {
    throw new Error("UIAutomator benchmark report is missing benchmark sections.");
  }
  if (
    value.metrics.length !== MOBILE_PERFORMANCE_SUMMARY_METRICS.length ||
    value.metrics.some(
      (row) => !isRecord(row) || !isMetric(row.metric) || !hasValidPercentiles(row),
    ) ||
    new Set(value.metrics.map((row) => (row as UnknownRecord).metric)).size !==
      MOBILE_PERFORMANCE_SUMMARY_METRICS.length
  ) {
    throw new Error("UIAutomator benchmark report has invalid metric rows.");
  }

  if (
    !isNonNegativeInteger(value.prefetch.hits) ||
    !isNonNegativeInteger(value.prefetch.warmed) ||
    value.prefetch.hits > value.prefetch.warmed ||
    typeof value.prefetch.hitRate !== "number" ||
    !Number.isFinite(value.prefetch.hitRate) ||
    value.prefetch.hitRate < 0 ||
    value.prefetch.hitRate > 1 ||
    !isNonEmptyString(value.runtime.appVersion) ||
    !isNonEmptyString(value.runtime.apiOrigin) ||
    !isNonEmptyString(value.runtime.buildId) ||
    !["high", "low", "mid", "unknown"].includes(String(value.runtime.deviceTier)) ||
    !["development", "uat", "canary", "production"].includes(String(value.runtime.environment)) ||
    !["cellular", "offline", "unknown", "wifi"].includes(String(value.runtime.networkClass)) ||
    !isNonEmptyString(value.runtime.osName) ||
    !isNonEmptyString(value.runtime.osVersion) ||
    (value.store.cipherVersion !== null && !isNonEmptyString(value.store.cipherVersion)) ||
    (value.store.rowCount !== null && !isNonNegativeInteger(value.store.rowCount)) ||
    (value.store.status !== null &&
      !["open", "sealed", "unavailable"].includes(String(value.store.status)))
  ) {
    throw new Error("UIAutomator benchmark report has invalid benchmark sections.");
  }
}

/** Parse only the one whitelisted diagnostics node; callers must delete the raw XML afterwards. */
export function parseUiAutomatorBenchmarkReport(xml: string): MobilePerformanceBenchmarkReport {
  const node =
    /<node\b[^>]*\bresource-id="(?:[^"]+:id\/)?performance-benchmark-report"[^>]*\/?\s*>/u.exec(
      xml,
    )?.[0];
  const encoded = node ? /\bcontent-desc="([^"]*)"/u.exec(node)?.[1] : undefined;
  if (!encoded) {
    throw new Error("UIAutomator hierarchy does not contain performance-benchmark-report.");
  }

  let report: unknown;
  try {
    report = JSON.parse(decodeXmlAttribute(encoded));
  } catch {
    throw new Error("UIAutomator benchmark report is not valid JSON.");
  }
  assertBenchmarkReport(report);
  return report;
}

export function evaluateMobilePerformanceBenchmarkReport(
  report: MobilePerformanceBenchmarkReport,
  input: { readonly expectedBuildId?: string } = {},
): { readonly status: "FAIL" | "PASS"; readonly violations: readonly string[] } {
  const counts = new Map(report.metrics.map((row) => [row.metric, row]));
  const violations: string[] = [];

  if (report.runtime.environment !== "uat") {
    violations.push(`Expected UAT runtime; received ${report.runtime.environment}.`);
  }
  if (report.runtime.apiOrigin !== MOBILE_UAT_API_ORIGIN) {
    violations.push(`Expected canonical UAT API origin; received ${report.runtime.apiOrigin}.`);
  }
  if (report.runtime.networkClass !== "wifi") {
    violations.push(`Expected Wi-Fi runtime; received ${report.runtime.networkClass}.`);
  }
  const expectedBuildId = input.expectedBuildId?.trim().toLowerCase();
  if (!expectedBuildId || !FULL_GIT_SHA_PATTERN.test(expectedBuildId)) {
    violations.push("Expected full source Git SHA was not supplied.");
  } else if (report.runtime.buildId !== expectedBuildId) {
    violations.push(
      `Expected release build ${expectedBuildId}; received ${report.runtime.buildId}.`,
    );
  }
  if (report.store.status !== "open" || !report.store.cipherVersion) {
    violations.push("Encrypted message store is not open with a reported cipher version.");
  }

  for (const metric of MOBILE_PERFORMANCE_SUMMARY_METRICS) {
    const expected = MOBILE_PERFORMANCE_BENCHMARK_ITERATIONS[metric];
    const actual = counts.get(metric);
    if (!actual || actual.n !== expected) {
      violations.push(
        `${metric} requires exactly ${expected} samples; received ${actual?.n ?? 0}.`,
      );
      continue;
    }
    if (actual.p50Ms === null || actual.p95Ms === null || actual.p99Ms === null) {
      violations.push(`${metric} has samples but is missing a percentile.`);
    }
  }

  return { status: violations.length === 0 ? "PASS" : "FAIL", violations };
}
