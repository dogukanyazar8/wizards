import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getMobileRuntimeConfig } from "../../config/environment";
import { mobileCopy } from "../../locale/mobile-copy";
import {
  drainMobilePerformanceSamples,
  peekMobilePerformanceSamples,
} from "../../performance/mobile-performance-metrics";
import {
  MOBILE_PERFORMANCE_SUMMARY_METRICS,
  summarizeMobilePerformanceSamples,
  type MobilePerformanceSummaryInput,
} from "../../performance/mobile-performance-summary";
import { discardPendingMobilePerformanceSamples } from "../../performance/mobile-performance-sample-persistence";
import { mergeMobilePerformanceSampleViews } from "../../performance/mobile-performance-sample-view";
import { getMobileNavigationSpanDiagnostics } from "../../performance/mobile-navigation-timing";
import { getMobileRequestLatencySnapshot } from "../../performance/mobile-request-metrics";
import { getMobileStartupPhaseTimeline } from "../../performance/mobile-startup-phases";
import { resolveMobileTelemetryDimensions } from "../../performance/mobile-telemetry-dimensions";
import { getMobileRecentDMPrefetchStats } from "../../query/mobile-message-prefetch";
import { mobileMessageStore } from "../../storage/mobile-message-store-database";
import type { MobileMessageStoreDiagnostics } from "../../storage/mobile-message-store";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => String(values[key] ?? match));
}

/**
 * The numbers a device session produces, on the device that produced them.
 *
 * Samples travel to the client-health pipeline, but that path needs the daily
 * rollup and database access — neither of which a person holding a phone has. A
 * baseline run has to be readable where it happens, so this panel computes the
 * percentiles from the in-memory sample log and reports the storage facts that
 * cannot be proven from outside a release build.
 *
 * Deliberately unstyled beyond legibility: it is an instrument, not a surface.
 */
export function MobilePerformanceDiagnosticsScreen({ onBack }: { onBack(): void }) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<readonly MobilePerformanceSummaryInput[]>(() =>
    peekMobilePerformanceSamples(),
  );
  const [storage, setStorage] = useState<MobileMessageStoreDiagnostics | null>(null);

  const refresh = useCallback(() => {
    // The retained log is the session; memory holds only what has not been
    // written or shipped yet. Reading memory alone is what made a full baseline
    // run report n=0 on every budgeted metric.
    void mobileMessageStore
      .readPerformanceSamples()
      .then((persisted) =>
        setSamples(mergeMobilePerformanceSampleViews(persisted, peekMobilePerformanceSamples())),
      )
      .catch(() => setSamples(peekMobilePerformanceSamples()));
    void mobileMessageStore
      .describe()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = summarizeMobilePerformanceSamples(samples);
  const timeline = getMobileStartupPhaseTimeline();
  const prefetch = getMobileRecentDMPrefetchStats();
  const spans = getMobileNavigationSpanDiagnostics();
  // Only routes the server accounted for: a row with no `Server-Timing` says
  // nothing this section is for.
  const requestLatency = getMobileRequestLatencySnapshot().filter(
    (sample) => sample.server.totalMs !== null,
  );
  const runtimeConfig = getMobileRuntimeConfig();
  let dimensions: Record<string, unknown> = {};
  try {
    dimensions = resolveMobileTelemetryDimensions() as unknown as Record<string, unknown>;
  } catch {
    dimensions = {};
  }

  const labelStyle = { color: theme.text.secondary, fontSize: 12 };
  const valueStyle = { color: theme.text.primary, fontSize: 14 };
  const headingStyle = {
    color: theme.text.primary,
    fontSize: 16,
    marginBottom: 8,
    marginTop: 20,
  };

  return (
    <ScrollView
      contentContainerStyle={{
        backgroundColor: theme.surface.base,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
      }}
      testID="mobile-performance-diagnostics"
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={onBack} testID="performance-back">
          <Text style={valueStyle}>{`‹ ${copy.authBackAction}`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={refresh} testID="performance-refresh">
          <Text style={valueStyle}>{copy.refreshShortAction}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // All three, because "reset" means the next measurement is the first
            // one: the retained table, the in-memory log, and the batch still
            // inside the write debounce — which would otherwise land a second
            // later and put the previous run back. Draining memory costs the
            // backend the samples it had not collected yet, which is the point.
            drainMobilePerformanceSamples();
            void discardPendingMobilePerformanceSamples()
              .then(() => mobileMessageStore.purgePerformanceSamples())
              .finally(refresh);
          }}
          testID="performance-reset"
        >
          <Text style={valueStyle}>{copy.performanceDiagnosticsReset}</Text>
        </Pressable>
      </View>

      <Text style={headingStyle}>{copy.performanceDiagnosticsMetricsHeading}</Text>
      {rows.map((row) => (
        <View key={row.metric} style={{ paddingVertical: 4 }}>
          <Text style={labelStyle}>{`${row.metric} · n=${row.count}`}</Text>
          <Text style={valueStyle} testID={`performance-metric-${row.metric}`}>
            {row.count === 0
              ? copy.performanceDiagnosticsNoMeasurements
              : `${row.p50Ms ?? "-"} / ${row.p95Ms ?? "-"} / ${row.p99Ms ?? "-"} ms`}
          </Text>
        </View>
      ))}

      <Text style={headingStyle}>{copy.performanceDiagnosticsStartupPhases}</Text>
      {Object.entries(timeline).length === 0 ? (
        <Text style={valueStyle}>{copy.performanceDiagnosticsNoMeasurements}</Text>
      ) : (
        Object.entries(timeline).map(([phase, elapsedMs]) => (
          <View key={phase} style={{ paddingVertical: 2 }}>
            <Text style={labelStyle}>{phase}</Text>
            <Text style={valueStyle}>{`${Math.round(elapsedMs)} ms`}</Text>
          </View>
        ))
      )}

      <Text style={headingStyle}>{copy.performanceDiagnosticsStoreHeading}</Text>
      <Text style={labelStyle}>cipher_version</Text>
      <Text style={valueStyle} testID="performance-cipher-version">
        {storage?.cipherVersion ?? copy.performanceDiagnosticsStoreUnavailable}
      </Text>
      <Text style={labelStyle}>{copy.performanceDiagnosticsStoreStatusRows}</Text>
      <Text style={valueStyle}>{`${storage?.status ?? "?"} · ${storage?.rowCount ?? "-"}`}</Text>

      <Text style={headingStyle}>{copy.performanceDiagnosticsPrefetchHitRate}</Text>
      <Text style={valueStyle}>
        {`${prefetch.hits}/${prefetch.warmed} · ${Math.round(prefetch.hitRate * 100)}%`}
      </Text>

      {/* A low n next to a high loss count means the instrument dropped spans,
          not that the reader stopped opening chats. The first baseline run could
          not tell those apart. */}
      <Text style={headingStyle}>{copy.performanceDiagnosticsSpanLoss}</Text>
      <Text style={valueStyle} testID="performance-span-loss">
        {`${spans.open} · ${spans.abandoned}`}
      </Text>

      {/* Splits a slow round trip into work the server did and time the wire
          took. Without it, a high send-ack is equally explainable by a slow
          query and by a distant region. */}
      <Text style={headingStyle}>{copy.performanceDiagnosticsServerTiming}</Text>
      {requestLatency.length === 0 ? (
        <Text style={valueStyle}>{copy.performanceDiagnosticsNoMeasurements}</Text>
      ) : (
        requestLatency.map((sample) => (
          <View key={sample.route} style={{ paddingVertical: 2 }}>
            <Text style={labelStyle}>{sample.route}</Text>
            <Text style={valueStyle}>
              {`${Math.round(sample.clientMs)} · ${sample.server.totalMs ?? "-"} (auth ${
                sample.server.authMs ?? "-"
              } / db ${sample.server.dbMs ?? "-"}) · ${sample.transportMs ?? "-"} ms`}
            </Text>
          </View>
        ))
      )}

      <Text style={headingStyle}>{copy.performanceDiagnosticsBuild}</Text>
      <Text style={valueStyle}>
        {`${runtimeConfig.environment} · ${String(dimensions.appVersion ?? "?")} · ${String(
          dimensions.osName ?? "?",
        )} ${String(dimensions.osVersion ?? "")}`}
      </Text>
      <Text style={valueStyle}>
        {fill(copy.performanceDiagnosticsDeviceMeta, {
          build: String(dimensions.buildId ?? "?"),
          network: String(dimensions.networkClass ?? "?"),
          tier: String(dimensions.deviceTier ?? "?"),
        })}
      </Text>

      <Text style={[headingStyle, { fontSize: 12 }]}>
        {fill(copy.performanceDiagnosticsSampleTotal, {
          metrics: MOBILE_PERFORMANCE_SUMMARY_METRICS.length,
          samples: samples.length,
        })}
      </Text>
    </ScrollView>
  );
}
