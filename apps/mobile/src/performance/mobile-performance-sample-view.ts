import type { MobilePerformanceSummaryInput } from "./mobile-performance-summary";

type MobilePerformanceSampleView = MobilePerformanceSummaryInput & {
  readonly sampleId: string;
};

/**
 * What the panel should show: the retained log, plus whatever was measured since
 * the last write.
 *
 * The two overlap by design — persistence debounces, so the newest samples are
 * still only in memory, and a sample that has already been written is also still
 * in memory until the reporter drains it. `sampleId` is what makes the overlap
 * harmless: the same measurement counted twice would move every percentile.
 */
export function mergeMobilePerformanceSampleViews(
  persisted: readonly MobilePerformanceSampleView[],
  inMemory: readonly MobilePerformanceSampleView[],
): readonly MobilePerformanceSummaryInput[] {
  const merged: MobilePerformanceSampleView[] = [];
  const seen = new Set<string>();

  for (const sample of [...persisted, ...inMemory]) {
    if (seen.has(sample.sampleId)) {
      continue;
    }

    seen.add(sample.sampleId);
    merged.push(sample);
  }

  return merged;
}
